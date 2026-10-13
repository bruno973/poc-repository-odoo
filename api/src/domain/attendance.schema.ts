// domain/attendance.schema.ts — Validation Zod des sorties d'adapter (pointages).

import { z } from "zod";
import { RefSchema } from "./tree.schema.js";

export const HoursStatusSchema = z.enum(["to_approve", "approved", "refused"]);

export const MovementsSchema = z.object({
  breakArrival: z.boolean(),
  breakDeparture: z.boolean(),
  transportArrival: z.boolean(),
  transportDeparture: z.boolean(),
  meals: z.number().int().nonnegative(),
});

const IsoDate = z.string().datetime({ offset: true });

export const AttendanceSchema = z.object({
  id: z.number().int().positive(),
  employee: RefSchema,
  checkIn: IsoDate,
  checkOut: IsoDate.nullable(),
  workedHours: z.number().nonnegative(),
  movements: MovementsSchema,
  hoursStatus: HoursStatusSchema.nullable(),
});

export const AttendancePageSchema = z.object({
  items: z.array(AttendanceSchema),
  total: z.number().int().nonnegative(),
});
