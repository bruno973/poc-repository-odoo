// server.ts — Fastify app factory
// Configure le serveur, enregistre les plugins, les routes et la traduction
// des erreurs domaine en codes HTTP (un seul endroit).

import Fastify, { type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { Repositories } from "./app/repositories.js";
import { SessionStore } from "./app/sessions.js";
import type { Tracer } from "./app/trace.js";
import { DomainError, HTTP_STATUS } from "./domain/errors.js";
import { NotImplementedError } from "./domain/EmployeeRepository.js";
import { registerEmployeeRoutes } from "./routes/employees.js";
import { registerDepartmentRoutes } from "./routes/departments.js";
import { registerAttendanceRoutes } from "./routes/attendances.js";
import { registerSummaryRoutes } from "./routes/summary.js";
import { registerUiRoutes } from "./routes/ui.js";
import { clearSessionCookie, registerAuthRoutes } from "./routes/auth.js";
import { SESSION_COOKIE, type ViewerResolver, headerViewer, readCookie, sessionViewer } from "./routes/viewer.js";

export interface ServerOptions {
  /** Sessions Leila (horloge injectable dans les tests) */
  sessions?: SessionStore;
  /** Secure sur le cookie de session ; défaut true */
  cookieSecure?: boolean;
  /** Défaut 5 */
  loginAttemptsPerMinute?: number;
  /** Faire confiance à X-Forwarded-For (API derrière le front) */
  trustProxy?: FastifyServerOptions["trustProxy"];
  /** Remplace la configuration du logger (tests : capture des journaux) */
  logger?: FastifyServerOptions["logger"];
  now?: () => number;
  /**
   * Origines autorisées en CORS. Vide (défaut) : pas de CORS, le front et l'API
   * partagent la même origine derrière le reverse proxy.
   */
  corsOrigins?: string[];
  /** Expose /api/_trace et le libellé de l'adapter dans /api/meta (développement uniquement) */
  debugEndpoints?: boolean;
}

/** En-tête exigé sur toute requête mutante en identité réelle (anti-CSRF). */
export const CSRF_HEADER = "x-leila-csrf";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function createServer(repos: Repositories, tracer: Tracer, options: ServerOptions = {}) {
  const fastify = Fastify({
    trustProxy: options.trustProxy ?? false,
    logger: options.logger ?? {
      level: "info",
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "req.body.password"],
        remove: true,
      },
    },
  });

  // SEC-001 : plus de CORS ouvert. Même origine derrière le proxy ; sinon liste explicite.
  const corsOrigins = options.corsOrigins ?? [];
  if (corsOrigins.length > 0) {
    await fastify.register(cors, { origin: corsOrigins, credentials: true });
  }

  const auth = repos.auth;
  const debug = options.debugEndpoints ?? false;

  // Anti-CSRF (§ 6.2.3) : le cookie de session part tout seul avec une requête
  // venue d'un autre site. Un en-tête personnalisé, lui, ne peut être posé que
  // par du code de la même origine (un autre site déclencherait un préflight CORS
  // refusé). SameSite=Lax couvre déjà les formulaires ; ceci couvre le reste.
  if (auth.mode !== "shared") {
    fastify.addHook("onRequest", async (request, reply) => {
      if (!MUTATING.has(request.method) || !request.url.startsWith("/api/")) return;
      if (request.headers[CSRF_HEADER] !== "1") {
        return reply.code(403).send({ error: "csrf", message: "Requête refusée (protection CSRF)." });
      }
      return undefined;
    });
  }
  const cookieSecure = options.cookieSecure ?? true;
  const sessions = auth.mode === "shared" ? null : (options.sessions ?? new SessionStore(options.now ? { now: options.now } : {}));

  fastify.setErrorHandler(async (error, request, reply) => {
    if (error instanceof DomainError) {
      // Session moteur expirée (F-08) : la session Leila n'a plus de sens.
      if (error.code === "unauthenticated" && sessions && auth.mode !== "shared") {
        const sid = readCookie(request, SESSION_COOKIE);
        const principal = sid ? sessions.destroy(sid) : null;
        if (principal) await auth.identity.logout(principal).catch(() => undefined);
        if (sid) clearSessionCookie(reply, cookieSecure);
      }
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

  let viewerOf: ViewerResolver = headerViewer;
  if (sessions && auth.mode !== "shared") {
    viewerOf = sessionViewer(sessions);
    registerAuthRoutes(fastify, {
      identity: auth.identity,
      sessions,
      cookieSecure,
      loginAttemptsPerMinute: options.loginAttemptsPerMinute ?? 5,
      ...(options.now ? { now: options.now } : {}),
    });
    // Purge des sessions expirées, et fermeture de leur session moteur.
    const timer = setInterval(() => {
      for (const principal of sessions.purgeExpired()) void auth.identity.logout(principal).catch(() => undefined);
    }, 60_000);
    timer.unref();
    fastify.addHook("onClose", async () => clearInterval(timer));
  }

  // Health check
  fastify.get("/healthz", async () => ({ status: "ok" }));

  // Méta : le mode d'identité est public (le front en a besoin avant connexion) ;
  // le reste et le journal des appels ne sont exposés qu'en développement (§ 6.2.9).
  fastify.get("/api/meta", async () =>
    debug ? { adapter: repos.adapter, label: repos.label, authMode: auth.mode } : { authMode: auth.mode },
  );
  if (debug) {
    fastify.get("/api/_trace", async (request) => {
      if (auth.mode !== "shared") viewerOf(request);
      return tracer.recent();
    });
  }

  // Routes métier
  registerEmployeeRoutes(fastify, repos.employees, viewerOf);
  registerDepartmentRoutes(fastify, repos.employees, viewerOf);
  registerAttendanceRoutes(fastify, repos.attendances, viewerOf);
  registerSummaryRoutes(fastify, repos.summary, viewerOf);
  registerUiRoutes(fastify, repos.ui, viewerOf);

  return fastify;
}
