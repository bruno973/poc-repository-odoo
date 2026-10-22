// features/employees/TreeForm.tsx — Rendu du formTree de la fiche employé.
//
// TRANSITOIRE (lot L1) : le formTree vient encore du squelette codé dans l'API
// (employee.skeleton.ts). Il sera remplacé par le FormRenderer générique du
// Leila UI Schema (lot L3). L'arbre arrive déjà élagué, avec `editable` calculé
// par le moteur pour ce viewer : le front affiche, il ne décide rien.

import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../app/api-client.js";
import { Link, useSearchParams } from "../../app/router.js";
import type { EmployeeFormRecord, FormNode } from "../../types/domain.js";

type Leaf = Exclude<FormNode, { kind: "group" }>;

const anyEditable = (nodes: readonly FormNode[]): boolean =>
  nodes.some((n) => (n.kind === "group" ? anyEditable(n.children) : n.editable));

export function TreeForm({ record, onSaved }: { record: EmployeeFormRecord; onSaved(record: EmployeeFormRecord): void }) {
  const tabs = record.formTree;
  const activeTab = useSearchParams().get("tab") ?? tabs[0]?.key ?? "";
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const canSave = anyEditable(tabs);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (Object.keys(draft).length === 0) {
      setStatus("Aucune modification.");
      return;
    }
    setStatus("Enregistrement…");
    try {
      const updated = await api.patch<EmployeeFormRecord>(`/api/employees/${record.id}`, draft);
      setDraft({});
      setStatus("Enregistré.");
      onSaved(updated);
    } catch (e) {
      setStatus(`Erreur : ${e instanceof ApiError ? e.message : "inattendue"}`);
    }
  };

  const field = (node: Leaf) => (
    <Field key={node.key} node={node} value={draft[node.key]} onChange={(v) => setDraft({ ...draft, [node.key]: v })} />
  );

  return (
    <>
      <nav className="tabs" role="tablist">
        {tabs.map((tab) => (
          <Link key={tab.key} to={`/employees/${record.id}?tab=${tab.key}`} className={`tabs__tab${tab.key === activeTab ? " is-active" : ""}`}>
            {tab.label}
          </Link>
        ))}
      </nav>
      <form onSubmit={(e) => void save(e)}>
        {tabs
          .filter((tab) => tab.key === activeTab)
          .map((tab) => (
            <div key={tab.key} role="tabpanel" className="fields">
              {tab.children.map((node) =>
                node.kind === "group" ? (
                  <section key={node.key} className="field-group">
                    <h3>{node.label}</h3>
                    {node.children.map((child) => (child.kind === "group" ? null : field(child)))}
                  </section>
                ) : (
                  field(node)
                ),
              )}
            </div>
          ))}
        {canSave && (
          <div className="form-actions">
            <button type="submit" className="btn">
              Enregistrer
            </button>
            {status && <span className="muted">{status}</span>}
          </div>
        )}
      </form>
    </>
  );
}

function Field({ node, value, onChange }: { node: Leaf; value: string | undefined; onChange(v: string): void }) {
  const id = `f-${node.key}`;
  let display: string | null = null;
  if (node.kind === "many2one") display = node.value?.label ?? null;
  else if (node.kind === "select") display = node.options.find((o) => o.value === node.value)?.label ?? null;
  else display = node.value === null ? null : String(node.value);

  // many2one : lecture seule (il faudrait un sélecteur d'enregistrement, prévu avec le FieldRegistry)
  const editable = node.editable && node.kind !== "many2one";
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {node.label}
      </label>
      {!editable ? (
        <span className="field__value" id={id}>
          {display ?? <em className="field__empty">—</em>}
        </span>
      ) : node.kind === "select" ? (
        <select id={id} className="field__input" value={value ?? node.value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {node.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input id={id} className="field__input" value={value ?? (node.value === null ? "" : String(node.value))} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
