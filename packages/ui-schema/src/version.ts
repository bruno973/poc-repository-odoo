// version.ts — Version du Leila UI Schema.
// Majeure : rupture (le client refuse). Mineure : ajout compatible.

// 1.1 : étiquettes (references), lignes liées (lines), images, étapes, regroupement
export const SCHEMA_VERSION = "1.1" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

/** Un client écrit pour SCHEMA_VERSION peut-il lire cette réponse ? */
export function isCompatibleVersion(version: string): boolean {
  const [major] = version.split(".");
  return major === SCHEMA_VERSION.split(".")[0];
}
