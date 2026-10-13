// routes/viewer.ts — Lecture du viewer depuis les en-têtes HTTP.
//
// PoC UNIQUEMENT : en production, l'identité viendra d'un jeton (Keycloak)
// vérifié, jamais d'en-têtes que n'importe quel client peut forger.
//
// Changement important : avant, un en-tête absent ou invalide donnait le rôle
// hr_admin. Désormais c'est un refus (401) : une API qui ne sait pas qui appelle
// ne doit rien ouvrir. Le front Astro injecte ces en-têtes côté serveur.

import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { DomainError } from "../domain/errors.js";
import type { ViewerContext } from "../domain/tree.js";
import { ViewerRoleSchema } from "../domain/tree.schema.js";

const PositiveInt = z.coerce.number().int().positive();

function header(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

export function extractViewer(request: FastifyRequest): ViewerContext {
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
