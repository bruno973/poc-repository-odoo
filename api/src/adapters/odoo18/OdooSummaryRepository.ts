// adapters/odoo18/OdooSummaryRepository.ts
// Synthèse : hr.attendance.ventilation (module leila_hr).
// Odoo fait le regroupement et les sommes (read_group) : un appel par niveau
// ouvert, exactement comme sa propre vue liste groupée.

import { DomainError } from "../../domain/errors.js";
import type { SummaryRepository } from "../../domain/SummaryRepository.js";
import {
  TOTAL_KEYS,
  WEEKDAYS,
  type SummaryDimension,
  type SummaryGroup,
  type SummaryGroupsParams,
  type SummaryKey,
  type SummaryLine,
  type SummaryLinesParams,
  type SummaryTotals,
} from "../../domain/summary.js";
import { SummaryGroupSchema, SummaryLineSchema } from "../../domain/summary.schema.js";
import type { HoursStatus } from "../../domain/attendance.js";
import type { ViewerContext, ViewerRole } from "../../domain/tree.js";
import { type OdooClient, fromOdooDatetime } from "./client.js";
import type { Ref } from "../../domain/tree.js";

/** Many2one Odoo ([id, "Libellé"]) ou rien. Ne pas utiliser m2o() ici : les axes
 * « semaine » et « jour » sont des chaînes, que m2o() découperait en caractères. */
function asRef(raw: unknown): Ref | null {
  return Array.isArray(raw) && typeof raw[0] === "number" ? { id: raw[0], label: String(raw[1] ?? "") } : null;
}

const MODEL = "hr.attendance.ventilation";

/** Axes domaine → champs groupables (tous stockés dans leila_hr). */
export const DIMENSION_FIELDS: Record<SummaryDimension, string> = {
  pole: "parent_id",
  department: "department_id",
  employee: "employee_id",
  period: "closure_id",
  week: "week_label",
  weekday: "day_of_week",
};

/** Totaux domaine → champs sommés par Odoo. */
export const TOTAL_FIELDS: Record<keyof SummaryTotals, string> = {
  worked: "worked_hours",
  day: "day_hours",
  night: "night_hours",
  overtime25: "overtime_hours_t1",
  overtime50: "overtime_hours_t2",
  sunday: "sunday_hours",
  publicHoliday: "public_holiday_hours",
  meals: "meal_count",
  daysBreakArrival: "is_break_entry_day_count",
  daysTransportArrival: "arrival_has_used_boat_day_count",
  daysBreakDeparture: "is_break_exit_day_count",
  daysTransportDeparture: "departure_will_used_boat_day_count",
};

type Row = Record<string, unknown>;

export class OdooSummaryRepository implements SummaryRepository {
  constructor(private readonly clientsByRole: Record<ViewerRole, OdooClient>) {}

  async getGroups(params: SummaryGroupsParams, viewer: ViewerContext): Promise<SummaryGroup[]> {
    const field = DIMENSION_FIELDS[params.dimension];
    const rows = await this.clientsByRole[viewer.role].callKw<Row[]>({
      model: MODEL,
      method: "read_group",
      args: [],
      kwargs: {
        domain: buildDomain(params.path, params.status),
        fields: Object.values(TOTAL_FIELDS).map((f) => `${f}:sum`),
        groupby: [field],
        lazy: true,
      },
    });
    return rows.map((row) => {
      const raw = row[field];
      const ref = asRef(raw);
      const value: SummaryKey["value"] = ref
        ? ref.id
        : raw === false || raw === null || raw === undefined
          ? null
          : String(raw);
      return SummaryGroupSchema.parse({
        key: { dimension: params.dimension, value },
        label: labelFor(params.dimension, raw),
        count: Number(row[`${field}_count`] ?? row["__count"] ?? 0),
        totals: toTotals(row),
      });
    });
  }

  async getLines(params: SummaryLinesParams, viewer: ViewerContext): Promise<SummaryLine[]> {
    const rows = await this.clientsByRole[viewer.role].callKw<(Row & { id: number })[]>({
      model: MODEL,
      method: "search_read",
      args: [buildDomain(params.path, params.status)],
      kwargs: {
        fields: [
          "employee_id",
          "check_in",
          "check_out",
          "day_of_week",
          "slot_name",
          "prestation_type",
          "hour_from",
          "hour_to",
          "overtime_status",
          ...Object.values(TOTAL_FIELDS),
        ],
        order: "check_in asc, id asc",
        limit: 500,
      },
    });
    return rows.map((row) =>
      SummaryLineSchema.parse({
        id: row.id,
        employee: asRef(row["employee_id"]) ?? { id: 0, label: "?" },
        checkIn: fromOdooDatetime(row["check_in"]) ?? "",
        checkOut: fromOdooDatetime(row["check_out"]) ?? "",
        weekday: labelFor("weekday", row["day_of_week"]),
        slot: typeof row["slot_name"] === "string" && row["slot_name"] ? row["slot_name"] : null,
        serviceType: asRef(row["prestation_type"])?.label ?? null,
        slotStart: typeof row["hour_from"] === "number" ? row["hour_from"] : null,
        slotEnd: typeof row["hour_to"] === "number" ? row["hour_to"] : null,
        totals: toTotals(row),
        hoursStatus: (row["overtime_status"] as HoursStatus | false) || null,
      }),
    );
  }
}

function buildDomain(path: SummaryKey[], status: HoursStatus | undefined): unknown[] {
  const domain: unknown[] = path.map((key) => {
    // Les valeurs du chemin viennent du client : on vérifie leur type avant de
    // les mettre dans un domaine Odoo.
    const v = key.value;
    if (v !== null && typeof v !== "number" && typeof v !== "string") {
      throw new DomainError("Valeur de regroupement invalide.", "invalid");
    }
    return [DIMENSION_FIELDS[key.dimension], "=", v ?? false];
  });
  if (status !== undefined) domain.push(["overtime_status", "=", status]);
  return domain;
}

function labelFor(dimension: SummaryDimension, raw: unknown): string {
  const ref = asRef(raw);
  if (ref) return ref.label;
  if (raw === false || raw === null || raw === undefined || raw === "") return "Aucun";
  if (dimension === "weekday") return WEEKDAYS[Number(raw)] ?? String(raw);
  return String(raw);
}

function toTotals(row: Row): SummaryTotals {
  const totals = {} as SummaryTotals;
  for (const key of TOTAL_KEYS) {
    const n = Number(row[TOTAL_FIELDS[key]] ?? 0);
    totals[key] = Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return totals;
}
