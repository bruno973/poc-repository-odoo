// test/odoo-protocol.test.ts — L'adapter Odoo contre un faux serveur (test/fake-odoo.ts).
// Vérifie ce que l'adapter ENVOIE et comment il TRADUIT les réponses. Sans Odoo.

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { attendanceCapabilities, recordAccess } from "../src/adapters/odoo18/capabilities.js";
import { OdooClient } from "../src/adapters/odoo18/client.js";
import { OdooAttendanceRepository } from "../src/adapters/odoo18/OdooAttendanceRepository.js";
import { OdooEmployeeRepository } from "../src/adapters/odoo18/OdooEmployeeRepository.js";
import { OdooSummaryRepository } from "../src/adapters/odoo18/OdooSummaryRepository.js";
import { SessionTransport, SharedAccounts, UserSessions } from "../src/adapters/odoo18/transport.js";
import { DomainError } from "../src/domain/errors.js";
import type { ViewerContext } from "../src/domain/tree.js";
import { FakeOdoo, NEXT, OdooFault } from "./fake-odoo.js";

const isCode = (code: string) => (e: unknown) => e instanceof DomainError && e.code === code;

describe("Adapter Odoo 18 : protocole (mode shared, /jsonrpc)", () => {
  const odoo = new FakeOdoo(undefined, [
    (call) =>
      call.model === "hr.attendance" && call.method === "write"
        ? (() => {
            throw new OdooFault("odoo.exceptions.ValidationError", "Repas : 3 maximum.");
          })()
        : NEXT,
  ]);
  before(() => odoo.start());
  after(() => odoo.stop());
  beforeEach(() => odoo.reset());

  const viewer: ViewerContext = { id: 1, role: "manager", employeeId: 5 };
  const shared = () => {
    const c = new OdooClient({ url: odoo.url, db: "test", user: "poc", password: "cle-api" });
    return new SharedAccounts({ employee: c, manager: c, hr_admin: c });
  };

  it("utilise l'API externe uniquement", async () => {
    await new OdooEmployeeRepository(shared()).getEmployeeById(6, viewer);
    assert.ok(odoo.paths.every((p) => p === "/jsonrpc"));
  });

  it("ne lit que les champs autorisés et met fields_get en cache par compte", async () => {
    const repo = new OdooEmployeeRepository(shared());
    const first = await repo.getEmployeeById(6, viewer);
    await repo.getEmployeeById(6, viewer);
    assert.ok(first);
    assert.equal(odoo.calls.filter((c) => c.method === "fields_get").length, 1, "fields_get rappelé à chaque fiche");
    const read = odoo.calls.find((c) => c.method === "read");
    assert.deepEqual(new Set(read?.kwargs["fields"] as string[]), new Set(["name", "work_email", "job_title"]));
    assert.equal((read?.kwargs["context"] as { lang: string }).lang, "fr_FR");
  });

  it("editable = champ modifiable (fields_get) ∧ fiche modifiable (has_access)", async () => {
    const repo = new OdooEmployeeRepository(shared());
    const leaf = (record: Awaited<ReturnType<typeof repo.getEmployeeById>>, key: string) => {
      const node = record?.formTree.flatMap((g) => g.children).find((n) => n.key === key);
      return node && node.kind !== "group" ? node : undefined;
    };
    // Fiche 6 : modifiable par le compte → work_email modifiable, job_title (lecture seule) non
    const team = await repo.getEmployeeById(6, viewer);
    assert.equal(leaf(team, "header.workEmail")?.editable, true);
    assert.equal(leaf(team, "header.jobTitle")?.editable, false);
    // Fiche 5 : lisible mais pas modifiable → plus aucun champ modifiable (avant : affichés puis 403)
    const own = await repo.getEmployeeById(5, viewer);
    assert.equal(leaf(own, "header.workEmail")?.editable, false);
    const has = odoo.calls.filter((c) => c.method === "has_access");
    assert.deepEqual(has.map((c) => c.args), [[[6], "write"], [[5], "write"]]);
  });

  it("refuse d'écrire un champ non modifiable, sans appeler write", async () => {
    const repo = new OdooEmployeeRepository(shared());
    await assert.rejects(repo.updateEmployee(6, { "header.jobTitle": "Chef" }, viewer), isCode("forbidden"));
    // Champ modifiable pour le moteur, mais fiche non modifiable (règle d'enregistrement)
    await assert.rejects(repo.updateEmployee(5, { "header.workEmail": "x@exemple.gf" }, viewer), isCode("forbidden"));
    await assert.rejects(repo.updateEmployee(6, { "header.inconnu": "x" }, viewer), isCode("invalid"));
    assert.equal(odoo.calls.filter((c) => c.method === "write").length, 0);
  });

  it("écrit un champ modifiable en le traduisant vers Odoo", async () => {
    const repo = new OdooEmployeeRepository(shared());
    await repo.updateEmployee(6, { "header.workEmail": "nouveau@exemple.gf" }, viewer);
    const write = odoo.calls.find((c) => c.method === "write");
    assert.deepEqual(write?.args, [[6], { work_email: "nouveau@exemple.gf" }]);
  });

  it("délègue regroupements et sommes à read_group, y compris pour un axe texte", async () => {
    const repo = new OdooSummaryRepository(shared());
    const groups = await repo.getGroups(
      { path: [{ dimension: "pole", value: null }], dimension: "week", status: "approved" },
      viewer,
    );
    const call = odoo.calls.find((c) => c.method === "read_group");
    assert.deepEqual(call?.kwargs["groupby"], ["week_label"]);
    assert.deepEqual(call?.kwargs["domain"], [["parent_id", "=", false], ["overtime_status", "=", "approved"]]);
    // Régression : une valeur texte ne doit pas être lue comme un many2one
    assert.deepEqual(groups[0]?.key, { dimension: "week", value: "S38 - 14/09/26-20/09/26" });
    assert.equal(groups[0]?.label, "S38 - 14/09/26-20/09/26");
    assert.equal(groups[0]?.totals.overtime25, 3.5);
    assert.equal(groups[1]?.label, "Aucun");
  });

  it("calcule les capacités des pointages par lot, puis fiche par fiche en cas de refus", async () => {
    const repo = new OdooAttendanceRepository(shared());
    const page = await repo.listAttendances({ limit: 80, offset: 0 }, viewer);
    const caps = Object.fromEntries(page.items.map((a) => [a.id, a.capabilities]));
    assert.deepEqual(caps[11], { canEdit: true, canApprove: true });
    assert.deepEqual(caps[13], { canEdit: false, canApprove: false });
    const has = odoo.calls.filter((c) => c.method === "has_access").map((c) => c.args[0]);
    assert.deepEqual(has[0], [11, 13], "un appel pour le lot");
    assert.equal(has.length, 3, "puis un par fiche, le lot ayant été refusé");
  });

  it("refuse correction et approbation sans la capacité, avant d'écrire", async () => {
    const repo = new OdooAttendanceRepository(shared());
    await assert.rejects(repo.updateAttendance(13, { movements: { meals: 1 } }, viewer), isCode("forbidden"));
    await assert.rejects(repo.approveHours(13, viewer), isCode("forbidden"));
    assert.equal(odoo.calls.filter((c) => c.method === "write" || c.method.startsWith("action_")).length, 0);
  });

  it("traduit une ValidationError Odoo en règle métier", async () => {
    const repo = new OdooAttendanceRepository(shared());
    await assert.rejects(
      repo.updateAttendance(11, { movements: { meals: 4 } }, viewer),
      (e: unknown) => e instanceof DomainError && e.code === "business_rule" && e.message.includes("Repas"),
    );
    assert.deepEqual(odoo.calls.find((c) => c.method === "write")?.args, [[11], { meal_count: 4 }]);
  });

  it("sans groupe d'approbation configuré, approuver = pouvoir modifier", async () => {
    const t = new OdooClient({ url: odoo.url, db: "test", user: "poc", password: "cle-api" });
    const withGroup = await attendanceCapabilities(t, [11], "groupe.inexistant");
    assert.deepEqual(withGroup.get(11), { canEdit: true, canApprove: false });
    const without = await attendanceCapabilities(t, [11], null);
    assert.deepEqual(without.get(11), { canEdit: true, canApprove: true });
    assert.deepEqual(await recordAccess(t, "hr.attendance", []), new Map());
  });
});

describe("Adapter Odoo 18 : protocole (mode odoo-session, cookie)", () => {
  const odoo = new FakeOdoo();
  const conn = () => ({ url: odoo.url, db: "test" });
  before(() => odoo.start());
  after(() => odoo.stop());
  beforeEach(() => odoo.reset());

  it("ouvre une session et appelle call_kw avec le cookie, sous l'uid de l'utilisateur", async () => {
    const t = await SessionTransport.authenticate(conn(), "p.manager", "manager-pw");
    assert.equal(t.uid, 7);
    await t.callKw({ model: "res.users", method: "read", args: [[7], ["name"]], kwargs: {} });
    assert.deepEqual(odoo.paths, ["/web/session/authenticate", "/web/dataset/call_kw/res.users/read"]);
    assert.equal(odoo.calls[0]?.transport, "session");
    assert.equal(odoo.calls[0]?.uid, 7);
  });

  it("refuse des identifiants faux avec un message générique", async () => {
    await assert.rejects(
      SessionTransport.authenticate(conn(), "p.manager", "faux"),
      (e: unknown) => e instanceof DomainError && e.code === "unauthenticated" && e.message === "Identifiant ou mot de passe incorrect.",
    );
    await assert.rejects(SessionTransport.authenticate(conn(), "inconnu", "manager-pw"), isCode("unauthenticated"));
  });

  it("traduit une session expirée en « unauthenticated » et le signale à isAlive", async () => {
    const t = await SessionTransport.authenticate(conn(), "p.employe", "employe-pw");
    assert.equal(await t.isAlive(), true);
    odoo.expire(9);
    assert.equal(await t.isAlive(), false);
    await assert.rejects(t.callKw({ model: "res.users", method: "read", args: [[9]], kwargs: {} }), isCode("unauthenticated"));
  });

  it("destroy ferme la session Odoo", async () => {
    const opened = odoo.sessions.size;
    const t = await SessionTransport.authenticate(conn(), "p.employe", "employe-pw");
    assert.equal(odoo.sessions.size, opened + 1);
    await t.destroy();
    assert.equal(odoo.sessions.size, opened);
  });

  it("UserSessions ne retombe jamais sur un compte partagé", async () => {
    const sessions = new UserSessions();
    assert.throws(() => sessions.for({ id: 1, role: "hr_admin" }), isCode("unauthenticated"));
    assert.throws(() => sessions.for({ id: 1, role: "hr_admin", backendHandle: "forgé" }), isCode("unauthenticated"));
    const t = await SessionTransport.authenticate(conn(), "p.employe", "employe-pw");
    const handle = sessions.register(t);
    assert.equal(handle.length, 43, "256 bits d'aléa");
    assert.equal(sessions.for({ id: 9, role: "employee", backendHandle: handle }), t);
    await t.destroy();
  });

  it("la même fiche donne des droits différents selon la personne", async () => {
    const sessions = new UserSessions();
    const repo = new OdooEmployeeRepository(sessions);
    const as = async (login: string, password: string, role: ViewerContext["role"]): Promise<ViewerContext> => {
      const t = await SessionTransport.authenticate(conn(), login, password);
      return { id: t.uid, role, backendHandle: sessions.register(t) };
    };
    const manager = await as("p.manager", "manager-pw", "manager");
    const employe = await as("p.employe", "employe-pw", "employee");
    const editable = (r: Awaited<ReturnType<typeof repo.getEmployeeById>>) =>
      r?.formTree.flatMap((g) => g.children).some((n) => n.kind !== "group" && n.editable);
    assert.equal(editable(await repo.getEmployeeById(6, manager)), true);
    assert.equal(editable(await repo.getEmployeeById(6, employe)), false, "pas d'auto-modification (Q-05)");
    // Plus de filtre par département recodé en mode session : Odoo filtre seul
    const list = await repo.listEmployees({}, { ...manager, departmentId: 999 });
    assert.deepEqual(list.items.map((e) => e.id).sort(), [5, 6]);
  });
});
