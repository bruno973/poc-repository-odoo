// adapters/odoo18/permissions.ts
// Calcule, pour un compte Odoo donné (= un rôle), quels champs hr.employee
// sont lisibles et lesquels sont éditables.
// Odoo est l'unique source de vérité : fields_get omet silencieusement les
// champs non lisibles (confirmé empiriquement — pas d'AccessError sur
// fields_get lui-même, contrairement à read() avec un champ interdit).

import type { OdooClient } from "./client.js";

interface FieldMeta {
  readonly: boolean;
  required: boolean;
  type: string;
}

export interface FieldAccess {
  /** Champs que ce compte peut demander à read()/search_read() sans AccessError. */
  readable: ReadonlySet<string>;
  /** Sous-ensemble de readable où readonly === false — safe pour write(). */
  editable: ReadonlySet<string>;
}

// fields_get décrit le schéma du modèle pour un COMPTE : le résultat ne dépend
// pas de la fiche consultée. On le garde donc en cache par client (= par rôle)
// au lieu de le redemander à chaque ouverture de fiche.
const cache = new WeakMap<OdooClient, Map<string, Promise<FieldAccess>>>();

export function getFieldAccess(
  client: OdooClient,
  candidateFields: readonly string[],
  model = "hr.employee"
): Promise<FieldAccess> {
  let byKey = cache.get(client);
  if (!byKey) {
    byKey = new Map();
    cache.set(client, byKey);
  }
  const key = `${model}:${[...candidateFields].sort().join(",")}`;
  let pending = byKey.get(key);
  if (!pending) {
    pending = loadFieldAccess(client, candidateFields, model);
    byKey.set(key, pending);
    // Un échec (réseau, droits) ne doit pas rester en cache.
    pending.catch(() => byKey?.delete(key));
  }
  return pending;
}

async function loadFieldAccess(
  client: OdooClient,
  candidateFields: readonly string[],
  model: string
): Promise<FieldAccess> {
  const raw = await client.callKw<Record<string, FieldMeta>>({
    model,
    method: "fields_get",
    args: [candidateFields],
    kwargs: { attributes: ["readonly", "required", "type"] },
  });

  const readable = new Set<string>(Object.keys(raw));
  const editable = new Set<string>();
  for (const [field, meta] of Object.entries(raw)) {
    if (meta.readonly === false) editable.add(field);
  }
  return { readable, editable };
}
