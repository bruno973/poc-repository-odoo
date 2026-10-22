// test/fake-odoo-ui.ts — Comportement « interface » du faux Odoo 18 :
// menus, actions, get_views (architectures RÉSOLUES : nœuds et champs portant un
// attribut `groups` retirés si l'utilisateur n'a pas le groupe, comme Odoo),
// lecture / écriture d'enregistrements avec règles d'accès simulées par utilisateur.
//
// Les architectures sont modifiables (`state.archs`) pour simuler un héritage de
// vue ajouté dans Odoo : le schéma Leila doit suivre sans toucher au front.

import { readFileSync } from "node:fs";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { type FakeCall, type FakeOdoo, type Handler, NEXT, OdooFault } from "./fake-odoo.js";

const FIXTURES = new URL("./fixtures/odoo18/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), "utf8");

type Row = Record<string, unknown> & { id: number };
type Meta = Record<string, unknown> & { type: string; string: string; groups?: string };

const GROUP_IDS: Record<string, number> = {
  "base.group_user": 1,
  "base.group_system": 2,
  "hr.group_hr_user": 10,
  "hr.group_hr_manager": 11,
  "hr_attendance.group_hr_attendance_officer": 20,
  "base.group_multi_company": 30,
};

const m2o = (id: number, name: string) => [id, name];

const EMPLOYEE_FIELDS: Record<string, Meta> = {
  name: { type: "char", string: "Nom", required: true, sortable: true, store: true },
  job_title: { type: "char", string: "Intitulé du poste", sortable: true, store: true },
  work_email: { type: "char", string: "Email pro" },
  work_phone: { type: "char", string: "Téléphone pro" },
  mobile_phone: { type: "char", string: "Mobile pro" },
  department_id: { type: "many2one", string: "Département", relation: "hr.department", domain: "[('company_id', 'in', [company_id, False])]" },
  parent_id: { type: "many2one", string: "Manager", relation: "hr.employee" },
  coach_id: { type: "many2one", string: "Mentor", relation: "hr.employee", domain: [] },
  company_id: { type: "many2one", string: "Société", relation: "res.company", groups: "base.group_multi_company" },
  work_location_id: { type: "many2one", string: "Lieu de travail", relation: "hr.work.location", domain: [] },
  resource_calendar_id: { type: "many2one", string: "Horaires", relation: "resource.calendar", domain: [] },
  tz: { type: "selection", string: "Fuseau horaire", selection: [["America/Cayenne", "America/Cayenne"], ["Europe/Paris", "Europe/Paris"]] },
  private_email: { type: "char", string: "Email privé", groups: "hr.group_hr_user" },
  ssnid: { type: "char", string: "N° sécurité sociale", groups: "hr.group_hr_user" },
  marital: { type: "selection", string: "État civil", groups: "hr.group_hr_user", selection: [["single", "Célibataire"], ["married", "Marié(e)"], ["cohabitant", "Cohabitant"]] },
  spouse_complete_name: { type: "char", string: "Conjoint", groups: "hr.group_hr_user" },
  employee_type: { type: "selection", string: "Type", groups: "hr.group_hr_user", selection: [["employee", "Employé"], ["student", "Étudiant"]] },
  user_id: { type: "many2one", string: "Utilisateur", relation: "res.users", groups: "hr.group_hr_user" },
  category_ids: { type: "many2many", string: "Étiquettes", relation: "hr.employee.category" },
  avatar_128: { type: "binary", string: "Avatar" },
  image_1920: { type: "binary", string: "Image" },
  hours_last_month: { type: "float", string: "Heures le mois dernier", readonly: true },
  active: { type: "boolean", string: "Actif" },
};

const ATTENDANCE_FIELDS: Record<string, Meta> = {
  employee_id: { type: "many2one", string: "Employé", relation: "hr.employee", required: true, domain: [] },
  check_in: { type: "datetime", string: "Arrivée", required: true, sortable: true, store: true },
  check_out: { type: "datetime", string: "Départ", sortable: true, store: true },
  worked_hours: { type: "float", string: "Heures", readonly: true },
  meal_count: { type: "integer", string: "Repas" },
  break_entry: { type: "boolean", string: "Arrivée de break" },
  boat_arrival: { type: "boolean", string: "Arrivé en transport" },
  overtime_status: { type: "selection", string: "Statut", readonly: true, selection: [["to_approve", "À approuver"], ["approved", "Approuvé"], ["refused", "Refusé"]] },
};

export interface UiState {
  archs: Record<string, string>;
  fields: Record<string, Record<string, Meta>>;
  employees: Row[];
  attendances: Row[];
  departments: [number, string, number][];
}

export function uiState(): UiState {
  return {
    archs: {
      "hr.employee:list": fixture("hr.employee.list.xml"),
      "hr.employee:form": fixture("hr.employee.form.xml"),
      "hr.employee:search": fixture("hr.employee.search.xml"),
      "hr.attendance:list": fixture("hr.attendance.list.xml"),
      "hr.attendance:form": fixture("hr.attendance.form.xml"),
      "hr.attendance:search": fixture("hr.attendance.search.xml"),
    },
    fields: { "hr.employee": structuredClone(EMPLOYEE_FIELDS), "hr.attendance": structuredClone(ATTENDANCE_FIELDS) },
    employees: [
      { id: 1, name: "Alice Admin", job_title: "DRH", work_email: "alice@exemple.gf", work_phone: "0594 01", mobile_phone: false, department_id: m2o(1, "Direction"), parent_id: false, coach_id: false, company_id: m2o(1, "Société A"), work_location_id: false, resource_calendar_id: false, tz: "America/Cayenne", private_email: "alice@perso.gf", ssnid: "2 85 01 973 001", marital: "married", spouse_complete_name: "Paul Admin", employee_type: "employee", user_id: m2o(2, "Admin RH"), category_ids: [], hours_last_month: 140, active: true },
      { id: 5, name: "Manon Manager", job_title: "Cheffe d'atelier", work_email: "manon@exemple.gf", work_phone: false, mobile_phone: false, department_id: m2o(3, "Atelier"), parent_id: m2o(1, "Alice Admin"), coach_id: false, company_id: m2o(1, "Société A"), work_location_id: false, resource_calendar_id: false, tz: "America/Cayenne", private_email: "manon@perso.gf", ssnid: "2 90 05 973 002", marital: "single", spouse_complete_name: false, employee_type: "employee", user_id: m2o(7, "Manon Manager"), category_ids: [1], hours_last_month: 150, active: true },
      { id: 6, name: "Émile Employé", job_title: false, work_email: "emile@exemple.gf", work_phone: "0594 06", mobile_phone: "0694 06", department_id: m2o(3, "Atelier"), parent_id: m2o(5, "Manon Manager"), coach_id: false, company_id: m2o(1, "Société A"), work_location_id: false, resource_calendar_id: false, tz: "America/Cayenne", private_email: "emile@perso.gf", ssnid: "1 95 06 973 003", marital: "married", spouse_complete_name: "Léa Employé", employee_type: "employee", user_id: m2o(9, "Émile Employé"), category_ids: [], hours_last_month: 160, active: true },
      { id: 8, name: "Hugo Horséquipe", job_title: "Docker", work_email: "hugo@exemple.gf", work_phone: false, mobile_phone: false, department_id: m2o(4, "Quai"), parent_id: false, coach_id: false, company_id: m2o(1, "Société A"), work_location_id: false, resource_calendar_id: false, tz: "America/Cayenne", private_email: "hugo@perso.gf", ssnid: "1 80 08 973 004", marital: "single", spouse_complete_name: false, employee_type: "employee", user_id: false, category_ids: [], hours_last_month: 120, active: true },
    ],
    attendances: [
      { id: 11, employee_id: m2o(6, "Émile Employé"), check_in: "2026-09-18 11:00:00", check_out: "2026-09-18 19:00:00", worked_hours: 8, meal_count: 1, break_entry: false, boat_arrival: false, overtime_status: "to_approve" },
      { id: 12, employee_id: m2o(8, "Hugo Horséquipe"), check_in: "2026-09-18 10:00:00", check_out: "2026-09-18 23:00:00", worked_hours: 13, meal_count: 0, break_entry: false, boat_arrival: true, overtime_status: "approved" },
      { id: 13, employee_id: m2o(5, "Manon Manager"), check_in: "2026-09-18 10:30:00", check_out: false, worked_hours: 0, meal_count: 0, break_entry: false, boat_arrival: false, overtime_status: false },
    ],
    // [id, nom, société] : « Filiale » est dans la société B
    departments: [[1, "Direction", 1], [3, "Atelier", 1], [4, "Quai", 1], [9, "Filiale", 2]],
  };
}

// ─── Règles d'accès simulées (par uid) ────────────────────────────────────────
const visibleEmployees = (uid: number, all: Row[]) => (uid === 2 ? all.map((e) => e.id) : uid === 7 ? [5, 6] : uid === 9 ? [6] : []);
const writableEmployees = (uid: number, all: Row[]) => (uid === 2 ? all.map((e) => e.id) : uid === 7 ? [6] : []);
const modelWrite: Record<string, number[]> = { "hr.employee": [2, 7], "hr.attendance": [2, 7] };

// ─── Domaines (évaluateur minimal, notation préfixée) ────────────────────────
function matches(row: Row, domain: unknown[]): boolean {
  let i = 0;
  const value = (field: string): unknown => {
    const v = row[field];
    return Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "string" ? v[0] : v;
  };
  const term = (): boolean => {
    const t = domain[i++];
    if (t === "&") return term() && term();
    if (t === "|") {
      const a = term();
      const b = term();
      return a || b;
    }
    if (t === "!") return !term();
    const [field, op, expected] = t as [string | number, string, unknown];
    if (field === 1) return true;
    const v = value(String(field));
    switch (op) {
      case "=":
        return v === expected || (expected === false && (v === false || v === null || v === undefined));
      case "!=":
        return !(v === expected || (expected === false && (v === false || v === null)));
      case "ilike": {
        const raw = row[String(field)];
        const text = Array.isArray(raw) ? String(raw[1]) : String(raw ?? "");
        return text.toLowerCase().includes(String(expected).toLowerCase());
      }
      case "in":
        return (expected as unknown[]).includes(v);
      case ">":
        return Number(v) > Number(expected);
      default:
        throw new OdooFault("builtins.ValueError", `opérateur ${op}`);
    }
  };
  // Domaine implicite : ET de tous les termes de premier niveau
  while (i < domain.length) if (!term()) return false;
  return true;
}

// ─── Architectures résolues : groupes appliqués ──────────────────────────────
const xmlOpts = { preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false, parseTagValue: false, trimValues: true };
const parser = new XMLParser(xmlOpts);
const builder = new XMLBuilder({ ...xmlOpts, suppressEmptyNode: true });

function stripGroups(arch: string, groups: string[]): string {
  const keep = (nodes: Record<string, unknown>[]): Record<string, unknown>[] =>
    nodes
      .filter((n) => {
        const g = (n[":@"] as Record<string, string> | undefined)?.["groups"];
        return !g || g.split(",").some((x) => groups.includes(x.trim()));
      })
      .map((n) => {
        const tag = Object.keys(n).find((k) => k !== ":@");
        if (tag && Array.isArray(n[tag])) return { ...n, [tag]: keep(n[tag] as Record<string, unknown>[]) };
        return n;
      });
  return builder.build(keep(parser.parse(arch) as Record<string, unknown>[])) as string;
}

function fieldsFor(meta: Record<string, Meta>, groups: string[]): Record<string, Meta> {
  return Object.fromEntries(Object.entries(meta).filter(([, m]) => !m.groups || groups.includes(m.groups)));
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export function uiHandler(state: UiState): Handler {
  return (call: FakeCall, odoo: FakeOdoo) => {
    const { uid, model, method, args, kwargs } = call;
    const groups = odoo.users.find((u) => u.uid === uid)?.groups ?? [];
    const allGroups = ["base.group_user", ...groups];

    if (model === "ir.ui.menu" && method === "load_web_menus") {
      // Comme Odoo 18 (constaté sur amg) : premier argument = ids, puis debug
      if (args.length !== 2 || !Array.isArray(args[0])) {
        throw new OdooFault("builtins.TypeError", "IrUiMenu.load_web_menus() missing 1 required positional argument: 'debug'");
      }
      return {
        root: { id: "root", name: "root", children: [100, 200, 900], actionID: false, actionModel: false, xmlid: "" },
        100: { id: 100, name: "Employés", children: [101, 102], actionID: false, actionModel: false, xmlid: "hr.menu_hr_root" },
        101: { id: 101, name: "Employés", children: [], actionID: 501, actionModel: "ir.actions.act_window", xmlid: "hr.menu_hr_employee" },
        102: { id: 102, name: "Mon équipe", children: [], actionID: 503, actionModel: "ir.actions.act_window", xmlid: "hr.menu_my_team" },
        200: { id: 200, name: "Présences", children: [201, 202], actionID: false, actionModel: false, xmlid: "hr_attendance.menu_hr_attendance_root" },
        201: { id: 201, name: "Présences", children: [], actionID: 502, actionModel: "ir.actions.act_window", xmlid: "hr_attendance.menu_hr_attendance_view_attendances" },
        202: { id: 202, name: "Mode kiosque", children: [], actionID: 504, actionModel: "ir.actions.client", xmlid: "hr_attendance.menu_kiosk" },
        900: { id: 900, name: "Facturation", children: [], actionID: 505, actionModel: "ir.actions.act_window", xmlid: "account.menu_finance" },
      };
    }
    if (model === "ir.actions.act_window" && method === "read") {
      const ACTIONS: Record<number, Record<string, unknown>> = {
        501: { id: 501, name: "Employés", res_model: "hr.employee", views: [[false, "list"], [false, "form"]], domain: false, context: "{'chat_icon': True}", search_view_id: false },
        502: { id: 502, name: "Présences", res_model: "hr.attendance", views: [[false, "list"], [false, "form"]], domain: "[]", context: "{'create': False}", search_view_id: false },
        503: { id: 503, name: "Mon équipe", res_model: "hr.employee", views: [[false, "list"]], domain: "[('parent_id.user_id', '=', uid)]", context: "{}", search_view_id: false },
      };
      return (args[0] as number[]).map((id) => ACTIONS[id]).filter(Boolean);
    }
    if (method === "get_views" && (model === "hr.employee" || model === "hr.attendance")) {
      const views = (kwargs["views"] as [number | false, string][]).map(([, type]) => type);
      return {
        views: Object.fromEntries(views.map((type) => [type, { arch: stripGroups(state.archs[`${model}:${type}`] ?? `<${type}/>`, allGroups), id: 1 }])),
        models: { [model]: { fields: fieldsFor(state.fields[model] ?? {}, allGroups) } },
      };
    }
    if (model === "res.users" && method === "read" && Array.isArray(args[1]) && (args[1] as string[]).includes("groups_id")) {
      return [{ id: uid, groups_id: allGroups.map((g) => GROUP_IDS[g] ?? 0) }];
    }
    if (method === "has_access" && (args[0] as number[]).length === 0) {
      return (modelWrite[model] ?? []).includes(uid);
    }

    const table = model === "hr.employee" ? state.employees : model === "hr.attendance" ? state.attendances : null;
    if (!table) {
      const departments = state.departments.map(([id, name, company]) => ({ id, name, company_id: m2o(company, `Société ${company}`) }));
      if (model === "hr.department" && method === "name_search") {
        const q = String(args[0] ?? "").toLowerCase();
        return departments.filter((d) => d.name.toLowerCase().includes(q) && matches(d, (args[1] as unknown[]) ?? [])).map((d) => [d.id, d.name]);
      }
      if (model === "hr.department" && method === "search_count") {
        return departments.filter((r) => matches(r, args[0] as unknown[])).length;
      }
      return NEXT;
    }
    const visibleIds = model === "hr.employee" ? visibleEmployees(uid, table) : table.filter((a) => visibleEmployees(uid, state.employees).includes((a["employee_id"] as [number])[0])).map((a) => a.id);
    const visible = table.filter((r) => visibleIds.includes(r.id));
    const pickFields = (row: Row, names: string[] | undefined) => {
      const allowed = fieldsFor(state.fields[model] ?? {}, allGroups);
      const wanted = names ?? Object.keys(allowed);
      for (const n of wanted) if (!(n in allowed)) throw new OdooFault("odoo.exceptions.AccessError", `Champ ${n} non accessible.`);
      return { id: row.id, ...Object.fromEntries(wanted.map((n) => [n, row[n] ?? false])) };
    };

    if (method === "search_read" || method === "search_count") {
      const rows = visible.filter((r) => matches(r, (args[0] as unknown[]) ?? []));
      if (method === "search_count") return rows.length;
      const order = kwargs["order"] as string | undefined;
      if (order) {
        const [f, dir] = order.split(" ");
        rows.sort((a, b) => String(a[f as string]).localeCompare(String(b[f as string])) * (dir === "desc" ? -1 : 1));
      }
      const offset = Number(kwargs["offset"] ?? 0);
      const limit = Number(kwargs["limit"] ?? rows.length);
      return rows.slice(offset, offset + limit).map((r) => pickFields(r, kwargs["fields"] as string[] | undefined));
    }
    if (method === "read") {
      const ids = args[0] as number[];
      if (ids.some((id) => !visibleIds.includes(id))) {
        if (ids.some((id) => !table.some((r) => r.id === id))) return [];
        throw new OdooFault("odoo.exceptions.AccessError", "Accès refusé à cet enregistrement.");
      }
      const names = (args[1] as string[] | undefined) ?? (kwargs["fields"] as string[] | undefined);
      return visible.filter((r) => ids.includes(r.id)).map((r) => pickFields(r, names));
    }
    if (method === "has_access") {
      const ids = args[0] as number[];
      const allowed = model === "hr.employee" ? writableEmployees(uid, table) : (modelWrite[model] ?? []).includes(uid) ? visibleIds.filter((id) => {
        const row = table.find((a) => a.id === id);
        return uid === 2 || (row && (row["employee_id"] as [number])[0] === 6);
      }) : [];
      return ids.every((id) => allowed.includes(id));
    }
    if (method === "write") {
      const [ids, values] = args as [number[], Record<string, unknown>];
      for (const id of ids) {
        const row = table.find((r) => r.id === id);
        if (!row) throw new OdooFault("odoo.exceptions.MissingError", "Introuvable");
        for (const [k, v] of Object.entries(values)) {
          const meta = state.fields[model]?.[k];
          if (meta?.type === "many2one" && typeof v === "number") {
            const name =
              meta["relation"] === "hr.department"
                ? state.departments.find(([d]) => d === v)?.[1]
                : meta["relation"] === "hr.employee"
                  ? (state.employees.find((e) => e.id === v)?.["name"] as string | undefined)
                  : undefined;
            row[k] = m2o(v, name ?? `#${v}`);
          } else row[k] = v;
        }
      }
      return true;
    }
    if (method === "action_approve_overtime" || method === "action_refuse_overtime") {
      for (const id of args[0] as number[]) {
        const row = table.find((r) => r.id === id);
        if (row) row["overtime_status"] = method === "action_approve_overtime" ? "approved" : "refused";
      }
      return true;
    }
    return NEXT;
  };
}
