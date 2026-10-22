// ui/FieldRegistry.tsx — Composant d'affichage / de saisie PAR TYPE Leila.
// Aucun composant ne connaît un champ ou un modèle : tout vient du descripteur.
// Ajouter un type = ajouter une entrée ici ; un type inconnu tombe sur « Unsupported ».

import type { FieldDescriptor, FieldType, FieldValue } from "@leila/ui-schema";
import type { ReactNode } from "react";
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

export function FieldDisplay({ descriptor, value, values }: { descriptor: FieldDescriptor; value: FieldValue | undefined; values: Readonly<Record<string, FieldValue>> }) {
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
