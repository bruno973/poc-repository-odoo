// scripts/lib/classement.ts — Classement des manques de prise en charge sur un inventaire (UI-001).
//
// Les diagnostics de toutes les vues sont regroupés par manque (type de champ, widget, élément…)
// et triés par nombre de vues concernées : on voit ce qu'il faut traiter UNE fois pour couvrir
// le plus de vues, et ce qui est propre à un seul modèle (candidat « ouvrir dans Odoo »).
//
// Fonctionne hors ligne sur docs/inventaire/<compte>/ : aucune connexion à Odoo.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { Diagnostic } from "@leila/ui-schema";
import { parseLiteral, type Literal } from "../../src/adapters/odoo18/ui/OdooExpressionParser.js";
import { type OdooFieldMeta, type ParsedView, parseArch } from "../../src/adapters/odoo18/ui/OdooViewParser.js";
import { ODOO_COMMANDS } from "../../src/adapters/odoo18/ui/commands.js";

export interface InventoryView {
  action: string;
  model: string;
  type: "form" | "list" | "search";
  arch: string;
  fields: Record<string, OdooFieldMeta>;
  actionContext?: Record<string, Literal> | undefined;
}

/** Vues d'un dossier d'inventaire (fichiers <action>-<modèle>.<type>.xml + .fields.json + README.md). */
export function loadInventory(dir: string): InventoryView[] {
  const readme = existsSync(`${dir}README.md`) ? readFileSync(`${dir}README.md`, "utf8") : "";
  return readdirSync(dir)
    .map((f) => /^(\d+)-(.+)\.(form|list|search)\.xml$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]) || a[0].localeCompare(b[0]))
    .map((m) => ({
      action: m[1] as string,
      model: m[2] as string,
      type: m[3] as InventoryView["type"],
      arch: readFileSync(`${dir}${m[0]}`, "utf8"),
      fields: JSON.parse(readFileSync(`${dir}${m[1]}-${m[2]}.fields.json`, "utf8")) as Record<string, OdooFieldMeta>,
      actionContext: actionContext(readme, m[1] as string),
    }));
}

/** Contexte d'action relevé dans le README de l'inventaire. */
function actionContext(readme: string, action: string): Record<string, Literal> | undefined {
  const m = new RegExp(`Action ${action} · [^\\n]*contexte \`([\\s\\S]*?)\`\\n`).exec(readme);
  const ctx = m ? parseLiteral(m[1] as string) : null;
  return ctx && typeof ctx === "object" && !Array.isArray(ctx) ? (ctx as Record<string, Literal>) : undefined;
}

export function parseInventoryView(v: InventoryView): ParsedView {
  return parseArch(v.arch, v.type, {
    model: v.model,
    fields: v.fields,
    commandFor: (b) => (b.type === "object" ? ODOO_COMMANDS.find((c) => c.model === v.model && c.method === b.name)?.id : undefined),
    actionContext: v.actionContext,
  });
}

// ─── Regroupement ─────────────────────────────────────────────────────────────

export type GapFamily = "Types de champ" | "Widgets" | "Éléments de vue" | "Recherche" | "Boutons" | "Expressions";

const FAMILY: Partial<Record<Diagnostic["code"], GapFamily>> = {
  unsupported_field_type: "Types de champ",
  unsupported_widget: "Widgets",
  unsupported_node: "Éléments de vue",
  ignored_text: "Éléments de vue",
  unsupported_domain: "Recherche",
  unsupported_command: "Boutons",
  unsupported_expression: "Expressions",
};
const SEVERITY = { info: 0, warning: 1, blocking: 2 } as const;

export interface Gap {
  family: GapFamily;
  /** Libellé du manque : nom entre « » quand le message en cite un, sinon le message. */
  subject: string;
  severity: Diagnostic["severity"];
  /** Vues concernées, « <modèle>.<type> » (une vue comptée une fois par manque). */
  views: string[];
  models: string[];
  occurrences: number;
}

/** Les exclusions par droits ne sont pas des manques : elles sont ignorées. */
export function rankGaps(items: readonly { model: string; type: string; diagnostics: readonly Diagnostic[] }[]): Gap[] {
  const gaps = new Map<string, Gap & { viewSet: Set<string>; modelSet: Set<string> }>();
  for (const item of items) {
    for (const d of item.diagnostics) {
      const family = FAMILY[d.code];
      if (!family) continue;
      const key = `${d.code}|${d.message}`;
      const quoted = /« ([^»]+) »/.exec(d.message)?.[1];
      const subject = family === "Types de champ" || family === "Widgets" ? (quoted ?? d.message) : d.message;
      const gap = gaps.get(key) ?? { family, subject, severity: d.severity, views: [], models: [], occurrences: 0, viewSet: new Set<string>(), modelSet: new Set<string>() };
      gap.occurrences++;
      gap.viewSet.add(`${item.model}.${item.type}`);
      gap.modelSet.add(item.model);
      if (SEVERITY[d.severity] > SEVERITY[gap.severity]) gap.severity = d.severity;
      gaps.set(key, gap);
    }
  }
  return [...gaps.values()]
    .map(({ viewSet, modelSet, ...g }) => ({ ...g, views: [...viewSet].sort(), models: [...modelSet].sort() }))
    .sort((a, b) => b.views.length - a.views.length || b.occurrences - a.occurrences || a.subject.localeCompare(b.subject));
}

// ─── Boutons hors registre ────────────────────────────────────────────────────

export interface ButtonCandidate {
  model: string;
  /** Méthode (type="object") ou action XML (type="action") : reste dans ce rapport, jamais envoyé au navigateur. */
  name: string;
  type: string;
  labels: string[];
  views: string[];
}

const BUTTON = /<button\b([^>]*)>/g;
const ATTR = /([\w-]+)="([^"]*)"/g;

/** Boutons des vues non inscrits au registre fermé de commandes : candidats à examiner. */
export function buttonCandidates(views: readonly InventoryView[]): ButtonCandidate[] {
  const out = new Map<string, ButtonCandidate>();
  for (const v of views) {
    for (const [, raw] of v.arch.matchAll(BUTTON)) {
      const a = Object.fromEntries([...(raw ?? "").matchAll(ATTR)].map((m) => [m[1], m[2]])) as Record<string, string | undefined>;
      const name = a["name"];
      if (!name) continue;
      const type = a["type"] ?? "?";
      if (type === "object" && ODOO_COMMANDS.some((c) => c.model === v.model && c.method === name)) continue;
      const key = `${v.model}|${type}|${name}`;
      const c = out.get(key) ?? { model: v.model, name, type, labels: [], views: [] };
      const label = a["string"] ?? a["title"];
      if (label && !c.labels.includes(label)) c.labels.push(label);
      if (!c.views.includes(v.type)) c.views.push(v.type);
      out.set(key, c);
    }
  }
  return [...out.values()].sort((a, b) => a.model.localeCompare(b.model) || a.name.localeCompare(b.name));
}

// ─── Rendu ────────────────────────────────────────────────────────────────────

const LEVEL = { info: "Info", warning: "Attention", blocking: "Bloquant" } as const;
const FAMILIES: GapFamily[] = ["Types de champ", "Widgets", "Éléments de vue", "Recherche", "Boutons", "Expressions"];
const cell = (s: string) => s.replace(/\|/g, "\\|");

export function renderRanking(
  gaps: readonly Gap[],
  meta: { account: string; viewCount: number; modelCount: number },
  buttons: readonly ButtonCandidate[] = [],
): string {
  const lines = [
    `# Classement des manques — compte \`${meta.account}\``,
    "",
    `${meta.viewCount} vues, ${meta.modelCount} modèles. Généré par \`npm run classement\` (hors ligne, depuis les fichiers de l'inventaire).`,
    "",
    "Lecture : un manque se traite **une fois** dans le moteur et disparaît de toutes les vues concernées.",
    "« Transversal » = présent sur plusieurs modèles (à implémenter en priorité) ; « propre à » = un seul modèle",
    "(souvent un widget spécifique d'Odoo : candidat à un lien « Ouvrir dans Odoo »).",
    "",
    "## Synthèse",
    "",
    "| Famille | Manques distincts | Transversaux | Occurrences |",
    "|---|---|---|---|",
  ];
  for (const family of FAMILIES) {
    const g = gaps.filter((x) => x.family === family);
    if (g.length) lines.push(`| ${family} | ${g.length} | ${g.filter((x) => x.models.length > 1).length} | ${g.reduce((n, x) => n + x.occurrences, 0)} |`);
  }
  lines.push("");
  for (const family of FAMILIES) {
    const g = gaps.filter((x) => x.family === family);
    if (!g.length) continue;
    lines.push(`## ${family}`, "", "| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |", "|---|---|---|---|---|---|");
    for (const x of g) {
      const scope = x.models.length > 1 ? `transversal (${x.models.length} modèles)` : `propre à \`${x.models[0]}\``;
      const shown = x.views.slice(0, 4).join(", ") + (x.views.length > 4 ? `, … (+${x.views.length - 4})` : "");
      lines.push(`| ${cell(x.subject)} | ${LEVEL[x.severity]} | ${x.views.length} | ${x.occurrences} | ${scope} | ${cell(shown)} |`);
    }
    lines.push("");
  }
  if (buttons.length) {
    lines.push(
      "## Boutons candidats au registre de commandes",
      "",
      "Le registre est fermé (ADR-001) : chaque bouton retenu demande une commande Leila explicite, testée avec les droits.",
      "",
      "| Modèle | Bouton | Type | Libellé | Vues |",
      "|---|---|---|---|---|",
    );
    for (const b of buttons) lines.push(`| \`${b.model}\` | \`${cell(b.name)}\` | ${b.type} | ${cell(b.labels.join(" / ") || "—")} | ${b.views.join(", ")} |`);
    lines.push("");
  }
  if (!gaps.length) lines.push("Aucun manque : toutes les vues sont entièrement prises en charge.", "");
  return lines.join("\n");
}

/** Classement complet d'un dossier d'inventaire. */
export function rankInventory(dir: string, account: string): string {
  const views = loadInventory(dir);
  const gaps = rankGaps(views.map((v) => ({ model: v.model, type: v.type, diagnostics: parseInventoryView(v).diagnostics })));
  return renderRanking(gaps, { account, viewCount: views.length, modelCount: new Set(views.map((v) => v.model)).size }, buttonCandidates(views));
}
