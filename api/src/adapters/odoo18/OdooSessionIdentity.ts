// adapters/odoo18/OdooSessionIdentity.ts — Connexion à Leila avec les identifiants Odoo.
//
// Remplaçant temporaire de Keycloak : le viewer n'est plus déclaré, il est
// CONSTATÉ dans Odoo (uid, employé lié, groupes). Le mot de passe sert à un seul
// appel (/web/session/authenticate) puis est oublié.

import type { BackendRecorder } from "../../app/trace.js";
import { type RoleRule, resolveRole } from "../../app/roles.js";
import { DomainError } from "../../domain/errors.js";
import type { Credentials, IdentityProvider, Principal } from "../../domain/identity.js";
import type { ViewerContext } from "../../domain/tree.js";
import { hasGroup } from "./capabilities.js";
import { m2o, type OdooM2O } from "./mapping.js";
import { type OdooConnection, SessionTransport, UserSessions } from "./transport.js";

/** Compte portail Odoo (« Utilisateur interne » absent) : pas d'accès au back-office. */
export const PORTAL_REFUSED = "Compte portail Odoo : la connexion à Leila n'est pas encore ouverte à ce type de compte.";

/** Proposition du cahier de dev (§ 6.4), à vérifier sur la base (Q-02). */
export const DEFAULT_ROLE_GROUPS =
  "hr_admin=hr.group_hr_manager;manager=hr_attendance.group_hr_attendance_officer,hr.group_hr_user";

export class OdooSessionIdentity implements IdentityProvider {
  constructor(
    private readonly conn: OdooConnection,
    private readonly sessions: UserSessions,
    private readonly roleRules: readonly RoleRule[],
    private readonly recorder?: BackendRecorder,
  ) {}

  async login(credentials: Credentials): Promise<Principal> {
    const transport = await SessionTransport.authenticate(this.conn, credentials.login, credentials.password, this.recorder);
    try {
      const uid = transport.uid;
      // Un compte portail ne peut ni lire hr.employee.public ni charger les menus :
      // message explicite plutôt qu'une erreur de droits brute (constaté sur amg).
      if (!(await hasGroup(transport, "base.group_user"))) throw new DomainError(PORTAL_REFUSED, "forbidden");
      const [users, employees, role] = await Promise.all([
        transport.callKw<{ id: number; name: string; company_id: OdooM2O }[]>({
          model: "res.users",
          method: "read",
          args: [[uid], ["name", "company_id"]],
          kwargs: {},
        }),
        // hr.employee.public : lisible par tout utilisateur interne, mêmes ids que hr.employee.
        transport.callKw<{ id: number; department_id: OdooM2O; company_id: OdooM2O }[]>({
          model: "hr.employee.public",
          method: "search_read",
          args: [[["user_id", "=", uid]]],
          kwargs: { fields: ["id", "department_id", "company_id"], limit: 1 },
        }),
        resolveRole(this.roleRules, (group) => hasGroup(transport, group)),
      ]);
      const user = users[0];
      if (!user) throw new DomainError("Utilisateur Odoo illisible après connexion.", "unavailable");
      const employee = employees[0];
      const company = m2o(user.company_id);
      const department = employee ? m2o(employee.department_id) : null;
      const viewer: ViewerContext = {
        id: uid,
        role,
        ...(employee ? { employeeId: employee.id } : {}),
        ...(department ? { departmentId: department.id } : {}),
        ...(company ? { companyId: company.id } : {}),
      };
      return { viewer, displayName: user.name, company, backendHandle: this.sessions.register(transport) };
    } catch (error) {
      await transport.destroy().catch(() => undefined);
      throw error;
    }
  }

  async logout(principal: Principal): Promise<void> {
    const transport = this.sessions.remove(principal.backendHandle);
    await transport?.destroy().catch(() => undefined);
  }

  async refresh(principal: Principal): Promise<Principal | null> {
    const transport = this.sessions.get(principal.backendHandle);
    if (!transport) return null;
    if (await transport.isAlive()) return principal;
    this.sessions.remove(principal.backendHandle);
    return null;
  }
}
