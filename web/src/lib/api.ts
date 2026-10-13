// web/src/lib/api.ts — Appels à l'API Fastify depuis le serveur Astro (SSR).
//
// Qui appelle ?
//  - mode shared : viewer du PoC, lu dans l'environnement (lib/viewer.ts) et
//    injecté en en-têtes x-viewer-* ;
//  - identité réelle : le cookie de session leila_sid du navigateur, relayé tel
//    quel. Le front ne sait rien d'autre de l'utilisateur.

import { viewerHeaders } from "./viewer.js";

export const API_BASE = process.env["API_BASE_URL"] ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Ce qu'il faut d'une requête Astro (page, composant ou endpoint) pour appeler l'API. */
export interface ApiContext {
  request: Request;
  locals: App.Locals;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function withQuery(path: string, query: Query = {}): string {
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** En-têtes d'identité pour un appel à l'API, selon le mode. */
export function identityHeaders(ctx: ApiContext): Record<string, string> {
  if (ctx.locals.auth.mode === "shared") return viewerHeaders();
  const cookie = ctx.request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

export async function apiGet<T>(ctx: ApiContext, path: string, query: Query = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withQuery(path, query), { headers: identityHeaders(ctx) });
  } catch {
    throw new ApiError(`L'API ne répond pas sur ${API_BASE}.`, 503, "unreachable");
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new ApiError(data.message ?? `Erreur HTTP ${res.status}`, res.status, data.error ?? "http");
  return data as T;
}

/** Session expirée en cours de page : retour à la connexion (F-08). */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function loginUrl(current: URL): string {
  return `/login?retour=${encodeURIComponent(current.pathname + current.search)}`;
}

/** N'accepte qu'un chemin local comme destination après connexion (pas de redirection ouverte). */
export function safeReturn(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/employees";
}
