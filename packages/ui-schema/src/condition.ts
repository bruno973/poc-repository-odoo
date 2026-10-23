// condition.ts — Conditions de présentation (invisible, readonly, required,
// décorations) : AST neutre et évaluateur PUR (ADR-002).
//
// Aucun eval, aucun accès au DOM, au réseau ou à une horloge : l'évaluation ne
// dépend que de l'AST et des valeurs fournies. Le même code tourne dans le
// navigateur (affichage) et dans le BFF (revalidation d'une écriture).
//
// Sémantique Python reproduite là où elle diffère de JavaScript (False == 0,
// vides faux, `in` sur listes et sous-chaînes). Une valeur inconnue rend le
// résultat INDÉTERMINÉ (null) : l'appelant applique alors le repli prudent.

import { z } from "zod";

export type Scalar = string | number | boolean | null;

export type Comparison = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not in";

export type Condition =
  | { op: "const"; value: Scalar | Scalar[] }
  | { op: "field"; field: string; scope?: "parent" }
  | { op: "not"; arg: Condition }
  | { op: "and" | "or"; args: Condition[] }
  | { op: Comparison; left: Condition; right: Condition }
  | { op: "unsupported"; source: string };

const ScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const COMPARISONS = ["==", "!=", "<", "<=", ">", ">=", "in", "not in"] as const;

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal("const"), value: z.union([ScalarSchema, z.array(ScalarSchema)]) }),
    z.object({ op: z.literal("field"), field: z.string().min(1), scope: z.literal("parent").optional() }),
    z.object({ op: z.literal("not"), arg: ConditionSchema }),
    z.object({ op: z.enum(["and", "or"]), args: z.array(ConditionSchema).min(1) }),
    z.object({ op: z.enum(COMPARISONS), left: ConditionSchema, right: ConditionSchema }),
    z.object({ op: z.literal("unsupported"), source: z.string() }),
  ]),
) as z.ZodType<Condition>;

/** Booléen fixe ou condition à évaluer sur l'enregistrement. */
export type Flag = boolean | Condition;
export const FlagSchema: z.ZodType<Flag> = z.union([z.boolean(), ConditionSchema]);

/** Valeurs vues par l'évaluateur : un champ absent est INCONNU (non lisible ou non chargé). */
export interface ConditionScope {
  values: Readonly<Record<string, unknown>>;
  parent?: Readonly<Record<string, unknown>>;
}

const UNKNOWN: unique symbol = Symbol("inconnu");
type Value = Scalar | Value[] | typeof UNKNOWN;

/**
 * Normalise une valeur Leila vers ce que voit une expression de condition :
 * vide → False, référence { id, label } → id, liste de références → liste d'ids,
 * lignes liées → ids des lignes (inconnu si elles ne sont pas toutes transmises).
 */
function normalize(raw: unknown): Value {
  if (raw === undefined) return UNKNOWN;
  if (raw === null) return false;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  if (Array.isArray(raw)) return raw.map(normalize);
  if (typeof raw === "object" && raw !== null && "id" in raw && typeof (raw as { id: unknown }).id === "number") {
    return (raw as { id: number }).id;
  }
  if (typeof raw === "object" && raw !== null && "ids" in raw && Array.isArray((raw as { ids: unknown }).ids)) {
    return ((raw as { ids: unknown[] }).ids).map(normalize);
  }
  // Lignes liées : ids des lignes si toutes sont connues ; sinon seule la vacuité est sûre
  if (typeof raw === "object" && raw !== null && "lines" in raw && "total" in raw && Array.isArray((raw as { lines: unknown }).lines)) {
    const { lines, total } = raw as { lines: { id: number }[]; total: number };
    if (total === 0) return [];
    return lines.length === total ? lines.map((l) => l.id) : UNKNOWN;
  }
  return UNKNOWN;
}

function truthy(v: Exclude<Value, typeof UNKNOWN>): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== false && v !== 0 && v !== "";
}

function asNumber(v: Value): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}

function pyEq(a: Value, b: Value): boolean | typeof UNKNOWN {
  if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
  if (a === null || b === null) return a === b;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na === nb;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const eq = pyEq(a[i] as Value, b[i] as Value);
      if (eq !== true) return eq;
    }
    return true;
  }
  return a === b;
}

function compare(op: Comparison, a: Value, b: Value): Value {
  if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
  switch (op) {
    case "==":
      return pyEq(a, b);
    case "!=": {
      const eq = pyEq(a, b);
      return eq === UNKNOWN ? UNKNOWN : !eq;
    }
    case "in":
    case "not in": {
      let found: boolean | typeof UNKNOWN;
      if (Array.isArray(b)) {
        found = false;
        for (const item of b) {
          const eq = pyEq(a, item);
          if (eq === UNKNOWN) return UNKNOWN;
          if (eq) {
            found = true;
            break;
          }
        }
      } else if (typeof b === "string" && typeof a === "string") {
        found = b.includes(a);
      } else {
        return UNKNOWN; // TypeError en Python
      }
      return op === "in" ? found : !found;
    }
    default: {
      // Ordre : nombres (booléens compris) entre eux, chaînes entre elles ; sinon TypeError en Python
      const na = asNumber(a);
      const nb = asNumber(b);
      let x: number | string;
      let y: number | string;
      if (na !== null && nb !== null) [x, y] = [na, nb];
      else if (typeof a === "string" && typeof b === "string") [x, y] = [a, b];
      else return UNKNOWN;
      return op === "<" ? x < y : op === "<=" ? x <= y : op === ">" ? x > y : x >= y;
    }
  }
}

function evaluate(node: Condition, scope: ConditionScope): Value {
  switch (node.op) {
    case "const":
      return Array.isArray(node.value) ? [...node.value] : node.value;
    case "field": {
      const source = node.scope === "parent" ? scope.parent : scope.values;
      if (!source || !Object.prototype.hasOwnProperty.call(source, node.field)) return UNKNOWN;
      return normalize(source[node.field]);
    }
    case "not": {
      const v = evaluate(node.arg, scope);
      return v === UNKNOWN ? UNKNOWN : !truthy(v);
    }
    case "and": {
      // `a and b` : renvoie le premier opérande faux, sinon le dernier
      let last: Value = true;
      for (const arg of node.args) {
        last = evaluate(arg, scope);
        if (last === UNKNOWN) return UNKNOWN;
        if (!truthy(last)) return last;
      }
      return last;
    }
    case "or": {
      let last: Value = false;
      for (const arg of node.args) {
        last = evaluate(arg, scope);
        if (last === UNKNOWN) return UNKNOWN;
        if (truthy(last)) return last;
      }
      return last;
    }
    case "unsupported":
      return UNKNOWN;
    default:
      return compare(node.op, evaluate(node.left, scope), evaluate(node.right, scope));
  }
}

/** true / false, ou null si la condition est indéterminée (non prise en charge, valeur inconnue, types incompatibles). */
export function evaluateCondition(condition: Condition, scope: ConditionScope): boolean | null {
  const v = evaluate(condition, scope);
  return v === UNKNOWN ? null : truthy(v);
}

/** La condition contient-elle une partie non prise en charge ? (indéterminée quelles que soient les valeurs) */
export function isSupported(condition: Condition): boolean {
  switch (condition.op) {
    case "unsupported":
      return false;
    case "const":
    case "field":
      return true;
    case "not":
      return isSupported(condition.arg);
    case "and":
    case "or":
      return condition.args.every(isSupported);
    default:
      return isSupported(condition.left) && isSupported(condition.right);
  }
}

/** Champs lus par la condition (pour charger aussi les champs invisibles nécessaires, s'ils sont lisibles). */
export function conditionFields(condition: Condition, out = new Set<string>()): Set<string> {
  switch (condition.op) {
    case "field":
      if (condition.scope !== "parent") out.add(condition.field);
      break;
    case "not":
      conditionFields(condition.arg, out);
      break;
    case "and":
    case "or":
      condition.args.forEach((c) => conditionFields(c, out));
      break;
    case "const":
    case "unsupported":
      break;
    default:
      conditionFields(condition.left, out);
      conditionFields(condition.right, out);
  }
  return out;
}

// ─── Replis prudents (ADR-002 § 4, arbitrage du 22/10/2026) ───────────────────

export type FlagKind = "invisible" | "columnInvisible" | "readonly" | "required";

/**
 * Valeur retenue quand la condition est indéterminée.
 *  - readonly            → lecture seule
 *  - invisible           → masqué
 *  - columnInvisible     → colonne masquée
 *  - required            → « indéterminé » : aucune validation locale (resolveRequired)
 */
export const FALLBACK: Record<Exclude<FlagKind, "required">, boolean> = {
  invisible: true,
  columnInvisible: true,
  readonly: true,
};

export function resolveFlag(flag: Flag | undefined, kind: Exclude<FlagKind, "required">, scope: ConditionScope): boolean {
  if (flag === undefined) return false;
  if (typeof flag === "boolean") return flag;
  return evaluateCondition(flag, scope) ?? FALLBACK[kind];
}

/** required : true / false, ou "unknown" — ne pas inventer : la validation serveur fait foi. */
export function resolveRequired(flag: Flag | undefined, scope: ConditionScope): boolean | "unknown" {
  if (flag === undefined) return false;
  if (typeof flag === "boolean") return flag;
  return evaluateCondition(flag, scope) ?? "unknown";
}

/** Bouton : condition d'invisibilité indéterminée → affiché mais commande DÉSACTIVÉE (et refusée par le serveur). */
export function resolveButton(invisible: Flag | undefined, scope: ConditionScope): "visible" | "hidden" | "disabled" {
  if (invisible === undefined) return "visible";
  if (typeof invisible === "boolean") return invisible ? "hidden" : "visible";
  const v = evaluateCondition(invisible, scope);
  return v === null ? "disabled" : v ? "hidden" : "visible";
}
