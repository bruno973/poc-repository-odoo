// e2e/ui-engine.mjs — Jalon du moteur générique (DEV.md v0.3), dans un vrai navigateur.
//
// Prérequis : simulateur Odoo 18 (api: npm run simulateur), API en
// ADAPTER=odoo AUTH_MODE=odoo-session ODOO_URL=http://127.0.0.1:8069 ODOO_DB=simulateur,
// front sur BASE_URL (défaut http://localhost:4321).
// Contre amg : les mêmes étapes s'appliquent, avec les profils réels (cf. README).

import { chromium } from "playwright";

const B = process.env.BASE_URL ?? "http://localhost:4321";
const CONTROL = process.env.SIMULATEUR_CONTROL ?? "http://127.0.0.1:8070";
const SHOTS = process.env.SHOTS_DIR;
const out = [];
const ok = (c, m) => out.push((c ? "OK  " : "KO  ") + m);

const browser = await chromium.launch();
const errors = [];
async function session(login, password) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(B + "/app");
  await page.fill("input[name=login]", login);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app");
  await page.waitForSelector(".apps a");
  return page;
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const openRecord = async (page, app, row) => {
  await page.goto(B + "/app");
  await page.click(`.apps a:text-is("${app}")`);
  await page.waitForSelector("tr.ui-row");
  await page.click(`tr.ui-row:has-text("${row}")`);
  await page.waitForSelector(".ui-form");
};

// 1. Manager : navigation importée, liste et fiche générées depuis les vues résolues
const manager = await session("p.manager", "manager-pw");
ok(await manager.locator(".apps a:text-is('Employés')").isVisible(), "navigation importée (menus de la session)");
ok(!(await manager.locator("text=Facturation").count()), "menus hors périmètre absents");
ok(await manager.locator("text=Mode kiosque").first().isVisible(), "action non générique affichée comme indisponible");
await manager.click(".apps a:text-is('Employés')");
await manager.waitForSelector("tr.ui-row");
ok((await manager.locator("tr.ui-row").count()) === 2, "liste : uniquement les fiches visibles (règles Odoo)");
await shot(manager, "1-liste-employes-manager");
await manager.click("tr.ui-row:has-text('Émile')");
await manager.waitForSelector(".ui-form");
ok(await manager.locator("label:text-is('Intitulé du poste')").isVisible(), "fiche : libellés issus de la vue, sans configuration");
ok(!(await manager.locator("text=Informations privées").count()), "onglet réservé au groupe RH absent pour le manager");
ok(await manager.locator(".ui-unsupported").first().isVisible(), "élément non pris en charge affiché (pas de disparition silencieuse)");
await manager.fill("#ui-job_title", "Soudeur");
await manager.click("button:text-is('Enregistrer')");
await manager.locator(".ui-status:text('Enregistré.')").waitFor();
ok(true, "écriture autorisée (manager sur son équipe)");
ok((await manager.locator("input#ui-work_email").count()) === 0 && (await manager.locator("#ui-work_email").count()) === 1, "widget non pris en charge → affiché en lecture seule");
await manager.click(".ui-diagnostics button");
ok(await manager.locator(".ui-diagnostics__table tr").count() > 3, "diagnostics de compatibilité consultables");
await shot(manager, "2-fiche-employe-manager");

// 2. Employé : lecture seule (droits Odoo + décision Q-05)
const employe = await session("p.employe", "employe-pw");
await openRecord(employe, "Employés", "Émile");
ok(await employe.locator(".ui-readonly-note").isVisible(), "employé : sa fiche en lecture seule");
ok((await employe.locator(".ui-form input, .ui-form select, .ui-form textarea").count()) === 0, "employé : aucun champ modifiable");

// 3. Admin : onglet privé visible ; puis héritage de vue installé dans Odoo
const admin = await session("p.admin", "admin-pw");
await openRecord(admin, "Employés", "Émile");
ok(await admin.locator("button:text-is('Informations privées')").isVisible(), "admin : onglet privé (droits différents)");
ok(!(await admin.locator("text=Badge (leila_hr)").count()), "avant héritage : pas de champ badge");
await fetch(`${CONTROL}/heritage`, { method: "POST" });
const refreshed = await admin.evaluate(async () => (await fetch("/api/ui/v1/cache/refresh", { method: "POST", headers: { "X-Leila-Csrf": "1" } })).status);
ok(refreshed === 200, "invalidation explicite du cache (administrateur)");
await admin.reload();
await admin.waitForSelector(".ui-form");
ok(await admin.locator("label:text-is('Badge (leila_hr)')").isVisible(), "JALON : champ ajouté par héritage affiché sans modifier le front");
ok(await admin.locator("#ui-badge_id").inputValue() === "B-6", "valeur du nouveau champ chargée");
await shot(admin, "3-fiche-apres-heritage-admin");

// 4. Commandes du registre fermé : approbation par le manager
await openRecord(manager, "Présences", "Émile");
const approve = manager.locator(".ui-header button:text-is('Approuver')");
ok(await approve.isEnabled(), "commande enregistrée disponible (droits + condition)");
ok(await manager.locator(".ui-header button:text-is('Kiosque')").isDisabled(), "bouton hors registre désactivé");
await approve.click();
await manager.locator(".ui-status").waitFor();
ok(!(await manager.locator(".ui-header button:text-is('Approuver')").count()), "après approbation : bouton masqué par sa condition");
await shot(manager, "4-presence-approuvee-manager");

ok(errors.length === 0, "aucune erreur JavaScript" + (errors.length ? " : " + errors.join(" | ") : ""));
await browser.close();
console.log(out.join("\n"));
process.exit(out.some((l) => l.startsWith("KO")) ? 1 : 0);
