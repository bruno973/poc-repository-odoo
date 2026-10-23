// ui/renderers/SearchRenderer.tsx — Recherche décrite par le schéma : champs de
// recherche, filtres et regroupements (un niveau). Les éléments non pris en charge
// restent visibles mais désactivés ; le navigateur n'envoie que des clés, jamais un domaine.

import type { ViewSchema } from "@leila/ui-schema";
import { useState, type FormEvent } from "react";

export interface SearchState {
  filters: string[];
  search: { field: string; value: string }[];
  /** Clé de regroupement (un niveau) */
  groupBy?: string | undefined;
}

export function SearchRenderer({ view, value, onChange }: { view: ViewSchema; value: SearchState; onChange(next: SearchState): void }) {
  const fields = view.root.filter((n) => n.kind === "searchField" && n.available);
  const filters = view.root.filter((n) => n.kind === "filter");
  const groupBys = view.root.filter((n) => n.kind === "groupBy");
  const [text, setText] = useState("");
  const [field, setField] = useState(fields[0]?.kind === "searchField" ? fields[0].field : "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !field) return;
    onChange({ ...value, search: [...value.search.filter((s) => s.field !== field), { field, value: text.trim() }] });
    setText("");
  };
  const labelOf = (key: string) => {
    const n = view.root.find((x) => x.kind === "searchField" && x.field === key);
    return n?.kind === "searchField" ? n.label : key;
  };

  return (
    <div className="ui-search">
      {fields.length > 0 && (
        <form className="toolbar" onSubmit={submit}>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Rechercher…" aria-label="Rechercher" />
          {fields.length > 1 && (
            <select value={field} onChange={(e) => setField(e.target.value)} aria-label="Champ de recherche">
              {fields.map((f) => f.kind === "searchField" && (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
          <button className="btn" type="submit">
            Rechercher
          </button>
        </form>
      )}
      <div className="ui-search__chips">
        {value.search.map((s) => (
          <button key={s.field} type="button" className="chip chip--active" onClick={() => onChange({ ...value, search: value.search.filter((x) => x.field !== s.field) })}>
            {labelOf(s.field)} : {s.value} ✕
          </button>
        ))}
        {filters.map((f) =>
          f.kind === "filter" ? (
            <button
              key={f.filterKey}
              type="button"
              className={`chip${value.filters.includes(f.filterKey) ? " chip--active" : ""}`}
              disabled={!f.available}
              aria-pressed={value.filters.includes(f.filterKey)}
              title={f.available ? undefined : "Filtre non pris en charge par Leila"}
              onClick={() =>
                onChange({
                  ...value,
                  filters: value.filters.includes(f.filterKey) ? value.filters.filter((k) => k !== f.filterKey) : [...value.filters, f.filterKey],
                })
              }
            >
              {f.label}
            </button>
          ) : null,
        )}
      </div>
      {groupBys.length > 0 && (
        <div className="ui-search__chips ui-search__groups" role="group" aria-label="Regrouper par">
          <span className="muted">Regrouper par :</span>
          {groupBys.map((g) =>
            g.kind === "groupBy" ? (
              <button
                key={g.groupKey}
                type="button"
                className={`chip${value.groupBy === g.groupKey ? " chip--active" : ""}`}
                disabled={!g.available}
                aria-pressed={value.groupBy === g.groupKey}
                title={g.available ? undefined : "Regroupement non pris en charge par Leila"}
                onClick={() => onChange({ ...value, groupBy: value.groupBy === g.groupKey ? undefined : g.groupKey })}
              >
                {g.label}
              </button>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
