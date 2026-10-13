// main.ts — Point d'entrée : charge l'environnement, compose les adapters, démarre.

import "dotenv/config";
import { createRepositories } from "./app/repositories.js";
import { Tracer } from "./app/trace.js";
import { createServer } from "./server.js";

async function main() {
  const port = parseInt(process.env["API_PORT"] ?? "3001", 10);
  const tracer = new Tracer();
  const repos = await createRepositories(process.env, tracer);
  const server = await createServer(repos, tracer);
  await server.listen({ port, host: "0.0.0.0" });
  console.log(`🚀 API on http://localhost:${port} [adapter: ${repos.label}]`);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
