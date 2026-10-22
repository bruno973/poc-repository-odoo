// test/ui-inventaire-amg.test.ts — Le parseur sur les VUES RÉELLES de amg (inventaire UI-001,
// docs/inventaire/<compte>/, produit par `npm run inventaire`). Aucune donnée d'enregistrement :
// architectures résolues et métadonnées de champs uniquement.
//
// Vérifie, pour chaque vue : pas d'erreur, parité champs/boutons, schéma conforme au contrat ;
// et fige les constats de l'inventaire (régressions interdites).

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SCHEMA_VERSION, ViewSchemaSchema } from "@leila/ui-schema";
import { evaluateDomain, parseDomain } from "../src/adapters/odoo18/ui/OdooDomain.js";
import { parseLiteral, type Literal } from "../src/adapters/odoo18/ui/OdooExpressionParser.js";
import { type OdooFieldMeta, type ParsedView, parseArch } from "../src/adapters/odoo18/ui/OdooViewParser.js";

const ROOT = new URL("../../docs/inventaire/", import.meta.url).pathname;
const accounts = existsSync(ROOT) ? readdirSync(ROOT).filter((d) => existsSync(`${ROOT}${d}/README.md`)) : [];

interface ViewFile {
  account: string;
  action: string;
  model: string;
  type: "form" | "list" | "search";
  arch: string;
  fields: Record<string, OdooFieldMeta>;
}

function load(account: string): ViewFile[] {
  const dir = `${ROOT}${account}/`;
  return readdirSync(dir)
    .map((f) => /^(\d+)-(.+)\.(form|list|search)\.xml$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      account,
      action: m[1] as string,
      model: m[2] as string,
      type: m[3] as ViewFile["type"],
      arch: readFileSync(`${dir}${m[0]}`, "utf8"),
      fields: JSON.parse(readFileSync(`${dir}${m[1]}-${m[2]}.fields.json`, "utf8")) as Record<string, OdooFieldMeta>,
    }));
}

/** Contexte d'action relevé dans le README de l'inventaire. */
function actionContext(account: string, action: string): Record<string, Literal> | undefined {
  const readme = readFileSync(`${ROOT}${account}/README.md`, "utf8");
  const m = new RegExp(`Action ${action} · [^\\n]*contexte \`([\\s\\S]*?)\`\\n`).exec(readme);
  const ctx = m ? parseLiteral(m[1] as string) : null;
  return ctx && typeof ctx === "object" && !Array.isArray(ctx) ? (ctx as Record<string, Literal>) : undefined;
}

const parse = (v: ViewFile): ParsedView =>
  parseArch(v.arch, v.type, { model: v.model, fields: v.fields, commandFor: () => undefined, actionContext: actionContext(v.account, v.action) });

if (accounts.length === 0) {
  describe("Inventaire amg", () => it("absent (lancer npm run inventaire)", { skip: true }, () => undefined));
}

for (const account of accounts) {
  const views = load(account);
  describe(`Inventaire amg (${account}) : ${views.length} vues résolues`, () => {
    it("chaque vue s'analyse, respecte la parité et produit un schéma conforme", () => {
      for (const v of views) {
        const p = parse(v);
        const s = p.stats;
        assert.equal(s.fieldsInArch + s.buttonsInArch, s.fieldsImported + s.buttonsImported + s.excluded + s.unsupported, `${v.action}-${v.model}.${v.type}`);
        const schema = {
          schemaVersion: SCHEMA_VERSION,
          viewKey: "k",
          viewType: v.type,
          title: "t",
          resourceKey: "r",
          resourceKind: "compatibility",
          capabilities: { canCreate: false, canEdit: true, canDelete: false },
          fields: p.fields,
          root: p.root,
          ...(p.decorations.length ? { decorations: p.decorations } : {}),
          diagnostics: p.diagnostics,
        };
        const r = ViewSchemaSchema.safeParse(schema);
        assert.ok(r.success, `${v.action}-${v.model}.${v.type} : ${r.success ? "" : JSON.stringify(r.error.issues.slice(0, 2))}`);
      }
    });

    it("toutes les conditions de toutes les vues sont comprises (contexte d'action compris)", () => {
      const left: string[] = [];
      for (const v of views) {
        for (const d of parse(v).diagnostics) {
          if (d.code === "unsupported_expression" && !d.message.startsWith("Décoration de cellule")) left.push(`${v.action}-${v.model}.${v.type} ${d.path}`);
        }
      }
      assert.deepEqual(left, []);
    });

    const form = views.find((v) => v.model === "hr.employee" && v.type === "form");
    if (form) {
      it("fiche employé : sélections « même société » et widgets courants pris en charge", () => {
        const p = parse(form);
        for (const field of ["department_id", "job_id", "resource_calendar_id", "parent_id", "coach_id", "work_location_id"]) {
          if (!p.fields[field] || p.fields[field]?.readonly) continue;
          assert.ok(p.fields[field]?.relation?.lookup, `${field} : sélection désactivée`);
        }
        const d = p.fieldDomains["department_id"];
        if (d) {
          // Domaine du champ (même société) + domaine ajouté par la vue, concaténés comme dans Odoo
          const evaluated = evaluateDomain(d, { values: { company_id: { id: 1, label: "A" } }, env: { uid: 2, allowed_company_ids: [1] } });
          assert.ok(evaluated && evaluated.some((t) => JSON.stringify(t) === JSON.stringify(["company_id", "in", [1, false]])), JSON.stringify(evaluated));
        }
        const widgets = p.diagnostics.filter((x) => x.code === "unsupported_widget").map((x) => x.message);
        for (const w of ["email", "phone", "many2one_avatar_user", "float_time", "boolean_toggle"]) {
          assert.ok(!widgets.some((m) => m.includes(`« ${w} »`)), `widget ${w} encore signalé`);
        }
      });
    }

    it("domaines d'action relevés : évaluables avec uid et société", () => {
      const readme = readFileSync(`${ROOT}${account}/README.md`, "utf8");
      const domains = [...readme.matchAll(/domaine `([^`]*)`/g)].map((m) => m[1] as string);
      assert.ok(domains.length > 0);
      for (const src of domains) {
        const expr = parseDomain(src);
        assert.ok(expr, `non analysé : ${src}`);
        assert.ok(evaluateDomain(expr, { env: { uid: 2, allowed_company_ids: [1] } }), `non évaluable : ${src}`);
      }
    });
  });
}
