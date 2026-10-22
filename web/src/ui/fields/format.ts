// ui/fields/format.ts — Affichage d'une valeur selon son TYPE Leila (jamais selon le champ).

import type { FieldDescriptor, FieldValue } from "@leila/ui-schema";
import { DISPLAY_TZ } from "../../lib/format.js";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: DISPLAY_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatValue(d: FieldDescriptor, value: FieldValue | undefined, values: Readonly<Record<string, FieldValue>> = {}): string {
  if (value === null || value === undefined) return "";
  switch (d.type) {
    case "boolean":
      return value === true ? "Oui" : "Non";
    case "integer":
      return typeof value === "number" ? value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : "";
    case "decimal": {
      if (d.format === "duration" && typeof value === "number") return hours(value);
      const digits = d.digits?.[1] ?? 2;
      return typeof value === "number" ? value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "";
    }
    case "money": {
      const currency = d.currencyField ? values[d.currencyField] : null;
      const label = currency && typeof currency === "object" && !Array.isArray(currency) ? currency.label : "";
      return typeof value === "number" ? `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label}`.trim() : "";
    }
    case "selection":
      return d.options?.find((o) => o.value === value)?.label ?? String(value);
    case "date":
      return typeof value === "string" ? dateFmt.format(new Date(`${value}T00:00:00Z`)) : "";
    case "datetime":
      return typeof value === "string" ? dateTimeFmt.format(new Date(value)).replace(",", "") : "";
    case "reference":
      return typeof value === "object" && !Array.isArray(value) ? value.label : "";
    case "unsupported":
      return Array.isArray(value) ? `${value.length} élément${value.length > 1 ? "s" : ""}` : "";
    default:
      return typeof value === "string" ? value : String(value);
  }
}

/** 7.5 → "07:30" (durée en heures, comme le widget float_time d'origine). */
export function hours(value: number): string {
  const sign = value < 0 ? "-" : "";
  const total = Math.round(Math.abs(value) * 60);
  return `${sign}${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "07:30" ou "7,5" → 7.5 ; null si illisible. */
export function parseHours(text: string): number | null {
  const t = text.trim();
  const hm = /^(-?)(\d{1,4}):([0-5]\d)$/.exec(t);
  if (hm) return (hm[1] ? -1 : 1) * (Number(hm[2]) + Number(hm[3]) / 60);
  const n = Number(t.replace(",", "."));
  return t !== "" && Number.isFinite(n) ? n : null;
}
