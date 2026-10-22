// test/ui-security.test.ts — Le moteur générique ne contourne aucun droit (§ 6, GO-05, GO-06, GO-09).
// Toujours avec plusieurs comptes de droits différents, jamais seulement l'admin.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { RecordPayload, ViewSchema } from "@leila/ui-schema";
import { openAction, startUiHarness, type UiClient, type UiHarness } from "./ui-harness.js";

describe("Moteur de présentation : sécurité", () => {
  let h: UiHarness;
  let admin: UiClient;
  let manager: UiClient;
  let employe: UiClient;
  before(async () => {
    h = await startUiHarness();
    [admin, manager, employe] = await Promise.all([h.as("p.admin", "admin-pw"), h.as("p.manager", "manager-pw"), h.as("p.employe", "employe-pw")]);
  });
  after(() => h.close());

  const employees = (c: UiClient) => openAction(c, "Employés");
  const attendances = (c: UiClient) => openAction(c, "Présences");
  const form = async (c: UiClient, action: { views: { form?: string } }) => (await c.get(`/api/ui/v1/views/${action.views.form}`)).json() as ViewSchema;
  const record = async (c: UiClient, resourceKey: string, id: number) => c.get(`/api/ui/v1/resources/${resourceKey}/records/${id}`);

  it("navigation : périmètre MVP seulement, actions non génériques indisponibles", async () => {
    const body = (await admin.get("/api/ui/v1/navigation")).body;
    assert.ok(!body.includes("Facturation"), "menu hors périmètre publié");
    const nav = JSON.parse(body) as { menus: { label: string; children: { label: string; available: boolean }[] }[] };
    const kiosk = nav.menus.flatMap((m) => m.children).find((m) => m.label === "Mode kiosque");
    assert.equal(kiosk?.available, false);
  });

  it("les clés d'un utilisateur sont inutilisables par un autre (404)", async () => {
    const mine = await employees(manager);
    assert.equal((await employe.get(`/api/ui/v1/views/${mine.views.form}`)).statusCode, 404);
    assert.equal((await employe.get(`/api/ui/v1/resources/${mine.resourceKey}/records/6`)).statusCode, 404);
    assert.equal((await employe.get(`/api/ui/v1/actions/${mine.actionKey}`)).statusCode, 404);
  });

  it("champs non lisibles : absents du schéma, des valeurs et des libellés (GO-05)", async () => {
    const a = await employees(employe);
    const schema = await form(employe, a);
    assert.equal(schema.fields["ssnid"], undefined);
    assert.ok(!JSON.stringify(schema).includes("Informations privées"), "onglet réservé au groupe RH publié");
    const rec = await record(employe, a.resourceKey, 6);
    assert.equal(rec.statusCode, 200);
    assert.ok(!rec.body.includes("ssnid") && !rec.body.includes("973 003"), "valeur privée transmise");
    // Cache isolé : l'admin, lui, a bien l'onglet et le champ (GO-09)
    const full = await form(admin, await employees(admin));
    assert.ok(full.fields["ssnid"]);
  });

  it("enregistrement hors règles d'accès : refusé par le moteur", async () => {
    const a = await employees(employe);
    assert.equal((await record(employe, a.resourceKey, 8)).statusCode, 403);
  });

  it("écriture autorisée : manager sur un membre de son équipe", async () => {
    const a = await employees(manager);
    const res = await manager.patch(`/api/ui/v1/resources/${a.resourceKey}/records/6`, { values: { job_title: "Soudeur" } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((res.json() as RecordPayload).values["job_title"], "Soudeur");
  });

  it("écritures interdites fabriquées à la main : toutes refusées avant Odoo (GO-06)", async () => {
    const m = await employees(manager);
    const ad = await employees(admin);
    const e = await employees(employe);
    h.odoo.reset();
    const cases: [UiClient, string, number, Record<string, unknown>, string][] = [
      [employe, e.resourceKey, 6, { job_title: "Chef" }, "auto-modification (Q-05) et droits Odoo"],
      [manager, m.resourceKey, 5, { job_title: "Chef" }, "sa propre fiche"],
      [manager, m.resourceKey, 6, { ssnid: "x" }, "champ absent du schéma (non lisible)"],
      [admin, ad.resourceKey, 6, { work_email: "x@y.z" }, "widget non pris en charge → lecture seule"],
      [admin, ad.resourceKey, 6, { hours_last_month: 1 }, "champ en lecture seule"],
      [admin, ad.resourceKey, 8, { coach_id: 5 }, "readonly conditionnel (pas de manager)"],
      [admin, ad.resourceKey, 5, { mobile_phone: "06" }, "invisible conditionnel (pas de téléphone pro)"],
      [admin, ad.resourceKey, 6, { user_id: 2 }, "readonly non pris en charge → lecture seule"],
      [admin, ad.resourceKey, 6, { department_id: 1 }, "domaine de sélection non pris en charge"],
      [admin, ad.resourceKey, 6, { category_ids: [1] }, "type non pris en charge"],
    ];
    for (const [c, key, id, values, why] of cases) {
      const res = await c.patch(`/api/ui/v1/resources/${key}/records/${id}`, { values });
      assert.ok([400, 403].includes(res.statusCode), `${why} : ${res.statusCode} ${res.body}`);
    }
    assert.equal(h.odoo.calls.filter((x) => x.method === "write").length, 0, "un write est parti vers Odoo");
  });

  it("valeurs : typées et sélectionnables uniquement dans le domaine", async () => {
    const ad = await employees(admin);
    const bad = await admin.patch(`/api/ui/v1/resources/${ad.resourceKey}/records/6`, { values: { tz: "Mars/Olympus" } });
    assert.equal(bad.statusCode, 400);
    const ok = await admin.patch(`/api/ui/v1/resources/${ad.resourceKey}/records/6`, { values: { coach_id: 1, tz: "Europe/Paris" } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.deepEqual((ok.json() as RecordPayload).values["coach_id"], { id: 1, label: "Alice Admin" });
  });

  it("commandes : registre fermé, droits et conditions revérifiés", async () => {
    const m = await attendances(manager);
    const formView = await form(manager, m);
    const flat = JSON.stringify(formView);
    assert.ok(flat.includes('"label":"Kiosque"') && !/"label":"Kiosque","commandKey"/.test(flat), "bouton hors registre exécutable");
    const rec = (await record(manager, m.resourceKey, 11)).json() as RecordPayload;
    const [approveKey] = Object.entries(rec.commands).find(([, v]) => v.available) ?? [];
    assert.ok(approveKey, "approbation indisponible pour le manager");
    // Un autre utilisateur ne peut pas réutiliser la clé
    const e = await attendances(employe);
    assert.equal((await employe.post(`/api/ui/v1/commands/${approveKey}`, { resourceKey: e.resourceKey, recordId: 11 })).statusCode, 404);
    // Hors droits d'écriture : pointage 13 (pas dans l'équipe du manager)
    assert.equal((await manager.post(`/api/ui/v1/commands/${approveKey}`, { resourceKey: m.resourceKey, recordId: 13 })).statusCode, 403);
    const done = await manager.post(`/api/ui/v1/commands/${approveKey}`, { resourceKey: m.resourceKey, recordId: 11 });
    assert.equal(done.statusCode, 200, done.body);
    assert.equal((done.json() as RecordPayload).values["overtime_status"], "approved");
    // Condition du bouton désormais vraie (déjà approuvé) → refusé
    assert.equal((await manager.post(`/api/ui/v1/commands/${approveKey}`, { resourceKey: m.resourceKey, recordId: 11 })).statusCode, 403);
  });

  it("aucune méthode libre : pas de route d'appel ORM, corps inconnus refusés", async () => {
    assert.equal((await admin.post("/api/ui/v1/call", { model: "res.users", method: "write" })).statusCode, 404);
    const m = await attendances(admin);
    const q = await admin.post(`/api/ui/v1/resources/${m.resourceKey}/query`, { domain: [["id", ">", 0]], filters: ["inconnu"] });
    assert.equal(q.statusCode, 400);
  });

  it("filtres : seuls ceux pris en charge sont applicables, combinés comme Odoo", async () => {
    const a = await attendances(admin);
    const search = (await admin.get(`/api/ui/v1/views/${a.views.search}`)).json() as ViewSchema;
    const key = (label: string) => search.root.find((n) => n.kind === "filter" && n.label === label);
    const mine = key("Mes présences");
    assert.ok(mine && mine.kind === "filter" && !mine.available);
    assert.equal((await admin.post(`/api/ui/v1/resources/${a.resourceKey}/query`, { filters: [mine.filterKey] })).statusCode, 400);
    const present = key("Présent");
    const toApprove = key("À approuver");
    assert.ok(present?.kind === "filter" && toApprove?.kind === "filter");
    const res = await admin.post(`/api/ui/v1/resources/${a.resourceKey}/query`, { filters: [present.filterKey, toApprove.filterKey] });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual((res.json() as { records: { id: number }[] }).records.map((r) => r.id), []);
    const either = await admin.post(`/api/ui/v1/resources/${a.resourceKey}/query`, { filters: [present.filterKey] });
    assert.deepEqual((either.json() as { records: { id: number }[] }).records.map((r) => r.id), [13]);
  });

  it("action à domaine dynamique : indisponible, et ses enregistrements aussi", async () => {
    const team = await openAction(admin, "Mon équipe");
    assert.equal(team.available, false);
    assert.equal((await admin.post(`/api/ui/v1/resources/${team.resourceKey}/query`, {})).statusCode, 403);
  });

  it("anti-CSRF sur les écritures et commandes du moteur", async () => {
    const a = await employees(admin);
    assert.equal((await admin.patch(`/api/ui/v1/resources/${a.resourceKey}/records/6`, { values: {} }, {})).statusCode, 403);
  });

  it("invalidation du cache : administrateur technique uniquement", async () => {
    assert.equal((await manager.post("/api/ui/v1/cache/refresh")).statusCode, 403);
    assert.equal((await admin.post("/api/ui/v1/cache/refresh")).statusCode, 200);
  });

  it("sans session : 401 partout", async () => {
    const res = await h.app.inject({ method: "GET", url: "/api/ui/v1/navigation" });
    assert.equal(res.statusCode, 401);
  });
});
