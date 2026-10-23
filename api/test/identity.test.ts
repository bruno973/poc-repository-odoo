// test/identity.test.ts — Contrat d'identité sur les deux fournisseurs (critère S-4),
// + rejoué contre une vraie base si ODOO_IDENTITY_LOGIN / _PASSWORD / _ROLE sont définis.

import "dotenv/config";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { FakeJwtIdentity, FakeJwtIssuer } from "../src/adapters/fake/FakeJwtIdentity.js";
import { OdooSessionIdentity, DEFAULT_ROLE_GROUPS } from "../src/adapters/odoo18/OdooSessionIdentity.js";
import { UserSessions } from "../src/adapters/odoo18/transport.js";
import { parseRoleGroups } from "../src/app/roles.js";
import { ViewerRoleSchema } from "../src/domain/tree.schema.js";
import { FakeOdoo } from "./fake-odoo.js";
import { runIdentityContract } from "./identity-contract.js";

const rules = parseRoleGroups(DEFAULT_ROLE_GROUPS);

// 1. Session Odoo, contre le faux serveur
const odoo = new FakeOdoo();
after(() => odoo.stop());
runIdentityContract("OdooSessionIdentity (faux serveur)", async () => {
  await odoo.start();
  return {
    provider: new OdooSessionIdentity({ url: odoo.url, db: "test" }, new UserSessions(), rules),
    valid: { login: "p.manager", password: "manager-pw", role: "manager", employeeId: 5 },
    other: { login: "p.employe", password: "employe-pw", role: "employee" },
    expire: () => odoo.expire(),
  };
});

describe("OdooSessionIdentity : compte portail (Q-10)", () => {
  const portal = new FakeOdoo();
  after(() => portal.stop());
  it("accepté : rôle employé, marqué portail, fiche retrouvée par ses pointages (sans accès à l'annuaire)", async () => {
    await portal.start();
    const provider = new OdooSessionIdentity({ url: portal.url, db: "test" }, new UserSessions(), rules);
    const principal = await provider.login({ login: "p.portail", password: "portail-pw" });
    assert.equal(principal.viewer.portal, true);
    assert.equal(principal.viewer.role, "employee");
    assert.equal(principal.viewer.employeeId, 20);
    // Annuaire refusé au portail, puis repli : aucune erreur de droits ne remonte
    const asked = portal.calls.filter((c) => c.model === "hr.employee.public").map((c) => JSON.stringify(c.args[0]));
    assert.deepEqual(asked, ['[["user_id","=",11]]', '[["work_contact_id","=",111]]']);
  });
  it("un utilisateur interne n'est pas marqué portail", async () => {
    const provider = new OdooSessionIdentity({ url: portal.url, db: "test" }, new UserSessions(), rules);
    const principal = await provider.login({ login: "p.employe", password: "employe-pw" });
    assert.equal(principal.viewer.portal, undefined);
    assert.equal(principal.viewer.employeeId, 6);
  });
});

// 2. JWT signé localement (préfigure Keycloak), même table groupes → rôle
let clock = Date.now();
const secret = "secret-de-test-0123456789abcdef";
const issuer = new FakeJwtIssuer(
  secret,
  [
    { login: "p.manager", password: "manager-pw", sub: 7, name: "Manon", employeeId: 5, groups: ["hr_attendance.group_hr_attendance_officer"] },
    { login: "p.employe", password: "employe-pw", sub: 9, name: "Émile", employeeId: 6, groups: [] },
  ],
  "leila",
  3600,
  () => clock,
);
runIdentityContract("FakeJwtIdentity", async () => ({
  provider: new FakeJwtIdentity(issuer, secret, rules, () => clock),
  valid: { login: "p.manager", password: "manager-pw", role: "manager", employeeId: 5 },
  other: { login: "p.employe", password: "employe-pw", role: "employee" },
  expire: () => {
    clock += 2 * 3600_000;
  },
}));

// 3. Base réelle (amg) : facultatif
const env = process.env;
if (env["ODOO_URL"] && env["ODOO_DB"] && env["ODOO_IDENTITY_LOGIN"] && env["ODOO_IDENTITY_PASSWORD"] && env["ODOO_IDENTITY_OTHER_LOGIN"]) {
  const sessions = new UserSessions();
  const live = new OdooSessionIdentity(
    { url: env["ODOO_URL"], db: env["ODOO_DB"] },
    sessions,
    parseRoleGroups(env["ROLE_GROUPS"] || DEFAULT_ROLE_GROUPS),
  );
  runIdentityContract(`OdooSessionIdentity (${env["ODOO_DB"]})`, async () => ({
    provider: live,
    valid: {
      login: env["ODOO_IDENTITY_LOGIN"] as string,
      password: env["ODOO_IDENTITY_PASSWORD"] as string,
      role: ViewerRoleSchema.parse(env["ODOO_IDENTITY_ROLE"] ?? "employee"),
    },
    other: {
      login: env["ODOO_IDENTITY_OTHER_LOGIN"] as string,
      password: env["ODOO_IDENTITY_OTHER_PASSWORD"] as string,
      role: ViewerRoleSchema.parse(env["ODOO_IDENTITY_OTHER_ROLE"] ?? "employee"),
    },
    // Sur une vraie base, on ferme les sessions Odoo pour simuler leur expiration
    expire: async () => {
      for (const handle of sessions.handles()) {
        await sessions.get(handle)?.destroy();
      }
    },
  }));
}
