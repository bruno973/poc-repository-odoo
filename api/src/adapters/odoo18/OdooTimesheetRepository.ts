// adapters/odoo18/OdooTimesheetRepository.ts — « Mes présences » : hr.attendance et la
// ventilation du module leila_hr (hr.attendance.ventilation), lus avec la session de
// l'utilisateur, SANS sudo (Q-10) : Odoo applique ses droits et règles d'enregistrement.
//
// Défense en profondeur : seules les lignes de SA fiche employé sont gardées, même si une
// règle trop large en laissait voir d'autres (constaté sur amg avant correction).
// Ventilation non lisible (droit portail absent) : pointages seuls, signalé au client.

import { DomainError } from "../../domain/errors.js";
import type { TimesheetRepository } from "../../domain/TimesheetRepository.js";
import { type AttendanceRow, buildTimesheet, type MyTimesheet, type VentilationRow } from "../../domain/timesheet.js";
import { MyTimesheetSchema } from "../../domain/timesheet.schema.js";
import type { ViewerContext } from "../../domain/tree.js";
import { fromOdooDatetime } from "./client.js";
import { m2o, type OdooM2O } from "./mapping.js";
import type { OdooTransportFactory } from "./transport.js";

/** Pointages affichés au plus (les plus récents). */
const LIMIT = 500;
/** Enregistrements automatiques d'absence d'Odoo (1 seconde) : exclus, comme la page portail. */
const AUTO_AWAY_HOURS = 1 / 3600;
const DEFAULT_TZ = "America/Cayenne";

const VENTILATION_FIELDS = [
  "attendance_id",
  "employee_id",
  "closure_id",
  "week_number",
  "week_label",
  "day_of_week_name",
  "day_hours",
  "night_hours",
  "overtime_hours_t1",
  "overtime_hours_t2",
  "public_holiday_hours",
  "sunday_hours",
  "worked_hours",
  "is_break_entry",
  "arrival_has_used_boat",
  "departure_will_used_boat",
  "is_break_exit",
];

interface RawAttendance {
  id: number;
  employee_id: OdooM2O;
  check_in: string | false;
  check_out: string | false;
  worked_hours: number | false;
}

type RawVentilation = Record<string, unknown> & { attendance_id: OdooM2O; employee_id: OdooM2O };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

export class OdooTimesheetRepository implements TimesheetRepository {
  constructor(private readonly transports: OdooTransportFactory) {}

  async mine(viewer: ViewerContext): Promise<MyTimesheet> {
    const t = this.transports.for(viewer);
    const [users] = await t.callKw<{ tz: string | false }[]>({ model: "res.users", method: "read", args: [[viewer.id], ["tz"]], kwargs: {} });
    const userTz = text(users?.tz);
    const timezone = userTz && isTimeZone(userTz) ? userTz : DEFAULT_TZ;
    const own = viewer.employeeId;
    if (own === undefined) {
      return MyTimesheetSchema.parse({ employee: null, timezone, timezoneFallback: !userTz, detail: "attendance-only", periods: [], truncated: false });
    }

    const raw = await t.callKw<RawAttendance[]>({
      model: "hr.attendance",
      method: "search_read",
      args: [[["employee_id", "=", own], ["worked_hours", "!=", AUTO_AWAY_HOURS]]],
      kwargs: { fields: ["employee_id", "check_in", "check_out", "worked_hours"], order: "check_in desc", limit: LIMIT + 1 },
    });
    // Défense en profondeur : uniquement SA fiche
    const mine = raw.filter((a) => m2o(a.employee_id)?.id === own && a.check_in).slice(0, LIMIT);
    const employee = m2o(mine[0]?.employee_id);

    let ventilations: Map<number, VentilationRow[]> | null = null;
    if (mine.length > 0) {
      const rows = await t
        .callKw<RawVentilation[]>({
          model: "hr.attendance.ventilation",
          method: "search_read",
          args: [[["attendance_id", "in", mine.map((a) => a.id)]]],
          kwargs: { fields: VENTILATION_FIELDS, order: "check_in asc" },
        })
        .catch((error: unknown) => {
          // Droit de lecture absent (compte portail sans règle dédiée) : pointages seuls
          if (error instanceof DomainError && error.code === "forbidden") return null;
          throw error;
        });
      if (rows) {
        ventilations = new Map();
        for (const v of rows) {
          const attendanceId = m2o(v.attendance_id)?.id;
          if (attendanceId === undefined || m2o(v.employee_id)?.id !== own) continue;
          const list = ventilations.get(attendanceId) ?? [];
          list.push({
            periodLabel: m2o(v["closure_id"] as OdooM2O)?.label ?? null,
            weekNumber: typeof v["week_number"] === "number" ? v["week_number"] : null,
            weekLabel: text(v["week_label"]),
            dayName: text(v["day_of_week_name"]),
            hours: {
              day: num(v["day_hours"]),
              night: num(v["night_hours"]),
              overtime25: num(v["overtime_hours_t1"]),
              overtime50: num(v["overtime_hours_t2"]),
              publicHoliday: num(v["public_holiday_hours"]),
              sunday: num(v["sunday_hours"]),
              total: num(v["worked_hours"]),
            },
            flags: {
              breakEntry: v["is_break_entry"] === true,
              transportArrival: v["arrival_has_used_boat"] === true,
              transportDeparture: v["departure_will_used_boat"] === true,
              breakExit: v["is_break_exit"] === true,
            },
          });
          ventilations.set(attendanceId, list);
        }
      }
    }

    const rows: AttendanceRow[] = mine.map((a) => ({
      id: a.id,
      checkIn: fromOdooDatetime(a.check_in) as string,
      checkOut: fromOdooDatetime(a.check_out),
      workedHours: num(a.worked_hours),
      ventilations: ventilations ? (ventilations.get(a.id) ?? []) : null,
    }));
    return MyTimesheetSchema.parse({
      employee,
      timezone,
      timezoneFallback: !userTz,
      detail: ventilations || mine.length === 0 ? "full" : "attendance-only",
      periods: buildTimesheet(rows, timezone),
      truncated: raw.filter((a) => m2o(a.employee_id)?.id === own).length > LIMIT,
    });
  }
}

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
