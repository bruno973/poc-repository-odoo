// ui/fields/editors.tsx — Éditeurs génériques par type. La conversion produit des
// valeurs typées ; le serveur revalide tout (type, droits, conditions).

import type { EditorProps } from "../FieldRegistry.js";

export function TextEditor({ id, value, required, onChange, multiline = false }: EditorProps & { multiline?: boolean }) {
  const v = typeof value === "string" ? value : "";
  return multiline ? (
    <textarea id={id} className="field__input" value={v} required={required} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} rows={3} />
  ) : (
    <input id={id} className="field__input" value={v} required={required} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />
  );
}

export function NumberEditor({ id, value, required, onChange, integer = false }: EditorProps & { integer?: boolean }) {
  return (
    <input
      id={id}
      className="field__input"
      type="number"
      step={integer ? 1 : "any"}
      required={required}
      value={typeof value === "number" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? null : integer ? Math.trunc(Number(e.target.value)) : Number(e.target.value))}
    />
  );
}

export function BooleanEditor({ id, value, onChange }: EditorProps) {
  return <input id={id} type="checkbox" className="switch" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
}

export function SelectionEditor({ id, descriptor, value, required, onChange }: EditorProps) {
  return (
    <select id={id} className="field__input" value={typeof value === "string" ? value : ""} required={required} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">—</option>
      {(descriptor.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** date : "AAAA-MM-JJ" ; datetime : saisie locale du poste convertie en ISO UTC. */
export function DateEditor({ id, value, required, onChange, withTime = false }: EditorProps & { withTime?: boolean }) {
  if (!withTime) {
    return <input id={id} className="field__input" type="date" required={required} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} />;
  }
  const local = typeof value === "string" ? toLocalInput(value) : "";
  return (
    <input
      id={id}
      className="field__input"
      type="datetime-local"
      required={required}
      value={local}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
    />
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
