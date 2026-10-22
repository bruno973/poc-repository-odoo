// adapters/mock/rights.ts — Le mock SIMULE le moteur, droits compris (F-10).
//
// Ce fichier joue le rôle des droits et règles d'enregistrement d'Odoo pour
// l'adapter mock : il n'est jamais utilisé avec l'adapter Odoo. Règles simplifiées :
//  - hr_admin : tout ;
//  - manager  : son équipe = employés dont il est le manager direct ;
//  - employee : lui-même pour pointer ; aucune modification de fiche (Q-05).

import type { AttendanceCapabilities } from "../../domain/attendance.js";
import type { ViewerContext } from "../../domain/tree.js";
import type { MockEmployeeFlat } from "./fixtures.js";

/** Champs qu'un manager peut modifier sur un membre de son équipe. */
const MANAGER_WRITABLE = new Set(["header.jobTitle", "header.workEmail", "header.workPhone", "header.workMobile"]);

export function teamOf(viewer: ViewerContext, records: readonly MockEmployeeFlat[]): Set<number> {
  if (viewer.employeeId === undefined) return new Set();
  return new Set(records.filter((r) => r.header.manager?.id === viewer.employeeId).map((r) => r.id));
}

/** Employés dont le viewer voit les pointages et la synthèse (règles d'enregistrement). */
export function attendanceScope(viewer: ViewerContext, records: readonly MockEmployeeFlat[]): (employeeId: number) => boolean {
  if (viewer.role === "hr_admin") return () => true;
  const team = viewer.role === "manager" ? teamOf(viewer, records) : new Set<number>();
  return (employeeId) => employeeId === viewer.employeeId || team.has(employeeId);
}

export function canWriteField(viewer: ViewerContext, employeeId: number, key: string, records: readonly MockEmployeeFlat[]): boolean {
  if (viewer.role === "hr_admin") return true;
  if (viewer.role === "manager") return MANAGER_WRITABLE.has(key) && teamOf(viewer, records).has(employeeId);
  return false;
}

export function attendanceCapabilitiesFor(
  viewer: ViewerContext,
  employeeId: number,
  records: readonly MockEmployeeFlat[],
): AttendanceCapabilities {
  if (viewer.role === "hr_admin") return { canEdit: true, canApprove: true };
  if (viewer.role === "manager" && teamOf(viewer, records).has(employeeId)) return { canEdit: true, canApprove: true };
  return { canEdit: false, canApprove: false };
}

/** Pointer (arrivée / départ) : soi-même, son équipe, ou tout le monde pour l'admin RH. */
export function canPunchFor(viewer: ViewerContext, employeeId: number, records: readonly MockEmployeeFlat[]): boolean {
  if (viewer.role === "hr_admin" || employeeId === viewer.employeeId) return true;
  return viewer.role === "manager" && teamOf(viewer, records).has(employeeId);
}
