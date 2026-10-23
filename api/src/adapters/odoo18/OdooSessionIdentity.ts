// adapters/odoo18/OdooSessionIdentity.ts — Connexion à Leila avec les identifiants Odoo.
//
// Remplaçant temporaire de Keycloak : le viewer n'est plus déclaré, il est
// CONSTATÉ dans Odoo (uid, employé lié, groupes). Le mot de passe sert à un seul
// appel (/web/session/authenticate) puis est oublié.
//
// Comptes portail (Q-10) : acceptés, rôle « employé », marqués portal. Leur fiche est
// retrouvée avec LEURS droits, sans sudo : user_id, puis contact (work_contact_id, le
// lien posé par l'invitation portail de leila_hr), puis l'employé de leurs pointages
// s'il est unique.

import type { BackendRecorder } from "../../app/trace.js";
import { type RoleRule, resolveRole } from "../../app/roles.js";
import { DomainError } from "../../domain/errors.js";
import type { Credentials, IdentityProvider, Principal } from "../../domain/identity.js";
import type { ViewerContext } from "../../domain/tree.js";
import { hasGroup } from "./capabilities.js";
import { m2o, type OdooM2O } from "./mapping.js";
import { type OdooConnection, type OdooTransport, SessionTransport, UserSessions } from "./transport.js";

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
      const internal = await hasGroup(transport, "base.group_user");
      const users = await transport.callKw<{ id: number; name: string; company_id: OdooM2O; partner_id: OdooM2O }[]>({
        model: "res.users",
        method: "read",
        args: [[uid], ["name", "company_id", "partner_id"]],
        kwargs: {},
      });
      const user = users[0];
      if (!user) throw new DomainError("Utilisateur Odoo illisible après connexion.", "unavailable");
      const partner = m2o(user.partner_id);
      const [employee, role] = await Promise.all([
        findEmployee(transport, uid, partner?.id ?? null),
        internal ? resolveRole(this.roleRules, (group) => hasGroup(transport, group)) : Promise.resolve("employee" as const),
      ]);
      const company = m2o(user.company_id);
      const viewer: ViewerContext = {
        id: uid,
        role,
        ...(employee ? { employeeId: employee.id } : {}),
        ...(employee?.departmentId ? { departmentId: employee.departmentId } : {}),
        ...(company ? { companyId: company.id } : {}),
        ...(internal ? {} : { portal: true }),
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

/**
 * Fiche employé de l'utilisateur, lue avec SES droits. Annuaire (hr.employee.public, lisible
 * par les utilisateurs internes) par user_id puis par contact ; à défaut (compte portail),
 * l'employé de ses pointages s'il n'y en a qu'un — plusieurs : ambigu, aucune fiche retenue.
 */
export async function findEmployee(
  transport: OdooTransport,
  uid: number,
  partnerId: number | null,
): Promise<{ id: number; departmentId?: number } | null> {
  const directory = async (domain: unknown[]) => {
    const rows = await transport
      .callKw<{ id: number; department_id: OdooM2O }[]>({ model: "hr.employee.public", method: "search_read", args: [domain], kwargs: { fields: ["id", "department_id"], limit: 1 } })
      .catch(() => []);
    const row = rows[0];
    if (!row) return null;
    const department = m2o(row.department_id);
    return { id: row.id, ...(department ? { departmentId: department.id } : {}) };
  };
  const byUser = await directory([["user_id", "=", uid]]);
  if (byUser) return byUser;
  if (partnerId !== null) {
    const byContact = await directory([["work_contact_id", "=", partnerId]]);
    if (byContact) return byContact;
  }
  const attendances = await transport
    .callKw<{ employee_id: OdooM2O }[]>({ model: "hr.attendance", method: "search_read", args: [[]], kwargs: { fields: ["employee_id"], limit: 50 } })
    .catch(() => []);
  const ids = new Set(attendances.map((a) => m2o(a.employee_id)?.id).filter((id): id is number => id !== undefined));
  return ids.size === 1 ? { id: [...ids][0] as number } : null;
}
