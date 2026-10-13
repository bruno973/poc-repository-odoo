// web/src/lib/format.ts — Formats d'affichage, partagés entre le rendu serveur et
// les scripts du navigateur.
//
// Fuseau explicite : dans le conteneur Docker, le serveur Astro tourne en UTC.
// Sans ce paramètre, les heures rendues côté serveur seraient décalées de 3 h.
export const DISPLAY_TZ = "America/Cayenne";

/** 13.75 → "13:45", comme le widget float_time d'Odoo (dépasse 24 h sans souci). */
export function hm(hours: number | null | undefined): string {
  if (!hours) return "00:00";
  const total = Math.round(hours * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: DISPLAY_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const time = new Intl.DateTimeFormat("fr-FR", { timeZone: DISPLAY_TZ, hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (iso: string | null): string => (iso ? dateTime.format(new Date(iso)).replace(",", "") : "");
export const fmtTime = (iso: string): string => time.format(new Date(iso));

export function duration(fromIso: string, to: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((to.getTime() - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  return h ? `${h} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;
}

export const STATUS_LABEL: Record<string, string> = {
  to_approve: "À approuver",
  approved: "Approuvé",
  refused: "Refusé",
};
