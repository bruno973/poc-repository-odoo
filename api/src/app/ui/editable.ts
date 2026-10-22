// app/ui/editable.ts — Règle d'édition d'un champ dans une fiche, évaluée avec les
// conditions du schéma : la MÊME que celle du FormRenderer (affichage), appliquée
// par le BFF au moment de l'écriture. Neutre : aucun terme d'ERP.

import { type ConditionScope, type Flag, type Node, resolveFlag } from "@leila/ui-schema";

/**
 * Le champ est-il modifiable dans la fiche, avec ces valeurs ? Au moins une occurrence
 * visible (elle et ses conteneurs) et non en lecture seule ; repli prudent si indéterminé.
 */
export function editableInForm(nodes: Node[], field: string, scope: ConditionScope, hidden: Flag[] = []): boolean {
  const hiddenNow = (extra: Flag | undefined) => [...hidden, ...(extra === undefined ? [] : [extra])];
  for (const n of nodes) {
    if (n.kind === "field" && n.field === field) {
      const flags = hiddenNow(n.invisible);
      const visible = flags.every((f) => !resolveFlag(f, "invisible", scope));
      if (visible && !resolveFlag(n.readonly, "readonly", scope)) return true;
    } else if (n.kind === "notebook") {
      if (n.pages.some((p) => editableInForm(p.children, field, scope, hiddenNow(p.invisible)))) return true;
    } else if ("children" in n) {
      if (editableInForm(n.children, field, scope, hiddenNow(n.invisible))) return true;
    }
  }
  return false;
}
