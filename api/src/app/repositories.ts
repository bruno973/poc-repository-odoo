// app/repositories.ts — Composition root : le SEUL endroit qui sait quel moteur
// est branché. Le reste de l'API ne voit que les ports du domaine.

import type { AttendanceRepository } from "../domain/AttendanceRepository.js";
import type { EmployeeRepository } from "../domain/EmployeeRepository.js";
import type { SummaryRepository } from "../domain/SummaryRepository.js";
import type { ViewerRole } from "../domain/tree.js";
import { ZodError } from "zod";
import { DomainError } from "../domain/errors.js";
import type { IdentityProvider } from "../domain/identity.js";
import { parseRoleGroups } from "./roles.js";
import { Tracer } from "./trace.js";

/**
 * Une ZodError levée DANS un adapter signifie que le moteur a renvoyé autre chose
 * que le contrat (champ renommé, type changé…) : c'est une dérive, pas une erreur
 * du client. On la convertit pour qu'elle ressorte en 502 et non en 400.
 */
export function driftGuard<T extends object>(portName: string, repo: T): T {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        try {
          return await (value as (...a: unknown[]) => unknown).apply(target, args);
        } catch (error) {
          if (error instanceof ZodError) {
            const where = error.issues.map((i) => i.path.join(".")).slice(0, 3).join(", ");
            throw new DomainError(`Réponse du moteur non conforme au contrat (${portName}.${String(prop)} : ${where}).`, "unavailable");
          }
          throw error;
        }
      };
    },
  });
}

/** Mode d'identité : comptes partagés (en-têtes x-viewer-*) ou session utilisateur. */
export type AuthMode = "shared" | "odoo-session" | "fake-jwt";

export type AuthSetup =
  | { mode: "shared" }
  | { mode: "odoo-session" | "fake-jwt"; identity: IdentityProvider };

export interface Repositories {
  /** Libellé affiché dans l'interface (« Mock », « Odoo, base X »). */
  label: string;
  adapter: "mock" | "odoo";
  auth: AuthSetup;
  employees: EmployeeRepository;
  attendances: AttendanceRepository;
  summary: SummaryRepository;
}

const ROLE_ENV: Record<ViewerRole, { user: string; password: string }> = {
  employee: { user: "ODOO_USER_EMPLOYEE", password: "ODOO_PASSWORD_EMPLOYEE" },
  manager: { user: "ODOO_USER_MANAGER", password: "ODOO_PASSWORD_MANAGER" },
  hr_admin: { user: "ODOO_USER_HR_ADMIN", password: "ODOO_PASSWORD_HR_ADMIN" },
};

export function authModeOf(env: NodeJS.ProcessEnv): AuthMode {
  // Défaut sûr : identité réelle. Le mode shared doit être demandé explicitement.
  const raw = env["AUTH_MODE"] || (env["ADAPTER"] === "odoo" ? "odoo-session" : "fake-jwt");
  if (raw === "shared" || raw === "odoo-session" || raw === "fake-jwt") return raw;
  throw new Error(`AUTH_MODE inconnu : ${raw} (shared | odoo-session | fake-jwt)`);
}

export async function createRepositories(env: NodeJS.ProcessEnv, tracer: Tracer): Promise<Repositories> {
  const adapter = env["ADAPTER"] === "odoo" ? "odoo" : "mock";
  const authMode = authModeOf(env);
  let raw: Repositories;

  if (adapter === "odoo") {
    if (authMode === "fake-jwt") throw new Error("AUTH_MODE=fake-jwt n'existe qu'avec ADAPTER=mock.");
    const { OdooClient } = await import("../adapters/odoo18/client.js");
    const { SharedAccounts, UserSessions } = await import("../adapters/odoo18/transport.js");
    const { OdooSessionIdentity, DEFAULT_ROLE_GROUPS } = await import("../adapters/odoo18/OdooSessionIdentity.js");
    const { OdooEmployeeRepository } = await import("../adapters/odoo18/OdooEmployeeRepository.js");
    const { OdooAttendanceRepository, DEFAULT_APPROVAL_GROUP } = await import(
      "../adapters/odoo18/OdooAttendanceRepository.js"
    );
    const { OdooSummaryRepository } = await import("../adapters/odoo18/OdooSummaryRepository.js");

    const required = [
      "ODOO_URL",
      "ODOO_DB",
      ...(authMode === "shared" ? Object.values(ROLE_ENV).flatMap((r) => [r.user, r.password]) : []),
    ];
    const missing = required.filter((k) => !env[k]);
    if (missing.length > 0) throw new Error(`Variables manquantes : ${missing.join(", ")} (voir api/.env.example)`);

    const base = {
      url: env["ODOO_URL"] as string,
      db: env["ODOO_DB"] as string,
      ...(env["ODOO_LANG"] ? { lang: env["ODOO_LANG"] } : {}),
      ...(env["ODOO_TZ"] ? { tz: env["ODOO_TZ"] } : {}),
    };

    let transports: InstanceType<typeof SharedAccounts> | InstanceType<typeof UserSessions>;
    let auth: AuthSetup;
    if (authMode === "shared") {
      const clientFor = (role: ViewerRole) =>
        new OdooClient(
          { ...base, user: env[ROLE_ENV[role].user] as string, password: env[ROLE_ENV[role].password] as string },
          tracer,
        );
      const clientsByRole = {
        employee: clientFor("employee"),
        manager: clientFor("manager"),
        hr_admin: clientFor("hr_admin"),
      };
      console.log("🔐 Authentification Odoo (3 comptes partagés)…");
      await Promise.all(Object.values(clientsByRole).map((c) => c.authenticate()));
      console.log("✅ Comptes Odoo authentifiés");
      transports = new SharedAccounts(clientsByRole);
      auth = { mode: "shared" };
    } else {
      // Aucun compte partagé : chaque appel part avec la session Odoo de l'utilisateur.
      const sessions = new UserSessions();
      transports = sessions;
      const rules = parseRoleGroups(env["ROLE_GROUPS"] || DEFAULT_ROLE_GROUPS);
      auth = { mode: "odoo-session", identity: new OdooSessionIdentity(base, sessions, rules, tracer) };
    }

    const approvalGroup = env["APPROVAL_GROUP"] === undefined ? DEFAULT_APPROVAL_GROUP : env["APPROVAL_GROUP"] || null;
    raw = {
      label: `Odoo, base ${base.db}${authMode === "odoo-session" ? " · identité réelle" : " · comptes partagés"}`,
      adapter,
      auth,
      employees: new OdooEmployeeRepository(transports),
      attendances: new OdooAttendanceRepository(transports, { approvalGroup }),
      summary: new OdooSummaryRepository(transports),
    };
  } else {
    if (authMode === "odoo-session") throw new Error("AUTH_MODE=odoo-session exige ADAPTER=odoo.");
    const { MockEmployeeRepository, MockTimeStore, MockAttendanceRepository, MockSummaryRepository } = await import(
      "../adapters/mock/index.js"
    );
    const store = new MockTimeStore();
    let auth: AuthSetup = { mode: "shared" };
    if (authMode === "fake-jwt") {
      const { createMockIdentity } = await import("../adapters/fake/mockUsers.js");
      auth = { mode: "fake-jwt", identity: createMockIdentity(env) };
    }
    raw = {
      label: `Mock (données en mémoire)${authMode === "fake-jwt" ? " · faux JWT" : ""}`,
      adapter,
      auth,
      employees: new MockEmployeeRepository(),
      attendances: new MockAttendanceRepository(store),
      summary: new MockSummaryRepository(store),
    };
  }

  return {
    ...raw,
    employees: tracer.wrap("EmployeeRepository", driftGuard("EmployeeRepository", raw.employees)),
    attendances: tracer.wrap("AttendanceRepository", driftGuard("AttendanceRepository", raw.attendances)),
    summary: tracer.wrap("SummaryRepository", driftGuard("SummaryRepository", raw.summary)),
  };
}
