// e2e/smoke.mjs — Parcours de bout en bout de Leila One (navigateur réel).
//
// Prérequis : API en ADAPTER=mock + AUTH_MODE=fake-jwt (données de démo),
// front servi sur BASE_URL (défaut http://localhost:4321, `npm run dev`).
// Navigateur : `npx playwright install chromium` la première fois.
// Écrit dans les données du mock (une approbation, une modification, un pointage) :
// relancer l'API pour repartir de zéro.

import { chromium } from "playwright";
const B = process.env.BASE_URL ?? "http://localhost:4321";
const out = [];
const ok = (c, m) => { out.push((c ? "OK  " : "KO  ") + m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
// Erreurs JavaScript uniquement (les 401/403 attendus sont journalisés par le navigateur)
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(B + "/gestion");
await page.waitForURL("**/login?retour=%2Fgestion");
ok(true, "route protégée → /login?retour=/gestion");
await page.fill("input[name=login]", "camille"); await page.fill("input[name=password]", "faux");
await page.click("button[type=submit]");
await page.getByRole("alert").waitFor();
ok((await page.getByRole("alert").textContent()).includes("incorrect"), "mauvais mot de passe → message générique");
await page.fill("input[name=password]", "demo"); await page.click("button[type=submit]");
await page.waitForURL("**/gestion"); await page.waitForSelector("table.grid tbody tr");
ok(await page.locator("text=Camille Durand").first().isVisible(), "connexion camille → retour sur /gestion");
ok(await page.locator("button:has-text('Approuver')").count() === 0, "employée : aucun bouton Approuver");
const sw = page.locator("input.switch");
ok(await sw.count() > 0 && await sw.first().isDisabled(), "employée : interrupteurs désactivés");
await page.click("a:has-text('Employés')"); await page.waitForSelector(".emp-card");
await page.click(".emp-card:has-text('Camille')"); await page.waitForSelector(".tabs");
ok(await page.locator("button:has-text('Enregistrer')").count() === 0, "fiche propre : pas de bouton Enregistrer (Q-05)");
await page.click("button:has-text('Se déconnecter')"); await page.waitForURL("**/login");
await page.goto(B + "/synthese"); await page.waitForURL("**/login?retour=%2Fsynthese");
ok(true, "après déconnexion : retour à /login");

await page.fill("input[name=login]", "abigail"); await page.fill("input[name=password]", "demo");
await page.click("button[type=submit]"); await page.waitForURL("**/synthese");
await page.waitForSelector("tr.group");
await page.locator("tr.group button.toggle").first().click();
await page.waitForFunction(() => document.querySelectorAll("tr.group").length > 1);
ok(true, "synthèse : dépliage d'un niveau");
await page.goto(B + "/gestion"); await page.waitForSelector("table.grid tbody tr");
const approve = page.locator("button:has-text('Approuver')");
ok(await approve.count() > 0, "manager : boutons Approuver présents (équipe)");
await approve.first().click();
await page.waitForTimeout(500);
await page.goto(B + "/employees/3"); await page.waitForSelector(".tabs");
await page.fill("#f-header\\.jobTitle", "Lead dev");
await page.click("button:has-text('Enregistrer')");
await page.locator("text=Enregistré.").waitFor();
ok((await page.locator("h1").textContent()) && (await page.locator(".hero .muted").textContent()) === "Lead dev", "manager : modification enregistrée");
await page.goto(B + "/pointer"); await page.waitForSelector(".punch");
await page.click(".punch"); await page.locator(".banner.is-ok").waitFor();
ok(true, "pointer : " + await page.locator(".banner.is-ok").textContent());
await page.goto(B + "/inconnue"); ok(await page.locator("text=Page introuvable").isVisible(), "route inconnue");
// Session expirée : on supprime le cookie puis on agit
await ctx.clearCookies();
await page.goto(B + "/gestion"); await page.waitForURL("**/login?retour=%2Fgestion");
ok(true, "cookie perdu → /login");
// CSRF : requête mutante sans en-tête
const r = await page.evaluate(async () => (await fetch("/api/auth/logout", { method: "POST" })).status);
ok(r === 403, "POST sans en-tête anti-CSRF → " + r);
ok(errors.length === 0, "aucune erreur JavaScript" + (errors.length ? " : " + errors.join(" | ") : ""));
await browser.close();
console.log(out.join("\n"));
process.exit(out.some((l) => l.startsWith("KO")) ? 1 : 0);
