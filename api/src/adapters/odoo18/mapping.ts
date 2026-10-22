// adapters/odoo18/mapping.ts
// Transforme les données brutes Odoo en types domaine.
// Point critique : 80% des bugs de drift Odoo apparaîtront ici.
// Aucun terme Odoo ne doit sortir de ce fichier vers domain/ ou web/.

import type {
  Ref,
  EmployeeSummary,
  EmployeeFormRecord,
  EmployeeHeaderSummary,
  OrgChartNode,
  FormNode,
  GroupNode,
} from "../../domain/tree.js";
import { EMPLOYEE_SKELETON } from "../../domain/employee.skeleton.js";
import type { FieldAccess } from "./permissions.js";

// ─── Types Odoo raw (tels que retournés par execute_kw) ───────────────────────

export type OdooM2O = [number, string] | false;
export type OdooDate = string | false;
export type OdooChar = string | false;
export type OdooInt = number | false;

/**
 * Tous les champs sont optionnels : un read() filtré par readable peut
 * légitimement ne PAS contenir un champ que le viewer n'a pas le droit de lire.
 */
export interface OdooRawEmployee {
  id: number;
  name?: string;
  job_title?: OdooChar;
  image_128?: OdooChar;
  department_id?: OdooM2O;
  job_id?: OdooM2O;
  parent_id?: OdooM2O;
  coach_id?: OdooM2O;
  category_ids?: number[];
  work_email?: OdooChar;
  work_phone?: OdooChar;
  mobile_phone?: OdooChar;
  work_location_id?: OdooM2O;
  address_id?: OdooM2O;
  leave_manager_id?: OdooM2O;
  resource_calendar_id?: OdooM2O;
  tz?: OdooChar;
  child_ids?: number[];
  private_street?: OdooChar;
  private_city?: OdooChar;
  private_zip?: OdooChar;
  private_country_id?: OdooM2O;
  private_email?: OdooChar;
  private_phone?: OdooChar;
  km_home_work?: OdooInt;
  private_car_plate?: OdooChar;
  country_id?: OdooM2O;
  identification_id?: OdooChar;
  ssnid?: OdooChar;
  passport_id?: OdooChar;
  gender?: "male" | "female" | "other" | false;
  birthday?: OdooDate;
  place_of_birth?: OdooChar;
  country_of_birth?: OdooM2O;
  emergency_contact?: OdooChar;
  emergency_phone?: OdooChar;
  marital?: "single" | "married" | "widower" | "divorced" | false;
  spouse_complete_name?: OdooChar;
  spouse_birthdate?: OdooDate;
  children?: OdooInt;
  certificate?: "graduate" | "bachelor" | "master" | "doctor" | "other" | false;
  study_field?: OdooChar;
  study_school?: OdooChar;
  employee_type?: "employee" | "student" | "freelance" | false;
  user_id?: OdooM2O;
  pin?: OdooChar;
  barcode?: OdooChar;
  active?: boolean;
}

// ─── Helpers de conversion ────────────────────────────────────────────────────

export function m2o(val: OdooM2O | undefined): Ref | null {
  if (!val) return null;
  return { id: val[0], label: val[1] };
}

export function str(val: OdooChar | undefined): string | null {
  return val === false || val === undefined ? null : val;
}

export function num(val: OdooInt | undefined): number | null {
  return val === false || val === undefined ? null : val;
}

export function date(val: OdooDate | undefined): string | null {
  return val === false || val === undefined ? null : val;
}

export function photo(val: OdooChar | undefined): string | null {
  if (!val) return null;
  return `data:image/png;base64,${val}`;
}

// ─── Champs déclarés dans le mapping ──────────────────────────────────────────

/** Champs toujours demandés (listing) — supposés universellement lisibles. */
export const EMPLOYEE_FIELDS_LISTING = [
  "name",
  "job_title",
  "image_128",
  "department_id",
  "work_email",
  "work_phone",
  "active",
] as const;

/** Tous les champs CANDIDATS pour la fiche complète — pas tous garantis lisibles. */
export const EMPLOYEE_FIELDS_FULL = [
  "name",
  "job_title",
  "image_128",
  "department_id",
  "job_id",
  "parent_id",
  "coach_id",
  "category_ids",
  "work_email",
  "work_phone",
  "mobile_phone",
  "work_location_id",
  "address_id",
  "leave_manager_id",
  "resource_calendar_id",
  "tz",
  "child_ids",
  "private_street",
  "private_city",
  "private_zip",
  "private_country_id",
  "private_email",
  "private_phone",
  "km_home_work",
  "private_car_plate",
  "country_id",
  "identification_id",
  "ssnid",
  "passport_id",
  "gender",
  "birthday",
  "place_of_birth",
  "country_of_birth",
  "emergency_contact",
  "emergency_phone",
  "marital",
  "spouse_complete_name",
  "spouse_birthdate",
  "children",
  "certificate",
  "study_field",
  "study_school",
  "employee_type",
  "user_id",
  "pin",
  "barcode",
  "active",
] as const;

// ─── Frontière ACL : domainKey ↔ odooField ────────────────────────────────────

export const DOMAIN_KEY_TO_ODOO_FIELD: Record<string, string> = {
  "header.fullName": "name",
  "header.jobTitle": "job_title",
  "header.department": "department_id",
  "header.jobPosition": "job_id",
  "header.manager": "parent_id",
  "header.mentor": "coach_id",
  "header.workEmail": "work_email",
  "header.workPhone": "work_phone",
  "header.workMobile": "mobile_phone",

  "infoPro.workAddress": "address_id",
  "infoPro.workLocation": "work_location_id",
  "infoPro.leaveManager": "leave_manager_id",
  "infoPro.workSchedule": "resource_calendar_id",
  "infoPro.timezone": "tz",

  "infoPrivee.privateStreet": "private_street",
  "infoPrivee.privateCity": "private_city",
  "infoPrivee.privateZip": "private_zip",
  "infoPrivee.privateCountry": "private_country_id",
  "infoPrivee.privateEmail": "private_email",
  "infoPrivee.privatePhone": "private_phone",
  "infoPrivee.kmHomeWork": "km_home_work",
  "infoPrivee.privateCar": "private_car_plate",
  "infoPrivee.emergencyContact": "emergency_contact",
  "infoPrivee.emergencyPhone": "emergency_phone",
  "infoPrivee.nationality": "country_id",
  "infoPrivee.identNumber": "identification_id",
  "infoPrivee.ssnId": "ssnid",
  "infoPrivee.passportId": "passport_id",
  "infoPrivee.gender": "gender",
  "infoPrivee.birthday": "birthday",
  "infoPrivee.birthPlace": "place_of_birth",
  "infoPrivee.countryBirth": "country_of_birth",
  "infoPrivee.maritalStatus": "marital",
  "infoPrivee.spouseName": "spouse_complete_name",
  "infoPrivee.spouseBirthdate": "spouse_birthdate",
  "infoPrivee.dependants": "children",
  "infoPrivee.certificate": "certificate",
  "infoPrivee.studyField": "study_field",
  "infoPrivee.studySchool": "study_school",
  // visaNo/permitNo/visaExpire/permitExpire : pas de champ Odoo source.

  "parametres.employeeType": "employee_type",
  "parametres.relatedUser": "user_id",
  "parametres.pinCode": "pin",
  "parametres.badgeId": "barcode",
};

function resolveRawValue(
  odooField: keyof OdooRawEmployee,
  raw: OdooRawEmployee,
  nodeKind: "text" | "select" | "many2one"
): string | number | Ref | null {
  const rawVal = raw[odooField];

  if (nodeKind === "many2one") {
    return m2o(rawVal as OdooM2O | undefined);
  }
  if (nodeKind === "select") {
    return rawVal === false || rawVal === undefined ? null : (rawVal as string);
  }
  if (typeof rawVal === "number" || rawVal === false || rawVal === undefined) {
    return num(rawVal as OdooInt | undefined);
  }
  return str(rawVal as OdooChar | undefined);
}

// ─── Hydratation de l'arbre ─────────────────────────────────────────────────

/**
 * Parcourt le skeleton statique et pose value + editable sur chaque feuille.
 * - value = null si le champ Odoo n'est pas dans access.readable (jamais
 *   demandé à read(), donc jamais présent dans raw — comportement sûr par
 *   construction, pas de fuite possible).
 * - editable = champ modifiable pour ce compte (fields_get) ∧ fiche modifiable
 *   (has_access("write") : droits du modèle + règles d'enregistrement).
 *   editableIf (règle Leila) est appliqué ensuite, côté domaine.
 */
export function hydrateSkeleton(
  raw: OdooRawEmployee,
  access: FieldAccess,
  recordWritable: boolean
): GroupNode[] {
  function hydrateNode(node: FormNode): FormNode {
    if (node.kind === "group") {
      return { ...node, children: node.children.map(hydrateNode) };
    }

    const odooField = DOMAIN_KEY_TO_ODOO_FIELD[node.key];
    if (!odooField || !access.readable.has(odooField)) {
      return { ...node, value: null, editable: false } as FormNode;
    }

    const value = resolveRawValue(odooField as keyof OdooRawEmployee, raw, node.kind);
    const editable = recordWritable && access.editable.has(odooField);

    return { ...node, value, editable } as FormNode;
  }

  return EMPLOYEE_SKELETON.map((group) => hydrateNode(group) as GroupNode);
}

// ─── Header léger (hors arbre) ────────────────────────────────────────────────

export function mapHeaderSummary(raw: OdooRawEmployee): EmployeeHeaderSummary {
  return {
    fullName: raw.name ?? "",
    jobTitle: str(raw.job_title),
    photo: photo(raw.image_128),
    department: m2o(raw.department_id),
    workEmail: str(raw.work_email),
  };
}

// ─── Listing / résumé ──────────────────────────────────────────────────────────

export function mapSummary(raw: OdooRawEmployee): EmployeeSummary {
  return {
    id: raw.id,
    fullName: raw.name ?? "",
    jobTitle: str(raw.job_title),
    photo: photo(raw.image_128),
    department: m2o(raw.department_id),
    workEmail: str(raw.work_email),
    workPhone: str(raw.work_phone),
  };
}

// ─── Organigramme ───────────────────────────────────────────────────────────────

export function mapOrgChart(
  root: OdooRawEmployee,
  allRaw: OdooRawEmployee[]
): OrgChartNode {
  const children = (root.child_ids ?? [])
    .map((childId) => allRaw.find((r) => r.id === childId))
    .filter((r): r is OdooRawEmployee => r !== undefined)
    .map(
      (child): OrgChartNode => ({
        id: child.id,
        fullName: child.name ?? "",
        jobTitle: str(child.job_title),
        photo: photo(child.image_128),
        children: [],
      })
    );

  return {
    id: root.id,
    fullName: root.name ?? "",
    jobTitle: str(root.job_title),
    photo: photo(root.image_128),
    children,
  };
}

// ─── Agrégat final ─────────────────────────────────────────────────────────────

export function mapFormRecord(
  raw: OdooRawEmployee,
  allRaw: OdooRawEmployee[],
  access: FieldAccess,
  recordWritable: boolean
): EmployeeFormRecord {
  return {
    id: raw.id,
    headerSummary: mapHeaderSummary(raw),
    formTree: hydrateSkeleton(raw, access, recordWritable),
    orgChart: mapOrgChart(raw, allRaw),
  };
}
