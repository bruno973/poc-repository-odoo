// server.ts — Fastify app factory
// Configure le serveur, enregistre les plugins, les routes et la traduction
// des erreurs domaine en codes HTTP (un seul endroit).

import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { Repositories } from "./app/repositories.js";
import type { Tracer } from "./app/trace.js";
import { DomainError, HTTP_STATUS } from "./domain/errors.js";
import { NotImplementedError } from "./domain/EmployeeRepository.js";
import { registerEmployeeRoutes } from "./routes/employees.js";
import { registerDepartmentRoutes } from "./routes/departments.js";
import { registerAttendanceRoutes } from "./routes/attendances.js";
import { registerSummaryRoutes } from "./routes/summary.js";

export async function createServer(repos: Repositories, tracer: Tracer) {
  const fastify = Fastify({
    logger: {
      level: "info",
      redact: {
        paths: ["req.headers.authorization", "req.body.password"],
        remove: true,
      },
    },
  });

  await fastify.register(cors, {
    origin: true, // Autorise toutes les origines (PoC)
  });

  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.code(HTTP_STATUS[error.code]).send({ error: error.code, message: error.message });
    }
    if (error instanceof NotImplementedError) {
      return reply.code(501).send({ error: "not_implemented", message: error.message });
    }
    if (error instanceof ZodError) {
      // Les ZodError de sortie d'adapter sont converties en amont (app/repositories.ts) :
      // ici, c'est forcément une entrée (query, params, body) mal formée.
      return reply.code(400).send({ error: "invalid", message: "Paramètres invalides", details: error.flatten() });
    }
    request.log.error(error);
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: "internal", message: status === 500 ? "Erreur interne" : error.message });
  });

  // Health check
  fastify.get("/healthz", async () => ({ status: "ok" }));

  // Méta + journal des appels (PoC)
  fastify.get("/api/meta", async () => ({ adapter: repos.adapter, label: repos.label }));
  fastify.get("/api/_trace", async () => tracer.recent());

  // Routes métier
  registerEmployeeRoutes(fastify, repos.employees);
  registerDepartmentRoutes(fastify, repos.employees);
  registerAttendanceRoutes(fastify, repos.attendances);
  registerSummaryRoutes(fastify, repos.summary);

  return fastify;
}
