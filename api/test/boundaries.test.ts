// test/boundaries.test.ts — Aucun terme Odoo dans le domaine ni dans le front (§ 5, maintenabilité).
// Seul le commentaire d'en-tête de domain/tree.ts, qui cite ces termes, est toléré.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = new URL("../..", import.meta.url).pathname;
const FORBIDDEN = /execute_kw|jsonrpc|call_kw|res\.partner|res\.users|hr\.employee|hr\.attendance|has_access|has_group|fields_get|session_id/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("Frontières", () => {
  for (const dir of ["api/src/domain", "web/src"]) {
    it(`aucun terme Odoo dans ${dir}`, () => {
      const hits: string[] = [];
      for (const file of files(join(ROOT, dir))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (!FORBIDDEN.test(line)) return;
            if (file.endsWith("domain/tree.ts") && line.startsWith("//")) return;
            hits.push(`${file.slice(ROOT.length)}:${i + 1}: ${line.trim()}`);
          });
      }
      assert.deepEqual(hits, []);
    });
  }
});
