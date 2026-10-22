// web/src/middleware.ts — Mode d'identité et utilisateur courant, pour chaque requête.
//
// Le mode vient de l'API (/api/meta, gardé 30 s). En identité réelle, chaque page
// demande /api/auth/me avec le cookie du navigateur : pas de session (ou session
// Odoo expirée) → redirection vers /login?retour=… (F-08), sans message technique.

import { defineMiddleware } from "astro:middleware";
import { API_BASE, loginUrl } from "./lib/api.js";
import type { PublicIdentity } from "./types/domain.js";

type Mode = App.Locals["auth"]["mode"];
let cached: { mode: Mode; at: number } | null = null;

async function authMode(): Promise<Mode> {
  if (cached && Date.now() - cached.at < 30_000) return cached.mode;
  try {
    const res = await fetch(`${API_BASE}/api/meta`);
    const meta = (await res.json()) as { authMode?: Mode };
    cached = { mode: meta.authMode ?? "shared", at: Date.now() };
    return cached.mode;
  } catch {
    // API injoignable : les pages afficheront leur propre erreur
    return "shared";
  }
}

const PUBLIC = [/^\/login$/, /^\/logout$/, /^\/api\//, /^\/_astro\//, /^\/favicon/];

export const onRequest = defineMiddleware(async (context, next) => {
  const mode = await authMode();
  context.locals.auth = { mode, me: null };
  if (mode === "shared" || PUBLIC.some((p) => p.test(context.url.pathname))) return next();

  const cookie = context.request.headers.get("cookie");
  if (!cookie?.includes("leila_sid=")) return context.redirect(loginUrl(context.url));
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { headers: { cookie } });
    if (res.status === 401) return context.redirect(loginUrl(context.url));
    if (res.ok) context.locals.auth.me = (await res.json()) as PublicIdentity;
  } catch {
    /* API injoignable : la page l'affichera */
  }
  return next();
});
