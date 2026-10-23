// test/ui-lot1.test.ts — Lot 1 (managers) : étiquettes, lignes liées, images, regroupements.
// Toujours sous l'identité de l'utilisateur, avec plusieurs comptes de droits différents.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { LinesValue, QueryResult, RecordPayload, ViewSchema } from "@leila/ui-schema";
import { PNG_1PX } from "./fake-odoo-ui.js";
import { openAction, startUiHarness, type UiClient, type UiHarness } from "./ui-harness.js";

describe("Lot 1 : étiquettes, lignes liées, images, regroupements", () => {
  let h: UiHarness;
  let admin: UiClient;
  let manager: UiClient;
  let employe: UiClient;
  before(async () => {
    h = await startUiHarness();
    [admin, manager, employe] = await Promise.all([h.as("p.admin", "admin-pw"), h.as("p.manager", "manager-pw"), h.as("p.employe", "employe-pw")]);
  });
  after(() => h.close());

  const record = async (c: UiClient, rk: string, id: number) => (await c.get(`/api/ui/v1/resources/${rk}/records/${id}`)).json() as RecordPayload;
  const query = async (c: UiClient, rk: string, body: object) => c.post(`/api/ui/v1/resources/${rk}/query`, body);

  it("étiquettes : noms lus avec les droits de l'utilisateur", async () => {
    const a = await openAction(manager, "Employés");
    const form = (await manager.get(`/api/ui/v1/views/${a.views.form}`)).json() as ViewSchema;
    assert.equal(form.fields["category_ids"]?.type, "references");
    const rec = await record(manager, a.resourceKey, 5);
    assert.deepEqual(rec.values["category_ids"], [{ id: 1, label: "Encadrement" }, { id: 2, label: "Sécurité" }]);
  });

  it("lignes liées : colonnes de la sous-liste, colonne masquée jamais lue ni publiée", async () => {
    const a = await openAction(admin, "Employés");
    const form = (await admin.get(`/api/ui/v1/views/${a.views.form}`)).json() as ViewSchema;
    assert.deepEqual(form.fields["child_ids"]?.lines?.columns, ["name", "job_title"]);
    h.odoo.reset();
    const rec = await record(admin, a.resourceKey, 1);
    const lines = rec.values["child_ids"] as LinesValue;
    assert.deepEqual(lines, { lines: [{ id: 5, values: { name: "Manon Manager", job_title: "Cheffe d'atelier" } }], total: 1 });
    const linesRead = h.odoo.calls.find((c) => c.method === "read" && JSON.stringify(c.args[0]) === "[5]");
    assert.deepEqual(linesRead?.args[1], ["name", "job_title"], "seules les colonnes publiées sont lues");
    assert.ok(!JSON.stringify(rec).includes("manon@perso.gf"));
  });

  it("lignes liées : lues sous l'identité du manager (sa fiche, son équipe)", async () => {
    const a = await openAction(manager, "Employés");
    const lines = (await record(manager, a.resourceKey, 5)).values["child_ids"] as LinesValue;
    assert.deepEqual(lines.lines.map((l) => l.id), [6]);
  });

  it("image : jeton de version dans les valeurs, contenu par la route dédiée", async () => {
    const a = await openAction(admin, "Employés");
    const rec = await record(admin, a.resourceKey, 1);
    assert.equal(typeof rec.values["image_1920"], "string");
    assert.ok(!JSON.stringify(rec).includes(PNG_1PX.slice(0, 20)), "contenu binaire dans les valeurs");
    const img = await admin.get(`/api/ui/v1/resources/${a.resourceKey}/records/1/images/image_1920`);
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers["content-type"], "image/png");
    assert.equal(img.headers["x-content-type-options"], "nosniff");
    assert.match(String(img.headers["cache-control"]), /^private/);
    assert.deepEqual(img.rawPayload, Buffer.from(PNG_1PX, "base64"));
  });

  it("image : SVG refusé, champ non image refusé, fiche hors droits refusée, clé d'un autre refusée", async () => {
    const a = await openAction(admin, "Employés");
    assert.equal((await admin.get(`/api/ui/v1/resources/${a.resourceKey}/records/5/images/image_1920`)).statusCode, 404, "SVG servi");
    assert.equal((await admin.get(`/api/ui/v1/resources/${a.resourceKey}/records/1/images/name`)).statusCode, 404);
    assert.equal((await admin.get(`/api/ui/v1/resources/${a.resourceKey}/records/1/images/ssnid`)).statusCode, 404);
    const mine = await openAction(employe, "Employés");
    assert.equal((await employe.get(`/api/ui/v1/resources/${mine.resourceKey}/records/1/images/image_1920`)).statusCode, 403);
    assert.equal((await employe.get(`/api/ui/v1/resources/${a.resourceKey}/records/1/images/image_1920`)).statusCode, 404);
  });

  it("regroupement : proposé par la recherche, groupes limités aux droits du manager", async () => {
    const a = await openAction(manager, "Présences");
    const search = (await manager.get(`/api/ui/v1/views/${a.views.search}`)).json() as ViewSchema;
    const byEmployee = search.root.find((n) => n.kind === "groupBy" && n.label === "Employé");
    assert.ok(byEmployee && byEmployee.kind === "groupBy" && byEmployee.available);
    const res = await query(manager, a.resourceKey, { groupBy: byEmployee.groupKey });
    assert.equal(res.statusCode, 200, res.body);
    const grouped = res.json() as QueryResult;
    assert.deepEqual(grouped.records, []);
    assert.deepEqual(grouped.groups?.map((g) => [g.label, g.count]).sort(), [["Manon Manager", 1], ["Émile Employé", 1]]);
    assert.ok(!res.body.includes("Hugo"), "groupe hors droits");
    // Enregistrements d'un groupe : domaine recalculé par le serveur (la clé n'est qu'une référence)
    const emile = grouped.groups?.find((g) => g.label === "Émile Employé");
    const inGroup = (await query(manager, a.resourceKey, { groupBy: byEmployee.groupKey, group: emile?.key })).json() as QueryResult;
    assert.deepEqual(inGroup.records.map((r) => r.id), [11]);
  });

  it("regroupement : clé de groupe inventée → vide ; regroupement inconnu ou groupe seul → 400", async () => {
    const a = await openAction(manager, "Présences");
    const search = (await manager.get(`/api/ui/v1/views/${a.views.search}`)).json() as ViewSchema;
    const g = search.root.find((n) => n.kind === "groupBy");
    assert.ok(g && g.kind === "groupBy");
    const forged = (await query(manager, a.resourceKey, { groupBy: g.groupKey, group: "r:8" })).json() as QueryResult;
    assert.deepEqual(forged.records, [], "groupe hors droits atteint par une clé forgée");
    assert.equal((await query(manager, a.resourceKey, { groupBy: "zz" })).statusCode, 400);
    assert.equal((await query(manager, a.resourceKey, { group: "r:6" })).statusCode, 400);
  });

  it("regroupement par sélection : libellés des options", async () => {
    const a = await openAction(admin, "Présences");
    const search = (await admin.get(`/api/ui/v1/views/${a.views.search}`)).json() as ViewSchema;
    const g = search.root.find((n) => n.kind === "groupBy" && n.label === "Statut");
    assert.ok(g && g.kind === "groupBy");
    const res = (await query(admin, a.resourceKey, { groupBy: g.groupKey })).json() as QueryResult;
    assert.deepEqual(res.groups?.map((x) => x.label).sort(), ["Approuvé", "Non défini", "À approuver"]);
  });

  it("regroupement par défaut : group_by du contexte d'action (premier niveau seulement)", async () => {
    const team = (await openAction(admin, "Mon équipe")) as { defaultGroupBy?: string; views: { search?: string } };
    assert.ok(team.defaultGroupBy, "regroupement par défaut absent");
    const search = (await admin.get(`/api/ui/v1/views/${team.views.search}`)).json() as ViewSchema;
    const g = search.root.find((n) => n.kind === "groupBy" && n.groupKey === team.defaultGroupBy);
    assert.ok(g && g.kind === "groupBy" && g.label === "Département");
    assert.ok(search.diagnostics.some((d) => d.message.includes("plusieurs niveaux")));
  });
});
