// test/ui-odoo18-parser.test.ts — Architectures résolues Odoo 18 → Leila UI Schema.
// Fixtures : test/fixtures/odoo18 (reconstructions, à remplacer par les vues de amg).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Node } from "@leila/ui-schema";
import { domainRefs, evaluateDomain, parseDomain } from "../src/adapters/odoo18/ui/OdooDomain.js";
import { asDomain, combineDomains, normalizeDomain, parseCondition, parseFlag, parseLiteral } from "../src/adapters/odoo18/ui/OdooExpressionParser.js";
import { groupSpec, type OdooFieldMeta, parseArch } from "../src/adapters/odoo18/ui/OdooViewParser.js";
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
  it("« id » est l'identifiant de la fiche (constaté sur amg : « not id »)", () => {
    assert.deepEqual(parseCondition("not id"), { op: "not", arg: { op: "field", field: "id" } });
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
  it("domaines : valeurs de la fiche, uid, société et texte cherché, évalués côté serveur", () => {
    const company = parseDomain("['|', ('company_id', '=', False), ('company_id', 'in', [company_id, False])]");
    assert.ok(company);
    assert.deepEqual([...domainRefs(company).fields], ["company_id"]);
    assert.deepEqual(evaluateDomain(company, { values: { company_id: { id: 4, label: "B" } } }), ["|", ["company_id", "=", false], ["company_id", "in", [4, false]]]);
    assert.equal(evaluateDomain(company, { values: {} }), null, "valeur non lisible → opération désactivée");
    // Motif constaté sur amg (champs « même société »)
    const checkCompany = parseDomain("(company_id and [('company_id', 'in', [company_id] + [False])] or [('company_id', '=', False)]) + ([])");
    assert.ok(checkCompany);
    assert.deepEqual(evaluateDomain(checkCompany, { values: { company_id: { id: 1, label: "A" } } }), [["company_id", "in", [1, false]]]);
    assert.deepEqual(evaluateDomain(checkCompany, { values: { company_id: null } }), [["company_id", "=", false]]);
    const allowed = parseDomain("[('company_id', 'in', allowed_company_ids)]");
    assert.ok(allowed);
    assert.deepEqual(evaluateDomain(allowed, { env: { allowed_company_ids: [1] } }), [["company_id", "in", [1]]]);
    assert.equal(evaluateDomain(allowed, {}), null, "société inconnue → indisponible, jamais élargi");
    const search = parseDomain("['|', ('work_email', 'ilike', self), ('name', 'ilike', self)]");
    assert.ok(search);
    assert.deepEqual(evaluateDomain(search, { env: { self: "ali" } }), ["|", ["work_email", "ilike", "ali"], ["name", "ilike", "ali"]]);
    for (const bad of ["[('x', '=', context.get('a'))]", "[('x', '=', company_id.id)]", "[('x', '=', f(1))]", "[('d', '<', context_today().strftime('%Y-%m-%d'))]"]) {
      assert.equal(parseDomain(bad), null, bad);
    }
    assert.equal(evaluateDomain({ k: "list", items: [{ k: "lit", v: "x" }] }), null, "terme mal formé");
  });
  it("conditions : context.get lu dans le contexte de l'action", () => {
    const ctx = { chat_icon: true, default_res_model: "hr.employee" };
    assert.deepEqual(parseCondition("not context.get('chat_icon')", ctx), { op: "not", arg: { op: "const", value: true } });
    assert.deepEqual(parseCondition("context.get('absent', 3)", ctx), { op: "const", value: 3 });
    assert.equal(parseCondition("context.get('tz')", ctx).op, "unsupported", "clé du contexte utilisateur");
    assert.equal(parseCondition("context.get('chat_icon')").op, "unsupported", "sans contexte d'action");
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
  it("widgets de présentation reconnus ; les autres : diagnostic + lecture seule", () => {
    assert.equal(view.fields["work_email"]?.readonly, false);
    assert.equal(view.fields["work_email"]?.format, "email");
    assert.ok(!view.diagnostics.some((d) => d.code === "unsupported_widget" && (d.path.includes("work_email") || d.path.includes("parent_id"))));
    assert.ok(!view.diagnostics.some((d) => d.code === "unsupported_widget" && d.path.includes("image_1920")));
  });
  it("étiquettes et image (lot 1) : pris en charge en lecture seule", () => {
    assert.equal(view.fields["category_ids"]?.type, "references");
    assert.equal(view.fields["category_ids"]?.readonly, true);
    assert.equal(view.fields["image_1920"]?.type, "image");
    assert.equal(view.fields["image_1920"]?.readonly, true);
  });
  it("sélection de référence : domaines constants ou dépendant de la fiche", () => {
    assert.equal(view.fields["coach_id"]?.relation?.lookup, true);
    const coach = view.fieldDomains["coach_id"];
    assert.ok(coach);
    assert.deepEqual(evaluateDomain(coach), []);
    assert.equal(view.fields["department_id"]?.relation?.lookup, true, "domaine du champ dépendant de company_id");
    const d = view.fieldDomains["department_id"];
    assert.ok(d);
    assert.deepEqual(evaluateDomain(d, { values: { company_id: { id: 2, label: "B" } } }), [["company_id", "in", [2, false]]]);
    assert.equal(view.fields["resource_calendar_id"]?.relation?.lookup, true, "domaine de vue dépendant de company_id");
    assert.ok(view.conditionFields.has("company_id"), "valeur nécessaire au domaine chargée avec la fiche");
    const wl = view.fieldDomains["work_location_id"];
    assert.ok(wl);
    assert.deepEqual(evaluateDomain(wl), [["active", "=", true]]);
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
    // Ce qui est publié (le reste — relations, domaines, lignes — ne quitte pas le serveur)
    const json = JSON.stringify({ fields: view.fields, root: view.root, diagnostics: view.diagnostics, decorations: view.decorations });
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
  it("filtres : uid pris en charge (serveur), dates désactivées", () => {
    const filters = search.root.filter((n) => n.kind === "filter");
    const byLabel = Object.fromEntries(filters.map((f) => [f.kind === "filter" && f.label, f.kind === "filter" && f.available]));
    assert.deepEqual(byLabel, { "Mes présences": true, Présent: true, "À approuver": true, Refusées: true, "Date d'arrivée": false });
    assert.deepEqual(search.filters.map((f) => f.group), [0, 0, 1, 1, 1]);
    const present = search.filters.find((f) => f.key === "f1")?.domain;
    assert.ok(present);
    assert.deepEqual(evaluateDomain(present), [["check_out", "=", false]]);
  });
  it("recherche employé : filter_domain avec « self », regroupements non proposés comme filtres", () => {
    const emp = parseArch(fixture("hr.employee.search.xml"), "search", ctx("hr.employee"));
    assert.equal(emp.searchFields["name"]?.usable, true);
    assert.equal(emp.searchFields["department_id"]?.usable, true);
    assert.ok(!emp.root.some((n) => n.kind === "filter" && n.label === "Département"), "regroupement affiché comme filtre");
    const groupBy = emp.root.find((n) => n.kind === "groupBy" && n.label === "Département");
    assert.ok(groupBy && groupBy.kind === "groupBy" && groupBy.available, "regroupement proposé à part");
    assert.deepEqual(emp.groupBys.map((g) => [g.spec, g.name]), [["department_id", "group_department"]]);
    assert.ok(emp.diagnostics.some((d) => d.sourceTag === "searchpanel"));
  });
  it("refuse une architecture avec DOCTYPE/ENTITY", () => {
    assert.throws(() => parseArch('<!DOCTYPE x [<!ENTITY a "b">]><form/>', "form", ctx("hr.employee")));
  });
});

describe("Lot 1 : lignes liées, étapes, regroupements", () => {
  const fields: Record<string, OdooFieldMeta> = {
    name: { type: "char", string: "Nom" },
    state: { type: "selection", string: "État", selection: [["draft", "Brouillon"], ["open", "En cours"], ["close", "Clos"], ["cancel", "Annulé"]] },
    line_ids: { type: "one2many", string: "Lignes", relation: "x.line" },
    badge_ids: { type: "one2many", string: "Badges", relation: "x.badge" },
    team_ids: { type: "one2many", string: "Équipe", relation: "x.member" },
    stage_id: { type: "many2one", string: "Étape", relation: "x.stage" },
    date_start: { type: "date", string: "Début" },
    total: { type: "float", string: "Total", store: false },
    file: { type: "binary", string: "Fichier" },
  };
  const models = {
    "x.line": {
      name: { type: "char", string: "Libellé" },
      hours: { type: "float", string: "Heures" },
      kind: { type: "selection", string: "Type", selection: [["a", "A"]] },
      secret: { type: "char", string: "Secret" },
      tags: { type: "many2many", string: "Étiquettes", relation: "x.tag" },
    } as Record<string, OdooFieldMeta>,
  };
  const c = { model: "x", fields, models, commandFor: () => undefined };
  const form = parseArch(
    `<form><header><field name="state" widget="statusbar" statusbar_visible="draft,open,close"/><field name="stage_id" widget="statusbar"/></header>
      <field name="line_ids"><list><field name="name"/><field name="hours" widget="float_time"/><field name="kind"/>
        <field name="secret" column_invisible="parent.state == 'draft'"/><field name="tags" widget="many2many_tags"/><field name="ghost"/></list></field>
      <field name="badge_ids"><kanban><field name="name"/></kanban></field>
      <field name="team_ids"/>
      <field name="file"/></form>`,
    "form",
    c,
  );
  it("sous-liste : colonnes simples et lisibles seulement, masquées exclues", () => {
    assert.equal(form.fields["line_ids"]?.type, "lines");
    assert.equal(form.fields["line_ids"]?.readonly, true);
    assert.deepEqual(form.fields["line_ids"]?.lines?.columns, ["name", "hours", "kind"]);
    assert.equal(form.fields["line_ids"]?.lines?.fields["hours"]?.format, "duration");
    assert.deepEqual(form.lines["line_ids"]?.columns, ["name", "hours", "kind"]);
    assert.equal(form.lines["line_ids"]?.relation, "x.line");
  });
  it("sans sous-liste ou en kanban : liste de noms (repli qui garde le sens)", () => {
    assert.deepEqual(form.fields["team_ids"]?.lines?.columns, ["display_name"]);
    assert.deepEqual(form.fields["badge_ids"]?.lines?.columns, ["display_name"]);
    assert.ok(form.diagnostics.some((d) => d.message.includes("liste de noms")));
  });
  it("statusbar : étapes sur une sélection, rendu standard + diagnostic sur une référence", () => {
    assert.equal(form.fields["state"]?.format, "steps");
    assert.deepEqual(form.fields["state"]?.visibleOptions, ["draft", "open", "close"]);
    assert.equal(form.fields["stage_id"]?.format, undefined);
    assert.ok(form.diagnostics.some((d) => d.code === "unsupported_widget" && d.message.includes("statusbar")));
  });
  it("binaire sans widget image : toujours non pris en charge", () => {
    assert.equal(form.fields["file"]?.type, "unsupported");
  });
  it("regroupements : granularité de date, champs non stockés et niveaux multiples refusés", () => {
    assert.deepEqual(groupSpec("date_start", fields), { spec: "date_start:month", field: "date_start" });
    assert.deepEqual(groupSpec("date_start:week", fields), { spec: "date_start:week", field: "date_start" });
    assert.deepEqual(groupSpec(["state"], fields), { spec: "state", field: "state" });
    assert.equal(groupSpec("state:month", fields), null);
    assert.equal(groupSpec("total", fields), null, "champ non stocké");
    assert.equal(groupSpec(["state", "stage_id"], fields), null, "plusieurs niveaux");
    assert.equal(groupSpec("absent", fields), null);
    const search = parseArch(
      `<search><filter name="g_state" string="État" context="{'group_by': 'state'}"/><filter name="g_total" string="Total" context="{'group_by': 'total'}"/>
        <filter name="g_hidden" string="Caché" context="{'group_by': 'stage_id'}" invisible="1"/></search>`,
      "search",
      c,
    );
    assert.deepEqual(search.root.map((n) => n.kind === "groupBy" && [n.label, n.available]), [["État", true], ["Total", false]]);
    assert.deepEqual(search.groupBys.map((g) => g.name), ["g_state", "g_hidden"], "regroupement invisible utilisable par search_default_*");
  });
});
