// scripts/inventaire-vues.ts — Inventaire UI-001 : vues Odoo 18 RÉSOLUES pour un compte.
//
// Pour chaque action des menus publiés (UI_MENU_ROOTS), enregistre l'architecture
// résolue (get_views, héritages et groupes appliqués pour CE compte), les
// métadonnées de champs, et un résumé de compatibilité : parité, diagnostics,
// expressions non prises en charge (texte exact, pour Q-08).
//
// Ne lit AUCUNE donnée d'enregistrement : seulement des définitions de vues.
//
//   cd api
//   ODOO_URL=… ODOO_DB=amg INVENTAIRE_LOGIN=p.manager INVENTAIRE_PASSWORD=… npm run inventaire
//   → docs/inventaire/<login>/ (une exécution par profil de test)

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseCondition } from "../src/adapters/odoo18/ui/OdooExpressionParser.js";
import { loadMenus, type OdooMenu } from "../src/adapters/odoo18/ui/OdooUiAdapter.js";
import { type OdooFieldMeta, parseArch } from "../src/adapters/odoo18/ui/OdooViewParser.js";
import { ODOO_COMMANDS } from "../src/adapters/odoo18/ui/commands.js";
import { SessionTransport } from "../src/adapters/odoo18/transport.js";

const env = process.env;
const need = (k: string) => env[k] || (console.error(`Variable manquante : ${k}`), process.exit(1));
const login = need("INVENTAIRE_LOGIN") as string;
const roots = (env["UI_MENU_ROOTS"] ?? "hr.menu_hr_root,hr_attendance.menu_hr_attendance_root").split(",").map((s) => s.trim()).filter(Boolean);
const outDir = new URL(`../../docs/inventaire/${login.replace(/[^\w.-]/g, "_")}/`, import.meta.url).pathname;

const t = await SessionTransport.authenticate(
  { url: need("ODOO_URL") as string, db: need("ODOO_DB") as string, lang: env["ODOO_LANG"] ?? "fr_FR", tz: env["ODOO_TZ"] ?? "America/Cayenne" },
  login,
  need("INVENTAIRE_PASSWORD") as string,
);
mkdirSync(outDir, { recursive: true });

const menus = await loadMenus(t);
const actions = new Map<number, string>();
const visit = (id: number, path: string) => {
  const m = menus[String(id)] as OdooMenu | undefined;
  if (!m) return;
  const here = path ? `${path} / ${m.name}` : m.name;
  if (m.actionID && m.actionModel === "ir.actions.act_window") actions.set(m.actionID, here);
  m.children.forEach((c) => visit(c, here));
};
(menus["root"]?.children ?? []).filter((id) => roots.length === 0 || roots.includes(menus[String(id)]?.xmlid ?? "")).forEach((id) => visit(id, ""));

const EXPR = /\b(invisible|readonly|required|column_invisible|domain|context|filter_domain)="([^"]*)"/g;
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const lines: string[] = [`# Inventaire des vues résolues — compte \`${login}\``, "", `Base \`${env["ODOO_DB"]}\` · ${new Date().toISOString()} · menus : ${roots.join(", ")}`, ""];
const unsupported = new Map<string, number>();

for (const [actionId, menuPath] of actions) {
  const [action] = await t.callKw<Record<string, unknown>[]>({ model: "ir.actions.act_window", method: "read", args: [[actionId], ["name", "res_model", "views", "domain", "context", "search_view_id"]], kwargs: {} });
  if (!action) continue;
  const model = String(action["res_model"]);
  const views: Record<string, number | false> = { list: false, form: false, search: false };
  for (const [id, type] of (action["views"] as [number | false, string][]) ?? []) {
    if ((type === "list" || type === "tree") && views["list"] === false) views["list"] = id;
    if (type === "form" && views["form"] === false) views["form"] = id;
  }
  if (Array.isArray(action["search_view_id"])) views["search"] = action["search_view_id"][0] as number;
  let res: { views: Record<string, { arch: string; id?: number }>; models: Record<string, { fields?: Record<string, OdooFieldMeta> }> };
  try {
    res = await t.callKw({ model, method: "get_views", args: [], kwargs: { views: Object.entries(views).map(([type, id]) => [id, type]), options: { action_id: actionId, load_filters: false, toolbar: false } } });
  } catch (error) {
    lines.push(`## ${menuPath} — ⚠️ get_views refusé : ${(error as Error).message}`, "");
    continue;
  }
  const entry = res.models[model] as ({ fields?: Record<string, OdooFieldMeta> } & Record<string, OdooFieldMeta>) | undefined;
  const fields = (entry?.fields ?? entry ?? {}) as Record<string, OdooFieldMeta>;
  const base = `${actionId}-${model}`;
  writeFileSync(`${outDir}${base}.fields.json`, JSON.stringify(fields, null, 2));
  lines.push(`## ${menuPath}`, "", `Action ${actionId} · modèle \`${model}\` · domaine \`${String(action["domain"] || "[]")}\` · contexte \`${String(action["context"] || "{}")}\``, "");
  lines.push("| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |", "|---|---|---|---|---|---|---|---|");
  for (const type of ["form", "list", "search"] as const) {
    const v = res.views[type];
    if (!v) continue;
    writeFileSync(`${outDir}${base}.${type}.xml`, v.arch);
    const p = parseArch(v.arch, type, {
      model,
      fields,
      commandFor: (b) => (b.type === "object" ? ODOO_COMMANDS.find((c) => c.model === model && c.method === b.name)?.id : undefined),
    });
    const s = p.stats;
    lines.push(`| ${type} | ${v.id ?? "?"} | ${s.fieldsInArch} | ${s.fieldsImported} | ${s.excluded} | ${s.unsupported} | ${s.buttonsImported}/${s.buttonsInArch} | ${p.diagnostics.filter((d) => d.severity !== "info").length} / ${p.diagnostics.length} |`);
    for (const m of v.arch.matchAll(EXPR)) {
      const [, attr, raw] = m as unknown as [string, string, string];
      const src = decode(raw);
      const ok = attr === "domain" || attr === "context" || attr === "filter_domain" ? null : parseCondition(src).op !== "unsupported";
      if (ok === false) unsupported.set(`${attr}="${src}"`, (unsupported.get(`${attr}="${src}"`) ?? 0) + 1);
    }
  }
  lines.push("");
}

lines.push("## Expressions de condition non prises en charge (Q-08)", "", "| Occurrences | Expression |", "|---|---|");
for (const [expr, n] of [...unsupported].sort((a, b) => b[1] - a[1])) lines.push(`| ${n} | \`${expr.replace(/\|/g, "\\|")}\` |`);
writeFileSync(`${outDir}README.md`, `${lines.join("\n")}\n`);
await t.destroy();
console.log(`Inventaire de ${actions.size} action(s) → ${outDir}`);
