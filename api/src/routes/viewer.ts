// routes/viewer.ts — Qui appelle ?
//
// Deux sources, selon AUTH_MODE :
//  - shared : en-têtes x-viewer-* injectés par le front (béquille du PoC, un
//    client direct pourrait les forger) ;
//  - odoo-session / fake-jwt : le cookie de session Leila (`leila_sid`), et lui
//    seul. Les en-têtes x-viewer-* sont alors IGNORÉS (scénario S-12).
//
// Viewer absent ou invalide → 401 : une API qui ne sait pas qui appelle n'ouvre rien.

import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { SessionStore } from "../app/sessions.js";
import { DomainError } from "../domain/errors.js";
import type { Principal } from "../domain/identity.js";
import type { ViewerContext } from "../domain/tree.js";
import { ViewerRoleSchema } from "../domain/tree.schema.js";

export type ViewerResolver = (request: FastifyRequest) => ViewerContext;

export const SESSION_COOKIE = "leila_sid";

const PositiveInt = z.coerce.number().int().positive();

function header(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

export function readCookie(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** Mode shared : viewer déclaré par les en-têtes. */
export function headerViewer(request: FastifyRequest): ViewerContext {
  const role = ViewerRoleSchema.safeParse(header(request, "x-viewer-role"));
  const id = PositiveInt.safeParse(header(request, "x-viewer-id"));
  if (!role.success || !id.success) {
    throw new DomainError("Viewer manquant ou invalide (en-têtes x-viewer-id et x-viewer-role).", "unauthenticated");
  }

  const dept = header(request, "x-viewer-department-id");
  const emp = header(request, "x-viewer-employee-id");
  const departmentId = dept === undefined ? undefined : PositiveInt.parse(dept);
  // Simplification PoC conservée : sans x-viewer-employee-id, l'employé du viewer
  // est supposé avoir le même id que le viewer.
  const employeeId = emp === undefined ? id.data : PositiveInt.parse(emp);

  return {
    id: id.data,
    role: role.data,
    employeeId,
    ...(departmentId !== undefined ? { departmentId } : {}),
  };
}

/** Principal de la session Leila portée par le cookie, ou null. */
export function sessionPrincipal(request: FastifyRequest, sessions: SessionStore): Principal | null {
  const sid = readCookie(request, SESSION_COOKIE);
  return sid ? sessions.get(sid) : null;
}

/** Modes identité réelle : viewer constaté, lu dans la session (jamais dans les en-têtes). */
export function sessionViewer(sessions: SessionStore): ViewerResolver {
  return (request) => {
    const principal = sessionPrincipal(request, sessions);
    if (!principal) throw new DomainError("Non connecté ou session expirée.", "unauthenticated");
    return { ...principal.viewer, backendHandle: principal.backendHandle };
  };
}
