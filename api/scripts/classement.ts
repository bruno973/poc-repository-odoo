// scripts/classement.ts — Régénère docs/inventaire/<compte>/CLASSEMENT.md, hors ligne.
//
// À relancer après chaque évolution du moteur : le classement montre ce qui reste, trié par
// nombre de vues concernées, sans reconnexion à Odoo.
//
//   cd api
//   npm run classement            → tous les comptes inventoriés
//   npm run classement -- admin   → un seul compte

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { rankInventory } from "./lib/classement.js";

const root = new URL("../../docs/inventaire/", import.meta.url).pathname;
const wanted = process.argv.slice(2);
const accounts = (existsSync(root) ? readdirSync(root) : []).filter((d) => existsSync(`${root}${d}/README.md`) && (wanted.length === 0 || wanted.includes(d)));
if (accounts.length === 0) {
  console.error("Aucun inventaire trouvé (lancer d'abord npm run inventaire).");
  process.exit(1);
}
for (const account of accounts) {
  writeFileSync(`${root}${account}/CLASSEMENT.md`, rankInventory(`${root}${account}/`, account));
  console.log(`Classement → docs/inventaire/${account}/CLASSEMENT.md`);
}
