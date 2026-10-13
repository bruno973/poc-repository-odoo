// test/mock.test.ts — Contrat sur l'adapter mock + comportement HTTP de l'API.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { createRepositories, driftGuard, type Repositories } from "../src/app/repositories.js";
import { Tracer } from "../src/app/trace.js";
import { createServer } from "../src/server.js";
import { runContract } from "./contract.js";

const admin = { id: 2, role: "hr_admin" as const, employeeId: 2 };

runContract("mock", () => createRepositories({ ADAPTER: "mock" }, new Tracer()), {
  viewer: admin,
  employeeId: 3,
  writes: true,
});

describe("API HTTP (adapter mock)", () => {
  let app: FastifyInstance;
  let repos: Repositories;
  const tracer = new Tracer();

  before(async () => {
    repos = await createRepositories({ ADAPTER: "mock" }, tracer);
    app = await createServer(repos, tracer);
  });
  after(() => app.close());

  const as = (role: string, id = 1) => ({ "x-viewer-role": role, "x-viewer-id": String(id) });

  it("refuse un appel sans viewer (plus de hr_admin par défaut)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/employees" });
    assert.equal(res.statusCode, 401);
    const res2 = await app.inject({ method: "GET", url: "/api/employees", headers: as("superadmin") });
    assert.equal(res2.statusCode, 401);
  });

  it("n'envoie pas les données privées d'un collègue à un manager", async () => {
    const res = await app.inject({ method: "GET", url: "/api/employees/2", headers: as("manager", 1) });
    assert.equal(res.statusCode, 200);
    assert.ok(!res.body.includes("infoPrivee.ssnId"));
    assert.ok(!res.body.includes("infoPrivee.spouseName"));
  });

  it("traduit les erreurs domaine en codes HTTP", async () => {
    const notFound = await app.inject({ method: "GET", url: "/api/employees/999", headers: as("hr_admin") });
    assert.equal(notFound.statusCode, 404);
    const invalid = await app.inject({ method: "GET", url: "/api/summary/groups?dimension=planete", headers: as("hr_admin") });
    assert.equal(invalid.statusCode, 400);
    const conflict1 = await app.inject({ method: "POST", url: "/api/employees/1/check-in", headers: as("hr_admin"), payload: {} });
    assert.equal(conflict1.statusCode, 200);
    const conflict2 = await app.inject({ method: "POST", url: "/api/employees/1/check-in", headers: as("hr_admin"), payload: {} });
    assert.equal(conflict2.statusCode, 409);
  });

  it("signale une sortie d'adapter non conforme comme une dérive (502), pas une erreur client", async () => {
    const { SummaryGroupSchema } = await import("../src/domain/summary.schema.js");
    const driftingSummary = driftGuard("SummaryRepository", {
      // Simule un moteur qui renvoie un total négatif : refusé par le schéma de sortie
      async getGroups() {
        return [SummaryGroupSchema.parse({ key: { dimension: "pole", value: null }, label: "x", count: 1, totals: { worked: -1 } })];
      },
      async getLines() {
        return [];
      },
    });
    const server = await createServer({ ...repos, summary: driftingSummary }, new Tracer());
    const res = await server.inject({ method: "GET", url: "/api/summary/groups?dimension=pole", headers: as("hr_admin") });
    assert.equal(res.statusCode, 502);
    assert.match(res.body, /non conforme au contrat/);
    await server.close();
  });

  it("journalise le port appelé", async () => {
    await app.inject({ method: "GET", url: "/api/attendances?limit=1", headers: as("hr_admin") });
    const trace = await app.inject({ method: "GET", url: "/api/_trace" });
    assert.ok(trace.body.includes("AttendanceRepository.listAttendances"));
  });
});
