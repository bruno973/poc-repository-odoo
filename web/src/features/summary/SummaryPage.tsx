// features/summary/SummaryPage.tsx — Synthèse des heures ventilées, en arbre dépliable.
// Un dépliage = un appel au port SummaryRepository (un read_group côté moteur).

import { useState } from "react";
import { api, ApiError } from "../../app/api-client.js";
import { useRouter, useSearchParams } from "../../app/router.js";
import { useApi } from "../../app/useApi.js";
import { Banner } from "../../layout/AppShell.js";
import { fmtDateTime, hm } from "../../lib/format.js";
import type { HoursStatus, SummaryDimension, SummaryGroup, SummaryKey, SummaryLine, SummaryTotals } from "../../types/domain.js";

const LABEL: Record<SummaryDimension, string> = {
  pole: "Pôle",
  department: "Service",
  employee: "Employé",
  period: "Période",
  week: "Semaine",
  weekday: "Jour",
};

const COLUMNS: { key: keyof SummaryTotals; label: string; hours: boolean }[] = [
  { key: "worked", label: "H. travaillées", hours: true },
  { key: "day", label: "H. jour", hours: true },
  { key: "night", label: "H. nuit", hours: true },
  { key: "overtime25", label: "H.S. 25 %", hours: true },
  { key: "overtime50", label: "H.S. 50 %", hours: true },
  { key: "sunday", label: "H. dimanche", hours: true },
  { key: "publicHoliday", label: "H. fériées", hours: true },
  { key: "meals", label: "Repas", hours: false },
  { key: "daysBreakArrival", label: "Jours arr. break", hours: false },
  { key: "daysTransportArrival", label: "Jours voy. arrivée", hours: false },
  { key: "daysBreakDeparture", label: "Jours dép. break", hours: false },
  { key: "daysTransportDeparture", label: "Jours voy. départ", hours: false },
];

const fmt = (c: (typeof COLUMNS)[number], v: number | undefined) => (c.hours ? hm(v ?? 0) : String(v ?? 0));
const STATUSES = ["approved", "to_approve", "refused"] as const;

export function SummaryPage() {
  const params = useSearchParams();
  const { navigate } = useRouter();
  const statusParam = params.get("statut") ?? "approved";
  const status: HoursStatus | undefined = STATUSES.find((s) => s === statusParam);
  const withWeek = params.get("semaine") === "1";
  const withDay = params.get("jour") === "1";
  const dimensions: SummaryDimension[] = [
    "pole",
    "department",
    "employee",
    "period",
    ...(withWeek ? (["week"] as const) : []),
    ...(withDay ? (["weekday"] as const) : []),
  ];

  const roots = useApi(
    (signal) => api.get<SummaryGroup[]>("/api/summary/groups", { dimension: dimensions[0], path: "[]", status }, signal),
    [status],
  );
  const [error, setError] = useState<string | null>(null);

  const go = (name: string, value: string | null) => {
    const q = new URLSearchParams(params);
    value === null ? q.delete(name) : q.set(name, value);
    navigate(`/synthese?${q}`);
  };

  const groups = roots.data ?? [];
  const grand: Record<string, number> = Object.fromEntries(
    COLUMNS.map((c) => [c.key, groups.reduce((acc, g) => acc + g.totals[c.key], 0)]),
  );

  return (
    <>
      <div className="head">
        <h1>Synthèse</h1>
        <select value={statusParam} onChange={(e) => go("statut", e.target.value)} aria-label="Statut des heures">
          <option value="approved">Heures approuvées</option>
          <option value="to_approve">Heures à approuver</option>
          <option value="refused">Heures refusées</option>
          <option value="tous">Tous les statuts</option>
        </select>
      </div>
      <p className="grouping">
        Regroupé par
        {dimensions.map((d, i) => (
          <span key={d}>
            {i > 0 && <span className="sep">› </span>}
            <strong>{LABEL[d]}</strong>
          </span>
        ))}
        <button type="button" className="link" onClick={() => go("semaine", withWeek ? null : "1")}>
          {withWeek ? "Retirer" : "Ajouter"} la semaine
        </button>
        <button type="button" className="link" onClick={() => go("jour", withDay ? null : "1")}>
          {withDay ? "Retirer" : "Ajouter"} le jour
        </button>
      </p>

      <Banner>{roots.error ?? error}</Banner>

      <div className="card table-wrap">
        <table className="grid tree">
          <thead>
            <tr>
              <th>{LABEL[dimensions[0] ?? "pole"]}</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="is-num">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          {/* Nouvelle clé quand les regroupements changent : les niveaux dépliés sont rechargés */}
          <tbody key={dimensions.join(">")}>
            {groups.map((g) => (
              <GroupRow
                key={String(g.key.value)}
                group={g}
                path={[g.key]}
                depth={0}
                dimensions={dimensions}
                status={status}
                onError={setError}
              />
            ))}
            {roots.data && groups.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="empty">
                  Aucune heure avec ce statut. Choisis « Tous les statuts » pour tout afficher.
                </td>
              </tr>
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr>
                <th>Total</th>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="is-num num">
                    {fmt(c, grand[c.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

interface RowProps {
  group: SummaryGroup;
  path: SummaryKey[];
  depth: number;
  dimensions: SummaryDimension[];
  status: HoursStatus | undefined;
  onError(message: string | null): void;
}

function GroupRow({ group, path, depth, dimensions, status, onError }: RowProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState<SummaryGroup[] | null>(null);
  const [lines, setLines] = useState<SummaryLine[] | null>(null);
  const next = dimensions[depth + 1];
  const indent = { paddingLeft: `${0.6 + depth * 1.2}rem` };

  const toggle = async () => {
    if (open) return setOpen(false);
    if (!children && !lines) {
      setLoading(true);
      try {
        const query = { path: JSON.stringify(path), status };
        if (next) setChildren(await api.get<SummaryGroup[]>("/api/summary/groups", { ...query, dimension: next }));
        else setLines(await api.get<SummaryLine[]>("/api/summary/lines", query));
        onError(null);
      } catch (e) {
        onError(e instanceof ApiError ? e.message : "Erreur inattendue.");
        return setLoading(false);
      }
      setLoading(false);
    }
    return setOpen(true);
  };

  return (
    <>
      <tr className={`group depth-${Math.min(depth, 4)}`}>
        <td style={indent}>
          <button type="button" className="toggle" aria-expanded={open} disabled={group.count === 0 || loading} onClick={() => void toggle()}>
            <span className="caret" aria-hidden="true">
              {group.count ? (open ? "▾" : "▸") : ""}
            </span>
            {group.label}
            <span className="count num">({group.count})</span>
          </button>
        </td>
        {COLUMNS.map((c) => (
          <td key={c.key} className="is-num num">
            {group.count ? fmt(c, group.totals[c.key]) : ""}
          </td>
        ))}
      </tr>
      {open &&
        children?.map((g) => (
          <GroupRow
            key={String(g.key.value)}
            group={g}
            path={[...path, g.key]}
            depth={depth + 1}
            dimensions={dimensions}
            status={status}
            onError={onError}
          />
        ))}
      {open &&
        lines?.map((l) => (
          <tr key={l.id} className="line">
            <td className="num" style={{ paddingLeft: `${0.6 + (depth + 1) * 1.2}rem` }}>
              {l.weekday} {fmtDateTime(l.checkIn)}
              {l.slot ? `  ·  ${l.slot}` : ""}
            </td>
            {COLUMNS.map((c) => (
              <td key={c.key} className="is-num num">
                {l.totals[c.key] ? fmt(c, l.totals[c.key]) : ""}
              </td>
            ))}
          </tr>
        ))}
    </>
  );
}
