// app/roles.ts — Correspondance groupes du fournisseur d'identité → rôle Leila.
//
// Le rôle ne sert qu'à la présentation (squelette, libellés) ; les décisions
// d'accès viennent du moteur. Table configurable (ROLE_GROUPS), évaluée dans
// l'ordre, première correspondance gagnante, `employee` sinon.
// Format : "hr_admin=groupe.a;manager=groupe.b,groupe.c"

import type { ViewerRole } from "../domain/tree.js";
import { ViewerRoleSchema } from "../domain/tree.schema.js";

export interface RoleRule {
  role: ViewerRole;
  groups: string[];
}

export function parseRoleGroups(raw: string): RoleRule[] {
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [role, groups = ""] = part.split("=");
      const parsed = ViewerRoleSchema.safeParse(role?.trim());
      if (!parsed.success) throw new Error(`ROLE_GROUPS : rôle inconnu « ${role} »`);
      return { role: parsed.data, groups: groups.split(",").map((g) => g.trim()).filter(Boolean) };
    });
}

export async function resolveRole(
  rules: readonly RoleRule[],
  hasGroup: (group: string) => boolean | Promise<boolean>,
): Promise<ViewerRole> {
  for (const rule of rules) {
    const matches = await Promise.all(rule.groups.map((g) => hasGroup(g)));
    if (matches.some(Boolean)) return rule.role;
  }
  return "employee";
}
