// adapters/fake/FakeJwtIdentity.ts — Deuxième fournisseur d'identité, pour les tests
// (critère S-4) et la démo sur l'adapter mock (AUTH_MODE=fake-jwt).
//
// Simule ce que fera Keycloak : un émetteur délivre un JWT signé (HS256) contre
// des identifiants ; Leila VÉRIFIE ce jeton (signature, audience, expiration) et
// en déduit le viewer avec la même table groupes → rôle que l'adapter Odoo.
// S'il passe le même contrat d'identité qu'OdooSessionIdentity, la jointure est
// prête pour un adaptateur Keycloak.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type RoleRule, resolveRole } from "../../app/roles.js";
import { DomainError } from "../../domain/errors.js";
import { type Credentials, type IdentityProvider, LOGIN_REFUSED, type Principal } from "../../domain/identity.js";
import type { Ref, ViewerContext } from "../../domain/tree.js";

export interface FakeUser {
  login: string;
  password: string;
  sub: number;
  name: string;
  groups: string[];
  employeeId?: number;
  departmentId?: number;
  company?: Ref;
}

interface Claims {
  iss: string;
  aud: string;
  sub: string;
  name: string;
  groups: string[];
  employee_id?: number;
  department_id?: number;
  company?: Ref;
  iat: number;
  exp: number;
}

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** Faux serveur d'autorisation : délivre des jetons signés (rôle de Keycloak). */
export class FakeJwtIssuer {
  constructor(
    private readonly secret: string,
    private readonly users: readonly FakeUser[],
    readonly audience = "leila",
    private readonly ttlSeconds = 3600,
    private readonly now: () => number = Date.now,
  ) {}

  issue(login: string, password: string): string | null {
    const user = this.users.find((u) => u.login === login);
    const expected = Buffer.from(user?.password ?? "\0");
    const given = Buffer.from(password);
    if (!user || expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const iat = Math.floor(this.now() / 1000);
    const claims: Claims = {
      iss: "fake-idp",
      aud: this.audience,
      sub: String(user.sub),
      name: user.name,
      groups: user.groups,
      ...(user.employeeId !== undefined ? { employee_id: user.employeeId } : {}),
      ...(user.departmentId !== undefined ? { department_id: user.departmentId } : {}),
      ...(user.company ? { company: user.company } : {}),
      iat,
      exp: iat + this.ttlSeconds,
    };
    const head = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify(claims))}`;
    return `${head}.${createHmac("sha256", this.secret).update(head).digest("base64url")}`;
  }
}

export class FakeJwtIdentity implements IdentityProvider {
  private readonly tokens = new Map<string, string>();

  constructor(
    private readonly issuer: FakeJwtIssuer,
    private readonly secret: string,
    private readonly roleRules: readonly RoleRule[],
    private readonly now: () => number = Date.now,
  ) {}

  async login(credentials: Credentials): Promise<Principal> {
    const token = this.issuer.issue(credentials.login, credentials.password);
    const claims = token ? this.verify(token) : null;
    if (!token || !claims) throw new DomainError(LOGIN_REFUSED, "unauthenticated");
    const handle = randomBytes(32).toString("base64url");
    this.tokens.set(handle, token);
    return this.principal(claims, handle);
  }

  async logout(principal: Principal): Promise<void> {
    this.tokens.delete(principal.backendHandle);
  }

  async refresh(principal: Principal): Promise<Principal | null> {
    const token = this.tokens.get(principal.backendHandle);
    const claims = token ? this.verify(token) : null;
    if (!claims) {
      this.tokens.delete(principal.backendHandle);
      return null;
    }
    return this.principal(claims, principal.backendHandle);
  }

  /** Vérifie signature, audience et expiration ; null si le jeton n'est pas valable. */
  private verify(token: string): Claims | null {
    const [head, body, signature] = token.split(".");
    if (!head || !body || !signature) return null;
    const expected = Buffer.from(createHmac("sha256", this.secret).update(`${head}.${body}`).digest("base64url"));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as Claims;
    if (claims.aud !== this.issuer.audience || claims.exp * 1000 <= this.now()) return null;
    return claims;
  }

  private async principal(claims: Claims, handle: string): Promise<Principal> {
    const role = await resolveRole(this.roleRules, (g) => claims.groups.includes(g));
    const viewer: ViewerContext = {
      id: Number(claims.sub),
      role,
      ...(claims.employee_id !== undefined ? { employeeId: claims.employee_id } : {}),
      ...(claims.department_id !== undefined ? { departmentId: claims.department_id } : {}),
      ...(claims.company ? { companyId: claims.company.id } : {}),
    };
    return { viewer, displayName: claims.name, company: claims.company ?? null, backendHandle: handle };
  }
}
