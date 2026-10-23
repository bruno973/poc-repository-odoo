// features/timesheet/MyTimesheetPage.tsx — « Mes présences » : mes pointages ventilés par
// période puis par semaine, avec totaux (reprise de la page portail de leila_hr).
// Heures affichées dans le fuseau de l'employé ; aucune donnée d'un autre employé n'est
// demandée : l'API ne sert que celles de l'utilisateur connecté.

import { useState } from "react";
import { api } from "../../app/api-client.js";
import { useApi } from "../../app/useApi.js";
import { Banner } from "../../layout/AppShell.js";
import { hm } from "../../lib/format.js";
import type { HoursBreakdown, MyTimesheet, TimesheetDay } from "../../types/domain.js";

const HOURS: { key: keyof HoursBreakdown; label: string }[] = [
  { key: "day", label: "H. jour" },
  { key: "night", label: "H. nuit" },
  { key: "overtime25", label: "HS 25 %" },
  { key: "overtime50", label: "HS 50 %" },
  { key: "publicHoliday", label: "H. fériées" },
  { key: "sunday", label: "H. dimanche" },
];
const FLAGS: { key: keyof NonNullable<TimesheetDay["flags"]>; label: string }[] = [
  { key: "breakEntry", label: "Arrivée de break" },
  { key: "transportArrival", label: "Transport arrivée" },
  { key: "transportDeparture", label: "Transport départ" },
  { key: "breakExit", label: "Départ en break" },
];

export function MyTimesheetPage() {
  const sheet = useApi((signal) => api.get<MyTimesheet>("/api/me/timesheet", {}, signal), []);
  const [period, setPeriod] = useState("all");
  if (sheet.error) return <Banner>{sheet.error}</Banner>;
  if (!sheet.data) return <p className="muted">Chargement…</p>;
  const t = sheet.data;
  const full = t.detail === "full";
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: t.timezone, hour: "2-digit", minute: "2-digit" });
  const date = (d: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${d}T00:00:00Z`));
  const columns = 4 + (full ? HOURS.length + FLAGS.length : 0) + 1;
  const shown = t.periods.filter((p) => period === "all" || p.label === period);

  const totals = (key: string, label: string, worked: number, hours: HoursBreakdown | null, className: string) => (
    <tr key={key} className={className}>
      <td colSpan={4} className="is-right">
        {label}
      </td>
      {full && HOURS.map((h) => <td key={h.key} className="is-num num">{hm(hours?.[h.key] ?? 0)}</td>)}
      {full && <td colSpan={FLAGS.length} />}
      <td className="is-num num">{hm(full ? (hours?.total ?? 0) : worked)}</td>
    </tr>
  );

  return (
    <>
      <div className="head">
        <h1>Mes pointages</h1>
        {t.employee && <span className="muted">{t.employee.label}</span>}
      </div>
      {!t.employee && <p className="banner is-error">Aucune fiche employé n'est liée à ton compte : demande à ton service RH de la relier.</p>}
      {!full && t.periods.length > 0 && (
        <p className="banner">Le détail des heures (jour, nuit, supplémentaires…) n'est pas encore accessible à ton compte : seules les heures pointées sont affichées.</p>
      )}
      <div className="toolbar">
        <label className="field__label" htmlFor="period">
          Période
        </label>
        <select id="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="all">Afficher tout</option>
          {t.periods.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="muted">
          Heures affichées en {t.timezone}
          {t.timezoneFallback ? " (fuseau non configuré sur ton compte)" : ""}
        </span>
      </div>
      <div className="card table-wrap">
        <table className="grid timesheet">
          <thead>
            <tr>
              <th>Jour</th>
              <th>Date</th>
              <th>Arrivée</th>
              <th>Départ</th>
              {full && HOURS.map((h) => <th key={h.key} className="is-num">{h.label}</th>)}
              {full && FLAGS.map((f) => <th key={f.key} className="is-center">{f.label}</th>)}
              <th className="is-num">Total h.</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns} className="empty">
                  Aucun pointage.
                </td>
              </tr>
            )}
            {shown.map((p) => [
              <tr key={`p:${p.label}`} className="timesheet__period">
                <td colSpan={columns}>Période : {p.label}</td>
              </tr>,
              ...p.weeks.flatMap((w, wi) => [
                <tr key={`w:${p.label}:${wi}`} className="timesheet__week">
                  <td colSpan={columns}>{w.label}</td>
                </tr>,
                ...w.days.map((d) => (
                  <tr key={d.attendanceId}>
                    <td>{d.dayName}</td>
                    <td className="num">{date(d.date)}</td>
                    <td className="num">{time.format(new Date(d.checkIn))}</td>
                    <td className="num">{d.checkOut ? time.format(new Date(d.checkOut)) : "—"}</td>
                    {full && HOURS.map((h) => <td key={h.key} className="is-num num">{d.hours ? hm(d.hours[h.key]) : ""}</td>)}
                    {full && FLAGS.map((f) => <td key={f.key} className="is-center">{d.flags?.[f.key] ? "✔" : ""}</td>)}
                    <td className="is-num num">{hm(full && d.hours ? d.hours.total : d.workedHours)}</td>
                  </tr>
                )),
                totals(`wt:${p.label}:${wi}`, "Total semaine :", w.workedHours, w.totals, "timesheet__total"),
              ]),
              totals(`pt:${p.label}`, "Total période :", p.workedHours, p.totals, "timesheet__total timesheet__total--period"),
            ])}
          </tbody>
        </table>
      </div>
      {t.truncated && <p className="muted">Seuls les pointages les plus récents sont affichés.</p>}
    </>
  );
}
