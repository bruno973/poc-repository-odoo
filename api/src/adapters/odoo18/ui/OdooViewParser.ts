// adapters/odoo18/ui/OdooViewParser.ts — Architecture XML RÉSOLUE d'Odoo 18
// (sortie de get_views, héritages appliqués) → nœuds du Leila UI Schema.
//
// Principes (ADR-001, ADR-002, D-09) :
//  - liste blanche de balises ; le reste devient « unsupported » + diagnostic,
//    rien ne disparaît en silence ;
//  - aucun HTML ni texte libre n'est transmis au client ;
//  - un champ absent des métadonnées (non lisible pour ce compte) est exclu et
//    seulement compté (diagnostic « excluded_by_rights », sans libellé) ;
//  - aucun widget n'est interprété en MVP : diagnostic + lecture seule ;
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
import { asDomain, parseCondition, parseFlag, parseLiteral } from "./OdooExpressionParser.js";

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
}

/** Filtre de recherche : la clé est publiée, le domaine reste côté BFF. */
export interface ServerFilter {
  key: string;
  domain: unknown[] | null;
  group: number;
}

export interface ParsedView {
  root: Node[];
  fields: Record<string, FieldDescriptor>;
  decorations: { style: DecorationStyle; when: import("@leila/ui-schema").Condition }[];
  diagnostics: Diagnostic[];
  /** Champs lus par les conditions (à charger s'ils sont lisibles) */
  conditionFields: Set<string>;
  /** Recherche : filtres et champs de recherche, côté serveur uniquement */
  filters: ServerFilter[];
  searchFields: Record<string, { usable: boolean }>;
  /** Domaines de champ (sélection d'une référence) : littéral pris en charge, ou null */
  fieldDomains: Record<string, unknown[] | null>;
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
  monetary: "money",
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
    stats: { fieldsInArch: 0, buttonsInArch: 0, fieldsImported: 0, buttonsImported: 0, excluded: 0, unsupported: 0, unsupportedNodes: 0 },
  };
  if (!rootEl || !rootTag || !expected.includes(rootTag)) {
    out.diagnostics.push({ code: "unsupported_node", severity: "blocking", path: viewType, sourceTag: rootTag ?? "?", message: `Racine « ${rootTag ?? "?"} » inattendue pour une vue ${viewType}.` });
    return out;
  }

  const diag = (d: Diagnostic) => out.diagnostics.push(d);
  const flag = (raw: string | undefined, path: string, attr: string): Flag | undefined => {
    const f = parseFlag(raw);
    if (f !== undefined && typeof f !== "boolean") {
      conditionFields(f, out.conditionFields);
      if (!isSupported(f)) {
        diag({ code: "unsupported_expression", severity: "warning", path, message: `${attr} : expression non prise en charge, repli prudent appliqué.` });
      }
    }
    return f;
  };

  const describe = (name: string, attrs: Record<string, string>, path: string): FieldDescriptor | null => {
    const meta = ctx.fields[name];
    if (!meta) return null;
    let type = TYPE_MAP[meta.type] ?? "unsupported";
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
    if (attrs["widget"]) {
      diag({ code: "unsupported_widget", severity: "info", path, message: `Widget « ${attrs["widget"]} » non pris en charge : rendu standard en lecture seule.` });
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
    };
    if (type === "selection" && !Array.isArray(meta.selection)) {
      descriptor.type = "unsupported";
      descriptor.readonly = true;
      diag({ code: "unsupported_field_type", severity: "warning", path, message: "Sélection dynamique non prise en charge." });
    }
    if (type === "reference") {
      // Sélection possible seulement si les domaines (champ ET vue) sont littéraux
      const fieldDomain = meta.domain === undefined || meta.domain === false || (Array.isArray(meta.domain) && meta.domain.length === 0)
        ? []
        : asDomain(parseLiteral(meta.domain as string));
      const viewDomain = attrs["domain"] === undefined ? [] : asDomain(parseLiteral(attrs["domain"]));
      const ok = fieldDomain !== null && viewDomain !== null && !readonly;
      out.fieldDomains[name] = ok ? [...(fieldDomain ?? []), ...(viewDomain ?? [])] : null;
      if (!ok && !readonly) {
        diag({ code: "unsupported_domain", severity: "info", path, message: "Domaine de sélection non pris en charge : sélection désactivée." });
      }
      descriptor.relation = { lookup: ok };
      if (!ok) descriptor.readonly = true;
    }
    out.fields[name] = descriptor;
    return descriptor;
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
          if (!describe(name, attrs, here)) {
            out.stats.excluded++;
            diag({ code: "excluded_by_rights", severity: "info", path: `${path}/field`, message: "Champ non lisible pour ce compte : exclu." });
            break;
          }
          if (kids.some((k) => tagOf(k) !== "#text")) {
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
      const when = parseCondition(raw);
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
          const groupBy = context && typeof context === "object" && !Array.isArray(context) && "group_by" in context;
          const domain = attrs["date"] || groupBy ? null : asDomain(parseLiteral(attrs["domain"] ?? "[]"));
          const usable = domain !== null && (!attrs["context"] || (context !== null && !groupBy));
          if (!usable) {
            diag({ code: "unsupported_domain", severity: "info", path: here, message: groupBy ? "Regroupement non pris en charge." : "Filtre non pris en charge : désactivé." });
          }
          out.filters.push({ key, domain: usable ? domain : null, group });
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
          // filter_domain : expression avec « self » → hors MVP ; le remplacer par un ilike changerait le sens
          const usable = !attrs["filter_domain"] && ["char", "text", "many2one", "selection"].includes(meta.type);
          if (!usable) diag({ code: "unsupported_domain", severity: "info", path: here, message: "Recherche sur ce champ non prise en charge : désactivée." });
          out.searchFields[name] = { usable };
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
