// test/mock.test.ts — Contrat sur l'adapter mock + comportement HTTP de l'API.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { createRepositories, driftGuard, type Repositories } from "../src/app/repositories.js";
import { Tracer } from "../src/app/trace.js";
import { DomainError } from "../src/domain/errors.js";
import type { FormNode } from "../src/domain/tree.js";
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

describe("Mock : droits simulés par rôle (F-10)", () => {
  // Fixtures : Abigail (1) manage Bruno (2) et Camille (3)
  const manager = { id: 101, role: "manager" as const, employeeId: 1 };
  const employee = { id: 103, role: "employee" as const, employeeId: 3 };
  const hrAdmin = { id: 102, role: "hr_admin" as const, employeeId: 2 };
  let repos: Repositories;
  before(async () => {
    repos = await createRepositories({ ADAPTER: "mock" }, new Tracer());
  });

  const editable = async (id: number, viewer: typeof manager | typeof employee | typeof hrAdmin) => {
    const record = await repos.employees.getEmployeeById(id, viewer);
    const keys: string[] = [];
    const walk = (nodes: readonly FormNode[]) => {
      for (const n of nodes) n.kind === "group" ? walk(n.children) : n.editable && keys.push(n.key);
    };
    walk(record?.formTree ?? []);
    return keys;
  };

  it("editable dépend du rôle et de l'équipe, plus jamais « true partout »", async () => {
    assert.ok((await editable(3, hrAdmin)).includes("infoPrivee.ssnId"));
    assert.deepEqual((await editable(3, manager)).sort(), ["header.jobTitle", "header.workEmail", "header.workMobile", "header.workPhone"]);
    assert.deepEqual(await editable(1, manager), [], "un manager ne modifie pas sa propre fiche");
    assert.deepEqual(await editable(3, employee), [], "pas d'auto-modification (Q-05)");
  });

  it("updateEmployee est implémenté en mémoire et applique la même règle", async () => {
    const updated = await repos.employees.updateEmployee(3, { "header.jobTitle": "Lead dev" }, manager);
    assert.equal(updated.headerSummary.jobTitle, "Lead dev");
    const list = await repos.employees.listEmployees({ search: "Lead dev" }, hrAdmin);
    assert.deepEqual(list.items.map((e) => e.id), [3]);
    await assert.rejects(
      repos.employees.updateEmployee(3, { "infoPrivee.ssnId": "x" }, manager),
      (e: unknown) => e instanceof DomainError && e.code === "forbidden",
    );
    await assert.rejects(
      repos.employees.updateEmployee(3, { "header.jobTitle": "x" }, employee),
      (e: unknown) => e instanceof DomainError && e.code === "forbidden",
    );
  });

  it("calcule les capacités des pointages et les applique", async () => {
    const own = await repos.attendances.listAttendances({ limit: 200, offset: 0 }, employee);
    assert.ok(own.items.length > 0 && own.items.every((a) => a.employee.id === 3), "un employé ne voit que ses pointages");
    assert.ok(own.items.every((a) => !a.capabilities.canApprove && !a.capabilities.canEdit));
    const id = own.items[0]?.id ?? 0;
    await assert.rejects(repos.attendances.approveHours(id, employee), (e: unknown) => e instanceof DomainError && e.code === "forbidden");

    const team = await repos.attendances.listAttendances({ limit: 200, offset: 0 }, manager);
    for (const a of team.items) assert.equal(a.capabilities.canApprove, a.employee.id !== 1, `pointage ${a.id}`);
    assert.equal((await repos.attendances.approveHours(id, manager)).hoursStatus, "approved");
  });

  it("refuse de pointer pour un employé hors équipe (S-10)", async () => {
    await assert.rejects(
      repos.attendances.checkIn({ employeeId: 1 }, employee),
      (e: unknown) => e instanceof DomainError && e.code === "forbidden",
    );
  });

  it("limite la synthèse au périmètre du viewer (S-02)", async () => {
    const groups = await repos.summary.getGroups({ path: [], dimension: "employee" }, employee);
    assert.deepEqual(groups.map((g) => g.key.value), [3]);
  });
});

describe("API HTTP (adapter mock, AUTH_MODE=fake-jwt)", () => {
  let app: FastifyInstance;
  before(async () => {
    const tracer = new Tracer();
    app = await createServer(await createRepositories({ ADAPTER: "mock", AUTH_MODE: "fake-jwt" }, tracer), tracer, {
      cookieSecure: false,
    });
  });
  after(() => app.close());

  it("connecte un utilisateur de démo et sert ses données, sans en-têtes x-viewer-*", async () => {
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { login: "camille", password: "demo" } });
    assert.equal(login.statusCode, 204);
    const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    assert.doesNotMatch(String(login.headers["set-cookie"]), /Secure/, "COOKIE_SECURE=0 en local");
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    assert.equal(me.json().role, "employee");
    const meta = await app.inject({ method: "GET", url: "/api/meta" });
    assert.equal(meta.json().authMode, "fake-jwt");
    const sheet = await app.inject({ method: "GET", url: "/api/employees/3", headers: { cookie, "x-viewer-role": "hr_admin" } });
    assert.ok(sheet.body.includes("infoPrivee.ssnId"), "sa propre fiche");
    const other = await app.inject({ method: "GET", url: "/api/employees/2", headers: { cookie, "x-viewer-role": "hr_admin" } });
    assert.ok(!other.body.includes("infoPrivee.ssnId"), "en-tête forgé pris en compte");
  });
});
