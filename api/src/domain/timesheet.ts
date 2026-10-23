// domain/timesheet.ts — « Mes présences » : pointages de l'utilisateur connecté, ventilés
// (heures de jour, de nuit, supplémentaires…) et regroupés par période de clôture puis
// par semaine, avec totaux. Aucun terme d'ERP : l'adaptateur fournit des lignes neutres.

import type { Ref } from "./tree.js";

export interface HoursBreakdown {
  day: number;
  night: number;
  overtime25: number;
  overtime50: number;
  publicHoliday: number;
  sunday: number;
  total: number;
}

export interface TimesheetDay {
  attendanceId: number;
  /** Date locale (fuseau de l'employé), AAAA-MM-JJ */
  date: string;
  dayName: string;
  checkIn: string;
  checkOut: string | null;
  /** Heures pointées (toujours connues) */
  workedHours: number;
  /** Ventilation ; null si elle n'est pas lisible pour ce compte */
  hours: HoursBreakdown | null;
  flags: { breakEntry: boolean; transportArrival: boolean; transportDeparture: boolean; breakExit: boolean } | null;
}

export interface TimesheetWeek {
  label: string;
  days: TimesheetDay[];
  workedHours: number;
  totals: HoursBreakdown | null;
}

export interface TimesheetPeriod {
  label: string;
  weeks: TimesheetWeek[];
  workedHours: number;
  totals: HoursBreakdown | null;
}

export interface MyTimesheet {
  employee: Ref | null;
  timezone: string;
  /** Fuseau de l'utilisateur absent : fuseau par défaut de Leila */
  timezoneFallback: boolean;
  /** full : ventilation lue ; attendance-only : pointages seuls (droits de lecture manquants) */
  detail: "full" | "attendance-only";
  periods: TimesheetPeriod[];
  /** Plus de pointages que la limite : les plus anciens ne sont pas affichés */
  truncated: boolean;
}

/** Ventilation d'un pointage, telle que l'adaptateur la lit (une ou plusieurs lignes). */
export interface VentilationRow {
  periodLabel: string | null;
  weekNumber: number | null;
  weekLabel: string | null;
  dayName: string | null;
  hours: HoursBreakdown;
  flags: { breakEntry: boolean; transportArrival: boolean; transportDeparture: boolean; breakExit: boolean };
}

export interface AttendanceRow {
  id: number;
  checkIn: string;
  checkOut: string | null;
  workedHours: number;
  /** null : ventilation non lisible ; [] : pas encore ventilé */
  ventilations: VentilationRow[] | null;
}

const ZERO: HoursBreakdown = { day: 0, night: 0, overtime25: 0, overtime50: 0, publicHoliday: 0, sunday: 0, total: 0 };
const KEYS = Object.keys(ZERO) as (keyof HoursBreakdown)[];
const add = (a: HoursBreakdown, b: HoursBreakdown): HoursBreakdown => Object.fromEntries(KEYS.map((k) => [k, a[k] + b[k]])) as unknown as HoursBreakdown;

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/** Date locale AAAA-MM-JJ et jour de la semaine d'un instant dans un fuseau. */
export function localDay(iso: string, timeZone: string): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday };
}

/** Numéro de semaine ISO 8601 d'une date AAAA-MM-JJ. */
export function isoWeek(date: string): { year: number; week: number } {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // jeudi de la semaine
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { year, week };
}

const monthLabel = (date: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${date}T00:00:00Z`));

/**
 * Regroupe les pointages (du plus récent au plus ancien) par période puis par semaine, comme
 * la page portail d'origine : période et semaine de la première ventilation ; sans ventilation,
 * mois et semaine ISO de la date locale. Heures ventilées additionnées par pointage.
 */
export function buildTimesheet(rows: readonly AttendanceRow[], timeZone: string): TimesheetPeriod[] {
  const periods: TimesheetPeriod[] = [];
  const sorted = [...rows].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  for (const row of sorted) {
    const { date, weekday } = localDay(row.checkIn, timeZone);
    const first = row.ventilations?.[0];
    const hours = row.ventilations && row.ventilations.length > 0 ? row.ventilations.map((v) => v.hours).reduce(add, ZERO) : row.ventilations ? { ...ZERO } : null;
    const week = isoWeek(date);
    const periodLabel = first?.periodLabel ?? (row.ventilations === null ? monthLabel(date) : "Sans période");
    const weekLabel = first?.weekLabel ?? `Semaine ${week.week} (${week.year})`;
    const weekKey = first?.weekNumber != null ? `${first.weekNumber}` : `${week.year}-${week.week}`;
    const day: TimesheetDay = {
      attendanceId: row.id,
      date,
      dayName: first?.dayName ?? DAY_NAMES[weekday] ?? "-",
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      workedHours: row.workedHours,
      hours,
      flags: first ? { ...first.flags } : null,
    };
    let period = periods[periods.length - 1];
    if (!period || period.label !== periodLabel) {
      period = { label: periodLabel, weeks: [], workedHours: 0, totals: hours ? { ...ZERO } : null };
      periods.push(period);
    }
    let current = period.weeks[period.weeks.length - 1] as (TimesheetWeek & { key?: string }) | undefined;
    if (!current || current.key !== weekKey) {
      current = { label: weekLabel, days: [], workedHours: 0, totals: hours ? { ...ZERO } : null, key: weekKey };
      period.weeks.push(current);
    }
    current.days.push(day);
    current.workedHours += row.workedHours;
    period.workedHours += row.workedHours;
    if (hours) {
      current.totals = add(current.totals ?? ZERO, hours);
      period.totals = add(period.totals ?? ZERO, hours);
    }
  }
  // La clé de semaine est interne au regroupement
  for (const p of periods) for (const w of p.weeks) delete (w as TimesheetWeek & { key?: string }).key;
  return periods;
}
