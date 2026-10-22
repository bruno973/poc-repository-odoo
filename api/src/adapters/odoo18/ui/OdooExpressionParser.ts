// adapters/odoo18/ui/OdooExpressionParser.ts — Expressions Python des vues Odoo 18
// → AST neutre (ADR-002). Rien n'est exécuté : on reconnaît un sous-ensemble sûr,
// tout le reste devient { op: "unsupported" } et déclenche le repli prudent.
//
// Deux usages :
//  - parseCondition : invisible / readonly / required / column_invisible / décorations ;
//  - parseLiteral   : domaines et contextes LITTÉRAUX (listes, tuples, dicts, constantes).
//    Une référence à une variable (uid, active_id, context_today()…) n'est pas littérale.

import type { Condition, Flag, Scalar } from "@leila/ui-schema";

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "name"; v: string }
  | { t: "op"; v: string }
  | { t: "end" };

const OPERATORS = ["==", "!=", "<=", ">=", "<", ">", "(", ")", "[", "]", "{", "}", ",", ":", "."];

class Unsupported extends Error {}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(src[i + 1] ?? "") && !lastIsValue(out))) {
      const m = /^-?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(src.slice(i));
      if (!m) throw new Unsupported("nombre");
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let v = "";
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\") {
          const next = src[j + 1];
          const esc: Record<string, string> = { n: "\n", t: "\t", "\\": "\\", "'": "'", '"': '"' };
          if (next === undefined || !(next in esc)) throw new Unsupported("échappement");
          v += esc[next];
          j += 2;
        } else v += src[j++];
      }
      if (src[j] !== ch) throw new Unsupported("chaîne non terminée");
      out.push({ t: "str", v });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)) as RegExpExecArray;
      out.push({ t: "name", v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) throw new Unsupported(`caractère ${ch}`);
    out.push({ t: "op", v: op });
    i += op.length;
  }
  out.push({ t: "end" });
  return out;
}

function lastIsValue(tokens: Token[]): boolean {
  const last = tokens[tokens.length - 1];
  return !!last && (last.t === "num" || last.t === "str" || last.t === "name" || (last.t === "op" && (last.v === ")" || last.v === "]")));
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i] as Token;
  }
  private next(): Token {
    return this.tokens[this.i++] as Token;
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === "op" && t.v === v;
  }
  private isName(v: string): boolean {
    const t = this.peek();
    return t.t === "name" && t.v === v;
  }
  private expectOp(v: string): void {
    if (!this.isOp(v)) throw new Unsupported(`« ${v} » attendu`);
    this.i++;
  }

  parseAll(): Condition {
    const e = this.or();
    if (this.peek().t !== "end") throw new Unsupported("suite inattendue");
    return e;
  }

  private or(): Condition {
    const args = [this.and()];
    while (this.isName("or")) {
      this.i++;
      args.push(this.and());
    }
    return args.length === 1 ? (args[0] as Condition) : { op: "or", args };
  }
  private and(): Condition {
    const args = [this.not()];
    while (this.isName("and")) {
      this.i++;
      args.push(this.not());
    }
    return args.length === 1 ? (args[0] as Condition) : { op: "and", args };
  }
  private not(): Condition {
    if (this.isName("not")) {
      this.i++;
      return { op: "not", arg: this.not() };
    }
    return this.cmp();
  }
  private cmp(): Condition {
    const left = this.atom();
    const t = this.peek();
    type Cmp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not in";
    let op: Cmp | null = null;
    if (t.t === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.v)) op = t.v as Cmp;
    else if (this.isName("in")) op = "in";
    else if (this.isName("not") && this.tokens[this.i + 1]?.t === "name" && (this.tokens[this.i + 1] as { v: string }).v === "in") op = "not in";
    if (!op) return left;
    this.i += op === "not in" ? 2 : 1;
    const right = this.atom();
    // Comparaisons chaînées (a < b < c) : hors sous-ensemble
    const after = this.peek();
    if (after.t === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(after.v)) throw new Unsupported("comparaison chaînée");
    return { op, left, right };
  }
  private atom(): Condition {
    const t = this.next();
    if (t.t === "num" || t.t === "str") return { op: "const", value: t.v };
    if (t.t === "op" && (t.v === "(" || t.v === "[")) {
      const close = t.v === "(" ? ")" : "]";
      // Parenthèses simples : sous-expression ; sinon tuple / liste de constantes
      if (t.v === "(" && !this.isOp(")")) {
        const first = this.or();
        if (this.isOp(")")) {
          this.i++;
          return first;
        }
        return this.sequence(close, first);
      }
      return this.sequence(close, null);
    }
    if (t.t === "name") {
      if (t.v === "True") return { op: "const", value: true };
      if (t.v === "False") return { op: "const", value: false };
      if (t.v === "None") return { op: "const", value: null };
      if (["and", "or", "not", "in"].includes(t.v)) throw new Unsupported("mot-clé inattendu");
      if (t.v === "parent" && this.isOp(".")) {
        this.i++;
        const f = this.next();
        if (f.t !== "name") throw new Unsupported("parent.?");
        this.noTrailer();
        return { op: "field", field: f.v, scope: "parent" };
      }
      // Variables d'environnement (uid, context, today…) et fonctions : hors sous-ensemble
      if (["uid", "context", "today", "now", "context_today", "current_date", "time", "datetime", "relativedelta", "id", "self"].includes(t.v)) {
        throw new Unsupported(`variable ${t.v}`);
      }
      this.noTrailer();
      return { op: "field", field: t.v };
    }
    throw new Unsupported("terme inattendu");
  }
  /** Appels, attributs et indexation après un nom : hors sous-ensemble */
  private noTrailer(): void {
    if (this.isOp("(") || this.isOp(".") || this.isOp("[")) throw new Unsupported("appel ou attribut");
  }
  private sequence(close: string, first: Condition | null): Condition {
    const items: Condition[] = first ? [first] : [];
    if (first) {
      if (!this.isOp(",") && !this.isOp(close)) throw new Unsupported("séquence");
      if (this.isOp(",")) this.i++;
    }
    while (!this.isOp(close)) {
      items.push(this.or());
      if (this.isOp(",")) this.i++;
      else if (!this.isOp(close)) throw new Unsupported("séquence");
    }
    this.expectOp(close);
    const values: Scalar[] = items.map((c) => {
      if (c.op !== "const" || Array.isArray(c.value)) throw new Unsupported("élément non constant");
      return c.value;
    });
    return { op: "const", value: values };
  }
}

/** Expression de condition → AST ; jamais d'exception : l'inconnu devient « unsupported ». */
export function parseCondition(source: string): Condition {
  try {
    return new Parser(tokenize(source)).parseAll();
  } catch {
    return { op: "unsupported", source };
  }
}

/** Valeur d'attribut XML → Flag : "1"/"True" et "0"/"False" deviennent des booléens. */
export function parseFlag(raw: string | undefined): Flag | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim();
  if (v === "" || v === "0" || v === "False") return false;
  if (v === "1" || v === "True") return true;
  const cond = parseCondition(v);
  return cond.op === "const" && !Array.isArray(cond.value) ? Boolean(cond.value) : cond;
}

// ─── Littéraux (domaines, contextes) ──────────────────────────────────────────

export type Literal = Scalar | Literal[] | { [key: string]: Literal };

class LiteralParser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}
  parseAll(): Literal {
    const v = this.value();
    if ((this.tokens[this.i] as Token).t !== "end") throw new Unsupported("suite");
    return v;
  }
  private value(): Literal {
    const t = this.tokens[this.i++] as Token;
    if (t.t === "num" || t.t === "str") return t.v;
    if (t.t === "name") {
      if (t.v === "True") return true;
      if (t.v === "False") return false;
      if (t.v === "None") return null;
      throw new Unsupported(`variable ${t.v}`);
    }
    if (t.t === "op" && (t.v === "[" || t.v === "(")) return this.items(t.v === "[" ? "]" : ")");
    if (t.t === "op" && t.v === "{") return this.dict();
    throw new Unsupported("littéral");
  }
  private items(close: string): Literal[] {
    const out: Literal[] = [];
    while (!this.at(close)) {
      out.push(this.value());
      if (this.at(",")) this.i++;
      else if (!this.at(close)) throw new Unsupported("séquence");
    }
    this.i++;
    return out;
  }
  private dict(): { [key: string]: Literal } {
    const out: { [key: string]: Literal } = {};
    while (!this.at("}")) {
      const k = this.tokens[this.i++] as Token;
      if (k.t !== "str") throw new Unsupported("clé");
      if (!this.at(":")) throw new Unsupported(":");
      this.i++;
      out[k.v] = this.value();
      if (this.at(",")) this.i++;
      else if (!this.at("}")) throw new Unsupported("dict");
    }
    this.i++;
    return out;
  }
  private at(v: string): boolean {
    const t = this.tokens[this.i] as Token;
    return t.t === "op" && t.v === v;
  }
}

/** Domaine / contexte littéral, ou null s'il dépend de variables ou n'est pas reconnu. */
export function parseLiteral(source: string | false | null | undefined | unknown[] | Record<string, unknown>): Literal | null {
  if (source === false || source === null || source === undefined) return null;
  if (typeof source !== "string") return source as Literal; // déjà structuré (rare)
  try {
    return new LiteralParser(tokenize(source)).parseAll();
  } catch {
    return null;
  }
}

/** Domaine Odoo littéral et bien formé (liste de termes [champ, opérateur, valeur] et '&' '|' '!'). */
export function asDomain(literal: Literal | null): unknown[] | null {
  if (!Array.isArray(literal)) return null;
  for (const term of literal) {
    if (term === "&" || term === "|" || term === "!") continue;
    if (!Array.isArray(term) || term.length !== 3 || typeof term[0] !== "string" || typeof term[1] !== "string") return null;
  }
  return literal;
}

const ARITY: Record<string, number> = { "!": 1, "&": 2, "|": 2 };

/** Comme odoo.osv.expression.normalize_domain : rend explicites les « & » implicites. */
export function normalizeDomain(domain: readonly unknown[]): unknown[] {
  if (domain.length === 0) return [[1, "=", 1]];
  const result: unknown[] = [];
  let expected = 1;
  for (const token of domain) {
    if (expected === 0) {
      result.unshift("&");
      expected = 1;
    }
    if (Array.isArray(token)) expected -= 1;
    else expected += (ARITY[token as string] ?? 0) - 1;
    result.push(token);
  }
  return result;
}

/** Combine des domaines par ET / OU (notation préfixée d'Odoo). */
export function combineDomains(op: "&" | "|", domains: readonly (readonly unknown[])[]): unknown[] {
  const parts = domains.filter((d) => d.length > 0).map(normalizeDomain);
  if (parts.length === 0) return [];
  return [...Array<string>(parts.length - 1).fill(op), ...parts.flat()];
}
