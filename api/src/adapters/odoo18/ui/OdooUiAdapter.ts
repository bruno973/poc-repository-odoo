// adapters/odoo18/ui/OdooUiAdapter.ts — Odoo 18 comme FOURNISSEUR de vues et de
// fonctionnalités pour le moteur de présentation Leila (ADR-001).
//
// Seule couche qui connaît ir.ui.menu, ir.actions.act_window, get_views, les
// domaines et les modèles. Tout appel part avec la session de l'utilisateur
// (OdooTransportFactory) : Odoo applique ACL, règles d'enregistrement et groupes
// de champ. Aucun sudo. Aucune méthode appelable librement : lecture, écriture
// revalidée et commandes du registre fermé uniquement.

import {
  type ActionDescriptor,
  ActionDescriptorSchema,
  type CommandRequest,
  type ConditionScope,
  type FieldDescriptor,
  type FieldValue,
  type LookupResult,
  type MenuNode,
  type Navigation,
  NavigationSchema,
  type Node,
  type QueryRequest,
  type QueryResult,
  QueryResultSchema,
  type RecordPayload,
  RecordPayloadSchema,
  resolveButton,
  SCHEMA_VERSION,
  type ViewSchema,
  ViewSchemaSchema,
  type WritePatch,
} from "@leila/ui-schema";
import { DefinitionCache } from "../../../app/ui/cache.js";
import type { KeyRegistry } from "../../../app/ui/keys.js";
import { editableInForm } from "../../../app/ui/editable.js";
import { leilaRestriction, type ResourceSemantic } from "../../../app/ui/restrictions.js";
import { DomainError } from "../../../domain/errors.js";
import type { ViewerContext } from "../../../domain/tree.js";
import type { CommandDispatcher, RecordRepository, ViewRepository } from "../../../domain/ui/ports.js";
import { hasGroup, recordAccess } from "../capabilities.js";
import { fromOdooDatetime, toOdooDatetime } from "../client.js";
import type { OdooTransport, OdooTransportFactory } from "../transport.js";
import { ODOO_COMMANDS, type OdooCommand } from "./commands.js";
import { asDomain, combineDomains, parseLiteral } from "./OdooExpressionParser.js";
import { type OdooFieldMeta, type ParsedView, parseArch } from "./OdooViewParser.js";

export interface OdooUiConfig {
  db: string;
  lang: string;
  /** xml ids des menus racines publiés (périmètre MVP, Q-07) ; vide = tous */
  menuRoots: readonly string[];
  cacheTtlMs: number;
  keys: KeyRegistry;
  commands?: readonly OdooCommand[];
  /** Diagnostics détaillés (emplacements, balises) pour tous : développement uniquement */
  debugDiagnostics?: boolean;
}

/** Sémantique Leila des modèles (restrictions métier propres à Leila). */
const SEMANTICS: Record<string, ResourceSemantic> = { "hr.employee": "employee", "hr.attendance": "attendance" };

interface OdooMenu {
  id: number | "root";
  name: string;
  children: number[];
  actionID: number | false;
  actionModel: string | false;
  xmlid: string;
}

interface ActionTarget {
  actionId: number;
}
interface ResourceTarget {
  model: string;
  actionId: number;
}
interface ViewTarget extends ResourceTarget {
  viewType: "list" | "form" | "search";
}

interface ActionDef {
  id: number;
  name: string;
  model: string;
  domain: unknown[] | null;
  contextOk: boolean;
  views: { list: number | false; form: number | false; search: number | false };
}

interface ViewBundle {
  action: ActionDef;
  fields: Record<string, OdooFieldMeta>;
  parsed: { list: ParsedView; form: ParsedView; search: ParsedView };
  canEdit: boolean;
}

const WRITABLE_TYPES = new Set<FieldDescriptor["type"]>(["text", "multiline", "integer", "decimal", "boolean", "selection", "date", "datetime", "reference"]);
const NOT_READ = new Set(["binary", "html", "properties", "properties_definition", "json", "image"]);

export class OdooUiAdapter implements ViewRepository, RecordRepository, CommandDispatcher {
  private readonly cache: DefinitionCache<ViewBundle>;
  private readonly commands: readonly OdooCommand[];
  private readonly groupsOf = new WeakMap<OdooTransport, Promise<string>>();

  constructor(
    private readonly transports: OdooTransportFactory,
    private readonly config: OdooUiConfig,
  ) {
    this.cache = new DefinitionCache(config.cacheTtlMs);
    this.commands = config.commands ?? ODOO_COMMANDS;
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  async navigation(viewer: ViewerContext): Promise<Navigation> {
    const t = this.transports.for(viewer);
    const owner = this.owner(viewer);
    const menus = await t.callKw<Record<string, OdooMenu>>({ model: "ir.ui.menu", method: "load_web_menus", args: [false], kwargs: {} });
    const build = (id: number): MenuNode | null => {
      const m = menus[String(id)];
      if (!m) return null;
      const children = m.children.map(build).filter((c): c is MenuNode => c !== null);
      const node: MenuNode = { key: this.config.keys.issue(owner, "menu", { menuId: id }), label: m.name, available: false, children };
      if (m.actionID && m.actionModel === "ir.actions.act_window") {
        node.actionKey = this.config.keys.issue(owner, "action", { actionId: m.actionID } satisfies ActionTarget);
        node.available = true;
      } else if (m.actionID) {
        node.available = false; // autre type d'action (client, serveur, URL) : hors moteur générique
      } else {
        node.available = children.some((c) => c.available);
      }
      return node;
    };
    const roots = (menus["root"]?.children ?? [])
      .filter((id) => this.config.menuRoots.length === 0 || this.config.menuRoots.includes(menus[String(id)]?.xmlid ?? ""))
      .map(build)
      .filter((m): m is MenuNode => m !== null);
    return NavigationSchema.parse({ schemaVersion: SCHEMA_VERSION, menus: roots });
  }

  async action(actionKey: string, viewer: ViewerContext): Promise<ActionDescriptor> {
    const { actionId } = this.config.keys.resolve<ActionTarget>(this.owner(viewer), "action", actionKey);
    const t = this.transports.for(viewer);
    const action = await this.actionDef(t, actionId);
    const owner = this.owner(viewer);
    const available = action.domain !== null && action.contextOk;
    const resource: ResourceTarget = { model: action.model, actionId };
    const view = (viewType: ViewTarget["viewType"]) => this.config.keys.issue(owner, "view", { ...resource, viewType } satisfies ViewTarget);
    return ActionDescriptorSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      actionKey,
      title: action.name,
      resourceKey: this.config.keys.issue(owner, "resource", resource),
      available,
      views: available ? { list: view("list"), form: view("form"), search: view("search") } : {},
      defaultView: "list",
      diagnostics: available
        ? []
        : [{ code: "unsupported_action", severity: "blocking", path: "action", message: "Domaine ou contexte d'action non pris en charge : action indisponible." }],
    });
  }

  async view(viewKey: string, viewer: ViewerContext): Promise<ViewSchema> {
    const target = this.config.keys.resolve<ViewTarget>(this.owner(viewer), "view", viewKey);
    const t = this.transports.for(viewer);
    const bundle = await this.bundle(t, viewer, target.actionId);
    const parsed = bundle.parsed[target.viewType];
    // Mode diagnostic (§ 5.2) : détail technique pour les administrateurs techniques ;
    // pour les autres, le message seul (sans emplacement ni balise d'origine).
    const detailed = this.config.debugDiagnostics === true || (await hasGroup(t, "base.group_system").catch(() => false));
    const diagnostics = detailed ? parsed.diagnostics : parsed.diagnostics.map(({ code, severity, message }) => ({ code, severity, path: "", message }));
    return ViewSchemaSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      viewKey,
      viewType: target.viewType,
      title: bundle.action.name,
      resourceKey: this.config.keys.issue(this.owner(viewer), "resource", { model: target.model, actionId: target.actionId } satisfies ResourceTarget),
      resourceKind: "compatibility",
      capabilities: { canCreate: false, canEdit: bundle.canEdit, canDelete: false },
      fields: parsed.fields,
      root: this.withCommandKeys(parsed.root, viewer),
      ...(parsed.decorations.length ? { decorations: parsed.decorations } : {}),
      diagnostics,
    });
  }

  async refreshCache(viewer: ViewerContext): Promise<{ cleared: number }> {
    // Réservé aux administrateurs techniques (groupe Paramètres d'Odoo)
    const t = this.transports.for(viewer);
    const uid = await t.userId();
    const admin = await t.callKw<boolean>({ model: "res.users", method: "has_group", args: [[uid], "base.group_system"], kwargs: {} });
    if (!admin) throw new DomainError("Réservé aux administrateurs techniques.", "forbidden");
    return { cleared: this.cache.clear() };
  }

  // ─── Enregistrements ────────────────────────────────────────────────────────

  async query(resourceKey: string, request: QueryRequest, viewer: ViewerContext): Promise<QueryResult> {
    const target = this.config.keys.resolve<ResourceTarget>(this.owner(viewer), "resource", resourceKey);
    const t = this.transports.for(viewer);
    const bundle = await this.bundle(t, viewer, target.actionId);
    if (bundle.action.domain === null) throw new DomainError("Action indisponible.", "forbidden");
    const { list, search } = bundle.parsed;

    // Filtres : uniquement ceux du schéma de recherche, utilisables ; OU dans un groupe, ET entre groupes
    const byGroup = new Map<number, unknown[][]>();
    for (const key of request.filters) {
      const f = search.filters.find((x) => x.key === key);
      if (!f) throw new DomainError(`Filtre inconnu : ${key}`, "invalid");
      if (!f.domain) throw new DomainError("Filtre indisponible.", "invalid");
      byGroup.set(f.group, [...(byGroup.get(f.group) ?? []), f.domain]);
    }
    const searchTerms = request.search.map((s) => {
      if (!search.searchFields[s.field]?.usable) throw new DomainError(`Recherche indisponible sur ${s.field}.`, "invalid");
      return [[s.field, "ilike", s.value]];
    });
    const domain = combineDomains("&", [
      bundle.action.domain,
      ...[...byGroup.values()].map((ds) => combineDomains("|", ds)),
      ...searchTerms,
    ]);

    const columns = list.root.filter((n): n is Extract<Node, { kind: "column" }> => n.kind === "column").map((c) => c.field);
    const fields = this.readableFields(bundle, [...columns, ...list.conditionFields]);
    let order: string | undefined;
    if (request.order) {
      const meta = bundle.fields[request.order.field];
      if (!columns.includes(request.order.field) || !meta || meta.sortable === false || meta.store === false) {
        throw new DomainError("Tri impossible sur cette colonne.", "invalid");
      }
      order = `${request.order.field} ${request.order.direction}`;
    }
    const [rows, total] = await Promise.all([
      t.callKw<Record<string, unknown>[]>({
        model: target.model,
        method: "search_read",
        args: [domain],
        kwargs: { fields, limit: request.limit, offset: request.offset, ...(order ? { order } : {}) },
      }),
      t.callKw<number>({ model: target.model, method: "search_count", args: [domain], kwargs: {} }),
    ]);
    return QueryResultSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      records: rows.map((row) => ({ id: row["id"], values: this.toValues(bundle, row, fields) })),
      total,
    });
  }

  async read(resourceKey: string, id: number, viewer: ViewerContext): Promise<RecordPayload> {
    const target = this.config.keys.resolve<ResourceTarget>(this.owner(viewer), "resource", resourceKey);
    const t = this.transports.for(viewer);
    const bundle = await this.bundle(t, viewer, target.actionId);
    return this.readWith(t, bundle, target, resourceKey, id, viewer);
  }

  async write(resourceKey: string, id: number, patch: WritePatch, viewer: ViewerContext): Promise<RecordPayload> {
    const target = this.config.keys.resolve<ResourceTarget>(this.owner(viewer), "resource", resourceKey);
    const t = this.transports.for(viewer);
    const bundle = await this.bundle(t, viewer, target.actionId);
    const current = await this.readWith(t, bundle, target, resourceKey, id, viewer);
    if (!current.access.canEdit) throw new DomainError("Enregistrement non modifiable pour toi.", "forbidden");

    const form = bundle.parsed.form;
    // Valeurs après modification, pour évaluer les conditions comme l'écran le ferait
    const merged: Record<string, unknown> = { ...current.values };
    for (const [key, value] of Object.entries(patch.values)) {
      const d = form.fields[key];
      merged[key] = d?.type === "reference" && typeof value === "number" ? { id: value, label: "" } : value;
    }
    const scope: ConditionScope = { values: merged };
    const odooValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch.values)) {
      const descriptor = form.fields[key];
      if (!descriptor || !WRITABLE_TYPES.has(descriptor.type) || descriptor.readonly || current.access.readonlyFields.includes(key)) {
        throw new DomainError(`Champ non modifiable : ${key}`, "forbidden");
      }
      if (!editableInForm(form.root, key, scope)) throw new DomainError(`Champ non modifiable : ${key}`, "forbidden");
      odooValues[key] = await this.toOdoo(t, bundle, descriptor, value);
    }
    if (Object.keys(odooValues).length > 0) {
      await t.callKw({ model: target.model, method: "write", args: [[id], odooValues], kwargs: {} });
    }
    return this.readWith(t, bundle, target, resourceKey, id, viewer);
  }

  async lookup(resourceKey: string, field: string, search: string, viewer: ViewerContext): Promise<LookupResult> {
    const target = this.config.keys.resolve<ResourceTarget>(this.owner(viewer), "resource", resourceKey);
    const t = this.transports.for(viewer);
    const bundle = await this.bundle(t, viewer, target.actionId);
    const descriptor = bundle.parsed.form.fields[field];
    const domain = bundle.parsed.form.fieldDomains[field];
    const relation = bundle.fields[field]?.relation;
    if (!descriptor?.relation?.lookup || !domain || !relation) throw new DomainError("Sélection indisponible pour ce champ.", "forbidden");
    const rows = await t.callKw<[number, string][]>({ model: relation, method: "name_search", args: [search.slice(0, 100), domain, "ilike", 20], kwargs: {} });
    return { options: rows.map(([id, label]) => ({ id, label })) };
  }

  async execute(commandKey: string, request: CommandRequest, viewer: ViewerContext): Promise<RecordPayload> {
    const owner = this.owner(viewer);
    const { commandId } = this.config.keys.resolve<{ commandId: string }>(owner, "command", commandKey);
    const command = this.commands.find((c) => c.id === commandId);
    const target = this.config.keys.resolve<ResourceTarget>(owner, "resource", request.resourceKey);
    if (!command || command.model !== target.model) throw new DomainError("Commande inconnue pour cette ressource.", "not_found");
    const t = this.transports.for(viewer);
    const bundle = await this.bundle(t, viewer, target.actionId);
    const current = await this.readWith(t, bundle, target, request.resourceKey, request.recordId, viewer);
    // Même règle que l'affichage : bouton visible (condition connue et fausse) et droits d'écriture
    if (!current.commands[commandKey]?.available) throw new DomainError("Commande indisponible pour cet enregistrement.", "forbidden");
    await t.callKw({ model: command.model, method: command.method, args: [[request.recordId]], kwargs: {} });
    return this.readWith(t, bundle, target, request.resourceKey, request.recordId, viewer);
  }

  // ─── Interne ────────────────────────────────────────────────────────────────

  private owner(viewer: ViewerContext): string {
    return `${this.config.db}:${viewer.id}`;
  }

  private withCommandKeys(nodes: Node[], viewer: ViewerContext): Node[] {
    const owner = this.owner(viewer);
    return nodes.map((n): Node => {
      if (n.kind === "button" && n.commandKey) return { ...n, commandKey: this.config.keys.issue(owner, "command", { commandId: n.commandKey }) };
      if (n.kind === "notebook") return { ...n, pages: n.pages.map((p) => ({ ...p, children: this.withCommandKeys(p.children, viewer) })) };
      if ("children" in n) return { ...n, children: this.withCommandKeys(n.children, viewer) };
      return n;
    });
  }

  private async readWith(
    t: OdooTransport,
    bundle: ViewBundle,
    target: ResourceTarget,
    resourceKey: string,
    id: number,
    viewer: ViewerContext,
  ): Promise<RecordPayload> {
    const form = bundle.parsed.form;
    const fieldNames = this.readableFields(bundle, [...Object.keys(form.fields), ...form.conditionFields]);
    const [rows, writable] = await Promise.all([
      t.callKw<Record<string, unknown>[]>({ model: target.model, method: "read", args: [[id], fieldNames], kwargs: {} }),
      recordAccess(t, target.model, [id], "write").catch(() => new Map<number, boolean>()),
    ]);
    const row = rows[0];
    if (!row) throw new DomainError("Enregistrement introuvable.", "not_found");
    const values = this.toValues(bundle, row, fieldNames);
    const restriction = leilaRestriction(SEMANTICS[target.model] ?? "other", id, viewer);
    const canEdit = writable.get(id) === true && !restriction.readonly;
    const scope: ConditionScope = { values };
    const commands: RecordPayload["commands"] = {};
    for (const button of collectButtons(form.root)) {
      if (!button.commandKey) continue;
      const key = this.config.keys.issue(this.owner(viewer), "command", { commandId: button.commandKey });
      commands[key] = { available: writable.get(id) === true && !restriction.readonly && resolveButton(button.invisible, scope) === "visible" };
    }
    return RecordPayloadSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      resourceKey,
      id,
      values,
      access: { canEdit, readonlyFields: restriction.readonly ? Object.keys(form.fields) : [] },
      commands,
    });
  }

  /** Champs à lire : lisibles pour ce compte (présents dans les métadonnées), hors contenus lourds. */
  private readableFields(bundle: ViewBundle, names: Iterable<string>): string[] {
    const out = new Set<string>();
    for (const name of names) {
      const meta = bundle.fields[name];
      if (meta && !NOT_READ.has(meta.type)) out.add(name);
    }
    return [...out];
  }

  private toValues(bundle: ViewBundle, row: Record<string, unknown>, names: string[]): Record<string, FieldValue> {
    const values: Record<string, FieldValue> = {};
    for (const name of names) values[name] = toLeilaValue(bundle.fields[name]?.type ?? "", row[name]);
    return values;
  }

  private async toOdoo(t: OdooTransport, bundle: ViewBundle, d: FieldDescriptor, value: unknown): Promise<unknown> {
    const bad = () => new DomainError(`Valeur invalide pour ${d.label}.`, "invalid");
    if (value === null) return false;
    switch (d.type) {
      case "text":
      case "multiline":
        if (typeof value !== "string") throw bad();
        return value === "" ? false : value;
      case "integer":
        if (typeof value !== "number" || !Number.isInteger(value)) throw bad();
        return value;
      case "decimal":
        if (typeof value !== "number" || !Number.isFinite(value)) throw bad();
        return value;
      case "boolean":
        if (typeof value !== "boolean") throw bad();
        return value;
      case "selection":
        if (typeof value !== "string" || !d.options?.some((o) => o.value === value)) throw bad();
        return value;
      case "date":
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad();
        return value;
      case "datetime":
        if (typeof value !== "string") throw bad();
        return toOdooDatetime(value);
      case "reference": {
        if (typeof value !== "number" || !Number.isInteger(value)) throw bad();
        const relation = bundle.fields[d.key]?.relation;
        const domain = bundle.parsed.form.fieldDomains[d.key];
        if (!relation || !domain || !d.relation?.lookup) throw new DomainError("Sélection indisponible pour ce champ.", "forbidden");
        // La valeur doit être sélectionnable par CET utilisateur, dans le domaine du champ
        const count = await t.callKw<number>({ model: relation, method: "search_count", args: [[...domain, ["id", "=", value]]], kwargs: {} });
        if (count !== 1) throw bad();
        return value;
      }
      default:
        throw new DomainError(`Champ non modifiable : ${d.key}`, "forbidden");
    }
  }

  private async actionDef(t: OdooTransport, actionId: number): Promise<ActionDef> {
    const rows = await t.callKw<Record<string, unknown>[]>({
      model: "ir.actions.act_window",
      method: "read",
      args: [[actionId], ["name", "res_model", "views", "domain", "context", "search_view_id"]],
      kwargs: {},
    });
    const row = rows[0];
    if (!row) throw new DomainError("Action introuvable.", "not_found");
    const views = { list: false as number | false, form: false as number | false, search: false as number | false };
    for (const [id, type] of (row["views"] as [number | false, string][] | undefined) ?? []) {
      if ((type === "list" || type === "tree") && views.list === false) views.list = id;
      if (type === "form" && views.form === false) views.form = id;
    }
    const search = row["search_view_id"];
    if (Array.isArray(search) && typeof search[0] === "number") views.search = search[0];
    const rawDomain = row["domain"];
    const domain = rawDomain === false || rawDomain === undefined || rawDomain === "" || rawDomain === "[]" ? [] : asDomain(parseLiteral(rawDomain as string));
    const rawContext = row["context"];
    const context = rawContext === false || rawContext === undefined || rawContext === "" ? {} : parseLiteral(rawContext as string);
    return {
      id: actionId,
      name: String(row["name"] ?? ""),
      model: String(row["res_model"] ?? ""),
      domain,
      contextOk: context !== null && typeof context === "object" && !Array.isArray(context),
      views,
    };
  }

  /** Vues résolues (get_views) de l'action, analysées ; cache isolé par utilisateur, droits, société, langue. */
  private async bundle(t: OdooTransport, viewer: ViewerContext, actionId: number): Promise<ViewBundle> {
    const action = await this.actionDef(t, actionId);
    const uid = await t.userId();
    const groups = await this.userGroups(t, uid);
    const key = [this.config.db, uid, groups, viewer.companyId ?? "-", this.config.lang, actionId, action.views.list, action.views.form, action.views.search].join("|");
    return this.cache.get(key, async () => {
      const [res, canEdit] = await Promise.all([
        t.callKw<{ views: Record<string, { arch: string }>; models: Record<string, { fields?: Record<string, OdooFieldMeta> } & Record<string, OdooFieldMeta>> }>({
          model: action.model,
          method: "get_views",
          args: [],
          kwargs: {
            views: [[action.views.list, "list"], [action.views.form, "form"], [action.views.search, "search"]],
            options: { action_id: actionId, load_filters: false, toolbar: false },
          },
        }),
        t.callKw<boolean>({ model: action.model, method: "has_access", args: [[], "write"], kwargs: {} }).catch(() => false),
      ]);
      const modelEntry = res.models[action.model];
      const fields = (modelEntry?.fields ?? modelEntry ?? {}) as Record<string, OdooFieldMeta>;
      const ctx = {
        model: action.model,
        fields,
        commandFor: (b: { name: string; type: string }) =>
          b.type === "object" ? this.commands.find((c) => c.model === action.model && c.method === b.name)?.id : undefined,
      };
      const arch = (type: string) => res.views[type]?.arch ?? `<${type}/>`;
      return {
        action,
        fields,
        parsed: { list: parseArch(arch("list"), "list", ctx), form: parseArch(arch("form"), "form", ctx), search: parseArch(arch("search"), "search", ctx) },
        canEdit,
      };
    });
  }

  private userGroups(t: OdooTransport, uid: number): Promise<string> {
    let pending = this.groupsOf.get(t);
    if (!pending) {
      pending = t
        .callKw<{ groups_id: number[] }[]>({ model: "res.users", method: "read", args: [[uid], ["groups_id"]], kwargs: {} })
        .then((rows) => [...(rows[0]?.groups_id ?? [])].sort((a, b) => a - b).join(","));
      this.groupsOf.set(t, pending);
      pending.catch(() => this.groupsOf.delete(t));
    }
    return pending;
  }
}

/** Valeur Odoo → valeur Leila (ADR-001 § 4). */
export function toLeilaValue(type: string, raw: unknown): FieldValue {
  if (type === "boolean") return raw === true;
  if (raw === false || raw === undefined || raw === null) return null;
  switch (type) {
    case "many2one":
      return Array.isArray(raw) && typeof raw[0] === "number" ? { id: raw[0], label: String(raw[1] ?? "") } : null;
    case "one2many":
    case "many2many":
      return Array.isArray(raw) ? raw.filter((x): x is number => typeof x === "number") : null;
    case "datetime":
      return fromOdooDatetime(raw);
    case "integer":
    case "float":
    case "monetary":
      return typeof raw === "number" ? raw : null;
    case "char":
    case "text":
    case "selection":
    case "date":
      return typeof raw === "string" ? raw : null;
    default:
      return null;
  }
}

function collectButtons(nodes: Node[], out: Extract<Node, { kind: "button" }>[] = []): Extract<Node, { kind: "button" }>[] {
  for (const n of nodes) {
    if (n.kind === "button") out.push(n);
    else if (n.kind === "notebook") n.pages.forEach((p) => collectButtons(p.children, out));
    else if ("children" in n) collectButtons(n.children, out);
  }
  return out;
}
