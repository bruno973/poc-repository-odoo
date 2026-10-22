// ui/client.ts — Appels au moteur de présentation (/api/ui/v1), réponses VALIDÉES
// par les schémas du package partagé : une réponse non conforme ou d'une version
// majeure inconnue est refusée plutôt que mal affichée.

import {
  type ActionDescriptor,
  ActionDescriptorSchema,
  isCompatibleVersion,
  type LookupResult,
  LookupResultSchema,
  type Navigation,
  NavigationSchema,
  type QueryRequestInput,
  type QueryResult,
  QueryResultSchema,
  type RecordPayload,
  RecordPayloadSchema,
  type ViewSchema,
  ViewSchemaSchema,
} from "@leila/ui-schema";
import { api, ApiError } from "../app/api-client.js";

const BASE = "/api/ui/v1";
const enc = encodeURIComponent;

interface Validator<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

function validate<T>(schema: Validator<T>, data: unknown): T {
  const version = (data as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === "string" && !isCompatibleVersion(version)) {
    throw new ApiError(`Version de schéma ${version} non prise en charge par ce client.`, 502, "schema_version");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError("Réponse du serveur non conforme au Leila UI Schema.", 502, "schema_invalid");
  return parsed.data;
}

export const ui = {
  navigation: async (signal?: AbortSignal): Promise<Navigation> => validate(NavigationSchema, await api.get(`${BASE}/navigation`, {}, signal)),
  action: async (key: string, signal?: AbortSignal): Promise<ActionDescriptor> => validate(ActionDescriptorSchema, await api.get(`${BASE}/actions/${enc(key)}`, {}, signal)),
  view: async (key: string, signal?: AbortSignal): Promise<ViewSchema> => validate(ViewSchemaSchema, await api.get(`${BASE}/views/${enc(key)}`, {}, signal)),
  query: async (resourceKey: string, request: QueryRequestInput): Promise<QueryResult> =>
    validate(QueryResultSchema, await api.post(`${BASE}/resources/${enc(resourceKey)}/query`, request)),
  read: async (resourceKey: string, id: number, signal?: AbortSignal): Promise<RecordPayload> =>
    validate(RecordPayloadSchema, await api.get(`${BASE}/resources/${enc(resourceKey)}/records/${id}`, {}, signal)),
  write: async (resourceKey: string, id: number, values: Record<string, string | number | boolean | null>): Promise<RecordPayload> =>
    validate(RecordPayloadSchema, await api.patch(`${BASE}/resources/${enc(resourceKey)}/records/${id}`, { values })),
  lookup: async (resourceKey: string, field: string, q: string, recordId: number): Promise<LookupResult> =>
    validate(LookupResultSchema, await api.get(`${BASE}/resources/${enc(resourceKey)}/fields/${enc(field)}/options`, { q, recordId })),
  command: async (commandKey: string, resourceKey: string, recordId: number): Promise<RecordPayload> =>
    validate(RecordPayloadSchema, await api.post(`${BASE}/commands/${enc(commandKey)}`, { resourceKey, recordId })),
};
