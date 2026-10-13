// domain/visibility.ts — Évaluation des règles VisibleIf CÔTÉ SERVEUR.
//
// Avant : évalué dans le navigateur (web/src/lib/visibility.ts). Les valeurs
// masquées partaient quand même dans la réponse JSON. Désormais l'API retire
// les nœuds invisibles AVANT de répondre : ce que le viewer n'a pas le droit
// de voir ne quitte jamais le serveur.
//
// Pur : aucun terme Odoo, aucun appel réseau.

import type { EmployeeFormRecord, FormNode, GroupNode, ViewerContext, VisibleIf } from "./tree.js";

/** Valeurs de l'arbre à plat, indexées par clé de nœud (many2one → libellé). */
export function flattenValues(nodes: readonly FormNode[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const node of nodes) {
    if (node.kind === "group") Object.assign(result, flattenValues(node.children));
    else result[node.key] = node.kind === "many2one" ? (node.value?.label ?? null) : node.value;
  }
  return result;
}

export function isVisible(
  rule: VisibleIf,
  viewer: ViewerContext,
  employeeId: number,
  values: Record<string, unknown>,
): boolean {
  switch (rule.kind) {
    case "always":
      return true;
    case "self":
      return viewer.employeeId === employeeId || viewer.role === "hr_admin";
    case "role":
      return rule.roles.includes(viewer.role);
    case "or":
      return rule.conditions.some((c) => isVisible(c, viewer, employeeId, values));
    case "and":
      return rule.conditions.every((c) => isVisible(c, viewer, employeeId, values));
    case "field": {
      const actual = values[rule.field];
      switch (rule.operator) {
        case "truthy":
          return Boolean(actual);
        case "eq":
          return actual === rule.value;
        case "neq":
          // Valeur inconnue (null) : on ne montre pas. Une condition qu'on ne peut
          // pas évaluer ne doit jamais ouvrir l'accès.
          return actual !== null && actual !== undefined && actual !== rule.value;
        case "gt":
          return typeof actual === "number" && typeof rule.value === "number" && actual > rule.value;
        case "lt":
          return typeof actual === "number" && typeof rule.value === "number" && actual < rule.value;
      }
    }
  }
}

/**
 * Retire de la fiche tout nœud invisible pour ce viewer, et les groupes devenus vides.
 * Les conditions « field » sont évaluées sur les valeurs AVANT élagage.
 */
export function applyVisibility(record: EmployeeFormRecord, viewer: ViewerContext): EmployeeFormRecord {
  const values = flattenValues(record.formTree);

  function prune(node: FormNode): FormNode | null {
    if (!isVisible(node.visibleIf, viewer, record.id, values)) return null;
    if (node.kind !== "group") return node;
    const children = node.children.map(prune).filter((c): c is FormNode => c !== null);
    return children.length ? { ...node, children } : null;
  }

  return {
    ...record,
    formTree: record.formTree.map(prune).filter((g): g is GroupNode => g !== null && g.kind === "group"),
  };
}

/**
 * Restreint `editable` par la règle Leila `editableIf` (feuille et groupes parents).
 * Ne rend jamais modifiable un champ que le moteur a déclaré non modifiable.
 * Appelé par les adapters à l'hydratation : l'affichage et l'enregistrement
 * (updateEmployee) lisent donc le même résultat.
 */
export function applyEditableIf(tree: GroupNode[], viewer: ViewerContext, employeeId: number): GroupNode[] {
  const values = flattenValues(tree);
  const allowed = (rules: readonly VisibleIf[]) => rules.every((r) => isVisible(r, viewer, employeeId, values));

  function walk(node: FormNode, inherited: readonly VisibleIf[]): FormNode {
    const rules = node.editableIf ? [...inherited, node.editableIf] : inherited;
    if (node.kind === "group") return { ...node, children: node.children.map((c) => walk(c, rules)) };
    return node.editable && rules.length > 0 && !allowed(rules) ? { ...node, editable: false } : node;
  }

  return tree.map((g) => walk(g, []) as GroupNode);
}

/** Clés des feuilles modifiables d'une fiche hydratée. */
export function editableKeys(tree: readonly FormNode[]): Set<string> {
  const keys = new Set<string>();
  const walk = (nodes: readonly FormNode[]) => {
    for (const n of nodes) {
      if (n.kind === "group") walk(n.children);
      else if (n.editable) keys.add(n.key);
    }
  };
  walk(tree);
  return keys;
}
