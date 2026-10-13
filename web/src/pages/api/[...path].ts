// pages/api/[...path].ts — Proxy serveur vers l'API Fastify, pour les appels du navigateur.
//
//  - identité : en mode shared, le viewer est injecté ICI depuis l'environnement
//    du serveur Astro ; en identité réelle, seul le cookie leila_sid est relayé
//    (et Set-Cookie en retour). Les en-têtes x-viewer-* du navigateur ne sont
//    jamais relayés ;
//  - seules les routes listées sont relayées.

import type { APIRoute } from "astro";
import { API_BASE, identityHeaders } from "../../lib/api.js";

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
  { method: "POST", pattern: /^auth\/(login|logout)$/ },
  { method: "GET", pattern: /^auth\/me$/ },
];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const ALL: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const path = params.path ?? "";
  if (!ALLOWED.some((r) => r.method === request.method && r.pattern.test(path))) {
    return json(404, { error: "not_found", message: `Route non relayée : ${request.method} /api/${path}` });
  }

  const search = new URL(request.url).search;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const res = await fetch(`${API_BASE}/api/${path}${search}`, {
      method: request.method,
      headers: {
        ...identityHeaders({ request, locals }),
        "X-Forwarded-For": clientAddress,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasBody ? { body: (await request.text()) || "{}" } : {}),
    });
    const headers = new Headers({ "Content-Type": res.headers.get("Content-Type") ?? "application/json" });
    for (const c of res.headers.getSetCookie()) headers.append("Set-Cookie", c);
    // 204 : pas de corps
    return new Response(res.status === 204 ? null : await res.text(), { status: res.status, headers });
  } catch {
    return json(503, { error: "unreachable", message: `L'API ne répond pas sur ${API_BASE}.` });
  }
};
