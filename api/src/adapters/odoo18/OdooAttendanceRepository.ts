// adapters/odoo18/OdooAttendanceRepository.ts
// Pointages : hr.attendance + champs ajoutés par le module leila_hr.
// Aucun terme Odoo ne sort de ce fichier : tout est traduit en types domaine.

import type { AttendanceRepository } from "../../domain/AttendanceRepository.js";
import type {
  Attendance,
  AttendanceListParams,
  AttendancePage,
  AttendancePatch,
  CheckInCommand,
  CheckOutCommand,
  HoursStatus,
  Movements,
} from "../../domain/attendance.js";
import { AttendancePageSchema, AttendanceSchema } from "../../domain/attendance.schema.js";
import { DomainError } from "../../domain/errors.js";
import type { ViewerContext, ViewerRole } from "../../domain/tree.js";
import { type OdooClient, fromOdooDatetime, toOdooDatetime } from "./client.js";
import { m2o, type OdooM2O } from "./mapping.js";

const MODEL = "hr.attendance";

export const ATTENDANCE_FIELDS = [
  "employee_id",
  "check_in",
  "check_out",
  "worked_hours",
  "overtime_status",
  // champs leila_hr (calculés avec inverse : lisibles ET modifiables)
  "meal_count",
  "break_entry",
  "break_exit",
  "boat_arrival",
  "boat_departure",
] as const;

/** Frontière ACL : vocabulaire domaine → champs Odoo. */
const MOVEMENT_FIELDS: Record<keyof Movements, string> = {
  breakArrival: "break_entry",
  breakDeparture: "break_exit",
  transportArrival: "boat_arrival",
  transportDeparture: "boat_departure",
  meals: "meal_count",
};

interface OdooRawAttendance {
  id: number;
  employee_id?: OdooM2O;
  check_in?: string | false;
  check_out?: string | false;
  worked_hours?: number;
  overtime_status?: HoursStatus | false;
  meal_count?: number | false;
  break_entry?: boolean;
  break_exit?: boolean;
  boat_arrival?: boolean;
  boat_departure?: boolean;
}

export class OdooAttendanceRepository implements AttendanceRepository {
  constructor(private readonly clientsByRole: Record<ViewerRole, OdooClient>) {}

  private clientFor(viewer: ViewerContext): OdooClient {
    return this.clientsByRole[viewer.role];
  }

  async listAttendances(params: AttendanceListParams, viewer: ViewerContext): Promise<AttendancePage> {
    const client = this.clientFor(viewer);
    const domain: unknown[] = [];
    if (params.employeeId !== undefined) domain.push(["employee_id", "=", params.employeeId]);
    if (params.onlyWithWorkedHours) domain.push(["worked_hours", ">", 0.001]);
    if (params.status !== undefined) domain.push(["overtime_status", "=", params.status]);

    const [rows, total] = await Promise.all([
      client.callKw<OdooRawAttendance[]>({
        model: MODEL,
        method: "search_read",
        args: [domain],
        kwargs: { fields: [...ATTENDANCE_FIELDS], order: "check_in desc, id desc", limit: params.limit, offset: params.offset },
      }),
      client.callKw<number>({ model: MODEL, method: "search_count", args: [domain], kwargs: {} }),
    ]);
    return AttendancePageSchema.parse({ items: rows.map(toAttendance), total });
  }

  async getOpenAttendance(employeeId: number, viewer: ViewerContext): Promise<Attendance | null> {
    const rows = await this.clientFor(viewer).callKw<OdooRawAttendance[]>({
      model: MODEL,
      method: "search_read",
      args: [[["employee_id", "=", employeeId], ["check_out", "=", false]]],
      kwargs: { fields: [...ATTENDANCE_FIELDS], order: "check_in desc", limit: 1 },
    });
    const row = rows[0];
    return row ? AttendanceSchema.parse(toAttendance(row)) : null;
  }

  async checkIn(command: CheckInCommand, viewer: ViewerContext): Promise<Attendance> {
    const client = this.clientFor(viewer);
    if (await this.getOpenAttendance(command.employeeId, viewer)) {
      throw new DomainError("Cet employé a déjà une arrivée en cours : pointe d'abord son départ.", "conflict");
    }
    const id = await client.callKw<number>({
      model: MODEL,
      method: "create",
      args: [{ employee_id: command.employeeId, check_in: toOdooDatetime(command.at ?? new Date().toISOString()) }],
      kwargs: {},
    });
    // Les mouvements passent par les champs calculés avec inverse de leila_hr,
    // écrits après la création pour que la fiche de mouvements existe déjà.
    const movements = toOdooMovements(command.movements ?? {});
    if (Object.keys(movements).length > 0) {
      await client.callKw({ model: MODEL, method: "write", args: [[id], movements], kwargs: {} });
    }
    return this.read(id, client);
  }

  async checkOut(command: CheckOutCommand, viewer: ViewerContext): Promise<Attendance> {
    const client = this.clientFor(viewer);
    const open = await this.getOpenAttendance(command.employeeId, viewer);
    if (!open) throw new DomainError("Aucune arrivée en cours pour cet employé.", "conflict");
    await client.callKw({
      model: MODEL,
      method: "write",
      args: [
        [open.id],
        { check_out: toOdooDatetime(command.at ?? new Date().toISOString()), ...toOdooMovements(command.movements ?? {}) },
      ],
      kwargs: {},
    });
    return this.read(open.id, client);
  }

  async updateAttendance(id: number, patch: AttendancePatch, viewer: ViewerContext): Promise<Attendance> {
    const client = this.clientFor(viewer);
    const values: Record<string, unknown> = toOdooMovements(patch.movements ?? {});
    if (patch.checkIn !== undefined) values["check_in"] = toOdooDatetime(patch.checkIn);
    if (patch.checkOut !== undefined) values["check_out"] = patch.checkOut === null ? false : toOdooDatetime(patch.checkOut);
    if (Object.keys(values).length > 0) {
      await client.callKw({ model: MODEL, method: "write", args: [[id], values], kwargs: {} });
    }
    return this.read(id, client);
  }

  async approveHours(id: number, viewer: ViewerContext): Promise<Attendance> {
    const client = this.clientFor(viewer);
    await client.callKw({ model: MODEL, method: "action_approve_overtime", args: [[id]], kwargs: {} });
    return this.read(id, client);
  }

  async refuseHours(id: number, viewer: ViewerContext): Promise<Attendance> {
    const client = this.clientFor(viewer);
    await client.callKw({ model: MODEL, method: "action_refuse_overtime", args: [[id]], kwargs: {} });
    return this.read(id, client);
  }

  private async read(id: number, client: OdooClient): Promise<Attendance> {
    const rows = await client.callKw<OdooRawAttendance[]>({
      model: MODEL,
      method: "read",
      args: [[id]],
      kwargs: { fields: [...ATTENDANCE_FIELDS] },
    });
    const row = rows[0];
    if (!row) throw new DomainError(`Pointage ${id} introuvable.`, "not_found");
    return AttendanceSchema.parse(toAttendance(row));
  }
}

function toOdooMovements(movements: Partial<Movements>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(MOVEMENT_FIELDS) as [keyof Movements, string][]) {
    const value = movements[key];
    if (value !== undefined) values[field] = value;
  }
  return values;
}

function toAttendance(row: OdooRawAttendance): Attendance {
  return {
    id: row.id,
    employee: m2o(row.employee_id) ?? { id: 0, label: "?" },
    checkIn: fromOdooDatetime(row.check_in) ?? "",
    checkOut: fromOdooDatetime(row.check_out),
    workedHours: Math.max(0, Number(row.worked_hours ?? 0)),
    movements: {
      breakArrival: Boolean(row.break_entry),
      breakDeparture: Boolean(row.break_exit),
      transportArrival: Boolean(row.boat_arrival),
      transportDeparture: Boolean(row.boat_departure),
      meals: Number(row.meal_count || 0),
    },
    hoursStatus: row.overtime_status || null,
  };
}
