// features/attendance/AttendanceKioskPage.tsx — Pointer une arrivée ou un départ (écran natif Leila).

import { useEffect, useState } from "react";
import { api, ApiError } from "../../app/api-client.js";
import { useRouter, useSearchParams } from "../../app/router.js";
import { useSession } from "../../app/session.js";
import { useApi } from "../../app/useApi.js";
import { Banner } from "../../layout/AppShell.js";
import { duration, fmtDateTime, fmtTime, hm } from "../../lib/format.js";
import type { Attendance, AttendancePage, EmployeeListResult } from "../../types/domain.js";

export function AttendanceKioskPage() {
  const { me } = useSession();
  const { navigate } = useRouter();
  const params = useSearchParams();
  const [flash, setFlash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const employees = useApi((signal) => api.get<EmployeeListResult>("/api/employees", { limit: 200 }, signal), []);
  const wanted = Number(params.get("employe")) || me?.employeeId || undefined;
  const items = employees.data?.items ?? [];
  const employeeId = items.find((e) => e.id === wanted)?.id ?? items[0]?.id;

  const state = useApi(
    async (signal) => {
      if (employeeId === undefined) return null;
      const [current, page] = await Promise.all([
        api.get<{ attendance: Attendance | null }>(`/api/employees/${employeeId}/open-attendance`, {}, signal),
        api.get<AttendancePage>("/api/attendances", { employeeId, limit: 6 }, signal),
      ]);
      return { open: current.attendance, recent: page.items };
    },
    [employeeId],
  );
  const open = state.data?.open ?? null;

  const [movements, setMovements] = useState<Record<string, boolean | number>>({});
  useEffect(() => setMovements({}), [employeeId, open?.id]);

  const punch = async () => {
    if (employeeId === undefined) return;
    setPending(true);
    setActionError(null);
    try {
      const mode = open ? "out" : "in";
      const result = await api.post<Attendance>(`/api/employees/${employeeId}/check-${mode}`, { movements });
      setFlash(
        mode === "in"
          ? `Arrivée enregistrée à ${fmtTime(result.checkIn)}.`
          : `Départ enregistré à ${result.checkOut ? fmtTime(result.checkOut) : ""}.`,
      );
      state.reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Erreur inattendue.");
    } finally {
      setPending(false);
    }
  };

  const check = (name: string, label: string) => (
    <label className="check">
      <input type="checkbox" checked={Boolean(movements[name])} onChange={(e) => setMovements({ ...movements, [name]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <>
      <div className="head">
        <h1>Pointer</h1>
        <div className="toolbar">
          <label className="muted" htmlFor="employe">
            Pointer pour
          </label>
          <select
            id="employe"
            value={employeeId ?? ""}
            onChange={(e) => {
              setFlash(null);
              navigate(`/pointer?employe=${e.target.value}`);
            }}
          >
            {items.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Banner>{employees.error ?? state.error}</Banner>
      <Banner kind="ok">{flash}</Banner>

      {employeeId !== undefined && state.data && (
        <section className="card punch-card">
          <p className="clock num">{fmtTime(now.toISOString())}</p>
          <p className={`state${open ? " is-in" : ""}`}>
            {open ? `Présent depuis ${fmtTime(open.checkIn)}, soit ${duration(open.checkIn, now)}` : "Pas d'arrivée en cours"}
          </p>
          <fieldset className="options">
            <legend>{open ? "Au départ" : "À l'arrivée"}</legend>
            {open ? (
              <>
                {check("breakDeparture", "Je pars en break")}
                {check("transportDeparture", "Je repars en transport")}
                <label className="check">
                  Repas pris sur place
                  <select value={Number(movements["meals"] ?? 0)} onChange={(e) => setMovements({ ...movements, meals: Number(e.target.value) })}>
                    {[0, 1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                {check("breakArrival", "Je reviens de break")}
                {check("transportArrival", "J'arrive en transport")}
              </>
            )}
          </fieldset>
          <button type="button" className="btn punch" disabled={pending} onClick={() => void punch()}>
            {open ? "Pointer le départ" : "Pointer l'arrivée"}
          </button>
          <Banner>{actionError}</Banner>
        </section>
      )}

      {state.data && (
        <section className="card recent">
          <h2>Derniers pointages</h2>
          {state.data.recent.length === 0 ? (
            <p className="muted">Aucun pointage enregistré pour cet employé.</p>
          ) : (
            <table className="grid">
              <thead>
                <tr>
                  <th>Arrivée</th>
                  <th>Départ</th>
                  <th className="is-num">Temps</th>
                </tr>
              </thead>
              <tbody>
                {state.data.recent.map((a) => (
                  <tr key={a.id}>
                    <td className="num">{fmtDateTime(a.checkIn)}</td>
                    <td className="num">{a.checkOut ? fmtDateTime(a.checkOut) : <span className="muted">en cours</span>}</td>
                    <td className="is-num num">{a.checkOut ? hm(a.workedHours) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
