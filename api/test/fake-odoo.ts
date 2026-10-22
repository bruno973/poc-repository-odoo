// test/fake-odoo.ts — Faux serveur Odoo 18 pour les tests, sans réseau ni base.
//
// Parle les deux protocoles de l'adapter :
//  - API externe /jsonrpc (common.authenticate, object.execute_kw) : mode shared ;
//  - routes du client web (/web/session/authenticate, /web/dataset/call_kw,
//    /web/session/get_session_info, /web/session/destroy) + cookie session_id :
//    mode odoo-session.
// Simule des droits et des règles d'enregistrement PAR UTILISATEUR (dataset par
// défaut ci-dessous) : c'est ce qui permet de montrer que le mode identité réelle
// applique les règles à la vraie personne.

import { randomBytes } from "node:crypto";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeCall {
  transport: "jsonrpc" | "session";
  uid: number;
  model: string;
  method: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
}

export interface FakeUser {
  login: string;
  /** Mot de passe (sessions) ou clé d'API (jsonrpc) */
  password: string;
  uid: number;
  name: string;
  groups: string[];
}

export class OdooFault extends Error {
  constructor(
    readonly odooName: string,
    message: string,
  ) {
    super(message);
  }
}

export type Handler = (call: FakeCall, odoo: FakeOdoo) => unknown;

/** Signal pour « pas géré ici, passe au suivant ». */
export const NEXT = Symbol("next");

// ─── Jeu de données par défaut ───────────────────────────────────────────────
// uid 2 : admin RH · uid 7 : manager de l'employé 6 · uid 9 : employé (fiche 6)
// Employés : 1 (admin), 5 (manager), 6 (équipe du manager), 8 (hors équipe)

export const USERS: FakeUser[] = [
  { login: "p.admin", password: "admin-pw", uid: 2, name: "Admin RH", groups: ["hr.group_hr_manager", "hr.group_hr_user", "hr_attendance.group_hr_attendance_officer", "base.group_system"] },
  { login: "p.manager", password: "manager-pw", uid: 7, name: "Manon Manager", groups: ["hr_attendance.group_hr_attendance_officer"] },
  { login: "p.employe", password: "employe-pw", uid: 9, name: "Émile Employé", groups: [] },
  // Compte technique partagé (clé d'API) du mode shared
  { login: "poc", password: "cle-api", uid: 7, name: "Compte partagé", groups: ["hr_attendance.group_hr_attendance_officer"] },
];

const EMPLOYEES = [
  { id: 1, name: "Alice Admin", user_id: 2, department_id: [1, "Direction"], parent_id: false, job_title: "DRH", work_email: "alice@exemple.gf" },
  { id: 5, name: "Manon Manager", user_id: 7, department_id: [3, "Atelier"], parent_id: [1, "Alice Admin"], job_title: "Cheffe d'atelier", work_email: "manon@exemple.gf" },
  { id: 6, name: "Émile Employé", user_id: 9, department_id: [3, "Atelier"], parent_id: [5, "Manon Manager"], job_title: false, work_email: "emile@exemple.gf" },
  { id: 8, name: "Hugo Horséquipe", user_id: false, department_id: [4, "Quai"], parent_id: [1, "Alice Admin"], job_title: "Docker", work_email: "hugo@exemple.gf" },
] as const;

const ATTENDANCES = [
  { id: 11, employee_id: [6, "Émile Employé"], check_in: "2026-09-18 11:00:00", check_out: "2026-09-18 19:00:00", worked_hours: 8, overtime_status: "to_approve" },
  { id: 12, employee_id: [8, "Hugo Horséquipe"], check_in: "2026-09-18 10:00:00", check_out: "2026-09-18 18:00:00", worked_hours: 8, overtime_status: "approved" },
  { id: 13, employee_id: [5, "Manon Manager"], check_in: "2026-09-18 10:30:00", check_out: "2026-09-18 18:30:00", worked_hours: 8, overtime_status: "approved" },
] as const;

/** Fiches visibles (règles d'enregistrement simulées). */
function visibleEmployees(uid: number): number[] {
  if (uid === 2) return EMPLOYEES.map((e) => e.id);
  if (uid === 7) return [5, 6];
  if (uid === 9) return [6];
  return [];
}
/** Fiches employé modifiables. */
function writableEmployees(uid: number): number[] {
  return uid === 2 ? EMPLOYEES.map((e) => e.id) : uid === 7 ? [6] : [];
}
/** Pointages modifiables : ceux de l'équipe pour le manager. */
function writableAttendances(uid: number): number[] {
  if (uid === 2) return ATTENDANCES.map((a) => a.id);
  if (uid === 7) return ATTENDANCES.filter((a) => a.employee_id[0] === 6).map((a) => a.id);
  return [];
}

const FIELDS: Record<string, object> = {
  name: { readonly: false, required: true, type: "char" },
  work_email: { readonly: false, required: false, type: "char" },
  job_title: { readonly: true, required: false, type: "char" },
};

const idsIn = (domain: unknown[]): number[] | null => {
  for (const term of domain) {
    if (Array.isArray(term) && term[0] === "employee_id" && term[1] === "=") return [term[2] as number];
  }
  return null;
};

export const defaultHandler: Handler = (call, odoo) => {
  const { uid, model, method, args, kwargs } = call;
  const user = odoo.users.find((u) => u.uid === uid);
  if (model === "res.users" && method === "has_group") return Boolean(user?.groups.includes(args[1] as string));
  if (model === "res.users" && method === "read") {
    return [{ id: uid, name: user?.name ?? "?", company_id: [1, "Société A"] }];
  }
  if (model === "hr.employee.public" && method === "search_read") {
    const target = ((args[0] as unknown[])[0] as [string, string, number])[2];
    return EMPLOYEES.filter((e) => e.user_id === target).map((e) => ({ id: e.id, department_id: e.department_id, company_id: [1, "Société A"] }));
  }
  if (model === "hr.employee" && method === "fields_get") {
    const requested = (args[0] as string[]) ?? [];
    return Object.fromEntries(requested.filter((f) => f in FIELDS).map((f) => [f, FIELDS[f]]));
  }
  if (model === "hr.employee" && (method === "search_read" || method === "search_count")) {
    const rows = EMPLOYEES.filter((e) => visibleEmployees(uid).includes(e.id));
    return method === "search_count" ? rows.length : rows.map((e) => ({ ...e, user_id: undefined, active: true, image_128: false }));
  }
  if (model === "hr.employee" && method === "read") {
    const ids = args[0] as number[];
    if (ids.some((id) => !visibleEmployees(uid).includes(id))) {
      throw new OdooFault("odoo.exceptions.AccessError", "Vous n'avez pas accès à cette fiche.");
    }
    return EMPLOYEES.filter((e) => ids.includes(e.id)).map((e) => {
      const fields = (kwargs["fields"] as string[] | undefined) ?? Object.keys(e);
      const row = e as unknown as Record<string, unknown>;
      return Object.fromEntries([["id", e.id], ["child_ids", []], ...fields.filter((f) => f in row && f !== "user_id").map((f) => [f, row[f]])]);
    });
  }
  if (method === "has_access") {
    const ids = args[0] as number[];
    const allowed = model === "hr.employee" ? writableEmployees(uid) : model === "hr.attendance" ? writableAttendances(uid) : [];
    return ids.every((id) => allowed.includes(id));
  }
  if (model === "hr.attendance" && (method === "search_read" || method === "search_count")) {
    const only = idsIn(args[0] as unknown[]);
    const rows = ATTENDANCES.filter(
      (a) => visibleEmployees(uid).includes(a.employee_id[0]) && (!only || only.includes(a.employee_id[0])),
    ).filter((a) => !(args[0] as unknown[]).some((t) => Array.isArray(t) && t[0] === "check_out" && t[2] === false));
    return method === "search_count" ? rows.length : rows;
  }
  if (model === "hr.attendance" && method === "read") {
    return ATTENDANCES.filter((a) => (args[0] as number[]).includes(a.id));
  }
  if (method === "write" || method === "action_approve_overtime" || method === "action_refuse_overtime") return true;
  if (model === "hr.attendance.ventilation" && method === "read_group") {
    return [
      { week_label: "S38 - 14/09/26-20/09/26", week_label_count: 5, worked_hours: 38.5, overtime_hours_t1: 3.5 },
      { week_label: false, week_label_count: 1, worked_hours: 2 },
    ];
  }
  if (model === "hr.attendance.ventilation" && method === "search_read") return [];
  return NEXT;
};

export class FakeOdoo {
  url = "";
  calls: FakeCall[] = [];
  /** Chemins HTTP reçus (preuve qu'aucun appel /jsonrpc ne part en mode identité réelle) */
  paths: string[] = [];
  /** Corps bruts reçus (recherche de mot de passe, S-6) */
  bodies: string[] = [];
  readonly sessions = new Map<string, number>();
  private server: Server | null = null;

  constructor(
    readonly users: FakeUser[] = USERS,
    private readonly handlers: Handler[] = [],
  ) {}

  /** Oublie les sessions (expiration côté Odoo) ; toutes si uid absent. */
  expire(uid?: number): void {
    for (const [sid, owner] of this.sessions) if (uid === undefined || owner === uid) this.sessions.delete(sid);
  }

  reset(): void {
    this.calls = [];
    this.paths = [];
    this.bodies = [];
  }

  async start(port = 0): Promise<this> {
    this.server = createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        this.paths.push(req.url ?? "");
        this.bodies.push(body);
        const { params, id } = JSON.parse(body || "{}") as { params: Record<string, unknown>; id: number };
        const headers: Record<string, string | string[]> = { "Content-Type": "application/json" };
        const send = (payload: object) => {
          res.writeHead(200, headers);
          res.end(JSON.stringify({ jsonrpc: "2.0", id, ...payload }));
        };
        const fault = (name: string, message: string, code = 200) =>
          send({ error: { code, message: "Odoo Server Error", data: { name, message } } });
        try {
          const url = req.url ?? "";
          if (url === "/jsonrpc") {
            const { service, args } = params as { service: string; args: unknown[] };
            if (service === "common") {
              const [, login, password] = args as [string, string, string];
              const user = this.users.find((u) => u.login === login && u.password === password);
              return send({ result: user ? user.uid : false });
            }
            const [, uid, password, model, method, callArgs, kwargs] = args as [
              string, number, string, string, string, unknown[], Record<string, unknown>,
            ];
            if (!this.users.some((u) => u.uid === uid && u.password === password)) {
              return fault("odoo.exceptions.AccessDenied", "Access Denied");
            }
            return send({ result: this.dispatch({ transport: "jsonrpc", uid, model, method, args: callArgs, kwargs }) });
          }
          if (url === "/web/session/authenticate") {
            const { login, password } = params as { login: string; password: string };
            const user = this.users.find((u) => u.login === login && u.password === password);
            if (!user) return fault("odoo.exceptions.AccessDenied", "Access Denied");
            const sid = randomBytes(20).toString("hex");
            this.sessions.set(sid, user.uid);
            headers["Set-Cookie"] = [`session_id=${sid}; Expires=Fri, 01 Jan 2100 00:00:00 GMT; HttpOnly; Path=/`];
            return send({ result: { uid: user.uid, name: user.name, username: user.login } });
          }
          const sid = /session_id=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
          const uid = sid ? this.sessions.get(sid) : undefined;
          if (uid === undefined) return fault("odoo.http.SessionExpiredException", "Session expired", 100);
          if (url === "/web/session/get_session_info") return send({ result: { uid } });
          if (url === "/web/session/destroy") {
            this.sessions.delete(sid as string);
            return send({ result: null });
          }
          if (url.startsWith("/web/dataset/call_kw/")) {
            const { model, method, args, kwargs } = params as { model: string; method: string; args: unknown[]; kwargs: Record<string, unknown> };
            return send({ result: this.dispatch({ transport: "session", uid, model, method, args, kwargs }) });
          }
          return fault("werkzeug.exceptions.NotFound", url);
        } catch (error) {
          if (error instanceof OdooFault) return fault(error.odooName, error.message);
          return fault("builtins.Exception", (error as Error).message);
        }
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(port, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private dispatch(call: FakeCall): unknown {
    this.calls.push(call);
    for (const handler of [...this.handlers, defaultHandler]) {
      const result = handler(call, this);
      if (result !== NEXT) return result;
    }
    throw new OdooFault("builtins.Exception", `inattendu : ${call.model}.${call.method}`);
  }
}
