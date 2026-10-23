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
  type LineValue,
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
import { type DomainEnvName, type DomainExpr, domainRefs, evaluateDomain, parseDomain } from "./OdooDomain.js";
import { combineDomains, type Literal, parseLiteral } from "./OdooExpressionParser.js";
import { groupSpec, type OdooFieldMeta, type ParsedView, parseArch, type ServerGroupBy } from "./OdooViewParser.js";

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

export interface OdooMenu {
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
  /** Domaine de l'action (évalué à chaque requête : uid, société) ; null si hors sous-ensemble */
  domain: DomainExpr | null;
  /** Contexte littéral ; null s'il ne l'est pas (action indisponible) */
  context: Record<string, Literal> | null;
  /** Raison pour laquelle l'action exige un écran natif Leila */
  nativeOnly?: string;
  views: { list: number | false; form: number | false; search: number | false };
}

/** Modèles dont l'écran Odoo n'est pas un écran de données (assistant de paramétrage…) : écran natif requis. */
const NATIVE_ONLY: Record<string, string> = {
  "res.config.settings": "Écran de paramètres : un écran natif Leila est nécessaire.",
};

interface ViewBundle {
  action: ActionDef;
  fields: Record<string, OdooFieldMeta>;
  parsed: { list: ParsedView; form: ParsedView; search: ParsedView };
  canEdit: boolean;
}

const WRITABLE_TYPES = new Set<FieldDescriptor["type"]>(["text", "multiline", "integer", "decimal", "boolean", "selection", "date", "datetime", "reference"]);
const NOT_READ = new Set(["binary", "html", "properties", "properties_definition", "json", "image"]);
/** Lignes liées lues pour une fiche (les suivantes sont seulement comptées). */
const MAX_LINES = 40;
/** Groupes renvoyés pour un regroupement. */
const MAX_GROUPS = 200;
/** Taille maximale d'une image servie. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Lecture : les champs binaires (images) ne renvoient que leur taille, jamais leur contenu. */
const BIN_SIZE = { context: { bin_size: true } };

/** Images servies : formats matriciels reconnus par leur signature (jamais SVG ni HTML). */
export function imageType(data: Buffer): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 6 && (data.subarray(0, 6).toString("latin1") === "GIF87a" || data.subarray(0, 6).toString("latin1") === "GIF89a")) return "image/gif";
  if (data.length >= 12 && data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

interface Group {
  key: string;
  label: string;
  count: number;
  domain: unknown[];
}

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
    const menus = await loadMenus(t);
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
    const env = await this.domainEnv(t, viewer);
    const available = !action.nativeOnly && action.context !== null && action.domain !== null && evaluateDomain(action.domain, { env }) !== null;
    // Filtres par défaut de l'action (search_default_<nom>), s'ils sont utilisables
    let defaultFilters: string[] = [];
    let defaultGroupBy: string | undefined;
    if (available && action.context) {
      const bundle = await this.bundle(t, viewer, actionId);
      defaultFilters = bundle.parsed.search.filters
        .filter((f) => f.domain !== null && action.context?.[`search_default_${f.name}`])
        .map((f) => f.key);
      // Regroupement par défaut : search_default_<regroupement>, sinon group_by de l'action
      const groupBys = bundle.parsed.search.groupBys;
      defaultGroupBy = groupBys.find((g) => g.name && action.context?.[`search_default_${g.name}`])?.key ?? bundle.parsed.search.defaultGroupKey;
    }
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
      ...(defaultFilters.length ? { defaultFilters } : {}),
      ...(defaultGroupBy ? { defaultGroupBy } : {}),
      diagnostics: available
        ? []
        : [{ code: "unsupported_action", severity: "blocking", path: "action", message: action.nativeOnly ?? "Domaine ou contexte d'action non pris en charge : action indisponible." }],
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
    const env = await this.domainEnv(t, viewer);
    const actionDomain = bundle.action.nativeOnly || !bundle.action.domain ? null : evaluateDomain(bundle.action.domain, { env });
    if (actionDomain === null) throw new DomainError("Action indisponible.", "forbidden");
    const { list, search } = bundle.parsed;

    // Filtres : uniquement ceux du schéma de recherche, utilisables ; OU dans un groupe, ET entre groupes
    const byGroup = new Map<number, unknown[][]>();
    for (const key of request.filters) {
      const f = search.filters.find((x) => x.key === key);
      if (!f) throw new DomainError(`Filtre inconnu : ${key}`, "invalid");
      const d = f.domain ? evaluateDomain(f.domain, { env }) : null;
      if (!d) throw new DomainError("Filtre indisponible.", "invalid");
      byGroup.set(f.group, [...(byGroup.get(f.group) ?? []), d]);
    }
    const searchTerms = request.search.map((s) => {
      const field = search.searchFields[s.field];
      if (!field?.usable) throw new DomainError(`Recherche indisponible sur ${s.field}.`, "invalid");
      if (!field.filterDomain) return [[s.field, "ilike", s.value]];
      const d = evaluateDomain(field.filterDomain, { env: { ...env, self: s.value } });
      if (!d) throw new DomainError(`Recherche indisponible sur ${s.field}.`, "invalid");
      return d;
    });
    let domain = combineDomains("&", [
      actionDomain,
      ...[...byGroup.values()].map((ds) => combineDomains("|", ds)),
      ...searchTerms,
    ]);

    // Regroupement : clé du schéma de recherche ; groupes et leurs domaines calculés par Odoo
    if (request.groupBy !== undefined) {
      const g = search.groupBys.find((x) => x.key === request.groupBy);
      if (!g) throw new DomainError(`Regroupement inconnu : ${request.groupBy}`, "invalid");
      const groups = await this.groups(t, target.model, domain, g, bundle.fields);
      if (request.group === undefined) {
        return QueryResultSchema.parse({
          schemaVersion: SCHEMA_VERSION,
          records: [],
          total: groups.reduce((n, x) => n + x.count, 0),
          groups: groups.map(({ key, label, count }) => ({ key, label, count })),
        });
      }
      const found = groups.find((x) => x.key === request.group);
      if (!found) return QueryResultSchema.parse({ schemaVersion: SCHEMA_VERSION, records: [], total: 0 });
      domain = found.domain;
    } else if (request.group !== undefined) {
      throw new DomainError("Groupe sans regroupement.", "invalid");
    }

    const columns = list.root.filter((n): n is Extract<Node, { kind: "column" }> => n.kind === "column").map((c) => c.field);
    const fields = this.readableFields(bundle, list, [...columns, ...list.conditionFields]);
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
        kwargs: { fields, limit: request.limit, offset: request.offset, ...(order ? { order } : {}), ...BIN_SIZE },
      }),
      t.callKw<number>({ model: target.model, method: "search_count", args: [domain], kwargs: {} }),
    ]);
    const values = await this.toValues(t, bundle, list, rows, fields, "list");
    return QueryResultSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      records: rows.map((row, i) => ({ id: row["id"], values: values[i] })),
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
    const scope: ConditionScope = { values: { ...merged, id } };
    const odooValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch.values)) {
      const descriptor = form.fields[key];
      if (!descriptor || !WRITABLE_TYPES.has(descriptor.type) || descriptor.readonly || current.access.readonlyFields.includes(key)) {
        throw new DomainError(`Champ non modifiable : ${key}`, "forbidden");
      }
      if (!editableInForm(form.root, key, scope)) throw new DomainError(`Champ non modifiable : ${key}`, "forbidden");
      odooValues[key] = await this.toOdoo(t, bundle, descriptor, value, scope.values, viewer);
    }
    if (Object.keys(odooValues).length > 0) {
      await t.callKw({ model: target.model, method: "write", args: [[id], odooValues], kwargs: {} });
    }
    return this.readWith(t, bundle, target, resourceKey, id, viewer);
  }

  async lookup(resourceKey: string, field: string, request: { search: string; recordId?: number | undefined }, viewer: ViewerContext): Promise<LookupResult> {
    const target = this.config.keys.resolve<ResourceTarget>(this.owner(viewer), "resource", resourceKey);
    const t = this.transports.for(viewer);
    const bundle = await this.bundle(t, viewer, target.actionId);
    const descriptor = bundle.parsed.form.fields[field];
    const expr = bundle.parsed.form.fieldDomains[field];
    const relation = bundle.fields[field]?.relation;
    if (!descriptor?.relation?.lookup || !expr || !relation) throw new DomainError("Sélection indisponible pour ce champ.", "forbidden");
    // Domaine dépendant de la fiche : valeurs lues sous l'identité de l'utilisateur (droits appliqués)
    let values: Record<string, unknown> = {};
    if (domainRefs(expr).fields.size > 0) {
      if (request.recordId === undefined) throw new DomainError("Sélection indisponible sans fiche.", "forbidden");
      const current = await this.readWith(t, bundle, target, resourceKey, request.recordId, viewer);
      values = { ...current.values, id: current.id };
    }
    const domain = evaluateDomain(expr, { values, env: await this.domainEnv(t, viewer) });
    if (!domain) throw new DomainError("Sélection indisponible : le domaine dépend d'une valeur non lisible.", "forbidden");
    const rows = await t.callKw<[number, string][]>({ model: relation, method: "name_search", args: [request.search.slice(0, 100), domain, "ilike", 20], kwargs: {} });
    return { options: rows.map(([id, label]) => ({ id, label })) };
  }

  async image(resourceKey: string, id: number, field: string, viewer: ViewerContext): Promise<{ contentType: string; data: Buffer }> {
    const target = this.config.keys.resolve<ResourceTarget>(this.owner(viewer), "resource", resourceKey);
    const t = this.transports.for(viewer);
    const bundle = await this.bundle(t, viewer, target.actionId);
    // Seulement un champ publié comme image par une vue de cette ressource
    const published = bundle.parsed.form.fields[field]?.type === "image" || bundle.parsed.list.fields[field]?.type === "image";
    if (!published || !bundle.fields[field]) throw new DomainError("Image introuvable.", "not_found");
    const rows = await t.callKw<Record<string, unknown>[]>({ model: target.model, method: "read", args: [[id], [field]], kwargs: {} });
    const raw = rows[0]?.[field];
    if (typeof raw !== "string" || raw.length === 0 || raw.length > (MAX_IMAGE_BYTES * 4) / 3 + 4) throw new DomainError("Image introuvable.", "not_found");
    const data = Buffer.from(raw, "base64");
    const contentType = imageType(data);
    if (!contentType) throw new DomainError("Format d'image non pris en charge.", "not_found");
    return { contentType, data };
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
    const fieldNames = this.readableFields(bundle, form, [...Object.keys(form.fields), ...form.conditionFields]);
    const [rows, writable] = await Promise.all([
      t.callKw<Record<string, unknown>[]>({ model: target.model, method: "read", args: [[id], fieldNames], kwargs: BIN_SIZE }),
      recordAccess(t, target.model, [id], "write").catch(() => new Map<number, boolean>()),
    ]);
    const row = rows[0];
    if (!row) throw new DomainError("Enregistrement introuvable.", "not_found");
    const [values = {}] = await this.toValues(t, bundle, form, [row], fieldNames, "form");
    const restriction = leilaRestriction(SEMANTICS[target.model] ?? "other", id, viewer);
    const canEdit = writable.get(id) === true && !restriction.readonly;
    const scope: ConditionScope = { values: { ...values, id } };
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

  /**
   * Champs à lire : lisibles pour ce compte (présents dans les métadonnées), hors contenus lourds.
   * Images publiées : lues avec bin_size (la taille sert de jeton de version, jamais le contenu).
   */
  private readableFields(bundle: ViewBundle, view: ParsedView, names: Iterable<string>): string[] {
    const out = new Set<string>();
    for (const name of names) {
      if (name === "id") continue;
      const meta = bundle.fields[name];
      if (meta && (!NOT_READ.has(meta.type) || view.fields[name]?.type === "image")) out.add(name);
    }
    return [...out];
  }

  /**
   * Valeurs Leila de lignes lues. Étiquettes : noms des enregistrements liés lus avec les droits
   * de l'utilisateur (illisibles → ids seuls). Lignes liées : en fiche, les premières lignes et
   * leurs colonnes ; en liste, le nombre seulement.
   */
  private async toValues(
    t: OdooTransport,
    bundle: ViewBundle,
    view: ParsedView,
    rows: Record<string, unknown>[],
    names: string[],
    mode: "form" | "list",
  ): Promise<Record<string, FieldValue>[]> {
    const out = rows.map((row) => {
      const values: Record<string, FieldValue> = {};
      for (const name of names) {
        const d = view.fields[name];
        const raw = row[name];
        values[name] = d?.type === "image" ? (typeof raw === "string" && raw !== "" ? raw : null) : toLeilaValue(bundle.fields[name]?.type ?? "", raw);
      }
      return values;
    });
    for (const name of names) {
      const d = view.fields[name];
      const relation = bundle.fields[name]?.relation;
      if (!d || !relation) continue;
      if (d.type === "references") {
        const ids = [...new Set(out.flatMap((v) => (Array.isArray(v[name]) ? (v[name] as number[]) : [])))];
        if (ids.length === 0) continue;
        const labels = await t
          .callKw<{ id: number; display_name: string }[]>({ model: relation, method: "read", args: [ids, ["display_name"]], kwargs: {} })
          .then((r) => new Map(r.map((x) => [x.id, String(x.display_name ?? "")])))
          .catch(() => null);
        if (!labels) continue; // relation illisible : ids seuls (affichés comme un nombre)
        for (const v of out) {
          const list = v[name];
          if (Array.isArray(list)) v[name] = (list as number[]).filter((id) => labels.has(id)).map((id) => ({ id, label: labels.get(id) ?? "" }));
        }
      } else if (d.type === "lines") {
        const lines = view.lines[name];
        for (const v of out) {
          const ids = Array.isArray(v[name]) ? (v[name] as number[]) : [];
          if (mode === "list" || !lines || ids.length === 0) {
            v[name] = { lines: [], total: ids.length };
            continue;
          }
          const shown = ids.slice(0, MAX_LINES);
          const read = await t
            .callKw<Record<string, unknown>[]>({ model: lines.relation, method: "read", args: [shown, lines.columns], kwargs: {} })
            .catch(() => null);
          if (!read) {
            v[name] = null; // lignes illisibles pour ce compte
            continue;
          }
          v[name] = {
            lines: read.map((r) => ({
              id: Number(r["id"]),
              values: Object.fromEntries(lines.columns.map((c) => [c, toLeilaValue(lines.meta[c]?.type ?? "", r[c]) as LineValue])),
            })),
            total: ids.length,
          };
        }
      }
    }
    return out;
  }

  /** Groupes d'un regroupement : comptes et domaines calculés par Odoo, avec les droits de l'utilisateur. */
  private async groups(t: OdooTransport, model: string, domain: unknown[], g: ServerGroupBy, fields: Record<string, OdooFieldMeta>): Promise<Group[]> {
    const rows = await t.callKw<Record<string, unknown>[]>({
      model,
      method: "read_group",
      args: [domain, [g.field], [g.spec]],
      kwargs: { lazy: true, limit: MAX_GROUPS },
    });
    const meta = fields[g.field];
    return rows
      .filter((r) => Array.isArray(r["__domain"]))
      .map((r) => {
        const raw = r[g.spec] ?? r[g.field];
        const count = Number(r[`${g.field}_count`] ?? r["__count"] ?? 0);
        return { key: groupKey(raw), label: groupLabel(raw, meta), count, domain: r["__domain"] as unknown[] };
      });
  }

  private async toOdoo(
    t: OdooTransport,
    bundle: ViewBundle,
    d: FieldDescriptor,
    value: unknown,
    values: Readonly<Record<string, unknown>>,
    viewer: ViewerContext,
  ): Promise<unknown> {
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
        const expr = bundle.parsed.form.fieldDomains[d.key];
        // Domaine évalué avec les valeurs APRÈS modification, comme l'écran les montre
        const domain = expr ? evaluateDomain(expr, { values, env: await this.domainEnv(t, viewer) }) : null;
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
    // actionId vient d'une clé émise depuis les menus de CET utilisateur : la lecture
    // en sudo par /web/action/load ne porte que sur des actions qui lui sont publiées.
    const row = await readWindowAction(t, actionId);
    if (!row) throw new DomainError("Action introuvable.", "not_found");
    const views = { list: false as number | false, form: false as number | false, search: false as number | false };
    for (const [id, type] of (row["views"] as [number | false, string][] | undefined) ?? []) {
      if ((type === "list" || type === "tree") && views.list === false) views.list = id;
      if (type === "form" && views.form === false) views.form = id;
    }
    const search = row["search_view_id"];
    if (Array.isArray(search) && typeof search[0] === "number") views.search = search[0];
    const domain = parseDomain(row["domain"]);
    const rawContext = row["context"];
    const context = rawContext === false || rawContext === undefined || rawContext === "" ? {} : parseLiteral(rawContext as string);
    const model = String(row["res_model"] ?? "");
    const nativeOnly = NATIVE_ONLY[model];
    return {
      id: actionId,
      name: String(row["name"] ?? ""),
      model,
      // L'action n'utilise que uid et la société : jamais de valeur de fiche
      domain: domain && domainRefs(domain).fields.size === 0 && [...domainRefs(domain).env].every((e) => e !== "self") ? domain : null,
      context: context !== null && typeof context === "object" && !Array.isArray(context) ? (context as Record<string, Literal>) : null,
      ...(nativeOnly ? { nativeOnly } : {}),
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
      const models = Object.fromEntries(
        Object.entries(res.models).map(([m, e]) => [m, ((e as { fields?: Record<string, OdooFieldMeta> }).fields ?? e) as Record<string, OdooFieldMeta>]),
      );
      const ctx = {
        model: action.model,
        fields,
        models,
        actionContext: action.context ?? undefined,
        commandFor: (b: { name: string; type: string }) =>
          b.type === "object" ? this.commands.find((c) => c.model === action.model && c.method === b.name)?.id : undefined,
      };
      const arch = (type: string) => res.views[type]?.arch ?? `<${type}/>`;
      const search = parseArch(arch("search"), "search", ctx);
      addActionGroupBy(search, action.context, fields);
      return {
        action,
        fields,
        parsed: { list: parseArch(arch("list"), "list", ctx), form: parseArch(arch("form"), "form", ctx), search },
        canEdit,
      };
    });
  }

  /**
   * Variables de domaine connues avec certitude par le serveur : l'utilisateur, et sa
   * société courante (ce qu'Odoo applique quand le client n'en active pas d'autres).
   */
  private async domainEnv(t: OdooTransport, viewer: ViewerContext): Promise<Partial<Record<DomainEnvName, unknown>>> {
    return {
      uid: await t.userId(),
      ...(viewer.companyId !== undefined ? { allowed_company_ids: [viewer.companyId] } : {}),
    };
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

/**
 * Menus de la session. Constaté sur amg (Odoo 18) : load_web_menus est appelée par
 * call_kw comme une méthode d'enregistrements (décorateur de cache), donc le premier
 * argument est la liste d'ids : [[], debug]. Repli sur la forme « modèle » ([debug])
 * si l'instance la déclare autrement.
 */
/**
 * Fenêtre d'action telle que le client web d'Odoo la charge. Session utilisateur :
 * route /web/action/load (lecture sudo d'Odoo, seule voie pour un non-administrateur).
 * Transport jsonrpc (comptes partagés) : lecture ORM. Autre type d'action → null.
 */
export async function readWindowAction(t: OdooTransport, actionId: number): Promise<Record<string, unknown> | null> {
  if (t.loadAction) {
    const action = await t.loadAction(actionId);
    return action && action["type"] === "ir.actions.act_window" ? action : null;
  }
  const rows = await t.callKw<Record<string, unknown>[]>({
    model: "ir.actions.act_window",
    method: "read",
    args: [[actionId], ["name", "res_model", "views", "domain", "context", "search_view_id"]],
    kwargs: {},
  });
  return rows[0] ?? null;
}

export async function loadMenus(t: OdooTransport): Promise<Record<string, OdooMenu>> {
  const call = (args: unknown[]) => t.callKw<Record<string, OdooMenu>>({ model: "ir.ui.menu", method: "load_web_menus", args, kwargs: {} });
  try {
    return await call([[], false]);
  } catch (error) {
    if (error instanceof DomainError && error.code === "unavailable" && error.message.includes("TypeError")) return call([false]);
    throw error;
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

/**
 * Regroupement demandé par le contexte de l'action (group_by) : proposé dans la recherche
 * s'il n'y figure pas déjà. Plusieurs niveaux : seul le premier est appliqué (diagnostic).
 */
function addActionGroupBy(search: ParsedView, context: Record<string, Literal> | null, fields: Record<string, OdooFieldMeta>): void {
  const raw = context?.["group_by"];
  if (raw === undefined || raw === null || raw === false) return;
  const levels = Array.isArray(raw) ? raw : [raw];
  if (levels.length === 0) return;
  const spec = groupSpec(levels[0], fields);
  if (levels.length > 1) {
    search.diagnostics.push({ code: "unsupported_domain", severity: "info", path: "action/context/group_by", message: "Regroupement à plusieurs niveaux : seul le premier est appliqué." });
  }
  if (!spec) {
    search.diagnostics.push({ code: "unsupported_domain", severity: "info", path: "action/context/group_by", message: "Regroupement de l'action non pris en charge." });
    return;
  }
  const existing = search.groupBys.find((g) => g.spec === spec.spec);
  if (existing) {
    // Déjà proposé par la vue : il devient le regroupement par défaut
    search.defaultGroupKey = existing.key;
    return;
  }
  const label = fields[spec.field]?.string ?? spec.field;
  search.groupBys.push({ key: "a0", name: "", ...spec, label });
  search.root.push({ kind: "groupBy", groupKey: "a0", label, available: true });
  search.defaultGroupKey = "a0";
}

/** Clé opaque d'un groupe : comparée à celles que le serveur recalcule, jamais interprétée. */
function groupKey(raw: unknown): string {
  if (raw === false || raw === null || raw === undefined) return "null";
  if (Array.isArray(raw) && typeof raw[0] === "number") return `r:${raw[0]}`;
  if (typeof raw === "string") return `s:${raw}`.slice(0, 200);
  if (typeof raw === "number") return `n:${raw}`;
  if (typeof raw === "boolean") return `b:${raw}`;
  return `j:${JSON.stringify(raw)}`.slice(0, 200);
}

function groupLabel(raw: unknown, meta: OdooFieldMeta | undefined): string {
  if (raw === false || raw === null || raw === undefined) return "Non défini";
  if (Array.isArray(raw)) return String(raw[1] ?? raw[0]);
  if (typeof raw === "boolean") return raw ? "Oui" : "Non";
  if (meta?.type === "selection" && Array.isArray(meta.selection)) return meta.selection.find(([v]) => v === raw)?.[1] ?? String(raw);
  return String(raw);
}
