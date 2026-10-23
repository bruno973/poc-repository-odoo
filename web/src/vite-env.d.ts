/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL d'Odoo (carte « Paramètres » de l'accueil, administrateurs) ; absente : carte masquée */
  readonly VITE_ODOO_URL?: string;
  /** URL de Leila App (opérations terrain) */
  readonly VITE_LEILA_APP_URL?: string;
}
