// payload.ts — État DYNAMIQUE : enregistrements, requêtes, écritures, navigation.
// Jamais mis en cache partagé entre utilisateurs ni enregistrements.

import { z } from "zod";
import { DiagnosticSchema, ViewTypeSchema } from "./schema.js";
import { SCHEMA_VERSION } from "./version.js";

export const ReferenceValueSchema = z.object({ id: z.number().int(), label: z.string() });

/**
 * Valeur d'un champ : date "AAAA-MM-JJ", datetime ISO UTC, référence { id, label },
 * liste d'ids (relation multiple, lecture seule), vide → null.
 */
export const FieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  ReferenceValueSchema,
  z.array(z.number().int()),
]);
export type FieldValue = z.infer<typeof FieldValueSchema>;

export const RecordPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  resourceKey: z.string(),
  id: z.number().int().positive(),
  values: z.record(z.string(), FieldValueSchema),
  access: z.object({
    /** Droits effectifs sur CET enregistrement */
    canEdit: z.boolean(),
    /** Restrictions serveur en plus des conditions de vue (ex. pas d'auto-modification) */
    readonlyFields: z.array(z.string()),
  }),
  commands: z.record(z.string(), z.object({ available: z.boolean() })),
});
export type RecordPayload = z.infer<typeof RecordPayloadSchema>;

export const QueryRequestSchema = z.object({
  /** Clés de filtres du schéma de recherche (jamais de domaine libre) */
  filters: z.array(z.string()).max(20).default([]),
  /** Recherche texte sur des champs déclarés dans le schéma de recherche */
  search: z.array(z.object({ field: z.string(), value: z.string().max(200) })).max(10).default([]),
  order: z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }).optional(),
  limit: z.number().int().min(1).max(200).default(80),
  offset: z.number().int().min(0).default(0),
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;
export type QueryRequestInput = z.input<typeof QueryRequestSchema>;

export const QueryResultSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  records: z.array(z.object({ id: z.number().int().positive(), values: z.record(z.string(), FieldValueSchema) })),
  total: z.number().int().nonnegative(),
});
export type QueryResult = z.infer<typeof QueryResultSchema>;

/** Écriture : référence = id ou null. */
export const WriteValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const WritePatchSchema = z.object({ values: z.record(z.string(), WriteValueSchema) });
export type WritePatch = z.infer<typeof WritePatchSchema>;

export const LookupResultSchema = z.object({ options: z.array(z.object({ id: z.number().int(), label: z.string() })) });
export type LookupResult = z.infer<typeof LookupResultSchema>;

export interface MenuNode {
  key: string;
  label: string;
  actionKey?: string | undefined;
  available: boolean;
  children: MenuNode[];
}
export const MenuNodeSchema: z.ZodType<MenuNode> = z.lazy(() =>
  z.object({
    key: z.string(),
    label: z.string(),
    actionKey: z.string().optional(),
    available: z.boolean(),
    children: z.array(MenuNodeSchema),
  }),
) as z.ZodType<MenuNode>;

export const NavigationSchema = z.object({ schemaVersion: z.literal(SCHEMA_VERSION), menus: z.array(MenuNodeSchema) });
export type Navigation = z.infer<typeof NavigationSchema>;

export const ActionDescriptorSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  actionKey: z.string(),
  title: z.string(),
  resourceKey: z.string(),
  available: z.boolean(),
  views: z.object({ list: z.string().optional(), form: z.string().optional(), search: z.string().optional() }),
  defaultView: ViewTypeSchema,
  /** Filtres actifs à l'ouverture (clés du schéma de recherche) */
  defaultFilters: z.array(z.string()).optional(),
  diagnostics: z.array(DiagnosticSchema),
});
export type ActionDescriptor = z.infer<typeof ActionDescriptorSchema>;

export const CommandRequestSchema = z.object({ resourceKey: z.string(), recordId: z.number().int().positive() });
export type CommandRequest = z.infer<typeof CommandRequestSchema>;
