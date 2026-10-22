// adapters/odoo18/ui/OdooDomain.ts — Domaines Odoo 18 : expressions Python RESTREINTES,
// évaluées CÔTÉ SERVEUR, jamais exécutées.
//
// Constaté sur amg (inventaire UI-001) : les domaines réels ne sont pas des littéraux.
//   [('company_id', 'in', allowed_company_ids)]                         (actions)
//   (company_id and [('company_id', 'in', [company_id] + [False])]
//      or [('company_id', '=', False)]) + ([])                          (champs « même société »)
//   ['|', ('work_email', 'ilike', self), ('name', 'ilike', self)]       (filter_domain)
//   [('parent_id.user_id', '=', uid)]                                   (filtre « Mon équipe »)
//
// Sous-ensemble accepté : constantes, listes / tuples, champs de la fiche, `and`, `or`,
// `not`, concaténation `+`, et trois variables CONNUES AVEC CERTITUDE par le serveur :
//   uid                  → l'utilisateur connecté ;
//   allowed_company_ids  → sa société courante (ce qu'Odoo applique par défaut :
//                          jamais un périmètre plus large) ;
//   self                 → le texte saisi dans une recherche.
// Tout le reste (context, context_today(), appels, attributs) → non pris en charge :
// l'opération qui dépend du domaine est désactivée, jamais élargie (ADR-002).

import { ENVIRONMENT, type Token, tokenize, Unsupported } from "./OdooExpressionParser.js";

export type DomainEnvName = "uid" | "allowed_company_ids" | "self";
const ENV_NAMES: readonly DomainEnvName[] = ["uid", "allowed_company_ids", "self"];

export type DomainExpr =
  | { k: "lit"; v: string | number | boolean | null }
  | { k: "list"; items: DomainExpr[] }
  | { k: "field"; name: string }
  | { k: "env"; name: DomainEnvName }
  | { k: "and" | "or" | "add"; args: DomainExpr[] }
  | { k: "not"; arg: DomainExpr };

class DomainParser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  parseAll(): DomainExpr {
    const e = this.or();
    if (this.peek().t !== "end") throw new Unsupported("suite");
    return e;
  }
  private peek(): Token {
    return this.tokens[this.i] as Token;
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === "op" && t.v === v;
  }
  private isName(v: string): boolean {
    const t = this.peek();
    return t.t === "name" && t.v === v;
  }
  private or(): DomainExpr {
    const args = [this.and()];
    while (this.isName("or")) {
      this.i++;
      args.push(this.and());
    }
    return args.length === 1 ? (args[0] as DomainExpr) : { k: "or", args };
  }
  private and(): DomainExpr {
    const args = [this.not()];
    while (this.isName("and")) {
      this.i++;
      args.push(this.not());
    }
    return args.length === 1 ? (args[0] as DomainExpr) : { k: "and", args };
  }
  private not(): DomainExpr {
    if (this.isName("not")) {
      this.i++;
      return { k: "not", arg: this.not() };
    }
    return this.add();
  }
  private add(): DomainExpr {
    const args = [this.atom()];
    while (this.isOp("+")) {
      this.i++;
      args.push(this.atom());
    }
    return args.length === 1 ? (args[0] as DomainExpr) : { k: "add", args };
  }
  private atom(): DomainExpr {
    const t = this.tokens[this.i++] as Token;
    if (t.t === "num" || t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "op" && (t.v === "[" || t.v === "(")) {
      const close = t.v === "[" ? "]" : ")";
      const items: DomainExpr[] = [];
      let comma = false;
      while (!this.isOp(close)) {
        items.push(this.or());
        if (this.isOp(",")) {
          this.i++;
          comma = true;
        } else if (!this.isOp(close)) throw new Unsupported("séquence");
      }
      this.i++;
      // (expr) sans virgule : simple parenthésage
      if (close === ")" && items.length === 1 && !comma) return items[0] as DomainExpr;
      return { k: "list", items };
    }
    if (t.t === "name") {
      if (t.v === "True") return { k: "lit", v: true };
      if (t.v === "False") return { k: "lit", v: false };
      if (t.v === "None") return { k: "lit", v: null };
      if (this.isOp("(") || this.isOp(".") || this.isOp("[")) throw new Unsupported("appel ou attribut");
      if ((ENV_NAMES as readonly string[]).includes(t.v)) return { k: "env", name: t.v as DomainEnvName };
      if (ENVIRONMENT.includes(t.v) || ["and", "or", "not", "in"].includes(t.v)) throw new Unsupported(`variable ${t.v}`);
      return { k: "field", name: t.v };
    }
    throw new Unsupported("terme");
  }
}

/** Domaine source (chaîne Python ou liste déjà structurée) → expression, ou null si hors sous-ensemble. */
export function parseDomain(source: unknown): DomainExpr | null {
  if (source === undefined || source === null || source === false || source === "") return { k: "list", items: [] };
  if (Array.isArray(source)) return fromStructured(source);
  if (typeof source !== "string") return null;
  try {
    return new DomainParser(tokenize(source)).parseAll();
  } catch {
    return null;
  }
}

function fromStructured(v: unknown): DomainExpr | null {
  if (Array.isArray(v)) {
    const items = v.map(fromStructured);
    return items.some((x) => x === null) ? null : { k: "list", items: items as DomainExpr[] };
  }
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return { k: "lit", v };
  return null;
}

export function domainRefs(expr: DomainExpr, fields = new Set<string>(), env = new Set<DomainEnvName>()): { fields: Set<string>; env: Set<DomainEnvName> } {
  switch (expr.k) {
    case "field":
      fields.add(expr.name);
      break;
    case "env":
      env.add(expr.name);
      break;
    case "list":
      expr.items.forEach((x) => domainRefs(x, fields, env));
      break;
    case "and":
    case "or":
    case "add":
      expr.args.forEach((x) => domainRefs(x, fields, env));
      break;
    case "not":
      domainRefs(expr.arg, fields, env);
      break;
    case "lit":
      break;
  }
  return { fields, env };
}

export interface DomainScope {
  /** Valeurs de la fiche (lisibles par l'utilisateur) ; un champ absent est inconnu */
  values?: Readonly<Record<string, unknown>>;
  env?: Partial<Record<DomainEnvName, unknown>>;
}

const UNKNOWN: unique symbol = Symbol("inconnu");
type V = unknown;

function truthy(v: V): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== false && v !== 0 && v !== "" && v !== undefined;
}

function value(raw: unknown): V {
  if (raw === undefined) return UNKNOWN;
  if (raw === null) return false;
  if (typeof raw === "object" && !Array.isArray(raw) && raw !== null && "id" in raw) return (raw as { id: unknown }).id;
  return raw;
}

function evaluate(expr: DomainExpr, scope: DomainScope): V {
  switch (expr.k) {
    case "lit":
      return expr.v;
    case "field": {
      const values = scope.values ?? {};
      return Object.prototype.hasOwnProperty.call(values, expr.name) ? value(values[expr.name]) : UNKNOWN;
    }
    case "env": {
      const v = scope.env?.[expr.name];
      return v === undefined ? UNKNOWN : v;
    }
    case "list": {
      const items = expr.items.map((x) => evaluate(x, scope));
      return items.includes(UNKNOWN) ? UNKNOWN : items;
    }
    case "not": {
      const v = evaluate(expr.arg, scope);
      return v === UNKNOWN ? UNKNOWN : !truthy(v);
    }
    case "and": {
      let last: V = true;
      for (const a of expr.args) {
        last = evaluate(a, scope);
        if (last === UNKNOWN || !truthy(last)) return last;
      }
      return last;
    }
    case "or": {
      let last: V = false;
      for (const a of expr.args) {
        last = evaluate(a, scope);
        if (last === UNKNOWN || truthy(last)) return last;
      }
      return last;
    }
    case "add": {
      const parts = expr.args.map((a) => evaluate(a, scope));
      if (parts.includes(UNKNOWN)) return UNKNOWN;
      if (parts.every(Array.isArray)) return (parts as unknown[][]).flat(1);
      if (parts.every((p) => typeof p === "string")) return (parts as string[]).join("");
      return UNKNOWN; // TypeError en Python
    }
  }
}

/**
 * Domaine prêt pour Odoo, ou null si indéterminé (valeur non lisible, variable inconnue)
 * ou mal formé : l'appelant désactive alors l'opération.
 */
export function evaluateDomain(expr: DomainExpr, scope: DomainScope = {}): unknown[] | null {
  const v = evaluate(expr, scope);
  if (v === UNKNOWN || !Array.isArray(v)) return null;
  for (const term of v) {
    if (term === "&" || term === "|" || term === "!") continue;
    if (!Array.isArray(term) || term.length !== 3 || typeof term[1] !== "string") return null;
    if (typeof term[0] !== "string" && !(term[0] === 1 || term[0] === 0)) return null;
  }
  return v;
}

/** Concaténation de domaines (champ + vue), comme Odoo. */
export function concatDomains(...exprs: DomainExpr[]): DomainExpr {
  return exprs.length === 1 ? (exprs[0] as DomainExpr) : { k: "add", args: exprs };
}
