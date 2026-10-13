// domain/tree.ts — Types domaine purs
// AUCUN terme Odoo dans ce fichier (execute_kw, jsonrpc, res.partner, hr.employee…)

// ─── Primitives ────────────────────────────────────────────────────────────────

/** Référence typée vers un enregistrement externe (id + label lisible). */
export interface Ref {
  id: number;
  label: string;
}

/** Rôles viewer supportés par le PoC. */
export type ViewerRole = "employee" | "manager" | "hr_admin";

/** Contexte du viewer injecté pour les règles de visibilité. */
export interface ViewerContext {
  id: number;
  role: ViewerRole;
  departmentId?: number;
  employeeId?: number;
}

// ─── Règles de visibilité ──────────────────────────────────────────────────────

export interface VisibleAlways {
  kind: "always";
}

export interface VisibleSelf {
  kind: "self";
}

export interface VisibleRole {
  kind: "role";
  roles: ViewerRole[];
}

export interface VisibleOr {
  kind: "or";
  conditions: VisibleIf[];
}

export interface VisibleAnd {
  kind: "and";
  conditions: VisibleIf[];
}

export interface VisibleField {
  kind: "field";
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "truthy";
  value?: string | number | boolean | undefined;
}

export type VisibleIf =
  | VisibleAlways
  | VisibleSelf
  | VisibleRole
  | VisibleOr
  | VisibleAnd
  | VisibleField;

// ─── Nœuds de l'arbre de formulaire ──────────────────────────────────────────

/** Nœud texte simple (char / date / integer). */
export interface TextField {
  kind: "text";
  key: string;
  label: string;
  value: string | number | null;
  visibleIf: VisibleIf;
  /** Calculé à l'hydratation selon les droits réels du viewer (fields_get). */
  editable: boolean;
}

/** Nœud sélection (valeur dans une liste fermée). */
export interface SelectField {
  kind: "select";
  key: string;
  label: string;
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  visibleIf: VisibleIf;
  editable: boolean;
}

/** Nœud relation many2one (référence vers un autre enregistrement). */
export interface Many2OneField {
  kind: "many2one";
  key: string;
  label: string;
  value: Ref | null;
  visibleIf: VisibleIf;
  editable: boolean;
}

/** Nœud groupe (section avec titre et sous-nœuds). Pas de editable : conteneur pur. */
export interface GroupNode {
  kind: "group";
  key: string;
  label: string;
  children: FormNode[];
  visibleIf: VisibleIf;
}

export type FormNode = TextField | SelectField | Many2OneField | GroupNode;

// ─── Header léger pour l'affichage (hors arbre de formulaire) ────────────────

/**
 * Résumé d'en-tête pour le hero de la fiche employé.
 * Volontairement séparé du formTree : c'est de l'affichage cosmétique,
 * pas un champ de formulaire éditable. Champs alignés sur le hero de [id].astro.
 */
export interface EmployeeHeaderSummary {
  fullName: string;
  jobTitle: string | null;
  photo: string | null;
  department: Ref | null;
  workEmail: string | null;
}

/** Nœud organigramme. */
export interface OrgChartNode {
  id: number;
  fullName: string;
  jobTitle: string | null;
  photo: string | null;
  children: OrgChartNode[];
}

// ─── Agrégats exposés par le port ─────────────────────────────────────────────

/** Résumé employé pour le listing (kanban par département). Reste plat — pas un formulaire. */
export interface EmployeeSummary {
  id: number;
  fullName: string;
  jobTitle: string | null;
  photo: string | null;
  department: Ref | null;
  workEmail: string | null;
  workPhone: string | null;
}

/** Fiche complète employé — pilotée par l'arbre, hydraté et validé. */
export interface EmployeeFormRecord {
  id: number;
  headerSummary: EmployeeHeaderSummary;
  formTree: GroupNode[];
  orgChart: OrgChartNode | null;
}

/** Résultat paginé du listing. */
export interface EmployeeListResult {
  items: EmployeeSummary[];
  total: number;
}

/** Paramètres de recherche / filtrage du listing. */
export interface EmployeeListParams {
  search?: string;
  departmentId?: number;
  limit?: number;
  offset?: number;
}

/** Arbre de départements. */
export interface DepartmentNode {
  id: number;
  name: string;
  children: DepartmentNode[];
  memberIds: number[];
}
