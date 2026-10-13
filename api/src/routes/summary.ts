// routes/summary.ts — Synthèse (regroupements + totaux, puis lignes de détail).

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HoursStatusSchema } from "../domain/attendance.schema.js";
import type { SummaryRepository } from "../domain/SummaryRepository.js";
import { SummaryDimensionSchema, SummaryKeySchema } from "../domain/summary.schema.js";
import { extractViewer } from "./viewer.js";

/** path : tableau JSON de { dimension, value }, passé en query string. */
const PathSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw) return [];
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "path : JSON attendu" });
      return z.NEVER;
    }
  })
  .pipe(z.array(SummaryKeySchema).max(6));

const GroupsQuery = z.object({
  dimension: SummaryDimensionSchema,
  path: PathSchema,
  status: HoursStatusSchema.optional(),
});

const LinesQuery = z.object({ path: PathSchema, status: HoursStatusSchema.optional() });

export function registerSummaryRoutes(fastify: FastifyInstance, repository: SummaryRepository): void {
  fastify.get("/api/summary/groups", async (request) => {
    const viewer = extractViewer(request);
    const q = GroupsQuery.parse(request.query);
    return repository.getGroups(
      { dimension: q.dimension, path: q.path, ...(q.status !== undefined && { status: q.status }) },
      viewer,
    );
  });

  fastify.get("/api/summary/lines", async (request) => {
    const viewer = extractViewer(request);
    const q = LinesQuery.parse(request.query);
    return repository.getLines({ path: q.path, ...(q.status !== undefined && { status: q.status }) }, viewer);
  });
}
