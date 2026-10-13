// adapters/odoo18/capabilities.ts — Ce que CE viewer peut faire sur CES fiches,
// demandé à Odoo et jamais recalculé par Leila.
//
// has_access (Odoo 18, méthode publique des enregistrements) couvre les droits du
// modèle ET les règles d'enregistrement (dont celles de leila_hr). Il répond pour
// l'ensemble du lot : un seul appel quand tout est autorisé (cas courant) ; en cas
// de refus, on redemande fiche par fiche pour savoir lesquelles.

import type { AttendanceCapabilities } from "../../domain/attendance.js";
import type { OdooTransport } from "./transport.js";

export type Operation = "read" | "write" | "create" | "unlink";

export async function recordAccess(
  transport: OdooTransport,
  model: string,
  ids: readonly number[],
  operation: Operation = "write",
): Promise<Map<number, boolean>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const ask = (batch: number[]) =>
    transport.callKw<boolean>({ model, method: "has_access", args: [batch, operation], kwargs: {} });

  if (await ask(unique)) return new Map(unique.map((id) => [id, true]));
  if (unique.length === 1) return new Map([[unique[0] as number, false]]);
  const each = await Promise.all(unique.map((id) => ask([id])));
  return new Map(unique.map((id, i) => [id, Boolean(each[i])]));
}

// Les groupes d'un utilisateur ne changent pas pendant sa session : cache par transport.
const groupCache = new WeakMap<OdooTransport, Map<string, Promise<boolean>>>();

export function hasGroup(transport: OdooTransport, group: string): Promise<boolean> {
  let byGroup = groupCache.get(transport);
  if (!byGroup) {
    byGroup = new Map();
    groupCache.set(transport, byGroup);
  }
  let pending = byGroup.get(group);
  if (!pending) {
    pending = transport
      .userId()
      .then((uid) => transport.callKw<boolean>({ model: "res.users", method: "has_group", args: [[uid], group], kwargs: {} }))
      .then(Boolean);
    byGroup.set(group, pending);
    pending.catch(() => byGroup?.delete(group));
  }
  return pending;
}

/**
 * canEdit = has_access("write") sur le pointage ;
 * canApprove = canEdit ∧ groupe d'approbation (si configuré).
 */
export async function attendanceCapabilities(
  transport: OdooTransport,
  ids: readonly number[],
  approvalGroup: string | null,
): Promise<Map<number, AttendanceCapabilities>> {
  const [writable, approver] = await Promise.all([
    recordAccess(transport, "hr.attendance", ids, "write"),
    ids.length && approvalGroup ? hasGroup(transport, approvalGroup) : Promise.resolve(true),
  ]);
  return new Map(
    [...writable].map(([id, canEdit]) => [id, { canEdit, canApprove: canEdit && approver }]),
  );
}
