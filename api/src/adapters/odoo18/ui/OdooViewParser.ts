// adapters/odoo18/ui/OdooViewParser.ts — Architecture XML RÉSOLUE d'Odoo 18
// (sortie de get_views, héritages appliqués) → nœuds du Leila UI Schema.
//
// Principes (ADR-001, ADR-002, D-09) :
//  - liste blanche de balises ; le reste devient « unsupported » + diagnostic,
//    rien ne disparaît en silence ;
//  - aucun HTML ni texte libre n'est transmis au client ;
//  - un champ absent des métadonnées (non lisible pour ce compte) est exclu et
//    seulement compté (diagnostic « excluded_by_rights », sans libellé) ;
//  - widgets : présentation pure (liste fermée) ou diagnostic + lecture seule ;
//  - relations multiples, lignes liées et images : lecture seule (lot 1) ;
//  - parité contrôlable : champs/boutons du XML = importés + exclus + non pris en charge.

import { XMLParser } from "fast-xml-parser";
import type {
  ButtonNode,
  ContainerNode,
  DecorationStyle,
  Diagnostic,
  FieldDescriptor,
  Flag,
  Node,
} from "@leila/ui-schema";
import { conditionFields, isSupported } from "@leila/ui-schema";
import { concatDomains, type DomainEnvName, type DomainExpr, domainRefs, parseDomain } from "./OdooDomain.js";
import { type Literal, parseCondition, parseFlag, parseLiteral } from "./OdooExpressionParser.js";

/** Métadonnées d'un champ telles que renvoyées par get_views / fields_get (Odoo 18). */
export interface OdooFieldMeta {
  type: string;
  string?: string;
  readonly?: boolean;
  required?: boolean;
  selection?: [string, string][] | string;
  relation?: string;
  digits?: [number, number] | false;
  currency_field?: string;
  domain?: unknown;
  help?: string;
  sortable?: boolean;
  store?: boolean;
}

export interface ParseContext {
  model: string;
  fields: Readonly<Record<string, OdooFieldMeta>>;
  /** Clé de commande si ce bouton est dans le registre fermé, sinon undefined */
  commandFor(button: { name: string; type: string }): string | undefined;
  /** Contexte littéral de l'action (lu par `context.get(…)` dans les conditions) */
  actionContext?: Readonly<Record<string, Literal>> | undefined;
  /** Champs des modèles liés renvoyés par get_views (colonnes des sous-listes) */
  models?: Readonly<Record<string, Readonly<Record<string, OdooFieldMeta>>>> | undefined;
}

/** Lignes liées : colonnes publiées et métadonnées pour la lecture côté serveur. */
export interface ServerLines {
  relation: string;
  columns: string[];
  meta: Record<string, OdooFieldMeta>;
}

/** Regroupement de la vue de recherche : la clé est publiée, la spécification reste côté BFF. */
export interface ServerGroupBy {
  key: string;
  /** Nom technique (search_default_<name> du contexte d'action) */
  name: string;
  /** Spécification Odoo : « champ » ou « champ:granularité » */
  spec: string;
  field: string;
  label: string;
}

/** Granularités de date d'Odoo. */
const GRANULARITIES = new Set(["day", "week", "month", "quarter", "year"]);
/** Types regroupables par le moteur (un niveau). */
const GROUPABLE = new Set(["many2one", "selection", "char", "boolean", "date", "datetime", "integer"]);

/** Spécification de regroupement si elle est utilisable avec ces champs, sinon null. */
export function groupSpec(raw: unknown, fields: Readonly<Record<string, OdooFieldMeta>>): { spec: string; field: string } | null {
  const value = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : null) : raw;
  if (typeof value !== "string") return null;
  const [field, granularity, extra] = value.split(":");
  if (!field || extra !== undefined) return null;
  const meta = fields[field];
  if (!meta || !GROUPABLE.has(meta.type) || meta.store === false) return null;
  const dated = meta.type === "date" || meta.type === "datetime";
  if (granularity !== undefined && (!dated || !GRANULARITIES.has(granularity))) return null;
  return { spec: dated && !granularity ? `${field}:month` : value, field };
}

/** Filtre de recherche : la clé est publiée, le domaine reste côté BFF. */
export interface ServerFilter {
  key: string;
  /** Nom technique (search_default_<name> du contexte d'action) */
  name: string;
  domain: DomainExpr | null;
  group: number;
}

/** Variables qu'un domaine peut utiliser selon l'usage (ADR-002, OdooDomain.ts). */
const RECORD_ENV: readonly DomainEnvName[] = ["uid", "allowed_company_ids"];
const SEARCH_ENV: readonly DomainEnvName[] = ["uid", "allowed_company_ids", "self"];
const envOk = (expr: DomainExpr, allowed: readonly DomainEnvName[]) => [...domainRefs(expr).env].every((e) => allowed.includes(e));

export interface ParsedView {
  root: Node[];
  fields: Record<string, FieldDescriptor>;
  decorations: { style: DecorationStyle; when: import("@leila/ui-schema").Condition }[];
  diagnostics: Diagnostic[];
  /** Champs lus par les conditions (à charger s'ils sont lisibles) */
  conditionFields: Set<string>;
  /** Recherche : filtres et champs de recherche, côté serveur uniquement */
  filters: ServerFilter[];
  /** filterDomain : domaine de recherche avec `self` = texte saisi ; absent : `ilike` sur le champ */
  searchFields: Record<string, { usable: boolean; filterDomain?: DomainExpr }>;
  /**
   * Domaines de champ (sélection d'une référence) : modèle pris en charge (constantes et
   * valeurs de la fiche, substituées côté serveur), ou null.
   */
  fieldDomains: Record<string, DomainExpr | null>;
  /** Lignes liées (type « lines ») : relation, colonnes et métadonnées */
  lines: Record<string, ServerLines>;
  /** Recherche : regroupements proposés */
  groupBys: ServerGroupBy[];
  /** Regroupement à appliquer à l'ouverture (contexte group_by de l'action) */
  defaultGroupKey?: string | undefined;
  /**
   * Parité (champs et boutons) : fieldsInArch + buttonsInArch = fieldsImported +
   * buttonsImported + excluded + unsupported. unsupportedNodes : autres éléments non pris en charge.
   */
  stats: { fieldsInArch: number; buttonsInArch: number; fieldsImported: number; buttonsImported: number; excluded: number; unsupported: number; unsupportedNodes: number };
}

const xml = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
});

type XmlNode = Record<string, unknown>;

const TRANSPARENT = new Set(["div", "span", "h1", "h2", "h3", "h4", "h5", "h6", "p", "small", "strong", "em", "b", "i", "u", "t"]);
const IGNORED = new Set(["br", "hr"]);
const TYPE_MAP: Record<string, FieldDescriptor["type"]> = {
  char: "text",
  text: "multiline",
  integer: "integer",
  float: "decimal",
  boolean: "boolean",
  selection: "selection",
  date: "date",
  datetime: "datetime",
  many2one: "reference",
  many2many: "references",
  one2many: "lines",
  monetary: "money",
};
/** Colonnes de sous-liste : types simples seulement (pas de lignes ni d'images imbriquées). */
const LINE_TYPES = new Set<FieldDescriptor["type"]>(["text", "multiline", "integer", "decimal", "boolean", "selection", "date", "datetime", "reference"]);
/**
 * Widgets de pure présentation : le rendu standard du type en préserve le sens et les
 * restrictions (arbitrage ADR-001 § 3.2). Constatés sur la fiche employé de amg.
 */
const PRESENTATION_WIDGETS: Record<string, FieldDescriptor["format"] | null> = {
  email: "email",
  phone: "phone",
  url: "url",
  // Inventaire amg : les plus fréquents après float_time
  float_time: "duration",
  boolean_toggle: null,
  boolean: null,
  boolean_switch: null,
  text: null,
  radio: null,
  badge: null,
  many2one_avatar: null,
  many2one_avatar_user: null,
  many2one_avatar_employee: null,
  // Relations multiples : étiquettes (lot 1, lecture seule)
  many2many_tags: null,
  many2many_tags_avatar: null,
  many2many_avatar_user: null,
  many2many_avatar_employee: null,
  many2many_checkboxes: null,
  // one2many affiché « comme un many2many » : même liste de lignes
  many2many: null,
  one2many: null,
  // Images et étapes : rendus dédiés (voir describe)
  image: null,
  statusbar: "steps",
};

const DECORATIONS: Record<string, DecorationStyle> = {
  "decoration-success": "success",
  "decoration-info": "info",
  "decoration-warning": "warning",
  "decoration-danger": "danger",
  "decoration-muted": "muted",
  "decoration-bf": "bold",
  "decoration-it": "italic",
};

function tagOf(node: XmlNode): string | null {
  for (const k of Object.keys(node)) if (k !== ":@") return k;
  return null;
}
function attrsOf(node: XmlNode): Record<string, string> {
  return (node[":@"] as Record<string, string> | undefined) ?? {};
}
function childrenOf(node: XmlNode, tag: string): XmlNode[] {
  const c = node[tag];
  return Array.isArray(c) ? (c as XmlNode[]) : [];
}

export function parseArch(arch: string, viewType: "list" | "form" | "search", ctx: ParseContext): ParsedView {
  if (/<!DOCTYPE|<!ENTITY/i.test(arch)) throw new Error("Architecture refusée (DOCTYPE/ENTITY).");
  const doc = xml.parse(arch) as XmlNode[];
  const rootEl = doc.find((n) => tagOf(n) !== null && tagOf(n) !== "?xml");
  const rootTag = rootEl ? tagOf(rootEl) : null;
  const expected = viewType === "list" ? ["list", "tree"] : [viewType];

  const out: ParsedView = {
    root: [],
    fields: {},
    decorations: [],
    diagnostics: [],
    conditionFields: new Set(),
    filters: [],
    searchFields: {},
    fieldDomains: {},
    lines: {},
    groupBys: [],
    stats: { fieldsInArch: 0, buttonsInArch: 0, fieldsImported: 0, buttonsImported: 0, excluded: 0, unsupported: 0, unsupportedNodes: 0 },
  };
  if (!rootEl || !rootTag || !expected.includes(rootTag)) {
    out.diagnostics.push({ code: "unsupported_node", severity: "blocking", path: viewType, sourceTag: rootTag ?? "?", message: `Racine « ${rootTag ?? "?"} » inattendue pour une vue ${viewType}.` });
    return out;
  }

  const diag = (d: Diagnostic) => out.diagnostics.push(d);
  const flag = (raw: string | undefined, path: string, attr: string): Flag | undefined => {
    const f = parseFlag(raw, ctx.actionContext);
    if (f !== undefined && typeof f !== "boolean") {
      conditionFields(f, out.conditionFields);
      if (!isSupported(f)) {
        diag({ code: "unsupported_expression", severity: "warning", path, message: `${attr} : expression non prise en charge, repli prudent appliqué.` });
      }
    }
    return f;
  };

  const describe = (name: string, attrs: Record<string, string>, path: string, sub?: XmlNode[]): FieldDescriptor | null => {
    const meta = ctx.fields[name];
    if (!meta) return null;
    // Image : champ binaire affiché par le widget image (la donnée passe par une route dédiée)
    let type = meta.type === "binary" && attrs["widget"] === "image" ? "image" : (TYPE_MAP[meta.type] ?? "unsupported");
    let readonly = Boolean(meta.readonly);
    if (type === "unsupported") {
      diag({ code: "unsupported_field_type", severity: "warning", path, message: `Type de champ « ${meta.type} » non pris en charge : affiché comme indisponible.` });
      readonly = true;
    }
    if (type === "money") {
      const currency = meta.currency_field ?? "currency_id";
      if (!ctx.fields[currency]) {
        diag({ code: "unsupported_field_type", severity: "warning", path, message: "Montant sans devise lisible : non affiché." });
        type = "unsupported";
      }
      readonly = true; // MVP : affichage seulement
    }
    const widget = attrs["widget"];
    // statusbar : étapes d'une sélection seulement ; sur une référence, rendu standard + diagnostic
    const presentation = widget !== undefined && widget in PRESENTATION_WIDGETS && !(widget === "statusbar" && type !== "selection");
    const format = presentation ? PRESENTATION_WIDGETS[widget] : null;
    if (widget && !presentation) {
      diag({ code: "unsupported_widget", severity: "info", path, message: `Widget « ${widget} » non pris en charge : rendu standard en lecture seule.` });
      readonly = true;
    }
    const existing = out.fields[name];
    const descriptor: FieldDescriptor = {
      key: name,
      label: attrs["string"] ?? meta.string ?? name,
      type,
      readonly: (existing?.readonly ?? false) || readonly,
      required: Boolean(meta.required),
      ...(type === "selection" && Array.isArray(meta.selection) ? { options: meta.selection.map(([value, label]) => ({ value, label })) } : {}),
      ...(Array.isArray(meta.digits) ? { digits: meta.digits } : {}),
      ...(type === "money" ? { currencyField: meta.currency_field ?? "currency_id" } : {}),
      ...(meta.help ? { help: meta.help } : {}),
      ...(format && ((type === "text" && format !== "duration" && format !== "steps") || (type === "decimal" && format === "duration") || (type === "selection" && format === "steps"))
        ? { format }
        : {}),
      ...(format === "steps" && attrs["statusbar_visible"] ? { visibleOptions: attrs["statusbar_visible"].split(",").map((v) => v.trim()).filter(Boolean) } : {}),
    };
    if (type === "references" || type === "lines" || type === "image") descriptor.readonly = true; // lot 1 : lecture seule
    if (type === "lines") describeLines(name, meta, descriptor, path, sub ?? []);
    if (type === "selection" && !Array.isArray(meta.selection)) {
      descriptor.type = "unsupported";
      descriptor.readonly = true;
      diag({ code: "unsupported_field_type", severity: "warning", path, message: "Sélection dynamique non prise en charge." });
    }
    if (type === "reference") {
      // Sélection possible si les domaines (champ ET vue) restent dans le sous-ensemble
      // évaluable côté serveur (valeurs de la fiche, uid, société) ; sinon désactivée (ADR-002)
      const fieldDomain = parseDomain(meta.domain);
      const viewDomain = parseDomain(attrs["domain"]);
      const both = fieldDomain && viewDomain ? concatDomains(fieldDomain, viewDomain) : null;
      const ok = both !== null && envOk(both, RECORD_ENV) && !readonly;
      out.fieldDomains[name] = ok ? both : null;
      if (ok && both) domainRefs(both).fields.forEach((f) => out.conditionFields.add(f));
      if (!ok && !readonly) {
        diag({ code: "unsupported_domain", severity: "info", path, message: "Domaine de sélection non pris en charge : sélection désactivée." });
      }
      descriptor.relation = { lookup: ok };
      if (!ok) descriptor.readonly = true;
    }
    out.fields[name] = descriptor;
    return descriptor;
  };

  /**
   * Lignes liées : colonnes de la sous-liste embarquée (<list>), limitées aux types simples et
   * aux champs lisibles du modèle lié. Sans sous-liste (ou kanban, fiche) : le nom seul, rendu
   * de secours qui garde le sens (la liste des lignes) sans rien ouvrir.
   */
  const describeLines = (name: string, meta: OdooFieldMeta, descriptor: FieldDescriptor, path: string, sub: XmlNode[]) => {
    const relation = meta.relation;
    const related = relation ? ctx.models?.[relation] : undefined;
    const listEl = sub.find((k) => tagOf(k) === "list" || tagOf(k) === "tree");
    const columns: string[] = [];
    const lineFields: Record<string, FieldDescriptor> = {};
    const lineMeta: Record<string, OdooFieldMeta> = {};
    if (listEl && related) {
      for (const el of childrenOf(listEl, tagOf(listEl) as string)) {
        const tag = tagOf(el);
        if (tag === "button") {
          out.stats.buttonsInArch++;
          out.stats.unsupported++;
          continue;
        }
        if (tag !== "field") {
          if (tag && tag !== "#text" && tag !== "#comment") countNested(childrenOf(el, tag));
          continue;
        }
        out.stats.fieldsInArch++;
        const a = attrsOf(el);
        const col = a["name"] ?? "";
        const m = related[col];
        // Colonne masquée (quelle qu'en soit la condition) : non publiée, comme le repli column_invisible
        const hidden = [a["column_invisible"], a["invisible"]].some((x) => x !== undefined && x !== "0" && x !== "False" && x !== "false");
        const t = m ? TYPE_MAP[m.type] : undefined;
        if (!m) {
          out.stats.excluded++;
          continue;
        }
        if (hidden || !t || !LINE_TYPES.has(t) || (t === "selection" && !Array.isArray(m.selection))) {
          out.stats.unsupported++;
          continue;
        }
        out.stats.fieldsImported++;
        columns.push(col);
        lineMeta[col] = m;
        lineFields[col] = {
          key: col,
          label: a["string"] ?? m.string ?? col,
          type: t,
          readonly: true,
          required: false,
          ...(t === "selection" && Array.isArray(m.selection) ? { options: m.selection.map(([value, label]) => ({ value, label })) } : {}),
          ...(Array.isArray(m.digits) ? { digits: m.digits } : {}),
          ...(a["widget"] === "float_time" && t === "decimal" ? { format: "duration" as const } : {}),
        };
      }
    } else if (sub.some((k) => tagOf(k) !== "#text")) {
      countNested(sub);
      diag({ code: "unsupported_node", severity: "info", path, message: "Sous-vue de relation non tabulaire : affichée en liste de noms." });
    }
    if (columns.length === 0) {
      columns.push("display_name");
      lineMeta["display_name"] = { type: "char", string: "Nom" };
      lineFields["display_name"] = { key: "display_name", label: "Nom", type: "text", readonly: true, required: false };
    }
    if (!relation) {
      descriptor.type = "unsupported";
      return;
    }
    descriptor.lines = { columns, fields: lineFields };
    out.lines[name] = { relation, columns, meta: lineMeta };
  };

  // ─── form ───────────────────────────────────────────────────────────────────
  const walk = (nodes: XmlNode[], path: string): Node[] => {
    const result: Node[] = [];
    let index = 0;
    let textNoted = false;
    for (const el of nodes) {
      const tag = tagOf(el);
      if (tag === "#text") {
        const text = String(el["#text"] ?? "").trim();
        if (text && !textNoted) {
          diag({ code: "ignored_text", severity: "info", path, message: "Texte libre de la vue non importé." });
          textNoted = true;
        }
        continue;
      }
      if (!tag || tag === "#comment") continue;
      const attrs = attrsOf(el);
      const kids = childrenOf(el, tag);
      const here = `${path}/${tag}${attrs["name"] ? `[${attrs["name"]}]` : `[${index}]`}`;
      index++;
      switch (tag) {
        case "sheet":
        case "header":
          result.push({ kind: tag, children: walk(kids, here) });
          break;
        case "group": {
          const children = walk(kids, here);
          const allGroups = children.length > 1 && children.every((c) => c.kind === "group");
          const node: ContainerNode = { kind: "group", children, columns: allGroups ? Math.min(children.length, 4) : 1 };
          if (attrs["string"]) node.label = attrs["string"];
          const inv = flag(attrs["invisible"], here, "invisible");
          if (inv !== undefined) node.invisible = inv;
          result.push(node);
          break;
        }
        case "notebook": {
          const pages: ContainerNode[] = [];
          let p = 0;
          for (const pageEl of kids) {
            const ptag = tagOf(pageEl);
            if (ptag === "#text" || ptag === "#comment" || !ptag) continue;
            const pattrs = attrsOf(pageEl);
            const ppath = `${here}/page[${p++}]`;
            if (ptag !== "page") {
              countNested(childrenOf(pageEl, ptag));
              out.stats.unsupportedNodes++;
              diag({ code: "unsupported_node", severity: "warning", path: ppath, sourceTag: ptag, message: `« ${ptag} » dans un onglet non pris en charge.` });
              continue;
            }
            const page: ContainerNode = { kind: "page", label: pattrs["string"] ?? "", children: walk(childrenOf(pageEl, "page"), ppath) };
            const inv = flag(pattrs["invisible"], ppath, "invisible");
            if (inv !== undefined) page.invisible = inv;
            pages.push(page);
          }
          result.push({ kind: "notebook", pages });
          break;
        }
        case "field": {
          out.stats.fieldsInArch++;
          const name = attrs["name"] ?? "";
          const described = describe(name, attrs, here, kids);
          if (!described) {
            out.stats.excluded++;
            diag({ code: "excluded_by_rights", severity: "info", path: `${path}/field`, message: "Champ non lisible pour ce compte : exclu." });
            break;
          }
          if (described.type !== "lines" && kids.some((k) => tagOf(k) !== "#text")) {
            countNested(kids);
            diag({ code: "unsupported_node", severity: "info", path: here, message: "Sous-vue de relation ignorée." });
          }
          out.stats.fieldsImported++;
          const node: Node = { kind: "field", field: name, showLabel: attrs["nolabel"] !== "1" };
          const inv = flag(attrs["invisible"], here, "invisible");
          const ro = flag(attrs["readonly"], here, "readonly");
          const req = flag(attrs["required"], here, "required");
          if (inv !== undefined) node.invisible = inv;
          if (ro !== undefined) node.readonly = ro;
          if (req !== undefined) node.required = req;
          result.push(node);
          break;
        }
        case "label": {
          const node: Node = { kind: "label" };
          if (attrs["string"]) node.text = attrs["string"];
          if (attrs["for"]) node.for = attrs["for"];
          result.push(node);
          break;
        }
        case "separator": {
          result.push(attrs["string"] ? { kind: "separator", label: attrs["string"] } : { kind: "separator" });
          break;
        }
        case "button": {
          out.stats.buttonsInArch++;
          // Contenu d'un bouton (ex. compteur de bouton intelligent) : non importé, compté
          countNested(kids);
          const commandKey = ctx.commandFor({ name: attrs["name"] ?? "", type: attrs["type"] ?? "" });
          const node: ButtonNode = {
            kind: "button",
            // Jamais le nom de méthode : c'est un identifiant technique du moteur
            label: attrs["string"] ?? attrs["title"] ?? "Action",
            primary: /\b(oe_highlight|btn-primary)\b/.test(attrs["class"] ?? ""),
          };
          const inv = flag(attrs["invisible"], here, "invisible");
          if (inv !== undefined) node.invisible = inv;
          if (commandKey) {
            node.commandKey = commandKey;
            out.stats.buttonsImported++;
          } else {
            out.stats.unsupported++;
            diag({ code: "unsupported_command", severity: "info", path: here, message: "Bouton hors du registre de commandes : affiché désactivé." });
          }
          result.push(node);
          break;
        }
        default: {
          if (IGNORED.has(tag)) break;
          if (TRANSPARENT.has(tag)) {
            result.push(...walk(kids, here));
            break;
          }
          if (tag === "widget") {
            // Élément visuel (bandeau, puce de chat, info-bulle…) : signalé sans alerte
            out.stats.unsupportedNodes++;
            diag({ code: "unsupported_node", severity: "info", path: here, sourceTag: tag, message: `Élément visuel « ${attrs["name"] ?? "widget"} » non pris en charge.` });
            result.push({ kind: "unsupported", sourceTag: tag, reason: "Élément visuel non pris en charge par Leila." });
            break;
          }
          countNested(kids);
          out.stats.unsupportedNodes++;
          diag({ code: "unsupported_node", severity: "warning", path: here, sourceTag: tag, message: `« ${tag} » non pris en charge.` });
          result.push({ kind: "unsupported", sourceTag: tag, reason: "Élément de vue non pris en charge par Leila." });
        }
      }
    }
    return result;
  };

  /** Champs et boutons à l'intérieur d'un élément non pris en charge : comptés comme tels. */
  const countNested = (nodes: XmlNode[]) => {
    for (const el of nodes) {
      const tag = tagOf(el);
      if (!tag || tag === "#text") continue;
      if (tag === "field") {
        out.stats.fieldsInArch++;
        out.stats.unsupported++;
      } else if (tag === "button") {
        out.stats.buttonsInArch++;
        out.stats.unsupported++;
      }
      countNested(childrenOf(el, tag));
    }
  };

  const rootAttrs = attrsOf(rootEl);
  const rootKids = childrenOf(rootEl, rootTag);

  if (viewType === "form") {
    out.root = walk(rootKids, "form");
  } else if (viewType === "list") {
    for (const [attr, style] of Object.entries(DECORATIONS)) {
      const raw = rootAttrs[attr];
      if (!raw) continue;
      const when = parseCondition(raw, ctx.actionContext);
      if (!isSupported(when)) {
        diag({ code: "unsupported_expression", severity: "info", path: `list/@${attr}`, message: "Décoration non prise en charge : style neutre." });
        continue;
      }
      conditionFields(when, out.conditionFields);
      out.decorations.push({ style, when });
    }
    let index = 0;
    for (const el of rootKids) {
      const tag = tagOf(el);
      if (!tag || tag === "#text" || tag === "#comment") continue;
      const attrs = attrsOf(el);
      const here = `list/${tag}${attrs["name"] ? `[${attrs["name"]}]` : `[${index}]`}`;
      index++;
      if (tag === "field") {
        out.stats.fieldsInArch++;
        const name = attrs["name"] ?? "";
        if (!describe(name, attrs, here)) {
          out.stats.excluded++;
          diag({ code: "excluded_by_rights", severity: "info", path: "list/field", message: "Champ non lisible pour ce compte : exclu." });
          continue;
        }
        out.stats.fieldsImported++;
        // column_invisible : la colonne entière ; invisible : la cellule selon la ligne
        const node: Node = { kind: "column", field: name };
        const colInv = flag(attrs["column_invisible"], here, "column_invisible");
        const inv = flag(attrs["invisible"], here, "invisible");
        if (colInv !== undefined) node.columnInvisible = colInv;
        if (inv !== undefined) node.invisible = inv;
        if (attrs["optional"] === "show" || attrs["optional"] === "hide") node.optional = attrs["optional"];
        if (Object.keys(attrs).some((a) => a.startsWith("decoration-"))) {
          diag({ code: "unsupported_expression", severity: "info", path: here, message: "Décoration de cellule ignorée : style neutre." });
        }
        out.root.push(node);
      } else if (tag === "button") {
        out.stats.buttonsInArch++;
        out.stats.unsupported++;
        diag({ code: "unsupported_command", severity: "info", path: here, message: "Bouton de liste non pris en charge." });
      } else {
        countNested(childrenOf(el, tag));
        out.stats.unsupportedNodes++;
        diag({ code: "unsupported_node", severity: "info", path: here, sourceTag: tag, message: `« ${tag} » de liste non pris en charge.` });
      }
    }
  } else {
    // ─── search ─────────────────────────────────────────────────────────────────
    let group = 0;
    let index = 0;
    const visit = (nodes: XmlNode[], path: string) => {
      for (const el of nodes) {
        const tag = tagOf(el);
        if (!tag || tag === "#text" || tag === "#comment") continue;
        const attrs = attrsOf(el);
        const here = `${path}/${tag}${attrs["name"] ? `[${attrs["name"]}]` : `[${index}]`}`;
        index++;
        if (tag === "separator") {
          group++;
        } else if (tag === "filter") {
          const key = `f${out.filters.length}`;
          const context = attrs["context"] ? parseLiteral(attrs["context"]) : null;
          const groupBy = context !== null && typeof context === "object" && !Array.isArray(context) && "group_by" in context;
          if (groupBy) {
            // Regroupement : proposé à part (un niveau) si le champ est lisible et regroupable
            const spec = groupSpec((context as Record<string, Literal>)["group_by"], ctx.fields);
            const label = attrs["string"] ?? attrs["name"] ?? "";
            if (attrs["invisible"] === "1" || attrs["invisible"] === "True") {
              if (spec) out.groupBys.push({ key: `g${out.groupBys.length}`, name: attrs["name"] ?? "", ...spec, label });
              continue;
            }
            if (!spec) {
              diag({ code: "unsupported_domain", severity: "info", path: here, message: "Regroupement non pris en charge." });
              out.root.push({ kind: "groupBy", groupKey: `x${index}`, label, available: false });
              continue;
            }
            const key = `g${out.groupBys.length}`;
            out.groupBys.push({ key, name: attrs["name"] ?? "", ...spec, label });
            out.root.push({ kind: "groupBy", groupKey: key, label, available: true });
            continue;
          }
          const domain = attrs["date"] ? null : parseDomain(attrs["domain"] ?? "[]");
          const usable = domain !== null && envOk(domain, RECORD_ENV) && (!attrs["context"] || context !== null);
          out.filters.push({ key, name: attrs["name"] ?? key, domain: usable ? domain : null, group });
          // Filtre invisible : utilisable seulement par le contexte de l'action (search_default_*), comme dans Odoo
          if (attrs["invisible"] === "1" || attrs["invisible"] === "True") continue;
          if (!usable) diag({ code: "unsupported_domain", severity: "info", path: here, message: "Filtre non pris en charge : désactivé." });
          out.root.push({ kind: "filter", filterKey: key, label: attrs["string"] ?? attrs["name"] ?? key, available: usable, group });
        } else if (tag === "field") {
          out.stats.fieldsInArch++;
          const name = attrs["name"] ?? "";
          const meta = ctx.fields[name];
          if (!meta) {
            out.stats.excluded++;
            diag({ code: "excluded_by_rights", severity: "info", path: `${path}/field`, message: "Champ de recherche non lisible : exclu." });
            continue;
          }
          out.stats.fieldsImported++;
          // filter_domain : `self` = texte saisi ; sinon recherche « ilike » sur le champ (comportement d'Odoo)
          const filterDomain = attrs["filter_domain"] ? parseDomain(attrs["filter_domain"]) : undefined;
          const usable =
            filterDomain === undefined
              ? // Comme Odoo : recherche « ilike » (nom affiché pour les relations) ; dates : sélecteur non pris en charge
                ["char", "text", "many2one", "many2many", "one2many", "selection"].includes(meta.type)
              : filterDomain !== null && envOk(filterDomain, SEARCH_ENV);
          if (!usable) diag({ code: "unsupported_domain", severity: "info", path: here, message: "Recherche sur ce champ non prise en charge : désactivée." });
          out.searchFields[name] = { usable, ...(usable && filterDomain ? { filterDomain } : {}) };
          out.root.push({ kind: "searchField", field: name, label: attrs["string"] ?? meta.string ?? name, available: usable });
        } else if (tag === "group") {
          visit(childrenOf(el, tag), here);
        } else {
          countNested(childrenOf(el, tag));
          out.stats.unsupportedNodes++;
          diag({ code: "unsupported_node", severity: "info", path: here, sourceTag: tag, message: `« ${tag} » de recherche non pris en charge.` });
        }
      }
    };
    visit(rootKids, "search");
  }
  return out;
}
