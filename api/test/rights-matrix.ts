// test/rights-matrix.ts — Matrice de scénarios de droits (§ 4.3 du cahier de dev).
//
// Chaque scénario est rejoué par HTTP, de bout en bout, dans les deux modes :
//  - shared : viewer déclaré par en-têtes x-viewer-* (comptes Odoo partagés) ;
//  - session : connexion avec les identifiants du profil (identité réelle).
// Le résultat observé est comparé à l'attendu, CONSTATÉ dans Odoo (tâche T-03) et
// fourni par la configuration. Rien n'est déduit ici : un attendu absent n'est
// pas compté.

import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { Tracer } from "../src/app/trace.js";
import type { ViewerRole } from "../src/domain/tree.js";

export type Mode = "shared" | "session";
export type ProfileId = "p.admin" | "p.manager" | "p.validateur" | "p.employe" | "p.autre_societe";

export interface ProfileConfig {
  login: string;
  /** Variable d'environnement qui contient le mot de passe (jamais le mot de passe lui-même) */
  passwordEnv: string;
  /** Viewer déclaré en mode partagé */
  shared: { role: ViewerRole; id: number; employeeId?: number; departmentId?: number };
}

export interface MatrixConfig {
  target: string;
  profiles: Partial<Record<ProfileId, ProfileConfig>>;
  data: {
    /** Équipe de p.manager */
    teamEmployeeIds: number[];
    managerEmployeeId?: number;
    employeEmployeeId?: number;
    /** Collègue de p.employe (S-07, S-12) */
    colleagueEmployeeId?: number;
    /** Employés que p.validateur valide / ne valide pas (S-04) */
    validatedEmployeeId?: number;
    notValidatedEmployeeId?: number;
    /** Employé hors de l'équipe de p.manager (S-10) */
    outsideTeamEmployeeId?: number;
    /** Pointage d'une période clôturée, et son employé (S-11) */
    closedAttendance?: { id: number; employeeId: number };
    /** Employés de la société B (S-09) */
    companyBEmployeeIds?: number[];
  };
  /** Résultat attendu, constaté dans Odoo (T-03) */
  expected: Partial<Record<ScenarioId, string>>;
}

export type ScenarioId =
  | "S-01" | "S-02" | "S-03" | "S-04" | "S-05" | "S-06" | "S-07" | "S-07b" | "S-08" | "S-09" | "S-10" | "S-11" | "S-12";

/** Attendus du cahier de dev quand ils ne dépendent pas de la base (sinon : configuration). */
export const DEFAULT_EXPECTED: Partial<Record<ScenarioId, string>> = {
  "S-01": "équipe seulement",
  "S-02": "équipe seulement",
  "S-03": "refusé",
  "S-04": "autorisé | refusé",
  "S-06": "aucun",
  "S-07": "absentes",
  "S-07b": "absent",
  "S-09": "société B seulement",
  "S-10": "refusé",
  "S-11": "refusé",
  "S-12": "ignoré",
};

export interface Observation {
  observed: string;
  ms: number;
  detail?: string;
}

export interface ScenarioResult {
  id: ScenarioId;
  profile: ProfileId | "tout profil";
  action: string;
  expected: string | null;
  shared: Observation;
  session: Observation;
}

export interface MatrixResults {
  generatedAt: string;
  target: string;
  writes: boolean;
  scenarios: ScenarioResult[];
  latency: Record<Mode, LatencyReport>;
}

export interface LatencyReport {
  /** P95 par opération de port (ms) */
  p95ByPort: Record<string, number>;
  calls: number;
  /** Temps passé dans has_access par ouverture de fiche (ms) */
  hasAccessPerSheet: { samples: number; mean: number; max: number };
}

// ─── Client HTTP par profil et par mode ─────────────────────────────────────

class ProfileClient {
  constructor(
    private readonly app: FastifyInstance,
    private readonly auth: Record<string, string>,
  ) {}

  request(method: "GET" | "POST" | "PATCH", url: string, payload?: unknown, extra: Record<string, string> = {}) {
    return this.app.inject({
      method,
      url,
      headers: { ...this.auth, ...extra },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  }
  get(url: string, extra?: Record<string, string>) {
    return this.request("GET", url, undefined, extra);
  }
}

async function clientFor(
  mode: Mode,
  app: FastifyInstance,
  profile: ProfileConfig,
  env: NodeJS.ProcessEnv,
): Promise<ProfileClient> {
  if (mode === "shared") {
    const s = profile.shared;
    return new ProfileClient(app, {
      "x-viewer-id": String(s.id),
      "x-viewer-role": s.role,
      ...(s.employeeId !== undefined ? { "x-viewer-employee-id": String(s.employeeId) } : {}),
      ...(s.departmentId !== undefined ? { "x-viewer-department-id": String(s.departmentId) } : {}),
    });
  }
  const password = env[profile.passwordEnv];
  if (!password) throw new Error(`Mot de passe absent : ${profile.passwordEnv}`);
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { login: profile.login, password },
    remoteAddress: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`,
  });
  if (res.statusCode !== 204) throw new Error(`Connexion refusée pour ${profile.login} (${res.statusCode})`);
  const cookie = String(res.headers["set-cookie"]).split(";")[0] ?? "";
  return new ProfileClient(app, { cookie });
}

// ─── Normalisation des observations ─────────────────────────────────────────

/** Bouton/champ affiché ? Action acceptée ? → vocabulaire de la matrice. */
function verdict(shown: boolean, status?: number): string {
  if (status === undefined) return shown ? "autorisé (affiché)" : "refusé";
  const ok = status >= 200 && status < 300;
  if (shown && ok) return "autorisé";
  if (!shown && !ok) return "refusé";
  if (shown && !ok) return `affiché puis ${status}`;
  return "masqué mais accepté";
}

function scope(ids: number[], allowed: number[], none = "vide", only = "équipe seulement"): string {
  if (ids.length === 0) return none;
  return ids.every((id) => allowed.includes(id)) ? only : "inclut hors périmètre";
}

const body = <T>(res: LightMyRequestResponse) => res.json() as T;

interface Leaf {
  key: string;
  kind: string;
  value: unknown;
  editable?: boolean;
  children?: Leaf[];
}
function leaves(res: LightMyRequestResponse): Leaf[] {
  if (res.statusCode !== 200) return [];
  const out: Leaf[] = [];
  const walk = (nodes: Leaf[]) => nodes.forEach((n) => (n.kind === "group" ? walk(n.children ?? []) : out.push(n)));
  walk(body<{ formTree: Leaf[] }>(res).formTree);
  return out;
}

interface AttendanceDto {
  id: number;
  employee: { id: number };
  movements: Record<string, boolean | number>;
  capabilities: { canEdit: boolean; canApprove: boolean };
}

async function attendancesOf(client: ProfileClient, employeeId: number): Promise<AttendanceDto[]> {
  const res = await client.get(`/api/attendances?employeeId=${employeeId}&limit=20`);
  return res.statusCode === 200 ? body<{ items: AttendanceDto[] }>(res).items : [];
}

/** Correction idempotente : réécrit la valeur actuelle d'un mouvement. */
async function correct(client: ProfileClient, a: AttendanceDto, writes: boolean): Promise<string> {
  if (!writes) return verdict(a.capabilities.canEdit);
  const res = await client.request("PATCH", `/api/attendances/${a.id}`, {
    movements: { breakArrival: Boolean(a.movements["breakArrival"]) },
  });
  return verdict(a.capabilities.canEdit, res.statusCode);
}

// ─── Scénarios ──────────────────────────────────────────────────────────────

interface Scenario {
  id: ScenarioId;
  profile: ProfileId;
  action: string;
  run(client: ProfileClient, cfg: MatrixConfig, writes: boolean): Promise<string>;
}

const PRIVATE_KEY = "infoPrivee.ssnId";

export const SCENARIOS: Scenario[] = [
  {
    id: "S-01",
    profile: "p.manager",
    action: "Lister les présences (Gestion)",
    async run(c, cfg) {
      const res = await c.get("/api/attendances?limit=200");
      if (res.statusCode !== 200) return `HTTP ${res.statusCode}`;
      const ids = [...new Set(body<{ items: AttendanceDto[] }>(res).items.map((a) => a.employee.id))];
      return scope(ids, [...cfg.data.teamEmployeeIds, ...(cfg.data.managerEmployeeId ? [cfg.data.managerEmployeeId] : [])]);
    },
  },
  {
    id: "S-02",
    profile: "p.manager",
    action: "Ouvrir la Synthèse",
    async run(c, cfg) {
      const res = await c.get("/api/summary/groups?dimension=employee");
      if (res.statusCode !== 200) return `HTTP ${res.statusCode}`;
      const ids = body<{ key: { value: unknown } }[]>(res).map((g) => Number(g.key.value)).filter(Number.isFinite);
      return scope(ids, [...cfg.data.teamEmployeeIds, ...(cfg.data.managerEmployeeId ? [cfg.data.managerEmployeeId] : [])]);
    },
  },
  {
    id: "S-03",
    profile: "p.employe",
    action: "Approuver ses propres heures",
    async run(c, cfg, writes) {
      const own = cfg.data.employeEmployeeId;
      if (own === undefined) return "non configuré";
      const a = (await attendancesOf(c, own))[0];
      if (!a) return "aucun pointage visible";
      if (!writes) return verdict(a.capabilities.canApprove);
      const res = await c.request("POST", `/api/attendances/${a.id}/approve`);
      return verdict(a.capabilities.canApprove, res.statusCode);
    },
  },
  {
    id: "S-04",
    profile: "p.validateur",
    action: "Corriger un pointage d'un employé validé / non validé",
    async run(c, cfg, writes) {
      const { validatedEmployeeId: yes, notValidatedEmployeeId: no } = cfg.data;
      if (yes === undefined || no === undefined) return "non configuré";
      const parts: string[] = [];
      for (const employeeId of [yes, no]) {
        const a = (await attendancesOf(c, employeeId))[0];
        parts.push(a ? await correct(c, a, writes) : "invisible");
      }
      return parts.join(" | ");
    },
  },
  {
    id: "S-05",
    profile: "p.manager",
    action: "Modifier l'intitulé de poste d'un membre de l'équipe",
    async run(c, cfg, writes) {
      const id = cfg.data.teamEmployeeIds[0];
      if (id === undefined) return "non configuré";
      const node = leaves(await c.get(`/api/employees/${id}`)).find((n) => n.key === "header.jobTitle");
      if (!node) return "champ absent";
      if (!writes) return verdict(Boolean(node.editable));
      const res = await c.request("PATCH", `/api/employees/${id}`, { "header.jobTitle": node.value ?? "" });
      return verdict(Boolean(node.editable), res.statusCode);
    },
  },
  {
    id: "S-06",
    profile: "p.employe",
    action: "Ouvrir sa fiche : champs modifiables",
    async run(c, cfg) {
      const own = cfg.data.employeEmployeeId;
      if (own === undefined) return "non configuré";
      const res = await c.get(`/api/employees/${own}`);
      if (res.statusCode !== 200) return `HTTP ${res.statusCode}`;
      const n = leaves(res).filter((l) => l.editable).length;
      return n === 0 ? "aucun" : `${n} modifiable(s)`;
    },
  },
  {
    id: "S-07",
    profile: "p.employe",
    action: "Ouvrir la fiche d'un collègue : données privées",
    async run(c, cfg) {
      const id = cfg.data.colleagueEmployeeId;
      if (id === undefined) return "non configuré";
      const res = await c.get(`/api/employees/${id}`);
      if (res.statusCode !== 200) return `fiche refusée (${res.statusCode}) : absentes`;
      return leaves(res).some((l) => l.key.startsWith("infoPrivee.")) ? "présentes" : "absentes";
    },
  },
  {
    id: "S-07b",
    profile: "p.manager",
    action: "Ouvrir la fiche d'un membre de l'équipe : contact d'urgence",
    async run(c, cfg) {
      const id = cfg.data.teamEmployeeIds[0];
      if (id === undefined) return "non configuré";
      return leaves(await c.get(`/api/employees/${id}`)).some((l) => l.key === "infoPrivee.emergencyContact") ? "présent" : "absent";
    },
  },
  {
    id: "S-08",
    profile: "p.manager",
    action: "Lire le n° de sécurité sociale d'un membre de l'équipe",
    async run(c, cfg) {
      const id = cfg.data.teamEmployeeIds[0];
      if (id === undefined) return "non configuré";
      const node = leaves(await c.get(`/api/employees/${id}`)).find((l) => l.key === PRIVATE_KEY);
      return node && node.value !== null ? "lisible" : "absent";
    },
  },
  {
    id: "S-09",
    profile: "p.autre_societe",
    action: "Lister les employés",
    async run(c, cfg) {
      const allowed = cfg.data.companyBEmployeeIds;
      if (!allowed) return "non configuré";
      const res = await c.get("/api/employees?limit=200");
      if (res.statusCode !== 200) return `HTTP ${res.statusCode}`;
      return scope(body<{ items: { id: number }[] }>(res).items.map((e) => e.id), allowed, "vide", "société B seulement");
    },
  },
  {
    id: "S-10",
    profile: "p.manager",
    action: "Pointer pour un employé hors équipe",
    async run(c, cfg, writes) {
      const id = cfg.data.outsideTeamEmployeeId;
      if (id === undefined) return "non configuré";
      if (!writes) return "non exécuté (écritures désactivées)";
      const res = await c.request("POST", `/api/employees/${id}/check-in`, {});
      if (res.statusCode === 200) await c.request("POST", `/api/employees/${id}/check-out`, {});
      if (res.statusCode === 409) return "conflit (arrivée déjà ouverte)";
      return res.statusCode === 200 ? "autorisé" : "refusé";
    },
  },
  {
    id: "S-11",
    profile: "p.validateur",
    action: "Modifier un pointage d'une période clôturée",
    async run(c, cfg, writes) {
      const closed = cfg.data.closedAttendance;
      if (!closed) return "non configuré";
      const res = await c.get(`/api/attendances?employeeId=${closed.employeeId}&limit=200`);
      const a = res.statusCode === 200 ? body<{ items: AttendanceDto[] }>(res).items.find((x) => x.id === closed.id) : undefined;
      if (!a) return "invisible : refusé";
      return correct(c, a, writes);
    },
  },
  {
    id: "S-12",
    profile: "p.employe",
    action: "En-tête x-viewer-role: hr_admin forgé",
    async run(c, cfg) {
      const id = cfg.data.colleagueEmployeeId;
      if (id === undefined) return "non configuré";
      const forged = { "x-viewer-role": "hr_admin" };
      const res = await c.get(`/api/employees/${id}`, forged);
      return leaves(res).some((l) => l.key === PRIVATE_KEY) ? "accepté" : "ignoré";
    },
  },
];

// ─── Exécution ──────────────────────────────────────────────────────────────

export interface MatrixTarget {
  app: FastifyInstance;
  tracer: Tracer;
}

export async function runMatrix(
  cfg: MatrixConfig,
  targets: Record<Mode, MatrixTarget>,
  options: { env: NodeJS.ProcessEnv; writes: boolean },
): Promise<MatrixResults> {
  const clients = new Map<string, ProfileClient>();
  const client = async (mode: Mode, id: ProfileId) => {
    const key = `${mode}:${id}`;
    const profile = cfg.profiles[id];
    if (!profile) return null;
    if (!clients.has(key)) clients.set(key, await clientFor(mode, targets[mode].app, profile, options.env));
    return clients.get(key) ?? null;
  };

  const scenarios: ScenarioResult[] = [];
  for (const s of SCENARIOS) {
    const observe = async (mode: Mode): Promise<Observation> => {
      const c = await client(mode, s.profile);
      if (!c) return { observed: "profil non configuré", ms: 0 };
      const started = performance.now();
      try {
        return { observed: await s.run(c, cfg, options.writes), ms: Math.round(performance.now() - started) };
      } catch (error) {
        return { observed: "erreur", ms: Math.round(performance.now() - started), detail: (error as Error).message };
      }
    };
    scenarios.push({
      id: s.id,
      profile: s.id === "S-12" ? "tout profil" : s.profile,
      action: s.action,
      expected: cfg.expected[s.id] ?? DEFAULT_EXPECTED[s.id] ?? null,
      shared: await observe("shared"),
      session: await observe("session"),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    target: cfg.target,
    writes: options.writes,
    scenarios,
    latency: { shared: latency(targets.shared.tracer), session: latency(targets.session.tracer) },
  };
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

export function latency(tracer: Tracer): LatencyReport {
  const entries = tracer.recent(10_000);
  const byPort = new Map<string, number[]>();
  for (const e of entries) byPort.set(e.port, [...(byPort.get(e.port) ?? []), e.ms]);
  const sheets = entries
    .filter((e) => e.port === "EmployeeRepository.getEmployeeById" && e.ok)
    .map((e) => e.backend.filter((b) => b.call.endsWith(".has_access")).reduce((sum, b) => sum + b.ms, 0));
  return {
    p95ByPort: Object.fromEntries([...byPort].map(([port, ms]) => [port, p95(ms)])),
    calls: entries.length,
    hasAccessPerSheet: {
      samples: sheets.length,
      mean: sheets.length ? Math.round(sheets.reduce((a, b) => a + b, 0) / sheets.length) : 0,
      max: Math.max(0, ...sheets),
    },
  };
}

/** S-1 : scénarios corrects en identité réelle ; S-2 : scénarios où le mode partagé diffère de l'attendu. */
export function score(results: MatrixResults): { s1: number; s2: number; counted: number } {
  const counted = results.scenarios.filter((s) => s.expected !== null);
  const pct = (n: number) => (counted.length ? Math.round((n / counted.length) * 100) : 0);
  return {
    counted: counted.length,
    s1: pct(counted.filter((s) => s.session.observed === s.expected).length),
    s2: pct(counted.filter((s) => s.shared.observed !== s.expected).length),
  };
}
