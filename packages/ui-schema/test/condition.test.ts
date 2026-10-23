// test/condition.test.ts — Évaluateur de conditions : sémantique Python et replis prudents.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Condition,
  ConditionSchema,
  type Scalar,
  conditionFields,
  evaluateCondition,
  isSupported,
  resolveButton,
  resolveFlag,
  resolveRequired,
} from "../src/index.js";

const c = (value: Scalar | Scalar[]): Condition => ({ op: "const", value });
const f = (field: string, scope?: "parent"): Condition => (scope ? { op: "field", field, scope } : { op: "field", field });
const cmp = (op: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not in", left: Condition, right: Condition): Condition => ({ op, left, right });
const not = (arg: Condition): Condition => ({ op: "not", arg });
const and = (...args: Condition[]): Condition => ({ op: "and", args });
const or = (...args: Condition[]): Condition => ({ op: "or", args });
const U: Condition = { op: "unsupported", source: "context.get('x')" };

const values = {
  name: "Alice",
  empty: null,
  zero: 0,
  one: 1,
  pi: 3.14,
  yes: true,
  no: false,
  state: "draft",
  dept: { id: 3, label: "Atelier" },
  noDept: null,
  tags: [1, 2, 3],
  noTags: [],
  day: "2026-10-22",
};
const scope = { values, parent: { company: { id: 1, label: "A" } } };
const ev = (cond: Condition) => evaluateCondition(cond, scope);

// [description, condition, attendu]
const CASES: [string, Condition, boolean | null][] = [
  ["constante True", c(true), true],
  ["constante False", c(false), false],
  ["None est faux", c(null), false],
  ["chaîne non vide vraie", c("x"), true],
  ["chaîne vide fausse", c(""), false],
  ["0 faux", c(0), false],
  ["liste vide fausse", c([]), false],
  ["liste non vide vraie", c([0]), true],
  ["champ texte vrai", f("name"), true],
  ["champ vide → False", f("empty"), false],
  ["champ 0 faux", f("zero"), false],
  ["référence renseignée vraie", f("dept"), true],
  ["référence vide fausse", f("noDept"), false],
  ["liste d'ids non vide vraie", f("tags"), true],
  ["liste d'ids vide fausse", f("noTags"), false],
  ["champ inconnu → indéterminé", f("secret"), null],
  ["== chaîne", cmp("==", f("state"), c("draft")), true],
  ["!= chaîne", cmp("!=", f("state"), c("done")), true],
  ["False == 0 (Python)", cmp("==", c(false), c(0)), true],
  ["True == 1 (Python)", cmp("==", c(true), c(1)), true],
  ["vide == False", cmp("==", f("empty"), c(false)), true],
  ["vide != False est faux", cmp("!=", f("empty"), c(false)), false],
  ["None == False est faux (Python)", cmp("==", c(null), c(false)), false],
  ["référence == id", cmp("==", f("dept"), c(3)), true],
  ["référence != autre id", cmp("!=", f("dept"), c(4)), true],
  ["< nombres", cmp("<", f("one"), f("pi")), true],
  [">= nombres", cmp(">=", f("one"), c(1)), true],
  ["> booléen/nombre", cmp(">", f("yes"), c(0)), true],
  ["<= chaînes (dates ISO)", cmp("<=", f("day"), c("2026-12-31")), true],
  ["< chaîne/nombre → TypeError → indéterminé", cmp("<", f("state"), c(1)), null],
  ["in liste", cmp("in", f("state"), c(["draft", "open"])), true],
  ["not in liste", cmp("not in", f("state"), c(["done"])), true],
  ["in liste faux", cmp("in", f("state"), c(["done"])), false],
  ["in sous-chaîne", cmp("in", c("li"), f("name")), true],
  ["in sur un nombre → indéterminé", cmp("in", c(1), f("one")), null],
  ["id in liste d'ids", cmp("in", c(2), f("tags")), true],
  ["référence in liste", cmp("in", f("dept"), c([1, 3])), true],
  ["False in [0] (Python)", cmp("in", c(false), c([0])), true],
  ["== listes", cmp("==", f("tags"), c([1, 2, 3])), true],
  ["== listes de longueurs différentes", cmp("==", f("tags"), c([1, 2])), false],
  ["not vrai", not(f("yes")), false],
  ["not vide", not(f("empty")), true],
  ["not inconnu → indéterminé", not(f("secret")), null],
  ["and vrai", and(f("yes"), f("name")), true],
  ["and court-circuit sur faux connu", and(f("no"), f("secret")), false],
  ["and avec inconnu en tête → indéterminé", and(f("secret"), f("no")), null],
  ["and vrai puis inconnu → indéterminé", and(f("yes"), f("secret")), null],
  ["or court-circuit sur vrai connu", or(f("yes"), f("secret")), true],
  ["or faux puis inconnu → indéterminé", or(f("no"), f("secret")), null],
  ["or faux", or(f("no"), f("empty")), false],
  ["comparaison avec inconnu → indéterminé", cmp("==", f("secret"), c(1)), null],
  ["non pris en charge → indéterminé", U, null],
  ["not(non pris en charge) → indéterminé", not(U), null],
  ["or(vrai, non pris en charge) → vrai", or(c(true), U), true],
  ["champ parent", cmp("==", f("company", "parent"), c(1)), true],
  ["champ parent inconnu", f("x", "parent"), null],
  ["imbrication", and(or(cmp("==", f("state"), c("draft")), f("no")), not(f("noDept"))), true],
  ["valeur objet non reconnue → indéterminé", f("weird"), null],
  ["étiquettes : liste de références → ids", cmp("in", c(3), f("refTags")), true],
  ["étiquettes vides → faux", f("noTags"), false],
  ["lignes liées complètes → ids", cmp("in", c(7), f("allLines")), true],
  ["lignes liées vides → faux", not(f("noLines")), true],
  ["lignes liées partielles → indéterminé", f("someLines"), null],
];

describe("evaluateCondition (sémantique Python)", () => {
  const withWeird = {
    ...scope,
    values: {
      ...values,
      weird: { foo: 1 },
      refTags: [{ id: 3, label: "A" }, { id: 4, label: "B" }],
      noTags: [],
      allLines: { lines: [{ id: 7, values: {} }], total: 1 },
      noLines: { lines: [], total: 0 },
      someLines: { lines: [{ id: 7, values: {} }], total: 30 },
    },
  };
  for (const [name, cond, expected] of CASES) {
    it(name, () => assert.equal(evaluateCondition(cond, withWeird), expected));
  }
  it(`couvre au moins 50 cas (${CASES.length})`, () => assert.ok(CASES.length >= 50));
});

describe("Replis prudents (ADR-002 § 4)", () => {
  it("readonly indéterminé → lecture seule", () => assert.equal(resolveFlag(U, "readonly", scope), true));
  it("invisible indéterminé → masqué", () => assert.equal(resolveFlag(f("secret"), "invisible", scope), true));
  it("column_invisible indéterminé → masquée", () => assert.equal(resolveFlag(U, "columnInvisible", scope), true));
  it("required indéterminé → « unknown », pas de valeur inventée", () => assert.equal(resolveRequired(U, scope), "unknown"));
  it("bouton à condition indéterminée → désactivé", () => assert.equal(resolveButton(U, scope), "disabled"));
  it("bouton visible / masqué selon la condition", () => {
    assert.equal(resolveButton(cmp("==", f("state"), c("done")), scope), "visible");
    assert.equal(resolveButton(cmp("==", f("state"), c("draft")), scope), "hidden");
    assert.equal(resolveButton(undefined, scope), "visible");
  });
  it("flag absent ou booléen", () => {
    assert.equal(resolveFlag(undefined, "readonly", scope), false);
    assert.equal(resolveFlag(true, "invisible", scope), true);
    assert.equal(resolveRequired(true, scope), true);
  });
  it("readonly inconnu reste en lecture seule quelles que soient les valeurs", () => {
    for (const v of [{}, values, { secret: 1 }]) assert.equal(resolveFlag(and(U, f("yes")), "readonly", { values: v }), true);
  });
});

describe("Outils", () => {
  it("isSupported", () => {
    assert.equal(isSupported(and(f("a"), cmp("==", f("b"), c(1)))), true);
    assert.equal(isSupported(or(f("a"), not(U))), false);
  });
  it("conditionFields liste les champs lus (hors parent)", () => {
    assert.deepEqual([...conditionFields(and(f("a"), cmp("in", f("b"), c([1])), f("p", "parent")))].sort(), ["a", "b"]);
  });
  it("le schéma Zod valide un AST et refuse un opérateur inconnu", () => {
    assert.ok(ConditionSchema.safeParse(and(f("a"), not(U))).success);
    assert.ok(!ConditionSchema.safeParse({ op: "eval", source: "__import__('os')" }).success);
    assert.ok(!ConditionSchema.safeParse({ op: "and", args: [] }).success);
  });
});
