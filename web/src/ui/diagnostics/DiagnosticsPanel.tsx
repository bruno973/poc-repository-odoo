// ui/diagnostics/DiagnosticsPanel.tsx — Compatibilité de l'écran, REGROUPÉE par type :
// combien d'éléments, de quelle gravité, et le détail à la demande. Aucune donnée
// personnelle (messages produits par le BFF) ; emplacements en mode diagnostic seulement.

import type { Diagnostic } from "@leila/ui-schema";
import { useState } from "react";

const SEVERITY: Record<Diagnostic["severity"], string> = { blocking: "Bloquant", warning: "Attention", info: "Info" };
const RANK: Record<Diagnostic["severity"], number> = { blocking: 0, warning: 1, info: 2 };
const LABEL: Record<Diagnostic["code"], string> = {
  unsupported_command: "Boutons hors du registre de commandes",
  unsupported_field_type: "Types de champ non pris en charge",
  unsupported_widget: "Widgets non pris en charge (lecture seule)",
  unsupported_expression: "Conditions non comprises (repli prudent)",
  unsupported_domain: "Sélections ou filtres désactivés (domaine)",
  unsupported_node: "Éléments de vue non pris en charge",
  unsupported_action: "Action indisponible",
  excluded_by_rights: "Champs exclus (droits de lecture)",
  ignored_text: "Texte libre non importé",
};

export function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (diagnostics.length === 0) return null;
  const toTreat = diagnostics.filter((d) => d.severity !== "info").length;
  const byCode = new Map<Diagnostic["code"], Diagnostic[]>();
  for (const d of diagnostics) byCode.set(d.code, [...(byCode.get(d.code) ?? []), d]);
  const groups = [...byCode]
    .map(([code, items]) => ({ code, items, worst: items.reduce((w, d) => (RANK[d.severity] < RANK[w] ? d.severity : w), "info" as Diagnostic["severity"]) }))
    .sort((a, b) => RANK[a.worst] - RANK[b.worst] || b.items.length - a.items.length);
  const detailed = diagnostics.some((d) => d.path !== "");

  return (
    <section className="ui-diagnostics">
      <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
        Compatibilité : {diagnostics.length} élément{diagnostics.length > 1 ? "s" : ""} non pris en charge
        {toTreat ? ` (dont ${toTreat} à traiter)` : ""}
      </button>
      {open && (
        <table className="grid ui-diagnostics__table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Niveau</th>
              <th className="is-num">Nombre</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.code} label={LABEL[g.code]} code={g.code} worst={g.worst} items={g.items} detailed={detailed} open={expanded === g.code} onToggle={() => setExpanded(expanded === g.code ? null : g.code)} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function GroupRows(props: { label: string; code: string; worst: Diagnostic["severity"]; items: Diagnostic[]; detailed: boolean; open: boolean; onToggle(): void }) {
  return (
    <>
      <tr className={`is-${props.worst}`}>
        <td>
          <button type="button" className="ui-sort" aria-expanded={props.open} onClick={props.onToggle}>
            {props.open ? "▾" : "▸"} {props.label} <code className="muted">{props.code}</code>
          </button>
        </td>
        <td>{SEVERITY[props.worst]}</td>
        <td className="is-num num">{props.items.length}</td>
      </tr>
      {props.open &&
        props.items.map((d, i) => (
          <tr key={i} className="ui-diagnostics__detail">
            <td colSpan={3}>
              {props.detailed && d.path && <code>{d.path}</code>} {d.message}
            </td>
          </tr>
        ))}
    </>
  );
}
