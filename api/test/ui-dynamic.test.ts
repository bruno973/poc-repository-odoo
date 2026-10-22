// test/ui-dynamic.test.ts — Jalon : un champ ajouté par héritage de vue dans Odoo 18
// apparaît dans le schéma Leila (donc à l'écran) sans modifier le front ni le schéma
// à la main, après invalidation du cache — et seulement pour qui a le droit de le lire.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { RecordPayload, ViewSchema } from "@leila/ui-schema";
import { openAction, startUiHarness, type UiClient, type UiHarness } from "./ui-harness.js";

describe("Jalon : vue héritée → schéma Leila mis à jour", () => {
  let h: UiHarness;
  let admin: UiClient;
  let manager: UiClient;
  before(async () => {
    h = await startUiHarness();
    [admin, manager] = await Promise.all([h.as("p.admin", "admin-pw"), h.as("p.manager", "manager-pw")]);
  });
  after(() => h.close());

  const formOf = async (c: UiClient) => {
    const a = await openAction(c, "Employés");
    return { a, view: (await c.get(`/api/ui/v1/views/${a.views.form}`)).json() as ViewSchema };
  };

  it("ajoute « badge_id » (leila_hr) puis « matricule_paie » réservé aux RH", async () => {
    const before = await formOf(admin);
    assert.equal(before.view.fields["badge_id"], undefined);

    // Héritage simulé (équivalent d'un <xpath expr="//field[@name='work_phone']" position="after"> installé dans Odoo)
    h.state.fields["hr.employee"] = {
      ...h.state.fields["hr.employee"],
      badge_id: { type: "char", string: "Badge (leila_hr)" },
      matricule_paie: { type: "char", string: "Matricule paie", groups: "hr.group_hr_user" },
    };
    h.state.archs["hr.employee:form"] = (h.state.archs["hr.employee:form"] as string).replace(
      '<field name="work_phone"/>',
      '<field name="work_phone"/><field name="badge_id"/><field name="matricule_paie" groups="hr.group_hr_user"/>',
    );
    for (const e of h.state.employees) Object.assign(e, { badge_id: `B-${e.id}`, matricule_paie: `P-${e.id}` });

    // Avant invalidation : définition en cache (durée courte)
    assert.equal((await formOf(admin)).view.fields["badge_id"], undefined);
    assert.equal((await admin.post("/api/ui/v1/cache/refresh")).statusCode, 200);

    const after = await formOf(admin);
    assert.equal(after.view.fields["badge_id"]?.label, "Badge (leila_hr)");
    assert.ok(JSON.stringify(after.view.root).includes('"field":"badge_id"'), "nœud absent de la fiche");
    const rec = (await admin.get(`/api/ui/v1/resources/${after.a.resourceKey}/records/6`)).json() as RecordPayload;
    assert.equal(rec.values["badge_id"], "B-6");
    // Écriture possible sur le nouveau champ, sans code spécifique
    const w = await admin.patch(`/api/ui/v1/resources/${after.a.resourceKey}/records/6`, { values: { badge_id: "B-600" } });
    assert.equal(w.statusCode, 200, w.body);

    // Droits : le manager voit badge_id mais pas le champ réservé aux RH
    const m = await formOf(manager);
    assert.ok(m.view.fields["badge_id"]);
    assert.equal(m.view.fields["matricule_paie"], undefined);
    const mrec = await manager.get(`/api/ui/v1/resources/${m.a.resourceKey}/records/6`);
    assert.ok(!mrec.body.includes("P-6"));
  });

  it("le cache expire seul après sa durée de vie", async () => {
    const short = await startUiHarness({ UI_VIEW_CACHE_TTL_SECONDS: "0" });
    try {
      const c = await short.as("p.admin", "admin-pw");
      short.state.fields["hr.employee"] = { ...short.state.fields["hr.employee"], badge_id: { type: "char", string: "Badge" } };
      await formOf(c);
      short.state.archs["hr.employee:form"] = (short.state.archs["hr.employee:form"] as string).replace('<field name="work_phone"/>', '<field name="work_phone"/><field name="badge_id"/>');
      assert.ok((await formOf(c)).view.fields["badge_id"]);
    } finally {
      await short.close();
    }
  });
});
