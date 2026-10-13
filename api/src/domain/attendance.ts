// domain/attendance.ts — Pointages : types domaine purs. Aucun terme Odoo.

import type { Ref } from "./tree.js";

/** Mouvements déclarés au pointage (break, transport, repas). */
export interface Movements {
  breakArrival: boolean;
  breakDeparture: boolean;
  transportArrival: boolean;
  transportDeparture: boolean;
  meals: number;
}

export type HoursStatus = "to_approve" | "approved" | "refused";

export interface Attendance {
  id: number;
  employee: Ref;
  /** ISO 8601 UTC */
  checkIn: string;
  /** ISO 8601 UTC ; null tant que l'employé est présent */
  checkOut: string | null;
  /** heures décimales */
  workedHours: number;
  movements: Movements;
  hoursStatus: HoursStatus | null;
}

export interface AttendancePage {
  items: Attendance[];
  total: number;
}

export interface AttendanceListParams {
  employeeId?: number;
  /** Équivalent du filtre « Avec heures travaillées » de la vue Gestion */
  onlyWithWorkedHours?: boolean;
  status?: HoursStatus;
  limit: number;
  offset: number;
}

export interface CheckInCommand {
  employeeId: number;
  /** ISO 8601 ; heure du serveur si absent */
  at?: string;
  movements?: { breakArrival?: boolean; transportArrival?: boolean };
}

export interface CheckOutCommand {
  employeeId: number;
  at?: string;
  movements?: { breakDeparture?: boolean; transportDeparture?: boolean; meals?: number };
}

export interface AttendancePatch {
  checkIn?: string;
  checkOut?: string | null;
  movements?: Partial<Movements>;
}
