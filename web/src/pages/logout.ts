// pages/logout.ts — Déconnexion (F-07) : l'API détruit la session Leila et la
// session Odoo ; le cookie effacé est relayé au navigateur.
import type { APIRoute } from "astro";
import { API_BASE } from "../lib/api.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const headers = new Headers({ Location: "/login" });
  try {
    const res = await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: request.headers.get("cookie") ?? "" },
    });
    for (const c of res.headers.getSetCookie()) headers.append("Set-Cookie", c);
  } catch {
    headers.append("Set-Cookie", "leila_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  }
  return new Response(null, { status: 303, headers });
};
