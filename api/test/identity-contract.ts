// test/identity-contract.ts — Contrat commun à TOUT fournisseur d'identité.
// OdooSessionIdentity (session Odoo) et FakeJwtIdentity (JWT signé, préfigure
// Keycloak) passent le même jeu : c'est la preuve de la jointure (critère S-4).

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { DomainError } from "../src/domain/errors.js";
import { type IdentityProvider, LOGIN_REFUSED, publicIdentity } from "../src/domain/identity.js";
import type { ViewerRole } from "../src/domain/tree.js";

export interface IdentityFixture {
  provider: IdentityProvider;
  valid: { login: string; password: string; role: ViewerRole; employeeId?: number };
  /** Un second utilisateur, d'un autre rôle */
  other: { login: string; password: string; role: ViewerRole };
  /** Fait expirer la session moteur ou le jeton de tous les utilisateurs */
  expire(): void | Promise<void>;
  /** Budget de temps pour une connexion (NFR : < 1,5 s) */
  loginBudgetMs?: number;
}

const refused = (e: unknown) => e instanceof DomainError && e.code === "unauthenticated" && e.message === LOGIN_REFUSED;

export function runIdentityContract(name: string, make: () => Promise<IdentityFixture>): void {
  describe(`Contrat d'identité : ${name}`, () => {
    let fx: IdentityFixture;
    before(async () => {
      fx = await make();
    });

    it("constate le viewer à la connexion (uid, rôle, employé)", async () => {
      const started = performance.now();
      const principal = await fx.provider.login(fx.valid);
      const ms = performance.now() - started;
      assert.ok(ms < (fx.loginBudgetMs ?? 1500), `connexion en ${Math.round(ms)} ms`);
      assert.ok(principal.viewer.id > 0);
      assert.equal(principal.viewer.role, fx.valid.role);
      if (fx.valid.employeeId !== undefined) assert.equal(principal.viewer.employeeId, fx.valid.employeeId);
      assert.ok(principal.displayName.length > 0);
      assert.ok(principal.backendHandle.length >= 32, "poignée trop courte");
      await fx.provider.logout(principal);
    });

    it("distingue deux utilisateurs", async () => {
      const a = await fx.provider.login(fx.valid);
      const b = await fx.provider.login(fx.other);
      assert.notEqual(a.viewer.id, b.viewer.id);
      assert.notEqual(a.backendHandle, b.backendHandle);
      assert.equal(b.viewer.role, fx.other.role);
      await Promise.all([fx.provider.logout(a), fx.provider.logout(b)]);
    });

    it("refuse mauvais mot de passe et login inconnu avec le même message", async () => {
      await assert.rejects(fx.provider.login({ login: fx.valid.login, password: `${fx.valid.password}x` }), refused);
      await assert.rejects(fx.provider.login({ login: `${fx.valid.login}-inconnu`, password: fx.valid.password }), refused);
    });

    it("n'expose jamais la poignée ni le mot de passe dans l'identité publique", async () => {
      const principal = await fx.provider.login(fx.valid);
      const json = JSON.stringify(publicIdentity(principal));
      assert.ok(!json.includes(principal.backendHandle));
      assert.ok(!json.includes(fx.valid.password));
      assert.ok(!JSON.stringify(principal).includes(fx.valid.password), "mot de passe gardé dans le principal");
      await fx.provider.logout(principal);
    });

    it("refresh confirme une session valide, et plus rien après logout", async () => {
      const principal = await fx.provider.login(fx.valid);
      assert.equal((await fx.provider.refresh(principal))?.viewer.id, principal.viewer.id);
      await fx.provider.logout(principal);
      assert.equal(await fx.provider.refresh(principal), null);
    });

    it("refresh renvoie null quand la session moteur a expiré", async () => {
      const principal = await fx.provider.login(fx.valid);
      await fx.expire();
      assert.equal(await fx.provider.refresh(principal), null);
    });
  });
}
