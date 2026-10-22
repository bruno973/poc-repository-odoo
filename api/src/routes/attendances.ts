// routes/attendances.ts — Pointer et Gestion.
// Les routes ne parlent qu'au port AttendanceRepository : aucune trace d'Odoo.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AttendanceRepository } from "../domain/AttendanceRepository.js";
import type { AttendancePatch, Movements } from "../domain/attendance.js";
import { HoursStatusSchema } from "../domain/attendance.schema.js";
import { IdParamsSchema } from "./employees.js";
import type { ViewerResolver } from "./viewer.js";

const ListQuerySchema = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  withWorkedHours: z.enum(["0", "1"]).optional(),
  status: HoursStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(80),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const IsoDate = z.string().datetime({ offset: true });
const Meals = z.number().int().min(0).max(3);

const CheckInBody = z
  .object({
    at: IsoDate.optional(),
    movements: z.object({ breakArrival: z.boolean().optional(), transportArrival: z.boolean().optional() }).optional(),
  })
  .default({});

const CheckOutBody = z
  .object({
    at: IsoDate.optional(),
    movements: z
      .object({ breakDeparture: z.boolean().optional(), transportDeparture: z.boolean().optional(), meals: Meals.optional() })
      .optional(),
  })
  .default({});

const PatchBody = z.object({
  checkIn: IsoDate.optional(),
  checkOut: IsoDate.nullable().optional(),
  movements: z
    .object({
      breakArrival: z.boolean().optional(),
      breakDeparture: z.boolean().optional(),
      transportArrival: z.boolean().optional(),
      transportDeparture: z.boolean().optional(),
      meals: Meals.optional(),
    })
    .optional(),
});

/** Retire les clés undefined (exactOptionalPropertyTypes). */
function defined<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as never;
}

export function registerAttendanceRoutes(
  fastify: FastifyInstance,
  repository: AttendanceRepository,
  viewerOf: ViewerResolver,
): void {
  fastify.get("/api/attendances", async (request) => {
    const viewer = viewerOf(request);
    const q = ListQuerySchema.parse(request.query);
    return repository.listAttendances(
      defined({
        employeeId: q.employeeId,
        onlyWithWorkedHours: q.withWorkedHours === "1",
        status: q.status,
        limit: q.limit,
        offset: q.offset,
      }),
      viewer,
    );
  });

  fastify.get("/api/employees/:id/open-attendance", async (request) => {
    const viewer = viewerOf(request);
    const { id } = IdParamsSchema.parse(request.params);
    return { attendance: await repository.getOpenAttendance(id, viewer) };
  });

  fastify.post("/api/employees/:id/check-in", async (request) => {
    const viewer = viewerOf(request);
    const { id } = IdParamsSchema.parse(request.params);
    const body = CheckInBody.parse(request.body ?? {});
    return repository.checkIn(
      defined({ employeeId: id, at: body.at, movements: body.movements ? defined(body.movements) : undefined }),
      viewer,
    );
  });

  fastify.post("/api/employees/:id/check-out", async (request) => {
    const viewer = viewerOf(request);
    const { id } = IdParamsSchema.parse(request.params);
    const body = CheckOutBody.parse(request.body ?? {});
    return repository.checkOut(
      defined({ employeeId: id, at: body.at, movements: body.movements ? defined(body.movements) : undefined }),
      viewer,
    );
  });

  fastify.patch("/api/attendances/:id", async (request) => {
    const viewer = viewerOf(request);
    const { id } = IdParamsSchema.parse(request.params);
    const body = PatchBody.parse(request.body ?? {});
    const patch: AttendancePatch = defined({
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      movements: body.movements ? (defined(body.movements) as Partial<Movements>) : undefined,
    });
    return repository.updateAttendance(id, patch, viewer);
  });

  fastify.post("/api/attendances/:id/approve", async (request) => {
    const viewer = viewerOf(request);
    const { id } = IdParamsSchema.parse(request.params);
    return repository.approveHours(id, viewer);
  });

  fastify.post("/api/attendances/:id/refuse", async (request) => {
    const viewer = viewerOf(request);
    const { id } = IdParamsSchema.parse(request.params);
    return repository.refuseHours(id, viewer);
  });
}
