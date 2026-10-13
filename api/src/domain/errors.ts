// domain/errors.ts — Erreurs métier typées.
// Les adapters traduisent leurs propres erreurs (Odoo, réseau…) vers celles-ci ;
// les routes ne connaissent que ces codes. Plus de détection par le texte du message.

export type DomainErrorCode =
  | "invalid" // entrée mal formée
  | "unauthenticated" // viewer absent ou illisible
  | "forbidden" // droits insuffisants
  | "not_found"
  | "conflict" // état incompatible (ex. double arrivée)
  | "business_rule" // règle métier refusée par le moteur
  | "unavailable"; // moteur injoignable ou réponse inattendue

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: DomainErrorCode,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const HTTP_STATUS: Record<DomainErrorCode, number> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
  unavailable: 502,
};
