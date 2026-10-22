// test/boundaries.test.ts — Frontières d'architecture (§ 3.1, GO-02), vérifiées à chaque `npm test`.
//  - Aucun terme technique Odoo dans le domaine, le front et le package partagé.
//  - Le package partagé ne dépend ni d'Odoo, ni du DOM, ni de React, ni de Fastify.
//  - Les composants génériques du moteur React ne connaissent aucun champ ni modèle.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = new URL("../..", import.meta.url).pathname;
const ODOO_TERMS =
  /execute_kw|jsonrpc|call_kw|res\.partner|res\.users|res\.company|hr\.employee|hr\.attendance|has_access|has_group|fields_get|get_views|ir\.ui\.|ir\.actions|act_window|res_model|session_id|search_read|name_search/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function hits(dir: string, pattern: RegExp, skip: (file: string, line: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const file of files(join(ROOT, dir))) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (pattern.test(line) && !skip(file, line)) out.push(`${file.slice(ROOT.length)}:${i + 1}: ${line.trim()}`);
      });
  }
  return out;
}

describe("Frontières", () => {
  it("aucun terme Odoo dans api/src/domain (hors commentaire d'en-tête de tree.ts)", () => {
    assert.deepEqual(hits("api/src/domain", ODOO_TERMS, (f, l) => f.endsWith("domain/tree.ts") && l.startsWith("//")), []);
  });
  it("aucun terme Odoo dans web/src", () => {
    assert.deepEqual(hits("web/src", ODOO_TERMS), []);
  });
  it("aucun terme Odoo dans packages/ui-schema/src", () => {
    assert.deepEqual(hits("packages/ui-schema/src", /odoo|Odoo|ODOO|xml|XML|owl\b|OWL/), []);
  });
  it("le package partagé n'importe que zod", () => {
    const imports = hits("packages/ui-schema/src", /^import .* from "(?!\.\/|zod")/);
    assert.deepEqual(imports, []);
    assert.deepEqual(hits("packages/ui-schema/src", /\b(window|document|localStorage|fetch)\b/), []);
  });
  it("les composants génériques ne référencent aucun champ métier", () => {
    // Noms de champs des écrans métier et des fixtures : ne doivent pas apparaître dans le moteur
    assert.deepEqual(hits("web/src/ui", /job_title|work_email|department_id|employee_id|overtime_status|check_in|"name"/), []);
  });
  it("aucune trace d'Astro dans le code actif", () => {
    assert.deepEqual(hits("web/src", /astro|@astrojs/i), []);
  });
});
