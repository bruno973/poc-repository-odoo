// adapters/fake/mockUsers.ts — Utilisateurs de démonstration pour ADAPTER=mock + AUTH_MODE=fake-jwt.
// Mêmes groupes que la table par défaut de l'adapter Odoo : la correspondance
// groupes → rôle est la même, quel que soit le fournisseur d'identité.

import { randomBytes } from "node:crypto";
import { parseRoleGroups } from "../../app/roles.js";
import { FakeJwtIdentity, FakeJwtIssuer, type FakeUser } from "./FakeJwtIdentity.js";

export const MOCK_ROLE_GROUPS =
  "hr_admin=hr.group_hr_manager;manager=hr_attendance.group_hr_attendance_officer,hr.group_hr_user";

const company = { id: 1, label: "Société A" };

export function mockUsers(password: string): FakeUser[] {
  return [
    { login: "abigail", password, sub: 101, name: "Abigail Peterson", employeeId: 1, departmentId: 1, company, groups: ["hr_attendance.group_hr_attendance_officer"] },
    { login: "bruno", password, sub: 102, name: "Bruno Martin", employeeId: 2, departmentId: 1, company, groups: ["hr.group_hr_manager"] },
    { login: "camille", password, sub: 103, name: "Camille Durand", employeeId: 3, departmentId: 2, company, groups: [] },
  ];
}

export function createMockIdentity(env: NodeJS.ProcessEnv): FakeJwtIdentity {
  const secret = randomBytes(32).toString("hex");
  const issuer = new FakeJwtIssuer(secret, mockUsers(env["FAKE_JWT_PASSWORD"] || "demo"));
  return new FakeJwtIdentity(issuer, secret, parseRoleGroups(MOCK_ROLE_GROUPS));
}
