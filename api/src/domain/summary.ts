// domain/summary.ts — Synthèse des heures ventilées. Aucun terme Odoo.

import type { HoursStatus } from "./attendance.js";
import type { Ref } from "./tree.js";

/** Axes de regroupement, du plus large au plus fin. */
export const SUMMARY_DIMENSIONS = ["pole", "department", "employee", "period", "week", "weekday"] as const;
export type SummaryDimension = (typeof SUMMARY_DIMENSIONS)[number];

export const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;

/** Une valeur de regroupement ; null = « Aucun ». */
export interface SummaryKey {
  dimension: SummaryDimension;
  value: number | string | null;
}

export interface SummaryTotals {
  worked: number;
  day: number;
  night: number;
  overtime25: number;
  overtime50: number;
  sunday: number;
  publicHoliday: number;
  meals: number;
  daysBreakArrival: number;
  daysTransportArrival: number;
  daysBreakDeparture: number;
  daysTransportDeparture: number;
}

export const TOTAL_KEYS = [
  "worked",
  "day",
  "night",
  "overtime25",
  "overtime50",
  "sunday",
  "publicHoliday",
  "meals",
  "daysBreakArrival",
  "daysTransportArrival",
  "daysBreakDeparture",
  "daysTransportDeparture",
] as const satisfies readonly (keyof SummaryTotals)[];

export const emptyTotals = (): SummaryTotals => ({
  worked: 0,
  day: 0,
  night: 0,
  overtime25: 0,
  overtime50: 0,
  sunday: 0,
  publicHoliday: 0,
  meals: 0,
  daysBreakArrival: 0,
  daysTransportArrival: 0,
  daysBreakDeparture: 0,
  daysTransportDeparture: 0,
});

export interface SummaryGroup {
  key: SummaryKey;
  label: string;
  count: number;
  totals: SummaryTotals;
}

export interface SummaryGroupsParams {
  /** Regroupements déjà ouverts, du plus large au plus fin */
  path: SummaryKey[];
  dimension: SummaryDimension;
  status?: HoursStatus;
}

export interface SummaryLinesParams {
  path: SummaryKey[];
  status?: HoursStatus;
}

export interface SummaryLine {
  id: number;
  employee: Ref;
  checkIn: string;
  checkOut: string;
  weekday: string;
  slot: string | null;
  serviceType: string | null;
  slotStart: number | null;
  slotEnd: number | null;
  totals: SummaryTotals;
  hoursStatus: HoursStatus | null;
}
