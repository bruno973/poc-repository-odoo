// test/ui-odoo18-parser.test.ts — Architectures résolues Odoo 18 → Leila UI Schema.
// Fixtures : test/fixtures/odoo18 (reconstructions, à remplacer par les vues de amg).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Node } from "@leila/ui-schema";
import { asDomain, combineDomains, normalizeDomain, parseCondition, parseFlag, parseLiteral } from "../src/adapters/odoo18/ui/OdooExpressionParser.js";
import { type OdooFieldMeta, parseArch } from "../src/adapters/odoo18/ui/OdooViewParser.js";
import { uiState } from "./fake-odoo-ui.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/odoo18/${name}`, import.meta.url), "utf8");
const state = uiState();
const ctx = (model: string, opts: { without?: string[] } = {}) => ({
  model,
  fields: Object.fromEntries(Object.entries(state.fields[model] ?? {}).filter(([k]) => !opts.without?.includes(k))) as Record<string, OdooFieldMeta>,
  commandFor: (b: { name: string; type: string }) =>
    b.type === "object" && ["action_approve_overtime", "action_refuse_overtime"].includes(b.name) ? `cmd:${b.name}` : undefined,
});

function flatten(nodes: Node[], out: Node[] = []): Node[] {
  for (const n of nodes) {
    out.push(n);
    if (n.kind === "notebook") n.pages.forEach((p) => (out.push(p), flatten(p.children, out)));
    else if ("children" in n) flatten(n.children, out);
  }
  return out;
}

describe("Expressions Odoo → AST", () => {
  it("reconnaît le sous-ensemble sûr", () => {
    assert.deepEqual(parseCondition("not work_phone"), { op: "not", arg: { op: "field", field: "work_phone" } });
    assert.deepEqual(parseCondition("marital not in ['married', 'cohabitant']"), {
      op: "not in",
      left: { op: "field", field: "marital" },
      right: { op: "const", value: ["married", "cohabitant"] },
    });
    assert.deepEqual(parseCondition("state == 'done' or (amount > 10 and not parent.locked)"), {
      op: "or",
      args: [
        { op: "==", left: { op: "field", field: "state" }, right: { op: "const", value: "done" } },
        { op: "and", args: [{ op: ">", left: { op: "field", field: "amount" }, right: { op: "const", value: 10 } }, { op: "not", arg: { op: "field", field: "locked", scope: "parent" } }] },
      ],
    });
    assert.deepEqual(parseCondition("count >= -1.5"), { op: ">=", left: { op: "field", field: "count" }, right: { op: "const", value: -1.5 } });
  });
  it("refuse tout le reste sans rien exécuter", () => {
    for (const src of ["context.get('x')", "id and uid", "__import__('os').system('rm')", "a.b", "f(x)", "x[0]", "lambda: 1", "today", "1 < x < 3", "'a' + 'b'", "x if y else z"]) {
      assert.equal(parseCondition(src).op, "unsupported", src);
    }
  });
  it("attributs booléens", () => {
    assert.equal(parseFlag("1"), true);
    assert.equal(parseFlag("True"), true);
    assert.equal(parseFlag("0"), false);
    assert.equal(parseFlag(undefined), undefined);
  });
  it("domaines et contextes littéraux uniquement", () => {
    assert.deepEqual(asDomain(parseLiteral("[('active', '=', False)]")), [["active", "=", false]]);
    assert.deepEqual(parseLiteral("{'create': False, 'n': 1}"), { create: false, n: 1 });
    assert.equal(parseLiteral("[('user_id', '=', uid)]"), null);
    assert.equal(asDomain(parseLiteral("[('a', '=')]")), null);
  });
  it("combine les domaines comme Odoo (notation préfixée)", () => {
    assert.deepEqual(normalizeDomain([["a", "=", 1], ["b", "=", 2]]), ["&", ["a", "=", 1], ["b", "=", 2]]);
    assert.deepEqual(combineDomains("|", [[["a", "=", 1]], [["b", "=", 2]]]), ["|", ["a", "=", 1], ["b", "=", 2]]);
    assert.deepEqual(combineDomains("&", [[], [["a", "=", 1]]]), [["a", "=", 1]]);
  });
});

describe("Fiche employé (form)", () => {
  const view = parseArch(fixture("hr.employee.form.xml"), "form", ctx("hr.employee"));
  const nodes = flatten(view.root);
  const field = (name: string) => nodes.find((n): n is Extract<Node, { kind: "field" }> => n.kind === "field" && n.field === name);

  it("importe structure, champs et onglets sans configuration manuelle", () => {
    assert.equal(view.root[0]?.kind, "header");
    assert.equal(view.root[1]?.kind, "sheet");
    assert.ok(field("name") && field("job_title") && field("department_id"));
    const notebook = nodes.find((n) => n.kind === "notebook");
    assert.ok(notebook && notebook.kind === "notebook");
    assert.deepEqual(notebook.pages.map((p) => p.label), ["Informations professionnelles", "Informations privées", "Paramètres RH"]);
    assert.equal(view.fields["name"]?.label, "Nom");
    assert.equal(view.fields["name"]?.required, true);
  });
  it("traduit les conditions en AST et signale celles non prises en charge", () => {
    assert.deepEqual(field("mobile_phone")?.invisible, { op: "not", arg: { op: "field", field: "work_phone" } });
    assert.equal((field("user_id")?.readonly as { op: string }).op, "unsupported");
    assert.equal((field("tz")?.required as { op: string }).op, "unsupported");
    assert.ok(view.diagnostics.some((d) => d.code === "unsupported_expression" && d.path.includes("user_id")));
    assert.ok(view.conditionFields.has("work_phone") && view.conditionFields.has("marital"));
  });
  it("aucun widget interprété : diagnostic + lecture seule", () => {
    assert.equal(view.fields["work_email"]?.readonly, true);
    assert.ok(view.diagnostics.some((d) => d.code === "unsupported_widget" && d.path.includes("work_email")));
    assert.equal(view.fields["parent_id"]?.readonly, true);
  });
  it("types non pris en charge signalés (many2many, binaire)", () => {
    assert.equal(view.fields["category_ids"]?.type, "unsupported");
    assert.equal(view.fields["image_1920"]?.type, "unsupported");
  });
  it("sélection de référence seulement avec un domaine littéral", () => {
    assert.equal(view.fields["coach_id"]?.relation?.lookup, true);
    assert.deepEqual(view.fieldDomains["coach_id"], []);
    assert.equal(view.fields["department_id"]?.relation?.lookup, false, "domaine du champ dépendant de company_id");
    assert.equal(view.fields["resource_calendar_id"]?.relation?.lookup, false, "domaine de vue dépendant de company_id");
    assert.deepEqual(view.fieldDomains["work_location_id"], [["active", "=", true]]);
  });
  it("boutons hors registre : non exécutables, signalés", () => {
    const buttons = nodes.filter((n) => n.kind === "button");
    assert.ok(buttons.length >= 1 && buttons.every((b) => b.kind === "button" && !b.commandKey));
    assert.ok(view.diagnostics.some((d) => d.code === "unsupported_command"));
  });
  it("éléments inconnus : nœud « unsupported » + diagnostic, jamais de disparition silencieuse", () => {
    assert.ok(nodes.some((n) => n.kind === "unsupported" && n.sourceTag === "chatter"));
    assert.ok(view.diagnostics.some((d) => d.sourceTag === "chatter"));
  });
  it("parité : champs + boutons du XML = importés + exclus + non pris en charge", () => {
    const xmlFields = (fixture("hr.employee.form.xml").match(/<field\b/g) ?? []).length;
    const xmlButtons = (fixture("hr.employee.form.xml").match(/<button\b/g) ?? []).length;
    const s = view.stats;
    assert.equal(s.fieldsInArch, xmlFields);
    assert.equal(s.buttonsInArch, xmlButtons);
    assert.equal(s.fieldsInArch + s.buttonsInArch, s.fieldsImported + s.buttonsImported + s.excluded + s.unsupported);
  });
  it("champ non lisible : exclu, compté, sans libellé ni nom dans le diagnostic", () => {
    const restricted = parseArch(fixture("hr.employee.form.xml"), "form", ctx("hr.employee", { without: ["ssnid"] }));
    assert.equal(restricted.fields["ssnid"], undefined);
    const d = restricted.diagnostics.filter((x) => x.code === "excluded_by_rights");
    assert.ok(d.length >= 1);
    assert.ok(d.every((x) => !x.message.includes("ssnid") && !x.path.includes("ssnid")));
  });
  it("aucune chaîne XML ni HTML dans le schéma produit", () => {
    const json = JSON.stringify(view);
    assert.ok(!/<\/?[a-z]/i.test(json.replace(/"sourceTag":"[^"]*"/g, "")), "balise dans le schéma");
    assert.ok(!json.includes("oe_title") && !json.includes("hr.employee"));
  });
});

describe("Liste et recherche des présences", () => {
  const list = parseArch(fixture("hr.attendance.list.xml"), "list", ctx("hr.attendance"));
  const search = parseArch(fixture("hr.attendance.search.xml"), "search", ctx("hr.attendance"));

  it("colonnes dans l'ordre, column_invisible et invisible de cellule", () => {
    const cols = list.root.filter((n) => n.kind === "column");
    assert.deepEqual(cols.map((c) => c.kind === "column" && c.field), ["employee_id", "check_in", "check_out", "worked_hours", "meal_count", "break_entry", "overtime_status"]);
    const brk = cols.find((c) => c.kind === "column" && c.field === "break_entry");
    assert.equal(brk?.kind === "column" && (brk.columnInvisible as { op: string }).op, "unsupported");
    const st = cols.find((c) => c.kind === "column" && c.field === "overtime_status");
    assert.deepEqual(st?.kind === "column" && st.invisible, { op: "not", arg: { op: "field", field: "overtime_status" } });
  });
  it("décorations traduites ; boutons de liste signalés", () => {
    assert.deepEqual(list.decorations.map((d) => d.style), ["warning", "danger"]);
    assert.ok(list.diagnostics.some((d) => d.code === "unsupported_command"));
  });
  it("filtres : domaines littéraux utilisables, uid et dates désactivés", () => {
    const filters = search.root.filter((n) => n.kind === "filter");
    const byLabel = Object.fromEntries(filters.map((f) => [f.kind === "filter" && f.label, f.kind === "filter" && f.available]));
    assert.deepEqual(byLabel, { "Mes présences": false, Présent: true, "À approuver": true, Refusées: true, "Date d'arrivée": false });
    assert.deepEqual(search.filters.map((f) => f.group), [0, 0, 1, 1, 1]);
    assert.deepEqual(search.filters.find((f) => f.key === "f1")?.domain, [["check_out", "=", false]]);
  });
  it("recherche employé : filter_domain non pris en charge → désactivée (sens préservé)", () => {
    const emp = parseArch(fixture("hr.employee.search.xml"), "search", ctx("hr.employee"));
    assert.equal(emp.searchFields["name"]?.usable, false);
    assert.equal(emp.searchFields["department_id"]?.usable, true);
    assert.ok(emp.root.some((n) => n.kind === "filter" && n.label === "Département" && !n.available), "regroupement");
    assert.ok(emp.diagnostics.some((d) => d.sourceTag === "searchpanel"));
  });
  it("refuse une architecture avec DOCTYPE/ENTITY", () => {
    assert.throws(() => parseArch('<!DOCTYPE x [<!ENTITY a "b">]><form/>', "form", ctx("hr.employee")));
  });
});
