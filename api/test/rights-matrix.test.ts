// test/rights-matrix.test.ts — Matrice de droits S-01…S-12, deux modes (T-60).
//
// 1. Toujours : répétition sur le mock (comptes déclarés vs faux JWT), pour que le
//    banc ne pourrisse pas. Le mock simule le moteur : seul S-12 doit différer.
// 2. Si RIGHTS_MATRIX_CONFIG pointe vers une configuration (voir
//    rights-matrix.config.example.json) : exécution contre Odoo (amg), résultats
//    écrits dans docs/rights-matrix.json, puis `npm run rapport` produit
//    docs/rapport-identite.md.

import "dotenv/config";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, it } from "node:test";
import { createRepositories } from "../src/app/repositories.js";
import { Tracer } from "../src/app/trace.js";
import { createServer } from "../src/server.js";
import { assertWritableDb } from "./guards.js";
import { type MatrixConfig, type MatrixTarget, runMatrix, score } from "./rights-matrix.js";

async function target(env: NodeJS.ProcessEnv): Promise<MatrixTarget> {
  const tracer = new Tracer(10_000);
  const app = await createServer(await createRepositories(env, tracer), tracer, {
    cookieSecure: false,
    loginAttemptsPerMinute: 1000,
    logger: false,
  });
  return { app, tracer };
}

describe("Matrice de droits : répétition sur le mock", () => {
  const MOCK: MatrixConfig = {
    target: "mock",
    profiles: {
      "p.admin": { login: "bruno", passwordEnv: "MOCK_PASSWORD", shared: { role: "hr_admin", id: 102, employeeId: 2 } },
      "p.manager": { login: "abigail", passwordEnv: "MOCK_PASSWORD", shared: { role: "manager", id: 101, employeeId: 1, departmentId: 1 } },
      "p.employe": { login: "camille", passwordEnv: "MOCK_PASSWORD", shared: { role: "employee", id: 103, employeeId: 3, departmentId: 2 } },
    },
    data: { teamEmployeeIds: [2, 3], managerEmployeeId: 1, employeEmployeeId: 3, colleagueEmployeeId: 2 },
    expected: { "S-05": "autorisé", "S-08": "absent" },
  };

  it("rejoue les scénarios dans les deux modes", async () => {
    const env = { MOCK_PASSWORD: "demo-matrice" };
    const shared = await target({ ADAPTER: "mock", AUTH_MODE: "shared" });
    const session = await target({ ADAPTER: "mock", AUTH_MODE: "fake-jwt", FAKE_JWT_PASSWORD: env.MOCK_PASSWORD });
    try {
      const results = await runMatrix(MOCK, { shared, session }, { env, writes: true });
      if (process.env["MATRIX_DEBUG"]) console.log(JSON.stringify(results.scenarios.map((s) => [s.id, s.expected, s.shared.observed, s.session.observed])));
      const by = Object.fromEntries(results.scenarios.map((s) => [s.id, s]));
      assert.equal(by["S-12"]?.shared.observed, "accepté");
      assert.equal(by["S-12"]?.session.observed, "ignoré");
      for (const s of results.scenarios) {
        assert.notEqual(s.session.observed, "erreur", `${s.id} : ${s.session.detail ?? ""}`);
        if (s.expected && !s.session.observed.startsWith("non ") && s.session.observed !== "profil non configuré") {
          assert.equal(s.session.observed, s.expected, `${s.id} (${s.action})`);
        }
      }
      assert.ok(score(results).s2 > 0, "le mode partagé doit au moins accepter l'en-tête forgé");
      assert.ok(results.latency.session.calls > 0);
    } finally {
      await Promise.all([shared.app.close(), session.app.close()]);
    }
  });
});

const configPath = process.env["RIGHTS_MATRIX_CONFIG"];
if (configPath) {
  describe("Matrice de droits : base réelle", () => {
    it("exécute S-01…S-12 et écrit docs/rights-matrix.json", { timeout: 600_000 }, async () => {
      const env = process.env;
      const cfg = JSON.parse(readFileSync(configPath, "utf8")) as MatrixConfig;
      const writes = env["ODOO_TEST_WRITES"] === "1";
      if (writes) assertWritableDb(env);
      const shared = await target({ ...env, ADAPTER: "odoo", AUTH_MODE: "shared" });
      const session = await target({ ...env, ADAPTER: "odoo", AUTH_MODE: "odoo-session" });
      try {
        const results = await runMatrix(cfg, { shared, session }, { env, writes });
        const out = new URL("../../docs/rights-matrix.json", import.meta.url).pathname;
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
        const { s1, s2, counted } = score(results);
        console.log(`Matrice : S-1 = ${s1} %, S-2 = ${s2} % (${counted} scénarios avec attendu) → ${out}`);
      } finally {
        await Promise.all([shared.app.close(), session.app.close()]);
      }
    });
  });
}
