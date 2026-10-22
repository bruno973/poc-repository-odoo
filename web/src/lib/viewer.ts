// web/src/lib/viewer.ts — Viewer du PoC, lu UNIQUEMENT côté serveur.
//
// process.env (et non import.meta.env) : lu à l'exécution, donc les variables
// passées au conteneur Docker sont prises en compte. import.meta.env est figé
// au moment du build : avant, VIEWER_ROLE n'avait d'effet que sur [id].astro.
//
// Le navigateur ne choisit jamais son rôle : le proxy /api/* injecte ces valeurs.
// Mode shared seulement : en identité réelle (AUTH_MODE=odoo-session côté API),
// le viewer est constaté par l'API à partir du cookie de session.

import type { ViewerContext, ViewerRole } from "../types/domain.js";

const ROLES: readonly ViewerRole[] = ["employee", "manager", "hr_admin"];

export function getViewer(): ViewerContext {
  const rawRole = process.env["VIEWER_ROLE"] ?? "employee";
  const role: ViewerRole = (ROLES as readonly string[]).includes(rawRole) ? (rawRole as ViewerRole) : "employee";
  const id = Number.parseInt(process.env["VIEWER_ID"] ?? "1", 10) || 1;
  const employeeId = Number.parseInt(process.env["VIEWER_EMPLOYEE_ID"] ?? String(id), 10) || id;
  const departmentId = Number.parseInt(process.env["VIEWER_DEPARTMENT_ID"] ?? "", 10);
  return { id, role, employeeId, ...(Number.isFinite(departmentId) ? { departmentId } : {}) };
}

export function viewerHeaders(viewer: ViewerContext = getViewer()): Record<string, string> {
  return {
    "x-viewer-id": String(viewer.id),
    "x-viewer-role": viewer.role,
    ...(viewer.employeeId !== undefined ? { "x-viewer-employee-id": String(viewer.employeeId) } : {}),
    ...(viewer.departmentId !== undefined ? { "x-viewer-department-id": String(viewer.departmentId) } : {}),
  };
}

export const ROLE_LABEL: Record<ViewerRole, string> = {
  employee: "Employé",
  manager: "Manager",
  hr_admin: "Admin RH",
};

/** Qui regarde la page, quel que soit le mode : constaté (identité réelle) ou déclaré (shared). */
export interface CurrentViewer {
  role: ViewerRole;
  employeeId: number | undefined;
  /** Libellé affiché dans la barre de navigation */
  label: string;
  /** Rôle constaté par l'API (true) ou déclaré par l'environnement (false) */
  observed: boolean;
}

export function currentViewer(locals: App.Locals): CurrentViewer {
  const me = locals.auth.me;
  if (locals.auth.mode !== "shared" && me) {
    return { role: me.role, employeeId: me.employeeId ?? undefined, label: me.displayName, observed: true };
  }
  const viewer = getViewer();
  return { role: viewer.role, employeeId: viewer.employeeId, label: `#${viewer.id}`, observed: false };
}
