// scripts/sonde-portail.ts — Que peut faire un compte (portail ou non) par l'ORM d'Odoo ?
//
// Pour chaque modèle : droits read/write/create/unlink, nombre d'enregistrements VISIBLES
// (règles d'enregistrement appliquées), champs lisibles, et si get_views répond.
// Sert à trancher Q-10 : les droits du module portail sont-ils portés par Odoo
// (droits d'accès + règles, appels ORM possibles) ou seulement par des contrôleurs en sudo ?
//
// Ne lit AUCUNE donnée d'enregistrement : des comptes (search_count) et des définitions.
//
//   cd api
//   SONDE_LOGIN=… SONDE_PASSWORD=… npm run sonde-portail
//   SONDE_MODELES=hr.attendance,mon.modele npm run sonde-portail   (modèles à sonder)
//   SONDE_PROPRIETAIRES=hr.attendance:employee_id   (cloisonnement : un seul propriétaire visible ?)
//   → docs/inventaire/<login>/SONDE.md

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { type OdooTransport, SessionTransport } from "../src/adapters/odoo18/transport.js";

const env = process.env;
const need = (k: string) => env[k] || (console.error(`Variable manquante : ${k}`), process.exit(1));
const login = need("SONDE_LOGIN") as string;
const DEFAULT_MODELS = [
  "hr.attendance",
  "hr.attendance.overtime",
  "hr.attendance.ventilation",
  "hr.employee",
  "hr.employee.public",
  "hr.leave",
  "hr.leave.allocation",
  "hr.payslip",
  "res.users",
  "res.partner",
  "ir.ui.menu",
];
const models = (env["SONDE_MODELES"] ?? DEFAULT_MODELS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const outDir = new URL(`../../docs/inventaire/${login.replace(/[^\w.-]/g, "_")}/`, import.meta.url).pathname;

const t = await SessionTransport.authenticate(
  { url: need("ODOO_URL") as string, db: need("ODOO_DB") as string, lang: env["ODOO_LANG"] ?? "fr_FR", tz: env["ODOO_TZ"] ?? "America/Cayenne" },
  login,
  need("SONDE_PASSWORD") as string,
);

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };
async function attempt<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    // Première ligne seulement : le message d'Odoo liste parfois des groupes sur plusieurs lignes
    return { ok: false, error: String((error as Error).message).split("\n")[0]?.slice(0, 140) ?? "erreur" };
  }
}

/** Droit sur le modèle : has_access (Odoo 18), sinon check_access_rights (versions antérieures). */
async function right(tr: OdooTransport, model: string, op: string): Promise<{ value: boolean | null; via: string }> {
  const viaHas = await attempt(() => tr.callKw<boolean>({ model, method: "has_access", args: [[], op], kwargs: {} }));
  if (viaHas.ok) return { value: Boolean(viaHas.value), via: "has_access" };
  const viaCheck = await attempt(() => tr.callKw<boolean>({ model, method: "check_access_rights", args: [op], kwargs: { raise_exception: false } }));
  if (viaCheck.ok) return { value: Boolean(viaCheck.value), via: "check_access_rights" };
  return { value: null, via: `aucune (${viaHas.error})` };
}

const group = async (g: string) => {
  const r = await attempt(() => t.callKw<boolean>({ model: "res.users", method: "has_group", args: [[t.uid], g], kwargs: {} }));
  return r.ok ? (r.value ? "oui" : "non") : `? (${r.error})`;
};

const yes = (v: boolean | null) => (v === null ? "?" : v ? "✅" : "—");
const cell = (s: string) => s.replace(/\|/g, "\\|");
const lines = [
  `# Sonde des droits ORM — compte \`${login}\``,
  "",
  `Base \`${env["ODOO_DB"]}\` · ${new Date().toISOString()} · uid ${t.uid}`,
  "",
  `Utilisateur interne (base.group_user) : **${await group("base.group_user")}** · Portail (base.group_portal) : **${await group("base.group_portal")}**`,
  "",
  "Aucune donnée lue : « Visibles » est un `search_count` (règles d'enregistrement appliquées).",
  "",
  "| Modèle | Lire | Écrire | Créer | Supprimer | Visibles | Champs lisibles | get_views (liste) | Remarque |",
  "|---|---|---|---|---|---|---|---|---|",
];
const vias = new Set<string>();

for (const model of models) {
  const [read, write, create, unlink] = await Promise.all(["read", "write", "create", "unlink"].map((op) => right(t, model, op)));
  [read, write, create, unlink].forEach((r) => r && vias.add(r.via));
  const count = await attempt(() => t.callKw<number>({ model, method: "search_count", args: [[]], kwargs: {} }));
  const fields = await attempt(() => t.callKw<Record<string, unknown>>({ model, method: "fields_get", args: [], kwargs: { attributes: ["type"] } }));
  const views = await attempt(() =>
    t.callKw<{ views: Record<string, { arch: string }> }>({ model, method: "get_views", args: [], kwargs: { views: [[false, "list"]], options: {} } }),
  );
  const notes = [count, fields, views].filter((o): o is { ok: false; error: string } => !o.ok).map((o) => o.error);
  lines.push(
    `| \`${model}\` | ${yes(read?.value ?? null)} | ${yes(write?.value ?? null)} | ${yes(create?.value ?? null)} | ${yes(unlink?.value ?? null)} | ${count.ok ? count.value : "refusé"} | ${fields.ok ? Object.keys(fields.value).length : "refusé"} | ${views.ok ? "✅" : "refusé"} | ${cell(notes[0] ?? "")} |`,
  );
}

// Cloisonnement : les enregistrements visibles appartiennent-ils tous au même propriétaire ?
// Seul l'identifiant du propriétaire d'UN enregistrement est lu ; le reste est compté.
const owners = (env["SONDE_PROPRIETAIRES"] ?? "hr.attendance:employee_id,hr.attendance.ventilation:employee_id").split(",").map((s) => s.trim()).filter(Boolean);
if (owners.length) {
  lines.push("", "## Cloisonnement", "", "| Modèle | Champ propriétaire | Visibles | Hors du premier propriétaire | Verdict |", "|---|---|---|---|---|");
  for (const pair of owners) {
    const [model, field] = pair.split(":") as [string, string | undefined];
    if (!field) continue;
    const total = await attempt(() => t.callKw<number>({ model, method: "search_count", args: [[]], kwargs: {} }));
    const ownerOf = await attempt(async () => {
      const rows = await t.callKw<Record<string, unknown>[]>({ model, method: "search_read", args: [[]], kwargs: { fields: [field], limit: 1 } });
      const v = rows[0]?.[field];
      return Array.isArray(v) ? (v[0] as number) : typeof v === "number" ? v : false;
    });
    const others = ownerOf?.ok
      ? await attempt(() => t.callKw<number>({ model, method: "search_count", args: [[[field, "!=", ownerOf.value]]], kwargs: {} }))
      : null;
    const verdict = !total.ok
      ? "lecture refusée"
      : total.value === 0
        ? "rien de visible"
        : others?.ok
          ? others.value === 0
            ? "✅ un seul propriétaire visible"
            : "⚠️ plusieurs propriétaires visibles : vérifier la règle d'enregistrement"
          : `? (${(others && !others.ok && others.error) || (ownerOf && !ownerOf.ok && ownerOf.error) || "indéterminé"})`;
    lines.push(`| \`${model}\` | \`${field}\` | ${total.ok ? total.value : "refusé"} | ${others?.ok ? others.value : "?"} | ${cell(verdict)} |`);
  }
}

lines.push("", `Méthode de vérification des droits utilisée : ${[...vias].map((v) => `\`${cell(v)}\``).join(", ")}.`, "");
lines.push(
  "## Lecture",
  "",
  "- **Lire ✅ et Visibles > 0** : Odoo porte les droits de ce compte sur ce modèle ; Leila peut l'appeler avec la session de l'utilisateur, filtré par les règles d'Odoo (cas 1 de Q-10).",
  "- **Lire — ou refusé** : seul un contrôleur (souvent en `sudo()`) donne accès à ces données ; Leila ne peut pas passer par l'ORM (cas 2).",
  "- **get_views ✅** : les définitions de vues du back-office sont lisibles pour ce modèle, même sans menus.",
  "",
);

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}SONDE.md`, lines.join("\n"));
await t.destroy();
console.log(lines.slice(4, 10 + models.length).join("\n"));
const cloison = lines.indexOf("## Cloisonnement");
if (cloison >= 0) console.log(`\n${lines.slice(cloison, cloison + 4 + owners.length).join("\n")}`);
console.log(`\n→ ${outDir}SONDE.md`);
