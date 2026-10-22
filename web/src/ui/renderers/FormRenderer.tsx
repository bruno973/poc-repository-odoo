// ui/renderers/FormRenderer.tsx — Rend une fiche décrite en Leila UI Schema.
//
// Générique : aucun champ, aucun modèle connu d'avance. Conditions évaluées par
// l'évaluateur PUR du package partagé (le même que le serveur), avec les replis
// prudents : readonly inconnu → lecture seule, invisible inconnu → masqué,
// bouton à condition inconnue → désactivé, required inconnu → pas de validation
// locale (le serveur fait foi). L'affichage n'autorise rien : le BFF revérifie tout.

import {
  type ButtonNode,
  type ContainerNode,
  type FieldValue,
  type Node,
  type RecordPayload,
  resolveButton,
  resolveFlag,
  resolveRequired,
  type ViewSchema,
} from "@leila/ui-schema";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "../../app/api-client.js";
import { ui } from "../client.js";
import { editorFor, FieldDisplay, type WriteValue } from "../FieldRegistry.js";
import { UnsupportedNode } from "../diagnostics/UnsupportedNode.js";

interface Props {
  view: ViewSchema;
  record: RecordPayload;
  onChange(record: RecordPayload): void;
}

export function FormRenderer({ view, record, onChange }: Props) {
  const [draft, setDraft] = useState<Record<string, WriteValue>>({});
  const [display, setDisplay] = useState<Record<string, FieldValue>>({});
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const values: Record<string, FieldValue> = { ...record.values, ...display };
  const scope = { values };
  const dirty = Object.keys(draft).length > 0;

  const set = (field: string, value: WriteValue, shown?: FieldValue) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setDisplay((d) => ({ ...d, [field]: shown === undefined ? value : shown }));
    setStatus(null);
  };

  const missingRequired = (): string[] => {
    const out: string[] = [];
    const walk = (nodes: Node[], hidden: boolean) => {
      for (const n of nodes) {
        if (n.kind === "field") {
          const d = view.fields[n.field];
          const invisible = hidden || resolveFlag(n.invisible, "invisible", scope);
          // required indéterminé : pas de validation locale (repli ADR-002)
          if (d && !invisible && (d.required || resolveRequired(n.required, scope) === true) && isEmpty(values[n.field]) && editable(n)) out.push(d.label);
        } else if (n.kind === "notebook") n.pages.forEach((p) => walk(p.children, hidden || resolveFlag(p.invisible, "invisible", scope)));
        else if ("children" in n) walk(n.children, hidden || resolveFlag(n.invisible, "invisible", scope));
      }
    };
    walk(view.root, false);
    return out;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const missing = missingRequired();
    if (missing.length) {
      setStatus({ kind: "error", text: `Champs obligatoires : ${missing.join(", ")}.` });
      return;
    }
    setPending(true);
    try {
      const updated = await ui.write(view.resourceKey, record.id, draft);
      setDraft({});
      setDisplay({});
      setStatus({ kind: "ok", text: "Enregistré." });
      onChange(updated);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ApiError ? e.message : "Enregistrement impossible." });
    } finally {
      setPending(false);
    }
  };

  const run = async (button: ButtonNode) => {
    if (!button.commandKey) return;
    setPending(true);
    try {
      onChange(await ui.command(button.commandKey, view.resourceKey, record.id));
      setStatus({ kind: "ok", text: `${button.label} : fait.` });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ApiError ? e.message : "Commande impossible." });
    } finally {
      setPending(false);
    }
  };

  function editable(n: Extract<Node, { kind: "field" }>): boolean {
    const d = view.fields[n.field];
    return (
      !!d &&
      !d.readonly &&
      record.access.canEdit &&
      !record.access.readonlyFields.includes(n.field) &&
      !resolveFlag(n.readonly, "readonly", scope) &&
      editorFor(d) !== null
    );
  }

  const render = (nodes: Node[], path: string): ReactNode[] =>
    nodes.map((n, i) => {
      const key = `${path}/${i}`;
      switch (n.kind) {
        case "sheet":
          return (
            <div key={key} className="ui-sheet">
              {render(n.children, key)}
            </div>
          );
        case "header":
          return (
            <div key={key} className="ui-header">
              {render(n.children, key)}
            </div>
          );
        case "group":
        case "page":
          return resolveFlag(n.invisible, "invisible", scope) ? null : <Group key={key} node={n}>{render(n.children, key)}</Group>;
        case "notebook":
          return <Notebook key={key} pages={n.pages.filter((p) => !resolveFlag(p.invisible, "invisible", scope))} render={(p, k) => render(p.children, k)} />;
        case "field": {
          if (resolveFlag(n.invisible, "invisible", scope)) return null;
          const d = view.fields[n.field];
          if (!d) return <UnsupportedNode key={key} sourceTag="field" reason="Champ non décrit" />;
          const id = `ui-${n.field}`;
          const required = d.required || resolveRequired(n.required, scope) === true;
          const editor = editable(n) ? editorFor(d) : null;
          return (
            <div key={key} className={`field ui-field ui-field--${d.type}`}>
              {n.showLabel && (
                <label className="field__label" htmlFor={id}>
                  {d.label}
                  {required && editor ? " *" : ""}
                </label>
              )}
              {editor ? (
                editor({ id, descriptor: d, value: values[n.field], required, resourceKey: view.resourceKey, onChange: (v, shown) => set(n.field, v, shown) })
              ) : (
                <span className="field__value" id={id}>
                  <FieldDisplay descriptor={d} value={values[n.field]} values={values} />
                </span>
              )}
            </div>
          );
        }
        case "label": {
          const text = n.text ?? (n.for ? view.fields[n.for]?.label : undefined);
          return text ? (
            <div key={key} className="field__label ui-label">
              {text}
            </div>
          ) : null;
        }
        case "separator":
          return (
            <h4 key={key} className="ui-separator">
              {n.label ?? ""}
            </h4>
          );
        case "button": {
          const state = resolveButton(n.invisible, scope);
          if (state === "hidden") return null;
          const available = !!n.commandKey && state === "visible" && record.commands[n.commandKey]?.available === true;
          const why = !n.commandKey
            ? "Action non disponible dans Leila"
            : state === "disabled"
              ? "Condition non prise en charge : commande désactivée"
              : !available
                ? "Non autorisé pour cet enregistrement"
                : dirty
                  ? "Enregistre d'abord tes modifications"
                  : undefined;
          return (
            <button key={key} type="button" className={n.primary ? "btn" : "btn btn--ghost"} disabled={!available || dirty || pending} title={why} onClick={() => void run(n)}>
              {n.label}
            </button>
          );
        }
        case "unsupported":
          return <UnsupportedNode key={key} sourceTag={n.sourceTag} reason={n.reason} />;
        default:
          return null;
      }
    });

  return (
    <form className="ui-form" onSubmit={(e) => void save(e)}>
      {render(view.root, "r")}
      {(dirty || status) && (
        <div className="form-actions">
          {dirty && (
            <>
              <button type="submit" className="btn" disabled={pending}>
                Enregistrer
              </button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setDraft({});
                  setDisplay({});
                  setStatus(null);
                }}
              >
                Annuler
              </button>
            </>
          )}
          {status && (
            <span className={status.kind === "error" ? "ui-status is-error" : "ui-status"} role={status.kind === "error" ? "alert" : "status"}>
              {status.text}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function Group({ node, children }: { node: ContainerNode; children: ReactNode }) {
  return (
    <section className={`ui-group ui-group--cols-${node.columns ?? 1}`}>
      {node.label && <h3 className="ui-group__title">{node.label}</h3>}
      <div className="ui-group__body">{children}</div>
    </section>
  );
}

function Notebook({ pages, render }: { pages: ContainerNode[]; render(page: ContainerNode, key: string): ReactNode[] }) {
  const [active, setActive] = useState(0);
  const current = Math.min(active, Math.max(0, pages.length - 1));
  if (pages.length === 0) return null;
  return (
    <div className="ui-notebook">
      <div className="tabs" role="tablist">
        {pages.map((p, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === current} className={`tabs__tab${i === current ? " is-active" : ""}`} onClick={() => setActive(i)}>
            {p.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{pages[current] && render(pages[current], `p${current}`)}</div>
    </div>
  );
}

function isEmpty(v: FieldValue | undefined): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}
