// main.ts — Point d'entrée : charge l'environnement, compose les adapters, démarre.

import "dotenv/config";
import { authModeOf, createRepositories } from "./app/repositories.js";
import { SessionStore } from "./app/sessions.js";
import { Tracer } from "./app/trace.js";
import { createServer } from "./server.js";

async function main() {
  const port = parseInt(process.env["API_PORT"] ?? "3001", 10);
  // SEC-001 : le mode shared fait confiance à des en-têtes que n'importe quel
  // client peut forger. Réservé aux comparaisons de tests en environnement isolé.
  if (authModeOf(process.env) === "shared" && process.env["ALLOW_SHARED_MODE"] !== "1") {
    throw new Error(
      "AUTH_MODE=shared refusé : identité forgeable par en-têtes. Utilise odoo-session (ou fake-jwt avec le mock), " +
        "ou pose ALLOW_SHARED_MODE=1 pour une comparaison de tests en environnement isolé.",
    );
  }
  const tracer = new Tracer();
  const repos = await createRepositories(process.env, tracer);
  const server = await createServer(repos, tracer, {
    cookieSecure: process.env["COOKIE_SECURE"] !== "0",
    loginAttemptsPerMinute: parseInt(process.env["LOGIN_ATTEMPTS_PER_MINUTE"] ?? "5", 10),
    trustProxy: process.env["TRUST_PROXY"] === "1",
    corsOrigins: (process.env["CORS_ORIGINS"] ?? "").split(",").map((o) => o.trim()).filter(Boolean),
    debugEndpoints: process.env["DEBUG_ENDPOINTS"] === "1",
    sessions: new SessionStore({
      idleMs: parseFloat(process.env["SESSION_IDLE_MINUTES"] ?? "60") * 60_000,
      absoluteMs: parseFloat(process.env["SESSION_MAX_HOURS"] ?? "8") * 3_600_000,
    }),
  });
  await server.listen({ port, host: "0.0.0.0" });
  console.log(`🚀 API on http://localhost:${port} [adapter: ${repos.label}] [auth: ${repos.auth.mode}]`);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
