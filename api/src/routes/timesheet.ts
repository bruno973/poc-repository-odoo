// routes/timesheet.ts — « Mes présences » de l'utilisateur connecté (aucun paramètre :
// impossible de demander celles d'un autre).

import type { FastifyInstance } from "fastify";
import type { TimesheetRepository } from "../domain/TimesheetRepository.js";
import type { ViewerResolver } from "./viewer.js";

export function registerTimesheetRoutes(fastify: FastifyInstance, repository: TimesheetRepository, viewerOf: ViewerResolver): void {
  fastify.get("/api/me/timesheet", async (request) => repository.mine(viewerOf(request)));
}
