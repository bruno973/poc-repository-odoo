// test/security.test.ts — Mode identité réelle de bout en bout (HTTP), contre le faux Odoo.
// Couvre F-01, F-03, F-07, F-08, S-6, S-12 et les exigences de sécurité du § 5.

import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { createRepositories } from "../src/app/repositories.js";
import { SessionStore } from "../src/app/sessions.js";
import { Tracer } from "../src/app/trace.js";
import type { Principal } from "../src/domain/identity.js";
import { createServer } from "../src/server.js";
import { FakeOdoo } from "./fake-odoo.js";

const PASSWORD = "manager-pw";

describe("Mode odoo-session : HTTP et sécurité", () => {
  const odoo = new FakeOdoo();
  const tracer = new Tracer();
  let app: FastifyInstance;
  let clock = Date.now();
  const sessions = new SessionStore({ now: () => clock });
  let logs = "";

  before(async () => {
    await odoo.start();
    const repos = await createRepositories(
      { ADAPTER: "odoo", AUTH_MODE: "odoo-session", ODOO_URL: odoo.url, ODOO_DB: "test" },
      tracer,
    );
    const stream = new Writable({
      write(chunk, _enc, done) {
        logs += String(chunk);
        done();
      },
    });
    app = await createServer(repos, tracer, {
      sessions,
      cookieSecure: true,
      now: () => clock,
      // Journal au niveau le plus bavard, pour y chercher le mot de passe
      logger: {
        level: "trace",
        stream,
        redact: { paths: ["req.headers.authorization", "req.headers.cookie", "req.body.password"], remove: true },
      },
    });
  });
  after(async () => {
    await app.close();
    await odoo.stop();
  });

  let ip = 0;
  const login = (user: string, password: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: user, password },
      remoteAddress: `10.0.0.${++ip}`,
    });
  const cookieOf = (res: { headers: Record<string, unknown> }) => {
    const raw = res.headers["set-cookie"];
    return String(Array.isArray(raw) ? raw[0] : raw);
  };
  const sid = (setCookie: string) => /leila_sid=([^;]*)/.exec(setCookie)?.[1] ?? "";
  const as = (setCookie: string) => ({ cookie: `leila_sid=${sid(setCookie)}` });

  it("connecte avec les identifiants Odoo : 204 + cookie httpOnly, SameSite=Lax, Secure, 256 bits", async () => {
    const res = await login("p.manager", PASSWORD);
    assert.equal(res.statusCode, 204);
    const cookie = cookieOf(res);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    assert.equal(sid(cookie).length, 43, "32 octets d'aléa en base64url");
  });

  it("refuse un mauvais mot de passe et un login inconnu avec le même 401 générique", async () => {
    const a = await login("p.manager", "faux");
    const b = await login("personne", PASSWORD);
    assert.equal(a.statusCode, 401);
    assert.equal(b.statusCode, 401);
    assert.equal(a.body, b.body);
    assert.doesNotMatch(a.body, /mot de passe incorrect pour|login inconnu/i);
  });

  it("déduit le viewer d'Odoo (auth/me)", async () => {
    const cookie = cookieOf(await login("p.manager", PASSWORD));
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: as(cookie) });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json(), {
      userId: 7,
      employeeId: 5,
      role: "manager",
      displayName: "Manon Manager",
      company: { id: 1, label: "Société A" },
    });
  });

  it("porte chaque appel de port avec l'uid de l'utilisateur, jamais un compte partagé (F-03)", async () => {
    odoo.reset();
    const manager = cookieOf(await login("p.manager", PASSWORD));
    const employe = cookieOf(await login("p.employe", "employe-pw"));
    await app.inject({ method: "GET", url: "/api/attendances", headers: as(manager) });
    await app.inject({ method: "GET", url: "/api/employees/6", headers: as(employe) });
    assert.ok(!odoo.paths.includes("/jsonrpc"), "appel par l'API externe (compte partagé)");
    assert.ok(odoo.calls.every((c) => c.transport === "session"));
    const entries = tracer.recent(10);
    const list = entries.find((e) => e.port === "AttendanceRepository.listAttendances");
    const sheet = entries.find((e) => e.port === "EmployeeRepository.getEmployeeById");
    assert.ok(list?.backend.length && list.backend.every((b) => b.uid === 7));
    assert.ok(sheet?.backend.length && sheet.backend.every((b) => b.uid === 9));
  });

  it("applique les règles d'Odoo à la vraie personne", async () => {
    const employe = cookieOf(await login("p.employe", "employe-pw"));
    const page = (await app.inject({ method: "GET", url: "/api/attendances", headers: as(employe) })).json() as {
      items: { id: number; capabilities: { canApprove: boolean } }[];
    };
    assert.deepEqual(page.items.map((a) => a.id), [11]);
    assert.equal(page.items[0]?.capabilities.canApprove, false, "S-03 : bouton absent");
    const approve = await app.inject({ method: "POST", url: "/api/attendances/11/approve", headers: as(employe) });
    assert.equal(approve.statusCode, 403);
  });

  it("ignore les en-têtes x-viewer-* forgés (S-12)", async () => {
    const forged = { "x-viewer-role": "hr_admin", "x-viewer-id": "2", "x-viewer-employee-id": "1" };
    const alone = await app.inject({ method: "GET", url: "/api/employees", headers: forged });
    assert.equal(alone.statusCode, 401);
    const employe = cookieOf(await login("p.employe", "employe-pw"));
    const res = await app.inject({ method: "GET", url: "/api/employees", headers: { ...forged, ...as(employe) } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.json() as { items: { id: number }[] }).items.map((e) => e.id), [6]);
  });

  it("déconnecte : session Leila et session Odoo détruites, appel suivant en 401 (F-07)", async () => {
    const cookie = cookieOf(await login("p.manager", PASSWORD));
    const before = odoo.sessions.size;
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers: as(cookie) });
    assert.equal(out.statusCode, 204);
    assert.match(cookieOf(out), /leila_sid=;.*Max-Age=0/);
    assert.equal(odoo.sessions.size, before - 1);
    const next = await app.inject({ method: "GET", url: "/api/employees", headers: as(cookie) });
    assert.equal(next.statusCode, 401);
  });

  it("session Odoo expirée → 401 et session Leila fermée (F-08)", async () => {
    const cookie = cookieOf(await login("p.employe", "employe-pw"));
    odoo.expire(9);
    const res = await app.inject({ method: "GET", url: "/api/attendances", headers: as(cookie) });
    assert.equal(res.statusCode, 401);
    assert.match(cookieOf(res), /Max-Age=0/);
    assert.equal(sessions.get(sid(cookie)), null);
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: as(cookie) });
    assert.equal(me.statusCode, 401);
  });

  it("expire la session Leila après 1 h d'inactivité et 8 h au total", async () => {
    const idle = cookieOf(await login("p.manager", PASSWORD));
    clock += 61 * 60_000;
    assert.equal((await app.inject({ method: "GET", url: "/api/auth/me", headers: as(idle) })).statusCode, 401);

    const active = cookieOf(await login("p.manager", PASSWORD));
    for (let i = 0; i < 9; i++) {
      clock += 50 * 60_000;
      assert.equal((await app.inject({ method: "GET", url: "/api/auth/me", headers: as(active) })).statusCode, 200);
    }
    clock += 50 * 60_000; // 8 h 20 depuis la connexion, toujours active
    assert.equal((await app.inject({ method: "GET", url: "/api/auth/me", headers: as(active) })).statusCode, 401);
  });

  it("limite à 5 tentatives de connexion par minute et par IP", async () => {
    const attempt = () =>
      app.inject({ method: "POST", url: "/api/auth/login", payload: { login: "p.manager", password: "faux" }, remoteAddress: "10.9.9.9" });
    for (let i = 0; i < 5; i++) assert.equal((await attempt()).statusCode, 401);
    const blocked = await attempt();
    assert.equal(blocked.statusCode, 429);
    assert.ok(Number(blocked.headers["retry-after"]) > 0);
    clock += 61_000;
    assert.equal((await attempt()).statusCode, 401);
  });

  it("ne garde le mot de passe nulle part : journaux, sessions, réponses, cookies (S-6)", async () => {
    const res = await login("p.manager", PASSWORD);
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: as(cookieOf(res)) });
    const trace = await app.inject({ method: "GET", url: "/api/_trace", headers: as(cookieOf(res)) });
    const places: Record<string, string> = {
      journaux: logs,
      sessions: sessions.dump(),
      "réponse login": res.body + JSON.stringify(res.headers),
      "réponse me": me.body,
      journal_des_appels: trace.body,
    };
    assert.ok(logs.length > 0, "aucun journal capturé");
    for (const [where, text] of Object.entries(places)) assert.ok(!text.includes(PASSWORD), `mot de passe trouvé dans : ${where}`);
    // Seul l'appel d'authentification à Odoo le transporte
    const carrying = odoo.bodies.filter((b) => b.includes(PASSWORD));
    assert.ok(carrying.length > 0 && carrying.every((b) => b.includes("\"login\"")));
  });

  it("le principal stocké ne contient que la poignée opaque", async () => {
    const cookie = cookieOf(await login("p.manager", PASSWORD));
    const principal = sessions.get(sid(cookie)) as Principal;
    assert.deepEqual(Object.keys(principal).sort(), ["backendHandle", "company", "displayName", "viewer"]);
    assert.ok(!Object.values(odoo.sessions).includes(principal.backendHandle));
    assert.ok(![...odoo.sessions.keys()].includes(principal.backendHandle), "cookie Odoo exposé comme poignée");
  });
});

describe("SessionStore", () => {
  it("purge les sessions expirées et les renvoie", () => {
    let now = 0;
    const store = new SessionStore({ idleMs: 10, absoluteMs: 100, now: () => now });
    const p = { viewer: { id: 1, role: "employee" as const }, displayName: "x", company: null, backendHandle: "h" };
    store.create(p);
    now = 11;
    assert.deepEqual(store.purgeExpired(), [p]);
    assert.equal(store.size, 0);
  });
});
