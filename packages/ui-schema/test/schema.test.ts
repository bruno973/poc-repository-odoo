// test/schema.test.ts — Schéma de vue : version, validation stricte, sérialisation.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCompatibleVersion, QueryRequestSchema, RecordPayloadSchema, SCHEMA_VERSION, ViewSchemaSchema, type ViewSchema } from "../src/index.js";

const view: ViewSchema = {
  schemaVersion: SCHEMA_VERSION,
  viewKey: "v1",
  viewType: "form",
  title: "Fiche",
  resourceKey: "r1",
  resourceKind: "compatibility",
  capabilities: { canCreate: false, canEdit: true, canDelete: false },
  fields: {
    name: { key: "name", label: "Nom", type: "text", readonly: false, required: true },
    state: { key: "state", label: "État", type: "selection", readonly: true, required: false, options: [{ value: "a", label: "A" }] },
  },
  root: [
    {
      kind: "sheet",
      children: [
        { kind: "group", columns: 2, children: [{ kind: "field", field: "name", showLabel: true, readonly: { op: "field", field: "state" } }] },
        { kind: "notebook", pages: [{ kind: "page", label: "Plus", children: [{ kind: "unsupported", sourceTag: "widget", reason: "OWL" }] }] },
        { kind: "button", label: "Valider", primary: true, invisible: { op: "unsupported", source: "uid" } },
      ],
    },
  ],
  diagnostics: [{ code: "unsupported_node", severity: "warning", path: "root/sheet/notebook/page[0]/widget", message: "x" }],
};

describe("ViewSchema", () => {
  it("valide un schéma complet et le relit à l'identique (sérialisation stable)", () => {
    const parsed = ViewSchemaSchema.parse(JSON.parse(JSON.stringify(view)));
    assert.deepEqual(parsed, view);
  });
  it("refuse une autre version majeure", () => {
    assert.ok(!ViewSchemaSchema.safeParse({ ...view, schemaVersion: "2.0" }).success);
    assert.equal(isCompatibleVersion("1.3"), true);
    assert.equal(isCompatibleVersion("2.0"), false);
  });
  it("refuse un nœud inconnu ou mal formé", () => {
    const bad = (root: unknown) => !ViewSchemaSchema.safeParse({ ...view, root }).success;
    assert.ok(bad([{ kind: "html", content: "<script>" }]));
    assert.ok(bad([{ kind: "field" }]));
    assert.ok(bad([{ kind: "group", columns: 9, children: [] }]));
  });
  it("refuse un type de champ inconnu", () => {
    assert.ok(!ViewSchemaSchema.safeParse({ ...view, fields: { x: { key: "x", label: "X", type: "owl", readonly: true, required: false } } }).success);
  });
  it("conserve l'ordre des nœuds", () => {
    const parsed = ViewSchemaSchema.parse(view);
    const sheet = parsed.root[0];
    assert.ok(sheet && sheet.kind === "sheet");
    assert.deepEqual(sheet.children.map((n) => n.kind), ["group", "notebook", "button"]);
  });
});

describe("Requêtes et enregistrements", () => {
  it("borne les requêtes", () => {
    assert.ok(!QueryRequestSchema.safeParse({ limit: 10_000 }).success);
    assert.deepEqual(QueryRequestSchema.parse({}), { filters: [], search: [], limit: 80, offset: 0 });
  });
  it("valide un enregistrement", () => {
    assert.ok(
      RecordPayloadSchema.safeParse({
        schemaVersion: SCHEMA_VERSION,
        resourceKey: "r1",
        id: 4,
        values: { name: "A", dept: { id: 1, label: "D" }, n: null },
        access: { canEdit: false, readonlyFields: [] },
        commands: {},
      }).success,
    );
  });
});
