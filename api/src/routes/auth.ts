// routes/auth.ts — Connexion / déconnexion / identité constatée (modes identité réelle).
//
// POST /api/auth/login   { login, password } → 204 + cookie leila_sid ; 401 générique ; 429
// POST /api/auth/logout  → 204 : session Leila ET session moteur détruites
// GET  /api/auth/me      → identité constatée, sans la poignée moteur
//
// Le mot de passe ne fait que traverser : passé au fournisseur d'identité, jamais
// stocké, jamais journalisé (le logger retire req.body.password par précaution).

import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { SessionStore } from "../app/sessions.js";
import { DomainError } from "../domain/errors.js";
import { type IdentityProvider, LOGIN_REFUSED, publicIdentity } from "../domain/identity.js";
import { SESSION_COOKIE, readCookie } from "./viewer.js";

export interface AuthRouteOptions {
  identity: IdentityProvider;
  sessions: SessionStore;
  /** Secure sur le cookie (désactivable en local http) */
  cookieSecure: boolean;
  /** Tentatives de connexion par minute et par IP */
  loginAttemptsPerMinute: number;
  now?: () => number;
}

const LoginBody = z.object({
  login: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(1024),
});

export function sessionCookie(value: string, options: { secure: boolean; maxAgeSeconds: number }): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds}`,
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.header("Set-Cookie", sessionCookie("", { secure, maxAgeSeconds: 0 }));
}

/** Fenêtre glissante d'une minute, par IP, en mémoire. */
export class LoginLimiter {
  private readonly attempts = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly now: () => number = Date.now,
    private readonly windowMs = 60_000,
  ) {}

  /** Enregistre une tentative ; renvoie le délai d'attente (s) si la limite est dépassée. */
  hit(ip: string): number | null {
    const at = this.now();
    const recent = (this.attempts.get(ip) ?? []).filter((t) => at - t < this.windowMs);
    if (recent.length >= this.max) {
      this.attempts.set(ip, recent);
      return Math.ceil((this.windowMs - (at - (recent[0] ?? at))) / 1000);
    }
    recent.push(at);
    this.attempts.set(ip, recent);
    return null;
  }
}

export function registerAuthRoutes(fastify: FastifyInstance, options: AuthRouteOptions): void {
  const { identity, sessions, cookieSecure } = options;
  const limiter = new LoginLimiter(options.loginAttemptsPerMinute, options.now);
  const maxAgeSeconds = Math.floor(sessions.absoluteMs / 1000);

  fastify.post("/api/auth/login", async (request, reply) => {
    const wait = limiter.hit(request.ip);
    if (wait !== null) {
      return reply
        .code(429)
        .header("Retry-After", String(wait))
        .send({ error: "too_many_requests", message: "Trop de tentatives : réessaie dans une minute." });
    }
    const parsed = LoginBody.safeParse(request.body ?? {});
    if (!parsed.success) throw new DomainError(LOGIN_REFUSED, "unauthenticated");

    // Une session précédente sur ce navigateur est remplacée.
    const previous = readCookie(request, SESSION_COOKIE);
    if (previous) {
      const old = sessions.destroy(previous);
      if (old) await identity.logout(old).catch(() => undefined);
    }

    const principal = await identity.login(parsed.data);
    const sid = sessions.create(principal);
    return reply.code(204).header("Set-Cookie", sessionCookie(sid, { secure: cookieSecure, maxAgeSeconds })).send();
  });

  fastify.post("/api/auth/logout", async (request, reply) => {
    const sid = readCookie(request, SESSION_COOKIE);
    const principal = sid ? sessions.destroy(sid) : null;
    if (principal) await identity.logout(principal).catch(() => undefined);
    clearSessionCookie(reply, cookieSecure);
    return reply.code(204).send();
  });

  fastify.get("/api/auth/me", async (request, reply) => {
    const sid = readCookie(request, SESSION_COOKIE);
    const principal = sid ? sessions.get(sid) : null;
    const alive = principal ? await identity.refresh(principal) : null;
    if (!sid || !alive) {
      if (sid) sessions.destroy(sid);
      clearSessionCookie(reply, cookieSecure);
      throw new DomainError("Non connecté ou session expirée.", "unauthenticated");
    }
    return publicIdentity(alive);
  });
}
