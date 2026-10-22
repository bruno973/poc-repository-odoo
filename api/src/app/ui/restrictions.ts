// app/ui/restrictions.ts — Restrictions métier PROPRES À LEILA, appliquées à
// l'identique à l'affichage (RecordPayload.access) et à l'écriture (§ 6.2.6).
// Vocabulaire Leila uniquement : l'adaptateur indique la « sémantique » d'une
// ressource (ex. « employee »), jamais un nom de modèle.

import type { ViewerContext } from "../../domain/tree.js";

export type ResourceSemantic = "employee" | "attendance" | "other";

export interface RecordRestriction {
  /** Toute la fiche en lecture seule */
  readonly: boolean;
  reason?: string;
}

export function leilaRestriction(semantic: ResourceSemantic, recordId: number, viewer: ViewerContext): RecordRestriction {
  // Q-05 : l'employé ne modifie pas sa propre fiche via Leila
  if (semantic === "employee" && viewer.employeeId !== undefined && recordId === viewer.employeeId) {
    return { readonly: true, reason: "Pas d'auto-modification de sa fiche (décision Q-05)." };
  }
  return { readonly: false };
}
