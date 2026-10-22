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
