// web/src/lib/api.ts — Appels à l'API Fastify depuis le serveur Astro (SSR).

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

type Query = Record<string, string | number | boolean | undefined | null>;

export function withQuery(path: string, query: Query = {}): string {
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export async function apiGet<T>(path: string, query: Query = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withQuery(path, query), { headers: viewerHeaders() });
  } catch {
    throw new ApiError(`L'API ne répond pas sur ${API_BASE}.`, 503, "unreachable");
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new ApiError(data.message ?? `Erreur HTTP ${res.status}`, res.status, data.error ?? "http");
  return data as T;
}
