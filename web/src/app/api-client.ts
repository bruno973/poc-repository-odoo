// app/api-client.ts — Seul point de contact HTTP du front avec l'API Leila.
//
// Même origine (/api relayé par Vite en dev, par le reverse proxy en prod) :
// le cookie de session leila_sid part tout seul, le front ne le lit jamais.
// Toute requête mutante porte l'en-tête anti-CSRF exigé par l'API.
// Un 401 signale une session absente ou expirée : la session React réagit.

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

const UNAUTHENTICATED = "leila:unauthenticated";

/** La session React s'abonne ici pour renvoyer vers /login (F-08). */
export function onUnauthenticated(listener: () => void): () => void {
  window.addEventListener(UNAUTHENTICATED, listener);
  return () => window.removeEventListener(UNAUTHENTICATED, listener);
}

export function withQuery(path: string, query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(method !== "GET" ? { "X-Leila-Csrf": "1" } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError("L'API ne répond pas.", 503, "unreachable");
  }
  window.dispatchEvent(new Event("leila:api-call"));
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHENTICATED));
  if (!res.ok) throw new ApiError(data.message ?? `Erreur HTTP ${res.status}`, res.status, data.error ?? "http");
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>("GET", withQuery(path, query), undefined, signal),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
};

/** N'accepte qu'un chemin local comme destination après connexion (pas de redirection ouverte). */
export function safeReturn(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/accueil";
  return raw;
}
