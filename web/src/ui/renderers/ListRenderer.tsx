// ui/renderers/ListRenderer.tsx — Liste décrite par le schéma : colonnes, tri
// (validé par le serveur), pagination, cellules et lignes conditionnelles.

import { type ColumnNode, evaluateCondition, type QueryResult, resolveFlag, type ViewSchema } from "@leila/ui-schema";
import { useEffect, useState } from "react";
import { ApiError } from "../../app/api-client.js";
import { ui } from "../client.js";
import { FieldDisplay } from "../FieldRegistry.js";
import type { SearchState } from "./SearchRenderer.js";

const PAGE = 40;

export function ListRenderer({ view, search, onOpen }: { view: ViewSchema; search: SearchState; onOpen(id: number): void }) {
  const [order, setOrder] = useState<{ field: string; direction: "asc" | "desc" } | null>(null);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Set<string>>(() => new Set());

  useEffect(() => setOffset(0), [search]);
  useEffect(() => {
    let alive = true;
    setError(null);
    ui.query(view.resourceKey, { filters: search.filters, search: search.search, limit: PAGE, offset, ...(order ? { order } : {}) })
      .then((r) => alive && setResult(r))
      .catch((e: unknown) => alive && setError(e instanceof ApiError ? e.message : "Chargement impossible."));
    return () => {
      alive = false;
    };
  }, [view.resourceKey, search, offset, order]);

  // column_invisible ne dépend pas de la ligne : indéterminé → colonne masquée (repli)
  const columns = view.root.filter(
    (n): n is ColumnNode => n.kind === "column" && !resolveFlag(n.columnInvisible, "columnInvisible", { values: {} }) && (n.optional !== "hide" || shown.has(n.field)),
  );
  const optional = view.root.filter((n): n is ColumnNode => n.kind === "column" && n.optional === "hide");
  const total = result?.total ?? 0;

  return (
    <div className="ui-list">
      <div className="toolbar ui-list__bar">
        <span className="muted num">
          {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} sur {total}
        </span>
        {offset > 0 && (
          <button type="button" className="link" onClick={() => setOffset(Math.max(0, offset - PAGE))} aria-label="Page précédente">
            ‹
          </button>
        )}
        {offset + PAGE < total && (
          <button type="button" className="link" onClick={() => setOffset(offset + PAGE)} aria-label="Page suivante">
            ›
          </button>
        )}
        {optional.map((c) => (
          <label key={c.field} className="check muted">
            <input type="checkbox" checked={shown.has(c.field)} onChange={(e) => setShown((s) => new Set(e.target.checked ? [...s, c.field] : [...s].filter((x) => x !== c.field)))} />
            {view.fields[c.field]?.label ?? c.field}
          </label>
        ))}
      </div>
      {error && (
        <p className="banner is-error" role="alert">
          {error}
        </p>
      )}
      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr>
              {columns.map((c) => {
                const d = view.fields[c.field];
                const dir = order?.field === c.field ? order.direction : null;
                return (
                  <th key={c.field} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}>
                    <button type="button" className="ui-sort" onClick={() => setOrder({ field: c.field, direction: dir === "asc" ? "desc" : "asc" })}>
                      {d?.label ?? c.field}
                      {dir === "asc" ? " ▲" : dir === "desc" ? " ▼" : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {result?.records.map((r) => {
              const scope = { values: r.values };
              const decoration = view.decorations?.find((d) => evaluateCondition(d.when, scope) === true)?.style;
              return (
                <tr key={r.id} className={`ui-row${decoration ? ` is-${decoration}` : ""}`} onClick={() => onOpen(r.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(r.id)}>
                  {columns.map((c) => {
                    const d = view.fields[c.field];
                    return (
                      <td key={c.field} className={d && ["integer", "decimal", "money"].includes(d.type) ? "is-num num" : undefined}>
                        {d && !resolveFlag(c.invisible, "invisible", scope) ? <FieldDisplay descriptor={d} value={r.values[c.field]} values={r.values} /> : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {result && result.records.length === 0 && (
              <tr>
                <td colSpan={columns.length || 1} className="empty">
                  Aucun enregistrement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
