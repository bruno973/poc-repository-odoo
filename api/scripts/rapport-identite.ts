// scripts/rapport-identite.ts — Génère docs/rapport-identite.md à partir de
// docs/rights-matrix.json (produit par test/rights-matrix.test.ts contre la base).
// Usage : npm run rapport

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { EMPLOYEE_SKELETON } from "../src/domain/employee.skeleton.js";
import type { FormNode } from "../src/domain/tree.js";
import { type MatrixResults, score } from "../test/rights-matrix.js";

const docs = new URL("../../docs/", import.meta.url).pathname;
const input = `${docs}rights-matrix.json`;
if (!existsSync(input)) {
  console.error(`Résultats absents : ${input}\nLance d'abord la matrice : RIGHTS_MATRIX_CONFIG=… npm test`);
  process.exit(1);
}
const results = JSON.parse(readFileSync(input, "utf8")) as MatrixResults;
const { s1, s2, counted } = score(results);

// S-3 : règles de droit recodées côté Leila en identité réelle (editableIf du squelette)
const recoded: string[] = [];
const walk = (nodes: readonly FormNode[]) =>
  nodes.forEach((n) => {
    if (n.editableIf) recoded.push(n.key);
    if (n.kind === "group") walk(n.children);
  });
walk(EMPLOYEE_SKELETON);

const ok = (b: boolean) => (b ? "✅" : "❌");
const cell = (s: string) => s.replace(/\|/g, "\\|");
const hasAccess = results.latency.session.hasAccessPerSheet;
const p95 = Object.entries(results.latency.session.p95ByPort).sort(([a], [b]) => a.localeCompare(b));
const worstP95 = Math.max(0, ...p95.map(([, ms]) => ms));
const go = s1 === 100 && counted >= 10;

const md = `# Rapport — identité réelle Leila ⇄ Odoo

Généré le ${results.generatedAt} · cible : \`${results.target}\` · écritures : ${results.writes ? "oui" : "non"}

## Critères de succès

| # | Critère | Cible | Mesuré | |
|---|---|---|---|---|
| S-1 | Scénarios corrects en identité réelle | 100 % (≥ 10) | ${s1} % sur ${counted} | ${ok(s1 === 100 && counted >= 10)} |
| S-2 | Scénarios où le mode partagé diffère de l'attendu | ≥ 60 % | ${s2} % | ${ok(s2 >= 60)} |
| S-3 | Règles de droit recodées (editableIf du squelette) | 0 | ${recoded.length}${recoded.length ? ` (${recoded.join(", ")})` : ""} | ${ok(recoded.length === 0)} |
| S-4 | 2ᵉ fournisseur d'identité passe le même contrat | Oui | voir \`test/identity.test.ts\` (FakeJwtIdentity) | — |
| S-5 | Surcoût has_access par fiche | < 150 ms | moyenne ${hasAccess.mean} ms, max ${hasAccess.max} ms (${hasAccess.samples} fiches) | ${ok(hasAccess.samples > 0 && hasAccess.max < 150)} |
| S-6 | Mot de passe retrouvé (journaux, cookies, réponses, store) | 0 | voir \`test/security.test.ts\` | — |

**Décision proposée : ${go ? "Go Keycloak" : "No-go / à revoir"}** — à valider en revue (T-70).

## Matrice

| ID | Profil | Action | Attendu (Odoo) | Partagé | Identité réelle |
|---|---|---|---|---|---|
${results.scenarios
  .map(
    (s) =>
      `| ${s.id} | ${s.profile} | ${cell(s.action)} | ${cell(s.expected ?? "—")} | ${s.shared.observed === s.expected ? "" : "⚠️ "}${cell(s.shared.observed)} | ${s.session.observed === s.expected ? "✅ " : "❌ "}${cell(s.session.observed)}${s.session.detail ? ` (${cell(s.session.detail)})` : ""} |`,
  )
  .join("\n")}

## Latences (identité réelle)

P95 par opération de port (cible < 600 ms) — pire : ${worstP95} ms ${ok(worstP95 < 600)}

| Port | P95 (ms) |
|---|---|
${p95.map(([port, ms]) => `| \`${port}\` | ${ms} |`).join("\n")}

## Constats

- _À compléter en revue : écarts leila_hr découverts, règles à corriger, scénarios à rejouer._
`;

writeFileSync(`${docs}rapport-identite.md`, md);
console.log(`→ ${docs}rapport-identite.md (S-1 ${s1} %, S-2 ${s2} %)`);
