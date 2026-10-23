// ui/renderers/ListRenderer.tsx — Liste décrite par le schéma : colonnes, tri
// (validé par le serveur), pagination, cellules et lignes conditionnelles, et
// regroupement à un niveau (groupes calculés par le serveur, dépliés à la demande).

import { type ColumnNode, evaluateCondition, type QueryRequestInput, type QueryResult, resolveFlag, type ViewSchema } from "@leila/ui-schema";
import { useEffect, useState } from "react";
import { ApiError } from "../../app/api-client.js";
import { ui } from "../client.js";
import { FieldDisplay } from "../FieldRegistry.js";
import type { SearchState } from "./SearchRenderer.js";

const PAGE = 40;

type Order = { field: string; direction: "asc" | "desc" } | null;

export function ListRenderer({ view, search, onOpen }: { view: ViewSchema; search: SearchState; onOpen(id: number): void }) {
  const [order, setOrder] = useState<Order>(null);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Set<string>>(() => new Set());

  useEffect(() => setOffset(0), [search]);
  useEffect(() => {
    let alive = true;
    setError(null);
    const request: QueryRequestInput = { filters: search.filters, search: search.search, limit: PAGE, offset: search.groupBy ? 0 : offset, ...(order ? { order } : {}) };
    if (search.groupBy) request.groupBy = search.groupBy;
    ui.query(view.resourceKey, request)
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
  const grouped = search.groupBy !== undefined && result?.groups !== undefined;

  return (
    <div className="ui-list">
      <div className="toolbar ui-list__bar">
        {grouped ? (
          <span className="muted num">
            {result?.groups?.length ?? 0} groupe{(result?.groups?.length ?? 0) > 1 ? "s" : ""} · {total} enregistrement{total > 1 ? "s" : ""}
          </span>
        ) : (
          <>
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
          </>
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
          {grouped ? (
            result?.groups?.map((g) => <Group key={`${search.groupBy}:${g.key}`} view={view} columns={columns} search={search} order={order} group={g} onOpen={onOpen} />)
          ) : (
            <tbody>
              {result && <Rows view={view} columns={columns} records={result.records} onOpen={onOpen} />}
            </tbody>
          )}
          {result && (grouped ? (result.groups?.length ?? 0) === 0 : result.records.length === 0) && (
            <tbody>
              <tr>
                <td colSpan={columns.length || 1} className="empty">
                  Aucun enregistrement.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

function Rows({ view, columns, records, onOpen }: { view: ViewSchema; columns: ColumnNode[]; records: QueryResult["records"]; onOpen(id: number): void }) {
  return (
    <>
      {records.map((r) => {
        const scope = { values: { ...r.values, id: r.id } };
        const decoration = view.decorations?.find((d) => evaluateCondition(d.when, scope) === true)?.style;
        return (
          <tr key={r.id} className={`ui-row${decoration ? ` is-${decoration}` : ""}`} onClick={() => onOpen(r.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(r.id)}>
            {columns.map((c) => {
              const d = view.fields[c.field];
              return (
                <td key={c.field} className={d && ["integer", "decimal", "money"].includes(d.type) ? "is-num num" : undefined}>
                  {d && !resolveFlag(c.invisible, "invisible", scope) ? (
                    <FieldDisplay descriptor={d} value={r.values[c.field]} values={r.values} record={{ resourceKey: view.resourceKey, recordId: r.id }} compact />
                  ) : null}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/** Un groupe : en-tête (libellé, nombre) ; enregistrements chargés à l'ouverture, page par page. */
function Group(props: {
  view: ViewSchema;
  columns: ColumnNode[];
  search: SearchState;
  order: Order;
  group: { key: string; label: string; count: number };
  onOpen(id: number): void;
}) {
  const { view, columns, search, order, group, onOpen } = props;
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<QueryResult["records"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (offset: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = await ui.query(view.resourceKey, { filters: search.filters, search: search.search, groupBy: search.groupBy, group: group.key, limit: PAGE, offset, ...(order ? { order } : {}) });
      setRecords((prev) => (offset === 0 ? r.records : [...prev, ...r.records]));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (open) void load(0);
  }, [open, order]);

  return (
    <tbody className="ui-group-rows">
      <tr className="ui-group-row">
        <td colSpan={columns.length || 1}>
          <button type="button" className="ui-group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span aria-hidden="true">{open ? "▾" : "▸"}</span> {group.label} <span className="muted num">({group.count})</span>
          </button>
        </td>
      </tr>
      {open && <Rows view={view} columns={columns} records={records} onOpen={onOpen} />}
      {open && error && (
        <tr>
          <td colSpan={columns.length || 1} className="banner is-error" role="alert">
            {error}
          </td>
        </tr>
      )}
      {open && !loading && records.length < group.count && !error && (
        <tr>
          <td colSpan={columns.length || 1}>
            <button type="button" className="link" onClick={() => void load(records.length)}>
              Afficher {Math.min(PAGE, group.count - records.length)} de plus
            </button>
          </td>
        </tr>
      )}
    </tbody>
  );
}
