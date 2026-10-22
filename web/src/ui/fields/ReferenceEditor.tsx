// ui/fields/ReferenceEditor.tsx — Sélection d'un enregistrement lié.
// Les options viennent du BFF, qui applique le domaine du champ et les droits ;
// l'id choisi est encore revérifié à l'écriture.

import { useEffect, useState } from "react";
import { ui } from "../client.js";
import type { EditorProps } from "../FieldRegistry.js";

export function ReferenceEditor({ id, descriptor, value, onChange, resourceKey }: EditorProps) {
  const current = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const [q, setQ] = useState(current?.label ?? "");
  const [options, setOptions] = useState<{ id: number; label: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setQ(current?.label ?? ""), [current?.id, current?.label]);

  const search = async (text: string) => {
    setQ(text);
    try {
      setOptions((await ui.lookup(resourceKey, descriptor.key, text)).options);
      setError(null);
    } catch {
      setOptions(null);
      setError("Recherche indisponible.");
    }
  };

  return (
    <div className="ref-editor">
      <input
        id={id}
        className="field__input"
        value={q}
        placeholder="Rechercher…"
        onFocus={() => options === null && void search(q === current?.label ? "" : q)}
        onChange={(e) => void search(e.target.value)}
        aria-autocomplete="list"
      />
      {current && (
        <button type="button" className="link" onClick={() => onChange(null, null)} aria-label="Vider">
          ✕
        </button>
      )}
      {options && options.length > 0 && (
        <ul className="ref-editor__options" role="listbox">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                role="option"
                aria-selected={current?.id === o.id}
                onClick={() => {
                  onChange(o.id, o);
                  setOptions(null);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <small className="muted">{error}</small>}
    </div>
  );
}
