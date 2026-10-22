// main.ts — Point d'entrée : charge l'environnement, compose les adapters, démarre.

import "dotenv/config";
import { createRepositories } from "./app/repositories.js";
import { SessionStore } from "./app/sessions.js";
import { Tracer } from "./app/trace.js";
import { createServer } from "./server.js";

async function main() {
  const port = parseInt(process.env["API_PORT"] ?? "3001", 10);
  const tracer = new Tracer();
  const repos = await createRepositories(process.env, tracer);
  const server = await createServer(repos, tracer, {
    cookieSecure: process.env["COOKIE_SECURE"] !== "0",
    loginAttemptsPerMinute: parseInt(process.env["LOGIN_ATTEMPTS_PER_MINUTE"] ?? "5", 10),
    trustProxy: process.env["TRUST_PROXY"] === "1",
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
