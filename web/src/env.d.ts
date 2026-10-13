/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Posé par src/middleware.ts pour chaque requête. */
    auth: {
      /** shared : viewer déclaré par l'environnement ; sinon identité réelle (cookie leila_sid) */
      mode: "shared" | "odoo-session" | "fake-jwt";
      /** Identité constatée par l'API (modes identité réelle) */
      me: import("./types/domain.js").PublicIdentity | null;
    };
  }
}
