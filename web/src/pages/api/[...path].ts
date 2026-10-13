// pages/api/[...path].ts — Proxy serveur vers l'API Fastify, pour les appels du navigateur.
//
// Remplace pages/api/employees/[id].ts. Deux changements de fond :
//  - le viewer est injecté ICI, depuis l'environnement du serveur Astro ;
//    les en-têtes x-viewer-* envoyés par le navigateur sont ignorés (avant,
//    ils étaient relayés tels quels : n'importe qui pouvait se déclarer hr_admin) ;
//  - seules les routes listées sont relayées.

import type { APIRoute } from "astro";
import { API_BASE } from "../../lib/api.js";
import { viewerHeaders } from "../../lib/viewer.js";

export const prerender = false;

const ALLOWED: { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^_trace$/ },
  { method: "GET", pattern: /^meta$/ },
  { method: "GET", pattern: /^summary\/(groups|lines)$/ },
  { method: "GET", pattern: /^attendances$/ },
  { method: "PATCH", pattern: /^attendances\/\d+$/ },
  { method: "POST", pattern: /^attendances\/\d+\/(approve|refuse)$/ },
  { method: "GET", pattern: /^employees\/\d+\/open-attendance$/ },
  { method: "POST", pattern: /^employees\/\d+\/check-(in|out)$/ },
  { method: "PATCH", pattern: /^employees\/\d+$/ },
];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const ALL: APIRoute = async ({ params, request }) => {
  const path = params.path ?? "";
  if (!ALLOWED.some((r) => r.method === request.method && r.pattern.test(path))) {
    return json(404, { error: "not_found", message: `Route non relayée : ${request.method} /api/${path}` });
  }

  const search = new URL(request.url).search;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const res = await fetch(`${API_BASE}/api/${path}${search}`, {
      method: request.method,
      headers: { ...viewerHeaders(), ...(hasBody ? { "Content-Type": "application/json" } : {}) },
      ...(hasBody ? { body: (await request.text()) || "{}" } : {}),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return json(503, { error: "unreachable", message: `L'API ne répond pas sur ${API_BASE}.` });
  }
};
