// domain/timesheet.schema.ts — Validation Zod de « Mes présences » (sortie d'adapter).

import { z } from "zod";
import { RefSchema } from "./tree.schema.js";

const Hours = z.number().finite();
export const HoursBreakdownSchema = z.object({ day: Hours, night: Hours, overtime25: Hours, overtime50: Hours, publicHoliday: Hours, sunday: Hours, total: Hours });
const Flags = z.object({ breakEntry: z.boolean(), transportArrival: z.boolean(), transportDeparture: z.boolean(), breakExit: z.boolean() });
const IsoDate = z.string().datetime({ offset: true });

export const TimesheetDaySchema = z.object({
  attendanceId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dayName: z.string(),
  checkIn: IsoDate,
  checkOut: IsoDate.nullable(),
  workedHours: Hours,
  hours: HoursBreakdownSchema.nullable(),
  flags: Flags.nullable(),
});

export const TimesheetWeekSchema = z.object({ label: z.string(), days: z.array(TimesheetDaySchema), workedHours: Hours, totals: HoursBreakdownSchema.nullable() });
export const TimesheetPeriodSchema = z.object({ label: z.string(), weeks: z.array(TimesheetWeekSchema), workedHours: Hours, totals: HoursBreakdownSchema.nullable() });

export const MyTimesheetSchema = z.object({
  employee: RefSchema.nullable(),
  timezone: z.string(),
  timezoneFallback: z.boolean(),
  detail: z.enum(["full", "attendance-only"]),
  periods: z.array(TimesheetPeriodSchema),
  truncated: z.boolean(),
});
