# ADR-002 — Expressions Odoo 18 (`invisible`, `readonly`, `required`…)

**Statut :** proposé — **à valider avant d'implémenter le moteur générique**
**Date :** 22/10/2026 · **Lots :** L2–L3 · **Répond à :** § 3.5, Q-08

## 1. Contexte

En Odoo 18, `invisible`, `readonly`, `required`, `column_invisible` et les décorations sont des **expressions Python** évaluées par le client web sur les valeurs de l'enregistrement, `parent`, `context`, `uid`, `today`… Le cahier interdit `eval()`, la traduction naïve Python → JS et toute exécution de code fourni par le XML.

## 2. Décision

### 2.1 Où

- **Analyse** : dans l'adaptateur (`adapters/odoo18/ui/OdooExpressionParser.ts`). Sortie : un AST **neutre** (`Condition`) placé dans le ViewSchema. Aucune chaîne Python ne quitte le BFF.
- **Évaluation pour l'affichage** : côté front, sur les valeurs courantes du formulaire (réactivité à la saisie). Sans risque : l'AST ne contient aucune donnée secrète et ne décide d'aucun droit.
- **Évaluation pour l'écriture** : côté BFF, avec **le même évaluateur**, sur les valeurs de l'enregistrement après application du patch : un champ `readonly` à cet instant est refusé (403) avant tout appel à Odoo (§ 6.2.5). Odoo reste le dernier rempart (ACL, règles, contraintes).

### 2.2 Grammaire du sous-ensemble MVP

```
expr     := or
or       := and ("or" and)*
and      := not ("and" not)*
not      := "not" not | cmp
cmp      := atom (("==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not in") atom)?
atom     := "True" | "False" | "None" | nombre | chaîne | liste | nom | "(" expr ")"
nom      := identifiant | "parent." identifiant
liste    := "[" (atom ("," atom)*)? "]" | "(" … ")"
```

Pas d'appel de fonction, pas d'accès indicé, pas d'attribut autre que `parent.x`, pas de `context.get(…)` en MVP.

### 2.3 AST

```ts
type Condition =
  | { op: "const"; value: boolean | number | string | null | (boolean | number | string | null)[] }
  | { op: "field"; field: FieldKey; scope?: "parent" }
  | { op: "not"; arg: Condition }
  | { op: "and" | "or"; args: Condition[] }
  | { op: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not in"; left: Condition; right: Condition }
  | { op: "unsupported"; source: string };   // texte d'origine, pour le diagnostic uniquement
```

Sémantique Python reproduite là où elle diffère de JS : `False == 0`, chaîne vide et liste vide fausses, `many2one` vide = `False`, `x in liste`.

### 2.4 Repli prudent quand l'expression n'est pas prise en charge

| Attribut | Repli | Raison |
|---|---|---|
| `readonly` | **lecture seule** | Ne jamais transformer l'inconnu en droit d'écriture (§ 3.5) |
| `invisible` / `column_invisible` | **visible** + diagnostic | D-09 : pas de disparition silencieuse. Sans risque : les champs que l'utilisateur ne peut pas lire sont déjà retirés par le BFF (`fields_get`, groupes) |
| `required` | non imposé côté front ; Odoo valide à l'écriture | Évite de bloquer une saisie légitime |
| décorations | ignorées | Cosmétique |
| `domain`, `context` de champ | jamais transmis au front ; appliqués par le BFF (recherche de référence, contexte d'écriture) | Ce sont des requêtes, pas de la présentation |

### 2.5 Variables d'environnement

`uid`, `today`, `now`, `context.get('x')`, `context_today()` : **hors MVP**, `unsupported` + repli ci-dessus. On les ajoutera au vu de l'inventaire réel (UI-001, Q-08) : le BFF les substituera par des constantes **avant** de livrer l'AST (le front ne reçoit jamais le contexte Odoo).

## 3. Tests

- Table de cas Python ↔ résultat attendu (≥ 50 cas), y compris pièges de typage.
- Fixtures : expressions réellement présentes dans `hr`, `hr_attendance`, `leila_hr` sur `amg` ; taux de couverture publié dans la matrice de compatibilité.
- Propriété : `readonly` inconnu ⇒ jamais modifiable, quel que soit l'enregistrement.

## 4. Conséquence technique

L'évaluateur est exécuté **au front et au BFF** : il doit être un module partagé. Proposition : `packages/ui-schema/` (types, Zod, évaluateur), importé par `api` et `web`, contexte Docker du front passé à la racine du dépôt. **À valider avec ADR-001.**
