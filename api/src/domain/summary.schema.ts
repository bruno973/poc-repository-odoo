// domain/summary.schema.ts — Validation Zod des sorties d'adapter (synthèse).

import { z } from "zod";
import { HoursStatusSchema } from "./attendance.schema.js";
import { SUMMARY_DIMENSIONS } from "./summary.js";
import { RefSchema } from "./tree.schema.js";

export const SummaryDimensionSchema = z.enum(SUMMARY_DIMENSIONS);

export const SummaryKeySchema = z.object({
  dimension: SummaryDimensionSchema,
  value: z.union([z.number(), z.string(), z.null()]),
});

const hours = z.number().nonnegative();
const count = z.number().nonnegative();

export const SummaryTotalsSchema = z.object({
  worked: hours,
  day: hours,
  night: hours,
  overtime25: hours,
  overtime50: hours,
  sunday: hours,
  publicHoliday: hours,
  meals: count,
  daysBreakArrival: count,
  daysTransportArrival: count,
  daysBreakDeparture: count,
  daysTransportDeparture: count,
});

export const SummaryGroupSchema = z.object({
  key: SummaryKeySchema,
  label: z.string(),
  count: z.number().int().nonnegative(),
  totals: SummaryTotalsSchema,
});

export const SummaryLineSchema = z.object({
  id: z.number().int().positive(),
  employee: RefSchema,
  checkIn: z.string(),
  checkOut: z.string(),
  weekday: z.string(),
  slot: z.string().nullable(),
  serviceType: z.string().nullable(),
  slotStart: z.number().nullable(),
  slotEnd: z.number().nullable(),
  totals: SummaryTotalsSchema,
  hoursStatus: HoursStatusSchema.nullable(),
});
