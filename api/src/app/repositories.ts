// app/repositories.ts — Composition root : le SEUL endroit qui sait quel moteur
// est branché. Le reste de l'API ne voit que les ports du domaine.

import type { AttendanceRepository } from "../domain/AttendanceRepository.js";
import type { EmployeeRepository } from "../domain/EmployeeRepository.js";
import type { SummaryRepository } from "../domain/SummaryRepository.js";
import type { ViewerRole } from "../domain/tree.js";
import { ZodError } from "zod";
import { DomainError } from "../domain/errors.js";
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

export interface Repositories {
  /** Libellé affiché dans l'interface (« Mock », « Odoo, base X »). */
  label: string;
  adapter: "mock" | "odoo";
  employees: EmployeeRepository;
  attendances: AttendanceRepository;
  summary: SummaryRepository;
}

const ROLE_ENV: Record<ViewerRole, { user: string; password: string }> = {
  employee: { user: "ODOO_USER_EMPLOYEE", password: "ODOO_PASSWORD_EMPLOYEE" },
  manager: { user: "ODOO_USER_MANAGER", password: "ODOO_PASSWORD_MANAGER" },
  hr_admin: { user: "ODOO_USER_HR_ADMIN", password: "ODOO_PASSWORD_HR_ADMIN" },
};

export async function createRepositories(env: NodeJS.ProcessEnv, tracer: Tracer): Promise<Repositories> {
  const adapter = env["ADAPTER"] === "odoo" ? "odoo" : "mock";
  let raw: Omit<Repositories, "employees" | "attendances" | "summary"> &
    Pick<Repositories, "employees" | "attendances" | "summary">;

  if (adapter === "odoo") {
    const { OdooClient } = await import("../adapters/odoo18/client.js");
    const { OdooEmployeeRepository } = await import("../adapters/odoo18/OdooEmployeeRepository.js");
    const { OdooAttendanceRepository } = await import("../adapters/odoo18/OdooAttendanceRepository.js");
    const { OdooSummaryRepository } = await import("../adapters/odoo18/OdooSummaryRepository.js");

    const required = ["ODOO_URL", "ODOO_DB", ...Object.values(ROLE_ENV).flatMap((r) => [r.user, r.password])];
    const missing = required.filter((k) => !env[k]);
    if (missing.length > 0) throw new Error(`Variables manquantes : ${missing.join(", ")} (voir api/.env.example)`);

    const base = {
      url: env["ODOO_URL"] as string,
      db: env["ODOO_DB"] as string,
      ...(env["ODOO_LANG"] ? { lang: env["ODOO_LANG"] } : {}),
      ...(env["ODOO_TZ"] ? { tz: env["ODOO_TZ"] } : {}),
    };
    const clientFor = (role: ViewerRole) =>
      new OdooClient(
        { ...base, user: env[ROLE_ENV[role].user] as string, password: env[ROLE_ENV[role].password] as string },
        tracer,
      );
    const clientsByRole: Record<ViewerRole, InstanceType<typeof OdooClient>> = {
      employee: clientFor("employee"),
      manager: clientFor("manager"),
      hr_admin: clientFor("hr_admin"),
    };
    console.log("🔐 Authentification Odoo (3 comptes)…");
    await Promise.all(Object.values(clientsByRole).map((c) => c.authenticate()));
    console.log("✅ Comptes Odoo authentifiés");

    raw = {
      label: `Odoo, base ${base.db}`,
      adapter,
      employees: new OdooEmployeeRepository(clientsByRole),
      attendances: new OdooAttendanceRepository(clientsByRole),
      summary: new OdooSummaryRepository(clientsByRole),
    };
  } else {
    const { MockEmployeeRepository, MockTimeStore, MockAttendanceRepository, MockSummaryRepository } = await import(
      "../adapters/mock/index.js"
    );
    const store = new MockTimeStore();
    raw = {
      label: "Mock (données en mémoire)",
      adapter,
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
