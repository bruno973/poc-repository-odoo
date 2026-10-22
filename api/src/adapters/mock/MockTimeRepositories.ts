// adapters/mock/MockTimeRepositories.ts
// Pointages et synthèse en mémoire, générés pour les employés des fixtures.
// Même contrat que l'adapter Odoo (cf. test/contract.ts). Calcul volontairement
// simplifié : une ligne de ventilation par pointage, seuils hebdo 35 h / 43 h.
// Aucun terme Odoo.

import type { AttendanceRepository } from "../../domain/AttendanceRepository.js";
import type {
  Attendance,
  AttendanceListParams,
  AttendancePage,
  AttendancePatch,
  CheckInCommand,
  CheckOutCommand,
  HoursStatus,
  Movements,
} from "../../domain/attendance.js";
import { AttendancePageSchema, AttendanceSchema } from "../../domain/attendance.schema.js";
import { DomainError } from "../../domain/errors.js";
import type { SummaryRepository } from "../../domain/SummaryRepository.js";
import {
  TOTAL_KEYS,
  WEEKDAYS,
  emptyTotals,
  type SummaryDimension,
  type SummaryGroup,
  type SummaryGroupsParams,
  type SummaryKey,
  type SummaryLine,
  type SummaryLinesParams,
} from "../../domain/summary.js";
import { SummaryGroupSchema, SummaryLineSchema } from "../../domain/summary.schema.js";
import type { DepartmentNode, EmployeeSummary, ViewerContext } from "../../domain/tree.js";
import { DEPARTMENTS, RECORDS, SUMMARIES } from "./fixtures.js";
import { attendanceCapabilitiesFor, attendanceScope, canPunchFor } from "./rights.js";

// La hiérarchie (manager) n'est pas modifiable dans le mock : les fixtures suffisent.
const forbidden = (message: string) => new DomainError(message, "forbidden");

const HOUR = 3_600_000;
const OFFSET_MS = -3 * HOUR; // America/Cayenne, UTC-3, sans heure d'été
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

interface StoredAttendance {
  id: number;
  employeeId: number;
  checkIn: number; // ms UTC
  checkOut: number | null;
  movements: Movements;
  hoursStatus: HoursStatus;
}

type Keys = Record<SummaryDimension, { value: number | string | null; label: string }>;
interface Line extends SummaryLine {
  keys: Keys;
}

/** État partagé par les deux repositories : un pointage modifié se voit dans la synthèse. */
export class MockTimeStore {
  attendances: StoredAttendance[] = [];
  lines: Line[] = [];
  private seq = 0;

  constructor(now: Date = new Date()) {
    this.seed(now);
    this.rebuildLines();
  }

  nextId(): number {
    return ++this.seq;
  }

  employee(id: number): EmployeeSummary {
    const e = SUMMARIES.find((x) => x.id === id);
    if (!e) throw new DomainError(`Employé ${id} introuvable.`, "not_found");
    return e;
  }

  openFor(employeeId: number): StoredAttendance | null {
    return this.attendances.find((a) => a.employeeId === employeeId && a.checkOut === null) ?? null;
  }

  rebuildLines(): void {
    const closed = this.attendances.filter((a) => a.checkOut !== null).sort((a, b) => a.checkIn - b.checkIn);
    const weekly = new Map<string, number>();
    this.lines = closed.map((a) => {
      const checkOut = a.checkOut as number;
      const emp = this.employee(a.employeeId);
      const pole = parentOf(emp.department?.id ?? null);
      const start = local(a.checkIn);
      const worked = (checkOut - a.checkIn) / HOUR;
      const night = nightOverlap(a.checkIn, checkOut);
      const weekday = (start.getUTCDay() + 6) % 7; // lundi = 0
      const monday = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - weekday));
      const sunday = new Date(monday.getTime() + 6 * 24 * HOUR);
      const weekKey = `${emp.id}-${monday.toISOString().slice(0, 10)}`;
      const before = weekly.get(weekKey) ?? 0;
      const after = before + worked;
      weekly.set(weekKey, after);
      const flag = (b: boolean) => (b ? 1 : 0);
      const weekLabel = `S${isoWeek(start)} - ${fmtShort(monday)}-${fmtShort(sunday)}`;
      return {
        id: a.id,
        employee: { id: emp.id, label: emp.fullName },
        checkIn: new Date(a.checkIn).toISOString(),
        checkOut: new Date(checkOut).toISOString(),
        weekday: WEEKDAYS[weekday] ?? "",
        slot: night > 0 ? "Poste de nuit" : "Journée",
        serviceType: "Heures normales",
        slotStart: night > 0 ? 21 : 7,
        slotEnd: night > 0 ? 5 : 15.5,
        hoursStatus: a.hoursStatus,
        totals: {
          ...emptyTotals(),
          worked,
          night,
          day: worked - night,
          overtime25: Math.max(0, Math.min(after, 43) - Math.max(before, 35)),
          overtime50: Math.max(0, after - Math.max(before, 43)),
          sunday: weekday === 6 ? worked : 0,
          meals: a.movements.meals,
          daysBreakArrival: flag(a.movements.breakArrival),
          daysTransportArrival: flag(a.movements.transportArrival),
          daysBreakDeparture: flag(a.movements.breakDeparture),
          daysTransportDeparture: flag(a.movements.transportDeparture),
        },
        keys: {
          pole: pole ? { value: pole.id, label: pole.name } : { value: null, label: "Aucun" },
          department: emp.department ? { value: emp.department.id, label: emp.department.label } : { value: null, label: "Aucun" },
          employee: { value: emp.id, label: emp.fullName },
          period: { value: start.getUTCFullYear() * 100 + start.getUTCMonth() + 1, label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}` },
          week: { value: weekLabel, label: weekLabel },
          weekday: { value: String(weekday), label: WEEKDAYS[weekday] ?? "" },
        },
      };
    });
  }

  private seed(now: Date): void {
    const random = mulberry32(973);
    const today = local(now.getTime());
    for (const emp of SUMMARIES) {
      for (let daysAgo = 35; daysAgo >= 1; daysAgo--) {
        const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysAgo));
        const weekday = (day.getUTCDay() + 6) % 7;
        if (weekday >= 5 || random() < 0.06) continue;
        const startHour = 6.75 + random() * 0.75;
        const duration = 7.5 + random() * 2.5;
        const checkIn = Math.round((day.getTime() - OFFSET_MS + startHour * HOUR) / 1000) * 1000;
        const roll = random();
        this.attendances.push({
          id: this.nextId(),
          employeeId: emp.id,
          checkIn,
          checkOut: Math.round((checkIn + duration * HOUR) / 1000) * 1000,
          movements: {
            transportArrival: weekday === 0 && random() < 0.4,
            transportDeparture: weekday === 4 && random() < 0.4,
            breakArrival: random() < 0.08,
            breakDeparture: random() < 0.08,
            meals: random() < 0.3 ? 1 : 0,
          },
          hoursStatus: roll < 0.85 ? "approved" : roll < 0.95 ? "to_approve" : "refused",
        });
      }
    }
  }
}

export class MockAttendanceRepository implements AttendanceRepository {
  constructor(private readonly store: MockTimeStore) {}

  async listAttendances(params: AttendanceListParams, viewer: ViewerContext): Promise<AttendancePage> {
    const inScope = attendanceScope(viewer, RECORDS);
    const rows = this.store.attendances
      .filter((a) => inScope(a.employeeId))
      .filter((a) => params.employeeId === undefined || a.employeeId === params.employeeId)
      .filter((a) => !params.onlyWithWorkedHours || worked(a) > 0.001)
      .filter((a) => params.status === undefined || a.hoursStatus === params.status)
      .sort((a, b) => b.checkIn - a.checkIn || b.id - a.id);
    return AttendancePageSchema.parse({
      total: rows.length,
      items: rows.slice(params.offset, params.offset + params.limit).map((a) => this.toAttendance(a, viewer)),
    });
  }

  async getOpenAttendance(employeeId: number, viewer: ViewerContext): Promise<Attendance | null> {
    this.store.employee(employeeId);
    const open = this.store.openFor(employeeId);
    return open && attendanceScope(viewer, RECORDS)(employeeId) ? this.toAttendance(open, viewer) : null;
  }

  async checkIn(command: CheckInCommand, viewer: ViewerContext): Promise<Attendance> {
    this.store.employee(command.employeeId);
    if (!canPunchFor(viewer, command.employeeId, RECORDS)) throw forbidden("Tu ne peux pas pointer pour cet employé.");
    if (this.store.openFor(command.employeeId)) {
      throw new DomainError("Cet employé a déjà une arrivée en cours : pointe d'abord son départ.", "conflict");
    }
    const record: StoredAttendance = {
      id: this.store.nextId(),
      employeeId: command.employeeId,
      checkIn: parseTime(command.at),
      checkOut: null,
      movements: {
        breakArrival: command.movements?.breakArrival ?? false,
        transportArrival: command.movements?.transportArrival ?? false,
        breakDeparture: false,
        transportDeparture: false,
        meals: 0,
      },
      hoursStatus: "approved",
    };
    this.store.attendances.push(record);
    return this.toAttendance(record, viewer);
  }

  async checkOut(command: CheckOutCommand, viewer: ViewerContext): Promise<Attendance> {
    if (!canPunchFor(viewer, command.employeeId, RECORDS)) throw forbidden("Tu ne peux pas pointer pour cet employé.");
    const open = this.store.openFor(command.employeeId);
    if (!open) throw new DomainError("Aucune arrivée en cours pour cet employé.", "conflict");
    const at = parseTime(command.at);
    if (at < open.checkIn) throw new DomainError("Le départ ne peut pas précéder l'arrivée.", "business_rule");
    open.checkOut = at;
    applyMovements(open.movements, command.movements ?? {});
    this.store.rebuildLines();
    return this.toAttendance(open, viewer);
  }

  async updateAttendance(id: number, patch: AttendancePatch, viewer: ViewerContext): Promise<Attendance> {
    const record = this.find(id);
    if (!this.caps(record, viewer).canEdit) throw forbidden("Tu n'as pas le droit de modifier ce pointage.");
    const checkIn = patch.checkIn !== undefined ? parseTime(patch.checkIn) : record.checkIn;
    const checkOut =
      patch.checkOut === undefined ? record.checkOut : patch.checkOut === null ? null : parseTime(patch.checkOut);
    if (checkOut !== null && checkOut < checkIn) {
      throw new DomainError("Le départ ne peut pas précéder l'arrivée.", "business_rule");
    }
    const meals = patch.movements?.meals;
    if (meals !== undefined && (meals < 0 || meals > 3)) {
      throw new DomainError("Le nombre de repas doit être compris entre 0 et 3.", "business_rule");
    }
    record.checkIn = checkIn;
    record.checkOut = checkOut;
    applyMovements(record.movements, patch.movements ?? {});
    this.store.rebuildLines();
    return this.toAttendance(record, viewer);
  }

  async approveHours(id: number, viewer: ViewerContext): Promise<Attendance> {
    return this.setStatus(id, "approved", viewer);
  }

  async refuseHours(id: number, viewer: ViewerContext): Promise<Attendance> {
    return this.setStatus(id, "refused", viewer);
  }

  private setStatus(id: number, status: HoursStatus, viewer: ViewerContext): Attendance {
    const record = this.find(id);
    if (!this.caps(record, viewer).canApprove) throw forbidden("Tu n'as pas le droit d'approuver ces heures.");
    record.hoursStatus = status;
    this.store.rebuildLines();
    return this.toAttendance(record, viewer);
  }

  private caps(a: StoredAttendance, viewer: ViewerContext) {
    return attendanceCapabilitiesFor(viewer, a.employeeId, RECORDS);
  }

  private find(id: number): StoredAttendance {
    const record = this.store.attendances.find((a) => a.id === id);
    if (!record) throw new DomainError(`Pointage ${id} introuvable.`, "not_found");
    return record;
  }

  private toAttendance(a: StoredAttendance, viewer: ViewerContext): Attendance {
    const emp = this.store.employee(a.employeeId);
    return AttendanceSchema.parse({
      id: a.id,
      employee: { id: emp.id, label: emp.fullName },
      checkIn: new Date(a.checkIn).toISOString(),
      checkOut: a.checkOut === null ? null : new Date(a.checkOut).toISOString(),
      workedHours: worked(a),
      movements: { ...a.movements },
      hoursStatus: a.hoursStatus,
      capabilities: this.caps(a, viewer),
    });
  }
}

export class MockSummaryRepository implements SummaryRepository {
  constructor(private readonly store: MockTimeStore) {}

  async getGroups(params: SummaryGroupsParams, viewer: ViewerContext): Promise<SummaryGroup[]> {
    const groups = new Map<string, SummaryGroup>();
    for (const line of this.filter(params.path, params.status, viewer)) {
      const k = line.keys[params.dimension];
      const id = String(k.value);
      let group = groups.get(id);
      if (!group) {
        group = { key: { dimension: params.dimension, value: k.value }, label: k.label, count: 0, totals: emptyTotals() };
        groups.set(id, group);
      }
      group.count++;
      for (const key of TOTAL_KEYS) group.totals[key] += line.totals[key];
    }
    return [...groups.values()]
      .sort((a, b) => compareGroups(a, b, params.dimension))
      .map((g) => SummaryGroupSchema.parse(g));
  }

  async getLines(params: SummaryLinesParams, viewer: ViewerContext): Promise<SummaryLine[]> {
    return this.filter(params.path, params.status, viewer).map(({ keys: _keys, ...line }) => SummaryLineSchema.parse(line));
  }

  private filter(path: SummaryKey[], status: HoursStatus | undefined, viewer: ViewerContext): Line[] {
    const inScope = attendanceScope(viewer, RECORDS);
    return this.store.lines.filter(
      (line) =>
        inScope(line.employee.id) &&
        (status === undefined || line.hoursStatus === status) &&
        path.every((key) => String(line.keys[key.dimension].value) === String(key.value)),
    );
  }
}

// ─── utilitaires ───────────────────────────────────────────────────────────────

function parentOf(departmentId: number | null): DepartmentNode | null {
  if (departmentId === null) return null;
  const visit = (nodes: DepartmentNode[], parent: DepartmentNode | null): DepartmentNode | null | undefined => {
    for (const node of nodes) {
      if (node.id === departmentId) return parent;
      const found = visit(node.children, node);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return visit(DEPARTMENTS, null) ?? null;
}

function applyMovements(target: Movements, patch: Partial<Movements>): void {
  if (patch.breakArrival !== undefined) target.breakArrival = patch.breakArrival;
  if (patch.breakDeparture !== undefined) target.breakDeparture = patch.breakDeparture;
  if (patch.transportArrival !== undefined) target.transportArrival = patch.transportArrival;
  if (patch.transportDeparture !== undefined) target.transportDeparture = patch.transportDeparture;
  if (patch.meals !== undefined) target.meals = patch.meals;
}

function compareGroups(a: SummaryGroup, b: SummaryGroup, dimension: SummaryDimension): number {
  if (a.key.value === null) return -1;
  if (b.key.value === null) return 1;
  if (dimension === "period" || dimension === "weekday") return Number(a.key.value) - Number(b.key.value);
  return a.label.localeCompare(b.label);
}

function worked(a: StoredAttendance): number {
  return a.checkOut === null ? 0 : (a.checkOut - a.checkIn) / HOUR;
}

function parseTime(iso: string | undefined): number {
  if (!iso) return Math.round(Date.now() / 1000) * 1000;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) throw new DomainError(`Date invalide : ${iso}`, "invalid");
  return t;
}

function local(ms: number): Date {
  return new Date(ms + OFFSET_MS);
}

/** Heures passées entre 21 h et 6 h, heure locale. */
function nightOverlap(start: number, end: number): number {
  let total = 0;
  const first = local(start);
  const day0 = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()) - OFFSET_MS;
  for (let d = day0 - 24 * HOUR; d < end; d += 24 * HOUR) {
    total += Math.max(0, Math.min(end, d + 30 * HOUR) - Math.max(start, d + 21 * HOUR));
  }
  return total / HOUR;
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

function fmtShort(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCFullYear()).slice(2)}`;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

