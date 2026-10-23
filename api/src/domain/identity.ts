// domain/identity.ts — Identité de l'utilisateur. Aucun terme Odoo.
//
// Le fournisseur d'identité (session Odoo aujourd'hui, Keycloak demain) constate
// QUI appelle ; il ne décide d'aucun droit. Les ports reçoivent le viewer, qui
// porte une poignée opaque vers la session moteur de l'utilisateur.

import type { Ref, ViewerContext } from "./tree.js";

export interface Credentials {
  login: string;
  password: string;
}

export interface Principal {
  /** userId, role (présentation), employeeId, companyId */
  viewer: ViewerContext;
  displayName: string;
  company: Ref | null;
  /** Poignée opaque vers la session moteur ; jamais exposée au client. */
  backendHandle: string;
}

export interface IdentityProvider {
  /** Identifiants refusés → DomainError("unauthenticated"), message générique. */
  login(credentials: Credentials): Promise<Principal>;
  logout(principal: Principal): Promise<void>;
  /** Vérifie que la session moteur est toujours valide ; null si expirée. */
  refresh(principal: Principal): Promise<Principal | null>;
}

/** Ce que le client peut voir du principal (jamais la poignée). */
export interface PublicIdentity {
  userId: number;
  employeeId: number | null;
  role: ViewerContext["role"];
  /** Compte d'accès externe : seuls les écrans dédiés (accueil, mes présences) lui sont proposés */
  portal: boolean;
  displayName: string;
  company: Ref | null;
}

export function publicIdentity(principal: Principal): PublicIdentity {
  return {
    userId: principal.viewer.id,
    employeeId: principal.viewer.employeeId ?? null,
    role: principal.viewer.role,
    portal: principal.viewer.portal === true,
    displayName: principal.displayName,
    company: principal.company,
  };
}

/** Message unique pour tout refus de connexion : n'indique jamais lequel des deux champs est faux. */
export const LOGIN_REFUSED = "Identifiant ou mot de passe incorrect.";
