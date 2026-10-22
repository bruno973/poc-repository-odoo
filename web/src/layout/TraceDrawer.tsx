// layout/TraceDrawer.tsx — Journal des appels (développement : DEBUG_ENDPOINTS=1 côté API).
// Absent si l'API ne publie pas /api/_trace.

import { useCallback, useEffect, useState } from "react";

interface TraceEntry {
  id: number;
  port: string;
  ms: number;
  ok: boolean;
  error?: string;
  backend: { call: string; ms: number; ok: boolean; uid?: number }[];
}

export function TraceDrawer() {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TraceEntry[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/_trace", { credentials: "same-origin" }).catch(() => null);
    if (res?.ok) {
      setAvailable(true);
      setEntries((await res.json()) as TraceEntry[]);
    } else if (res?.status === 404) setAvailable(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const onCall = () => void refresh();
    window.addEventListener("leila:api-call", onCall);
    return () => window.removeEventListener("leila:api-call", onCall);
  }, [open, refresh]);

  if (!available) return null;
  return (
    <section className="trace" aria-label="Journal des appels">
      <button
        type="button"
        className="trace__toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) void refresh();
        }}
      >
        Journal des appels
      </button>
      {open && (
        <ol className="trace__list">
          {entries.length === 0 && <li className="trace__item">Aucun appel pour l'instant.</li>}
          {entries.map((e) => (
            <li key={e.id} className={`trace__item${e.ok ? "" : " is-error"}`}>
              <div className="trace__row">
                <code>{e.port}</code>
                <span>{e.ms} ms</span>
              </div>
              {e.backend.length > 0 && (
                <ul className="trace__backend">
                  {e.backend.map((b, i) => (
                    <li key={i} className="trace__row">
                      <code>{b.call}</code>
                      <span>
                        {b.uid !== undefined ? `uid ${b.uid} · ` : ""}
                        {b.ms} ms
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {e.error && <div className="trace__error">{e.error}</div>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
