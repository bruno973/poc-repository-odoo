// adapters/mock/ui/MockUiAdapter.ts — Moteur de présentation SANS ERP.
//
// Prouve que le Leila UI Schema et les renderers React ne dépendent pas d'Odoo
// (§ 10, risque « dépendance cachée ») : une ressource PORTABLE « employés »,
// décrite directement dans le langage de présentation Leila, servie par les
// mêmes routes, avec les mêmes contrôles (clés par utilisateur, droits simulés,
// restriction Q-05, revalidation à l'écriture).

import {
  type ActionDescriptor,
  type CommandRequest,
  type FieldValue,
  type LookupResult,
  type Navigation,
  type QueryRequest,
  type QueryResult,
  type RecordPayload,
  SCHEMA_VERSION,
  type ViewSchema,
  ViewSchemaSchema,
  type WritePatch,
} from "@leila/ui-schema";
import type { KeyRegistry } from "../../../app/ui/keys.js";
import { editableInForm } from "../../../app/ui/editable.js";
import { leilaRestriction } from "../../../app/ui/restrictions.js";
import { DomainError } from "../../../domain/errors.js";
import type { ViewerContext } from "../../../domain/tree.js";
import type { CommandDispatcher, RecordRepository, ViewRepository } from "../../../domain/ui/ports.js";
import { DEPARTMENTS, RECORDS, type MockEmployeeFlat } from "../fixtures.js";
import { canWriteField } from "../rights.js";

/** Champs du schéma ↔ clés du squelette historique (pour réutiliser les droits simulés). */
const FIELD_RIGHTS: Record<string, string> = {
  fullName: "header.fullName",
  jobTitle: "header.jobTitle",
  workEmail: "header.workEmail",
  workPhone: "header.workPhone",
  department: "header.department",
};

const FIELDS: ViewSchema["fields"] = {
  fullName: { key: "fullName", label: "Nom", type: "text", readonly: true, required: true },
  jobTitle: { key: "jobTitle", label: "Poste", type: "text", readonly: false, required: false },
  workEmail: { key: "workEmail", label: "Email pro", type: "text", readonly: false, required: false },
  workPhone: { key: "workPhone", label: "Téléphone pro", type: "text", readonly: false, required: false },
  department: { key: "department", label: "Département", type: "reference", readonly: true, required: false, relation: { lookup: false } },
};

export class MockUiAdapter implements ViewRepository, RecordRepository, CommandDispatcher {
  private readonly records: MockEmployeeFlat[] = structuredClone(RECORDS);

  constructor(private readonly keys: KeyRegistry) {}

  private owner(viewer: ViewerContext): string {
    return `mock:${viewer.id}`;
  }

  async navigation(viewer: ViewerContext): Promise<Navigation> {
    const owner = this.owner(viewer);
    return {
      schemaVersion: SCHEMA_VERSION,
      menus: [
        {
          key: this.keys.issue(owner, "menu", "rh"),
          label: "Ressources humaines",
          available: true,
          children: [
            { key: this.keys.issue(owner, "menu", "rh/employees"), label: "Employés (écran générique)", actionKey: this.keys.issue(owner, "action", "employees"), available: true, children: [] },
            { key: this.keys.issue(owner, "menu", "rh/kiosk"), label: "Kiosque (non disponible)", available: false, children: [] },
          ],
        },
      ],
    };
  }

  async action(actionKey: string, viewer: ViewerContext): Promise<ActionDescriptor> {
    const owner = this.owner(viewer);
    this.keys.resolve(owner, "action", actionKey);
    const view = (type: string) => this.keys.issue(owner, "view", type);
    return {
      schemaVersion: SCHEMA_VERSION,
      actionKey,
      title: "Employés",
      resourceKey: this.keys.issue(owner, "resource", "employees"),
      available: true,
      views: { list: view("list"), form: view("form"), search: view("search") },
      defaultView: "list",
      diagnostics: [],
    };
  }

  async view(viewKey: string, viewer: ViewerContext): Promise<ViewSchema> {
    const owner = this.owner(viewer);
    const type = this.keys.resolve<"list" | "form" | "search">(owner, "view", viewKey);
    const base = {
      schemaVersion: SCHEMA_VERSION,
      viewKey,
      title: "Employés",
      resourceKey: this.keys.issue(owner, "resource", "employees"),
      resourceKind: "portable" as const,
      capabilities: { canCreate: false, canEdit: viewer.role !== "employee", canDelete: false },
      diagnostics: [],
    };
    if (type === "list") {
      return ViewSchemaSchema.parse({
        ...base,
        viewType: "list",
        fields: pick("fullName", "jobTitle", "department", "workEmail"),
        root: ["fullName", "jobTitle", "department", "workEmail"].map((field) => ({ kind: "column", field })),
        decorations: [{ style: "muted", when: { op: "not", arg: { op: "field", field: "jobTitle" } } }],
      });
    }
    if (type === "search") {
      return ViewSchemaSchema.parse({
        ...base,
        viewType: "search",
        fields: pick("fullName"),
        root: [
          { kind: "searchField", field: "fullName", label: "Nom", available: true },
          ...DEPARTMENTS.map((d) => ({ kind: "filter", filterKey: `dept${d.id}`, label: d.name, available: true, group: 0 })),
        ],
      });
    }
    return ViewSchemaSchema.parse({
      ...base,
      viewType: "form",
      fields: FIELDS,
      root: [
        {
          kind: "sheet",
          children: [
            { kind: "field", field: "fullName", showLabel: false },
            {
              kind: "group",
              columns: 2,
              children: [
                { kind: "group", columns: 1, label: "Poste", children: [{ kind: "field", field: "jobTitle", showLabel: true }, { kind: "field", field: "department", showLabel: true }] },
                {
                  kind: "group",
                  columns: 1,
                  label: "Contact",
                  children: [
                    { kind: "field", field: "workEmail", showLabel: true },
                    // Masqué tant que l'email est vide : démontre une condition évaluée côté front ET serveur
                    { kind: "field", field: "workPhone", showLabel: true, invisible: { op: "not", arg: { op: "field", field: "workEmail" } } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  }

  async refreshCache(): Promise<{ cleared: number }> {
    return { cleared: 0 };
  }

  async query(resourceKey: string, request: QueryRequest, viewer: ViewerContext): Promise<QueryResult> {
    this.keys.resolve(this.owner(viewer), "resource", resourceKey);
    let rows = this.records;
    const depts = request.filters.map((f) => {
      const d = DEPARTMENTS.find((x) => `dept${x.id}` === f);
      if (!d) throw new DomainError(`Filtre inconnu : ${f}`, "invalid");
      return d.id;
    });
    if (depts.length) rows = rows.filter((r) => depts.includes(r.header.department?.id ?? -1));
    for (const s of request.search) {
      if (s.field !== "fullName") throw new DomainError(`Recherche indisponible sur ${s.field}.`, "invalid");
      rows = rows.filter((r) => r.header.fullName.toLowerCase().includes(s.value.toLowerCase()));
    }
    if (request.order) {
      const { field, direction } = request.order;
      if (!(field in FIELDS)) throw new DomainError("Tri impossible sur cette colonne.", "invalid");
      rows = [...rows].sort((a, b) => String(values(a)[field] ?? "").localeCompare(String(values(b)[field] ?? "")) * (direction === "asc" ? 1 : -1));
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      total: rows.length,
      records: rows.slice(request.offset, request.offset + request.limit).map((r) => ({ id: r.id, values: pickValues(values(r), "fullName", "jobTitle", "department", "workEmail") })),
    };
  }

  async read(resourceKey: string, id: number, viewer: ViewerContext): Promise<RecordPayload> {
    this.keys.resolve(this.owner(viewer), "resource", resourceKey);
    const r = this.records.find((x) => x.id === id);
    if (!r) throw new DomainError("Enregistrement introuvable.", "not_found");
    const restriction = leilaRestriction("employee", id, viewer);
    const writable = Object.keys(FIELDS).filter((f) => !FIELDS[f]?.readonly && canWriteField(viewer, id, FIELD_RIGHTS[f] ?? "", this.records));
    return {
      schemaVersion: SCHEMA_VERSION,
      resourceKey,
      id,
      values: values(r),
      access: {
        canEdit: writable.length > 0 && !restriction.readonly,
        readonlyFields: restriction.readonly ? Object.keys(FIELDS) : Object.keys(FIELDS).filter((f) => !writable.includes(f)),
      },
      commands: {},
    };
  }

  async write(resourceKey: string, id: number, patch: WritePatch, viewer: ViewerContext): Promise<RecordPayload> {
    const current = await this.read(resourceKey, id, viewer);
    if (!current.access.canEdit) throw new DomainError("Enregistrement non modifiable pour toi.", "forbidden");
    const r = this.records.find((x) => x.id === id) as MockEmployeeFlat;
    const form = await this.view(this.keys.issue(this.owner(viewer), "view", "form"), viewer);
    const scope = { values: { ...current.values, ...patch.values } };
    for (const [key, value] of Object.entries(patch.values)) {
      const d = FIELDS[key];
      if (!d || d.readonly || current.access.readonlyFields.includes(key)) throw new DomainError(`Champ non modifiable : ${key}`, "forbidden");
      // Même règle que l'écran : champ visible et non en lecture seule avec ces valeurs
      if (!editableInForm(form.root, key, scope)) throw new DomainError(`Champ non modifiable : ${key}`, "forbidden");
      if (value !== null && typeof value !== "string") throw new DomainError(`Valeur invalide pour ${d.label}.`, "invalid");
    }
    for (const [key, value] of Object.entries(patch.values)) {
      (r.header as unknown as Record<string, unknown>)[key] = value === "" ? null : value;
    }
    return this.read(resourceKey, id, viewer);
  }

  async lookup(): Promise<LookupResult> {
    throw new DomainError("Sélection indisponible pour ce champ.", "forbidden");
  }

  async execute(commandKey: string, _request: CommandRequest, viewer: ViewerContext): Promise<RecordPayload> {
    this.keys.resolve(this.owner(viewer), "command", commandKey);
    throw new DomainError("Commande inconnue.", "not_found");
  }
}

function values(r: MockEmployeeFlat): Record<string, FieldValue> {
  return {
    fullName: r.header.fullName,
    jobTitle: r.header.jobTitle,
    workEmail: r.header.workEmail,
    workPhone: r.header.workPhone,
    department: r.header.department,
  };
}

function pick(...keys: string[]): ViewSchema["fields"] {
  return Object.fromEntries(keys.map((k) => [k, FIELDS[k]])) as ViewSchema["fields"];
}

function pickValues(v: Record<string, FieldValue>, ...keys: string[]): Record<string, FieldValue> {
  return Object.fromEntries(keys.map((k) => [k, v[k] ?? null]));
}
