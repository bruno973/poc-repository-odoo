// ui/FieldRegistry.tsx — Composant d'affichage / de saisie PAR TYPE Leila.
// Aucun composant ne connaît un champ ou un modèle : tout vient du descripteur.
// Ajouter un type = ajouter une entrée ici ; un type inconnu tombe sur « Unsupported ».

import type { FieldDescriptor, FieldType, FieldValue, LinesValue } from "@leila/ui-schema";
import { type ReactNode, useState } from "react";
import { imageUrl } from "./client.js";
import { BooleanEditor, DateEditor, NumberEditor, SelectionEditor, TextEditor } from "./fields/editors.js";
import { formatValue } from "./fields/format.js";
import { ReferenceEditor } from "./fields/ReferenceEditor.js";

export type WriteValue = string | number | boolean | null;

export interface EditorProps {
  id: string;
  descriptor: FieldDescriptor;
  value: FieldValue | undefined;
  required: boolean;
  onChange(value: WriteValue, display?: FieldValue): void;
  /** Ressource et fiche (sélection d'une référence : le domaine dépend de la fiche) */
  resourceKey: string;
  recordId: number;
}

type Editor = (props: EditorProps) => ReactNode;

const EDITORS: Partial<Record<FieldType, Editor>> = {
  text: (p) => <TextEditor {...p} />,
  multiline: (p) => <TextEditor {...p} multiline />,
  integer: (p) => <NumberEditor {...p} integer />,
  decimal: (p) => <NumberEditor {...p} />,
  boolean: (p) => <BooleanEditor {...p} />,
  selection: (p) => <SelectionEditor {...p} />,
  date: (p) => <DateEditor {...p} />,
  datetime: (p) => <DateEditor {...p} withTime />,
  reference: (p) => <ReferenceEditor {...p} />,
};

/** Éditeur du type, s'il existe et si le champ est sélectionnable (référence). */
export function editorFor(d: FieldDescriptor): Editor | null {
  if (d.type === "reference" && !d.relation?.lookup) return null;
  return EDITORS[d.type] ?? null;
}

/** Fiche affichée : nécessaire aux images (servies par une route propre à l'enregistrement). */
export interface RecordRef {
  resourceKey: string;
  recordId: number;
}

interface DisplayProps {
  descriptor: FieldDescriptor;
  value: FieldValue | undefined;
  values: Readonly<Record<string, FieldValue>>;
  record?: RecordRef | undefined;
  /** Liste : rendu compact (lignes liées comptées, pas de tableau) */
  compact?: boolean;
}

export function FieldDisplay({ descriptor, value, values, record, compact = false }: DisplayProps) {
  if (descriptor.type === "references") return <Tags value={value} />;
  if (descriptor.type === "lines") return <Lines descriptor={descriptor} value={value} compact={compact} />;
  if (descriptor.type === "image") {
    if (typeof value !== "string" || !record) return <em className="field__empty">—</em>;
    return <ImageView src={imageUrl(record.resourceKey, record.recordId, descriptor.key, value)} label={descriptor.label} compact={compact} />;
  }
  if (descriptor.type === "selection" && descriptor.format === "steps" && !compact) return <Steps descriptor={descriptor} value={value} />;
  if (descriptor.type === "unsupported") {
    const detail = formatValue(descriptor, value, values);
    return (
      <span className="ui-unsupported-value" title="Type de champ non pris en charge par Leila">
        Non disponible dans Leila{detail ? ` (${detail})` : ""}
      </span>
    );
  }
  if (descriptor.type === "boolean") return <span aria-label={value ? "Oui" : "Non"}>{value ? "☑" : "☐"}</span>;
  const text = formatValue(descriptor, value, values);
  // Lien de présentation (widgets email / phone / url) : n'ouvre aucun droit
  if (text && descriptor.format) {
    const href = descriptor.format === "email" ? `mailto:${text}` : descriptor.format === "phone" ? `tel:${text.replace(/[^\d+]/g, "")}` : /^https?:\/\//i.test(text) ? text : null;
    if (href) return <a href={href} rel="noopener noreferrer" target={descriptor.format === "url" ? "_blank" : undefined}>{text}</a>;
  }
  return text ? <span className={descriptor.type === "multiline" ? "ui-multiline" : undefined}>{text}</span> : <em className="field__empty">—</em>;
}

/** Étiquettes : noms lus par le serveur ; illisibles (ids seuls) → nombre d'éléments. */
function Tags({ value }: { value: FieldValue | undefined }) {
  if (!Array.isArray(value) || value.length === 0) return <em className="field__empty">—</em>;
  const tags = value.filter((v): v is { id: number; label: string } => typeof v === "object" && v !== null);
  if (tags.length === 0) return <span className="muted">{value.length} élément{value.length > 1 ? "s" : ""}</span>;
  return (
    <span className="ui-tags">
      {tags.map((t) => (
        <span key={t.id} className="ui-tag">
          {t.label}
        </span>
      ))}
    </span>
  );
}

/** Lignes liées en lecture seule : tableau des colonnes décrites ; en liste, le nombre. */
function Lines({ descriptor, value, compact }: { descriptor: FieldDescriptor; value: FieldValue | undefined; compact: boolean }) {
  if (value === null || value === undefined) return <em className="field__empty" title="Lignes non lisibles pour ce compte">—</em>;
  if (typeof value !== "object" || !("lines" in value)) return <em className="field__empty">—</em>;
  const { lines, total } = value as LinesValue;
  if (total === 0) return <em className="field__empty">Aucune ligne</em>;
  if (compact || !descriptor.lines) return <span className="muted">{total} ligne{total > 1 ? "s" : ""}</span>;
  const { columns, fields } = descriptor.lines;
  return (
    <div className="ui-lines table-wrap">
      <table className="grid">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{fields[c]?.label ?? c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              {columns.map((c) => {
                const d = fields[c];
                return <td key={c} className={d && ["integer", "decimal"].includes(d.type) ? "is-num num" : undefined}>{d ? <FieldDisplay descriptor={d} value={line.values[c]} values={line.values} compact /> : null}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {total > lines.length && <p className="muted ui-lines__more">{total - lines.length} ligne{total - lines.length > 1 ? "s" : ""} de plus, non affichée{total - lines.length > 1 ? "s" : ""}.</p>}
    </div>
  );
}

/** Barre d'étapes (statusbar) : options visibles, plus la valeur courante si elle n'y est pas. */
function Steps({ descriptor, value }: { descriptor: FieldDescriptor; value: FieldValue | undefined }) {
  const visible = descriptor.visibleOptions;
  const steps = (descriptor.options ?? []).filter((o) => !visible || visible.includes(o.value) || o.value === value);
  if (steps.length === 0) return <em className="field__empty">—</em>;
  return (
    <ol className="ui-steps" aria-label={descriptor.label}>
      {steps.map((o) => (
        <li key={o.value} className={o.value === value ? "is-current" : undefined} aria-current={o.value === value ? "step" : undefined}>
          {o.label}
        </li>
      ))}
    </ol>
  );
}

/** Image : refusée par le serveur (format non matriciel, droits) → mention plutôt qu'une image cassée. */
function ImageView({ src, label, compact }: { src: string; label: string; compact: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="muted ui-image-missing">Image non disponible</span>;
  return <img className={compact ? "ui-image ui-image--small" : "ui-image"} src={src} alt={label} loading="lazy" onError={() => setFailed(true)} />;
}
