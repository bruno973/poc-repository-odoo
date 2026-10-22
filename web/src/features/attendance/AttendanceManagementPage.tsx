// features/attendance/AttendanceManagementPage.tsx — Gestion : pointages, corrections, approbation.
// Interrupteurs et boutons suivent les capacités calculées par le moteur pour ce viewer.

import { useEffect, useState } from "react";
import { api, ApiError } from "../../app/api-client.js";
import { Link, useRouter, useSearchParams } from "../../app/router.js";
import { useApi } from "../../app/useApi.js";
import { Banner } from "../../layout/AppShell.js";
import { STATUS_LABEL, fmtDateTime, hm } from "../../lib/format.js";
import type { Attendance, AttendancePage, HoursStatus, Movements } from "../../types/domain.js";

const PAGE = 80;
const STATUSES = ["to_approve", "approved", "refused"] as const;
const MOVES = [
  { key: "breakArrival", label: "Arrivée de break" },
  { key: "breakDeparture", label: "Part en break" },
  { key: "transportArrival", label: "Arrivé en transport" },
  { key: "transportDeparture", label: "Départ en transport" },
] as const satisfies readonly { key: keyof Movements; label: string }[];

export function AttendanceManagementPage() {
  const params = useSearchParams();
  const { navigate } = useRouter();
  const employeeId = Number(params.get("employe")) || undefined;
  const withWorked = params.get("heures") !== "0";
  const status = STATUSES.find((s) => s === params.get("statut"));
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  const page = useApi(
    (signal) =>
      api.get<AttendancePage>(
        "/api/attendances",
        { employeeId, withWorkedHours: withWorked ? "1" : undefined, status, limit: PAGE, offset },
        signal,
      ),
    [employeeId, withWorked, status, offset],
  );
  const [rows, setRows] = useState<Attendance[]>([]);
  useEffect(() => setRows(page.data?.items ?? []), [page.data]);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const go = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) v === null ? q.delete(k) : q.set(k, v);
    if (!("offset" in changes)) q.delete("offset");
    navigate(`/gestion${q.size ? `?${q}` : ""}`);
  };

  const act = async (id: number, request: () => Promise<Attendance>) => {
    setPendingId(id);
    setActionError(null);
    try {
      const updated = await request();
      setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Erreur inattendue.");
    } finally {
      setPendingId(null);
    }
  };

  const total = page.data?.total ?? 0;
  return (
    <>
      <div className="head">
        <h1>Gestion</h1>
        <div className="toolbar">
          {employeeId && (
            <Link className="link" to="/gestion">
              Tous les employés ✕
            </Link>
          )}
          <label className="check">
            <input type="checkbox" checked={withWorked} onChange={(e) => go({ heures: e.target.checked ? null : "0" })} />
            Avec heures travaillées
          </label>
          <select value={status ?? ""} onChange={(e) => go({ statut: e.target.value || null })} aria-label="Statut des heures">
            <option value="">Tous les statuts</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <span className="muted num pager">
            {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} sur {total}
            {offset > 0 && (
              <button type="button" className="link" aria-label="Page précédente" onClick={() => go({ offset: String(Math.max(0, offset - PAGE)) })}>
                ‹
              </button>
            )}
            {offset + PAGE < total && (
              <button type="button" className="link" aria-label="Page suivante" onClick={() => go({ offset: String(offset + PAGE) })}>
                ›
              </button>
            )}
          </span>
        </div>
      </div>

      <Banner>{page.error ?? actionError}</Banner>

      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Employé</th>
              <th>Arrivée</th>
              <th>Départ</th>
              <th className="is-num">Repas</th>
              {MOVES.map((m) => (
                <th key={m.key} className="is-center">
                  {m.label}
                </th>
              ))}
              <th className="is-num">Temps de travail</th>
              <th>Statut des heures</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className={pendingId === a.id ? "is-pending" : undefined}>
                <td>
                  <Link className="who" to={`/gestion?employe=${a.employee.id}`}>
                    {a.employee.label}
                  </Link>
                </td>
                <td className="num">{fmtDateTime(a.checkIn)}</td>
                <td className="num">{a.checkOut ? fmtDateTime(a.checkOut) : <span className="muted">en cours</span>}</td>
                <td className="is-num num">{a.movements.meals}</td>
                {MOVES.map((m) => (
                  <td key={m.key} className="is-center">
                    <input
                      type="checkbox"
                      className="switch"
                      checked={a.movements[m.key]}
                      disabled={!a.capabilities.canEdit || pendingId === a.id}
                      title={a.capabilities.canEdit ? undefined : "Non modifiable pour toi (droits du moteur)"}
                      aria-label={`${m.label}, ${a.employee.label}, ${fmtDateTime(a.checkIn)}`}
                      onChange={(e) =>
                        void act(a.id, () => api.patch<Attendance>(`/api/attendances/${a.id}`, { movements: { [m.key]: e.target.checked } }))
                      }
                    />
                  </td>
                ))}
                <td className="is-num num">{hm(a.workedHours)}</td>
                <td>{a.hoursStatus && <StatusBadge status={a.hoursStatus} />}</td>
                <td className="actions">
                  {a.capabilities.canApprove && (
                    <>
                      {a.hoursStatus !== "approved" && (
                        <button type="button" className="link" onClick={() => void act(a.id, () => api.post<Attendance>(`/api/attendances/${a.id}/approve`))}>
                          Approuver
                        </button>
                      )}
                      {a.hoursStatus !== "refused" && (
                        <button type="button" className="link is-danger" onClick={() => void act(a.id, () => api.post<Attendance>(`/api/attendances/${a.id}/refuse`))}>
                          Refuser
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {page.data && rows.length === 0 && (
              <tr>
                <td colSpan={11} className="empty">
                  Aucun pointage avec ces filtres. Décoche « Avec heures travaillées » ou change de statut.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function StatusBadge({ status }: { status: HoursStatus }) {
  return <span className={`status is-${status}`}>{STATUS_LABEL[status]}</span>;
}
