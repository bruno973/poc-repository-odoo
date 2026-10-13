// test/visibility.test.ts — Élagage côté serveur et règles de visibilité.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockEmployeeRepository } from "../src/adapters/mock/index.js";
import type { EmployeeFormRecord, FormNode, ViewerContext, VisibleIf } from "../src/domain/tree.js";
import { applyVisibility, isVisible } from "../src/domain/visibility.js";

const keys = (record: EmployeeFormRecord): string[] => {
  const out: string[] = [];
  const walk = (nodes: readonly FormNode[]) => {
    for (const n of nodes) {
      out.push(n.key);
      if (n.kind === "group") walk(n.children);
    }
  };
  walk(record.formTree);
  return out;
};

const repo = new MockEmployeeRepository();
const admin: ViewerContext = { id: 99, role: "hr_admin", employeeId: 99 };
const managerOther: ViewerContext = { id: 1, role: "manager", employeeId: 1 };
const self: ViewerContext = { id: 2, role: "employee", employeeId: 2 };

describe("Visibilité évaluée côté serveur", () => {
  it("retire les données privées d'un collègue pour un manager", async () => {
    const record = await repo.getEmployeeById(2, managerOther);
    assert.ok(record);
    const visible = keys(applyVisibility(record, managerOther));
    assert.ok(!visible.includes("infoPrivee.ssnId"), "n° sécurité sociale exposé");
    assert.ok(!visible.includes("infoPrivee.passportId"));
    assert.ok(!visible.includes("parametres"), "onglet Paramètres exposé");
    // Les informations professionnelles restent visibles
    assert.ok(visible.includes("header.workEmail"));
    // NB : le contact d'urgence est déclaré SELF_OR_MANAGER_PLUS, mais il est rangé
    // dans le groupe « Informations privées » (SELF_OR_ADMIN) : le manager ne le voit
    // donc pas. C'était déjà le cas avant (onglet masqué côté front). À trancher.
    assert.ok(!visible.includes("infoPrivee.emergencyContact"));
  });

  it("ne laisse plus fuiter le conjoint vers un viewer qui n'est ni soi ni admin", async () => {
    const record = await repo.getEmployeeById(2, managerOther);
    assert.ok(record);
    const visible = keys(applyVisibility(record, managerOther));
    assert.ok(!visible.includes("infoPrivee.spouseName"));
    assert.ok(!visible.includes("infoPrivee.spouseBirthdate"));
  });

  it("garde les données privées pour soi-même et pour l'admin RH", async () => {
    const record = await repo.getEmployeeById(2, self);
    assert.ok(record);
    assert.ok(keys(applyVisibility(record, self)).includes("infoPrivee.ssnId"));
    assert.ok(keys(applyVisibility(record, admin)).includes("infoPrivee.ssnId"));
  });

  it("ne sérialise aucune valeur masquée dans la réponse", async () => {
    const record = await repo.getEmployeeById(2, managerOther);
    assert.ok(record);
    const raw = await repo.getEmployeeById(2, admin);
    assert.ok(raw);
    const json = JSON.stringify(applyVisibility(record, managerOther));
    // Valeur réelle du n° de sécu dans les fixtures, lue via la vue admin
    const ssn = JSON.stringify(applyVisibility(raw, admin)).match(/"infoPrivee\.ssnId"[^}]*"value":"([^"]+)"/)?.[1];
    if (ssn) assert.ok(!json.includes(ssn), "la valeur masquée est encore dans le JSON");
  });

  it("refuse une condition « field » qu'on ne peut pas évaluer", () => {
    const rule: VisibleIf = { kind: "field", field: "x", operator: "neq", value: "single" };
    assert.equal(isVisible(rule, admin, 1, { x: null }), false);
    assert.equal(isVisible(rule, admin, 1, { x: "married" }), true);
  });

  it("combine and / or", () => {
    const rule: VisibleIf = {
      kind: "and",
      conditions: [{ kind: "self" }, { kind: "role", roles: ["employee"] }],
    };
    assert.equal(isVisible(rule, self, 2, {}), true);
    assert.equal(isVisible(rule, self, 3, {}), false);
  });
});
