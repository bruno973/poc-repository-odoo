// domain/tree.schema.ts — Schémas Zod correspondant aux types de tree.ts
// Parsés en sortie de chaque adapter — jamais de cast "as"

import { z } from "zod";
import type { OrgChartNode, DepartmentNode, FormNode, GroupNode } from "./tree.js";

// ─── Primitives ────────────────────────────────────────────────────────────────

export const RefSchema = z.object({
  id: z.number().int().positive(),
  label: z.string(),
});

export const ViewerRoleSchema = z.enum(["employee", "manager", "hr_admin"]);

export const ViewerContextSchema = z.object({
  id: z.number().int().positive(),
  role: ViewerRoleSchema,
  departmentId: z.number().int().positive().optional(),
  employeeId: z.number().int().positive().optional(),
  companyId: z.number().int().positive().optional(),
});

// ─── Règles de visibilité ──────────────────────────────────────────────────────

export const VisibleAlwaysSchema = z.object({ kind: z.literal("always") });
export const VisibleSelfSchema = z.object({ kind: z.literal("self") });
export const VisibleRoleSchema = z.object({
  kind: z.literal("role"),
  roles: z.array(ViewerRoleSchema),
});
export const VisibleFieldSchema = z.object({
  kind: z.literal("field"),
  field: z.string(),
  operator: z.enum(["eq", "neq", "gt", "lt", "truthy"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export type VisibleIfSchema = z.infer<typeof VisibleIfSchemaLazy>;
const VisibleIfSchemaLazy: z.ZodType<
  | z.infer<typeof VisibleAlwaysSchema>
  | z.infer<typeof VisibleSelfSchema>
  | z.infer<typeof VisibleRoleSchema>
  | z.infer<typeof VisibleFieldSchema>
  | { kind: "or"; conditions: VisibleIfSchema[] }
  | { kind: "and"; conditions: VisibleIfSchema[] }
> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    VisibleAlwaysSchema,
    VisibleSelfSchema,
    VisibleRoleSchema,
    VisibleFieldSchema,
    z.object({
      kind: z.literal("or"),
      conditions: z.array(VisibleIfSchemaLazy),
    }),
    z.object({
      kind: z.literal("and"),
      conditions: z.array(VisibleIfSchemaLazy),
    }),
  ])
);

export const VisibleIfSchema = VisibleIfSchemaLazy;

// ─── Nœuds de l'arbre de formulaire ───────────────────────────────────────────
// Récursif (GroupNode contient des FormNode) → z.lazy obligatoire.

export const TextFieldSchema = z.object({
  kind: z.literal("text"),
  key: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number()]).nullable(),
  visibleIf: VisibleIfSchema,
  editableIf: VisibleIfSchema.optional(),
  editable: z.boolean(),
});

export const SelectFieldSchema = z.object({
  kind: z.literal("select"),
  key: z.string(),
  label: z.string(),
  value: z.string().nullable(),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  visibleIf: VisibleIfSchema,
  editableIf: VisibleIfSchema.optional(),
  editable: z.boolean(),
});

export const Many2OneFieldSchema = z.object({
  kind: z.literal("many2one"),
  key: z.string(),
  label: z.string(),
  value: RefSchema.nullable(),
  visibleIf: VisibleIfSchema,
  editableIf: VisibleIfSchema.optional(),
  editable: z.boolean(),
});

export type FormNodeSchema = z.infer<typeof FormNodeSchemaLazy>;
const FormNodeSchemaLazy: z.ZodType<FormNode> = z.lazy(() =>
  z.union([
    TextFieldSchema,
    SelectFieldSchema,
    Many2OneFieldSchema,
    GroupNodeSchema,
  ])
);

export const GroupNodeSchema: z.ZodType<GroupNode> = z.lazy(() =>
  z.object({
    kind: z.literal("group"),
    key: z.string(),
    label: z.string(),
    children: z.array(FormNodeSchemaLazy),
    visibleIf: VisibleIfSchema,
    editableIf: VisibleIfSchema.optional(),
  })
);

export const FormNodeSchema = FormNodeSchemaLazy;

// ─── Header léger pour l'affichage ─────────────────────────────────────────────

export const EmployeeHeaderSummarySchema = z.object({
  fullName: z.string(),
  jobTitle: z.string().nullable(),
  photo: z.string().nullable(),
  department: RefSchema.nullable(),
  workEmail: z.string().nullable(),
});

// ─── Organigramme ───────────────────────────────────────────────────────────────

export const OrgChartNodeSchema: z.ZodType<OrgChartNode> = z.lazy(() =>
  z.object({
    id: z.number().int().positive(),
    fullName: z.string(),
    jobTitle: z.string().nullable(),
    photo: z.string().nullable(),
    children: z.array(OrgChartNodeSchema),
  })
);

// ─── Agrégats exposés par le port ─────────────────────────────────────────────

export const EmployeeSummarySchema = z.object({
  id: z.number().int().positive(),
  fullName: z.string(),
  jobTitle: z.string().nullable(),
  photo: z.string().nullable(),
  department: RefSchema.nullable(),
  workEmail: z.string().nullable(),
  workPhone: z.string().nullable(),
});

export const EmployeeFormRecordSchema = z.object({
  id: z.number().int().positive(),
  headerSummary: EmployeeHeaderSummarySchema,
  formTree: z.array(GroupNodeSchema),
  orgChart: OrgChartNodeSchema.nullable(),
});

export const EmployeeListResultSchema = z.object({
  items: z.array(EmployeeSummarySchema),
  total: z.number().int().nonnegative(),
});

export const EmployeeListParamsSchema = z.object({
  search: z.string().optional(),
  departmentId: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const DepartmentNodeSchema: z.ZodType<DepartmentNode> = z.lazy(() =>
  z.object({
    id: z.number().int().positive(),
    name: z.string(),
    children: z.array(DepartmentNodeSchema),
    memberIds: z.array(z.number().int().positive()),
  })
);
