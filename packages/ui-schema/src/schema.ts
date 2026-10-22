// schema.ts — Leila UI Schema v1 : description STATIQUE d'une vue (ADR-001).
// Aucune notion de modèle, de domaine ni de session d'un ERP : des clés opaques.

import { z } from "zod";
import { FlagSchema, ConditionSchema } from "./condition.js";
import { SCHEMA_VERSION } from "./version.js";

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export const DiagnosticCodeSchema = z.enum([
  "unsupported_node",
  "unsupported_widget",
  "unsupported_expression",
  "unsupported_field_type",
  "excluded_by_rights",
  "unsupported_action",
  "unsupported_domain",
  "unsupported_command",
  "ignored_text",
]);

export const DiagnosticSchema = z.object({
  code: DiagnosticCodeSchema,
  severity: z.enum(["info", "warning", "blocking"]),
  path: z.string(),
  sourceTag: z.string().optional(),
  message: z.string(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

// ─── Champs ───────────────────────────────────────────────────────────────────

export const FieldTypeSchema = z.enum([
  "text",
  "multiline",
  "integer",
  "decimal",
  "boolean",
  "selection",
  "date",
  "datetime",
  "reference",
  "money",
  "unsupported",
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const FieldDescriptorSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  type: FieldTypeSchema,
  /** Statique, pour CE compte (définition du champ + widget non pris en charge) */
  readonly: z.boolean(),
  required: z.boolean(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  digits: z.tuple([z.number().int(), z.number().int()]).optional(),
  currencyField: z.string().optional(),
  /** reference : sélection d'un enregistrement lié possible (domaine pris en charge, recherche autorisée) */
  relation: z.object({ lookup: z.boolean() }).optional(),
  help: z.string().optional(),
});
export type FieldDescriptor = z.infer<typeof FieldDescriptorSchema>;

// ─── Nœuds ────────────────────────────────────────────────────────────────────

export interface FieldNode {
  kind: "field";
  field: string;
  showLabel: boolean;
  invisible?: z.infer<typeof FlagSchema> | undefined;
  readonly?: z.infer<typeof FlagSchema> | undefined;
  required?: z.infer<typeof FlagSchema> | undefined;
}
export interface ColumnNode {
  kind: "column";
  field: string;
  /** Colonne entière masquée (indépendant de la ligne) */
  columnInvisible?: z.infer<typeof FlagSchema> | undefined;
  /** Cellule masquée selon la ligne */
  invisible?: z.infer<typeof FlagSchema> | undefined;
  /** Colonne optionnelle (affichée par défaut ou non) */
  optional?: "show" | "hide" | undefined;
}
export interface ButtonNode {
  kind: "button";
  label: string;
  /** Absent : bouton non exécutable dans Leila (hors registre de commandes) */
  commandKey?: string | undefined;
  invisible?: z.infer<typeof FlagSchema> | undefined;
  primary: boolean;
}
export interface LabelNode {
  kind: "label";
  text?: string | undefined;
  for?: string | undefined;
}
export interface SeparatorNode {
  kind: "separator";
  label?: string | undefined;
}
export interface UnsupportedNode {
  kind: "unsupported";
  sourceTag: string;
  reason: string;
  label?: string | undefined;
}
export interface FilterNode {
  kind: "filter";
  filterKey: string;
  label: string;
  /** false : filtre non applicable (domaine non pris en charge) — affiché désactivé */
  available: boolean;
  group: number;
}
export interface SearchFieldNode {
  kind: "searchField";
  field: string;
  label: string;
  available: boolean;
}
export interface ContainerNode {
  kind: "sheet" | "header" | "group" | "page";
  label?: string | undefined;
  columns?: number | undefined;
  invisible?: z.infer<typeof FlagSchema> | undefined;
  children: Node[];
}
export interface NotebookNode {
  kind: "notebook";
  pages: ContainerNode[];
}

export type Node =
  | FieldNode
  | ColumnNode
  | ButtonNode
  | LabelNode
  | SeparatorNode
  | UnsupportedNode
  | FilterNode
  | SearchFieldNode
  | ContainerNode
  | NotebookNode;

const opt = <T extends z.ZodTypeAny>(s: T) => s.optional();

export const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("field"), field: z.string().min(1), showLabel: z.boolean(), invisible: opt(FlagSchema), readonly: opt(FlagSchema), required: opt(FlagSchema) }),
    z.object({ kind: z.literal("column"), field: z.string().min(1), columnInvisible: opt(FlagSchema), invisible: opt(FlagSchema), optional: opt(z.enum(["show", "hide"])) }),
    z.object({ kind: z.literal("button"), label: z.string(), commandKey: opt(z.string()), invisible: opt(FlagSchema), primary: z.boolean() }),
    z.object({ kind: z.literal("label"), text: opt(z.string()), for: opt(z.string()) }),
    z.object({ kind: z.literal("separator"), label: opt(z.string()) }),
    z.object({ kind: z.literal("unsupported"), sourceTag: z.string(), reason: z.string(), label: opt(z.string()) }),
    z.object({ kind: z.literal("filter"), filterKey: z.string(), label: z.string(), available: z.boolean(), group: z.number().int() }),
    z.object({ kind: z.literal("searchField"), field: z.string(), label: z.string(), available: z.boolean() }),
    ContainerSchema,
    z.object({ kind: z.literal("notebook"), pages: z.array(ContainerSchema) }),
  ]),
) as z.ZodType<Node>;

const ContainerSchema: z.ZodType<ContainerNode> = z.lazy(() =>
  z.object({
    kind: z.enum(["sheet", "header", "group", "page"]),
    label: opt(z.string()),
    columns: opt(z.number().int().min(1).max(4)),
    invisible: opt(FlagSchema),
    children: z.array(NodeSchema),
  }),
) as z.ZodType<ContainerNode>;

// ─── Vue ──────────────────────────────────────────────────────────────────────

export const DecorationStyleSchema = z.enum(["success", "info", "warning", "danger", "muted", "bold", "italic"]);
export type DecorationStyle = z.infer<typeof DecorationStyleSchema>;

export const ViewTypeSchema = z.enum(["list", "form", "search"]);
export type ViewType = z.infer<typeof ViewTypeSchema>;

export const ViewSchemaSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  viewKey: z.string().min(1),
  viewType: ViewTypeSchema,
  title: z.string(),
  resourceKey: z.string().min(1),
  resourceKind: z.enum(["portable", "compatibility"]),
  capabilities: z.object({ canCreate: z.boolean(), canEdit: z.boolean(), canDelete: z.boolean() }),
  fields: z.record(z.string(), FieldDescriptorSchema),
  root: z.array(NodeSchema),
  /** Liste : style d'une ligne selon une condition (décorations) */
  decorations: z.array(z.object({ style: DecorationStyleSchema, when: ConditionSchema })).optional(),
  diagnostics: z.array(DiagnosticSchema),
});
export type ViewSchema = z.infer<typeof ViewSchemaSchema>;
