# ADR-002 — Conditions des vues Odoo 18

**Statut :** ✅ **validé sous conditions** (Bruno SOSIN, 22/10/2026) — replis modifiés au § 4
**Lots :** L2–L3 · **Répond à :** § 3.5, Q-08

## 1. Contexte

En Odoo 18, `invisible`, `readonly`, `required`, `column_invisible`, les décorations, `domain` et `context` sont des **expressions Python**. Le cahier interdit `eval()`, la traduction naïve Python → JS et toute exécution de code venu du XML.

## 2. Décision

- **Analyse** : dans l'adaptateur (`adapters/odoo18/ui/OdooExpressionParser.ts`). Sa sortie est un **AST neutre et versionné**, sans exécution, qui seul quitte le BFF.
- **Évaluation** : par un **évaluateur pur** du package partagé `@leila/ui-schema`, utilisé à deux endroits :
  - côté front, pour l'affichage (réaction à la saisie) ;
  - côté BFF, pour revalider une écriture : un champ `readonly` est refusé (403) avant tout appel à Odoo.
- **Sécurité** : l'invisibilité XML n'est **jamais** un mécanisme de sécurité. Les droits réels (ACL, règles d'enregistrement, groupes de champ) restent appliqués par le backend et Odoo.

## 3. Grammaire du sous-ensemble MVP

```
expr  := or ;  or := and ("or" and)* ;  and := not ("and" not)*
not   := "not" not | cmp
cmp   := atom (("=="|"!="|"<"|"<="|">"|">="|"in"|"not in") atom)?
atom  := True | False | None | nombre | chaîne | liste | tuple | nom | "parent." nom | "(" expr ")"
```

AST :

```ts
type Condition =
  | { op: "const"; value: Scalar | Scalar[] }
  | { op: "field"; field: string; scope?: "parent" }
  | { op: "not"; arg: Condition }
  | { op: "and" | "or"; args: Condition[] }
  | { op: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not in"; left: Condition; right: Condition }
  | { op: "unsupported"; source: string };
```

La sémantique Python est reproduite là où elle diffère de JavaScript :
- `False == 0` ;
- chaîne vide, liste vide et `None` sont fausses ;
- une relation vide vaut `False` ;
- `in` s'applique aux listes et aux sous-chaînes.

Une valeur **inconnue**, c'est-à-dire un champ absent des valeurs lisibles, rend la condition **indéterminée** : le repli du § 4 s'applique.

`id` désigne l'identifiant de la fiche (constaté sur `amg` : `invisible="not id"`).

**Domaines** (arbitrage « domain inconnu → opération désactivée ») — d'après l'inventaire réel de `amg` (`api/src/adapters/odoo18/ui/OdooDomain.ts`) : les domaines sont des expressions restreintes **évaluées côté serveur**, jamais exécutées : constantes, listes / tuples, champs de la fiche, `and` / `or` / `not`, concaténation `+` (motif `(company_id and [...] or [...]) + ([])` des champs « même société »), et trois variables connues avec certitude par le BFF :
- `uid` → l'utilisateur connecté ;
- `allowed_company_ids` → sa société courante (ce qu'Odoo applique par défaut ; jamais un périmètre plus large) ;
- `self` → le texte saisi (`filter_domain` des champs de recherche).

Si une valeur référencée n'est pas lisible, ou si le domaine contient `context`, `context_today()`, un appel ou un attribut, l'opération est désactivée — jamais élargie.

**Contexte d'action** : `context.get('clé'[, défaut])` est lu dans le contexte **littéral** de l'action (connu au moment de l'analyse) ; les clés du contexte utilisateur (`lang`, `tz`, `uid`, `allowed_company_ids`, `active_*`) restent non prises en charge.

Non pris en charge dans les conditions : appels de fonction (hors `context.get`), indexation, `uid`, `today`, `now`, `context_today()`. Sur les 23 actions de l'inventaire admin de `amg`, **toutes** les conditions sont désormais comprises. On les ajoutera au vu de l'inventaire réel des vues de `amg` (UI-001, Q-08).

## 4. Replis quand une condition est inconnue ou indéterminée (arbitrage)

| Élément | Repli |
|---|---|
| `readonly` | **lecture seule** |
| `invisible` | **masqué** + diagnostic |
| `column_invisible` | colonne **masquée** + diagnostic |
| `required` | aucune valeur inventée ; pas de validation locale incertaine (ni blocage, ni « non requis » affirmé) ; la validation serveur fait foi ; diagnostic |
| `domain` / `context` | **opération dépendante désactivée** (sélection many2one, filtre, action) plutôt qu'élargie ; diagnostic |
| bouton dont une condition est inconnue | **commande désactivée** |
| décoration | style **neutre** + diagnostic |

Les champs invisibles nécessaires au calcul d'autres conditions sont chargés et utilisés en interne **uniquement s'ils sont lisibles** par l'utilisateur. S'ils ne le sont pas, la condition est indéterminée et le repli s'applique.

## 5. Tests

- Table de cas Python ↔ résultat attendu (≥ 50 cas, dont les pièges de typage) dans le package.
- Propriété : `readonly` inconnu ⇒ jamais modifiable, et l'écriture est refusée par le BFF.
- Parseur testé sur des vues **résolues** Odoo 18. Les fixtures actuelles reproduisent la structure des vues standard `hr.employee` / `hr.attendance`. Elles devront être **remplacées par les architectures réellement extraites de `amg`** (`hr`, `hr_attendance`, `leila_hr`) dès que l'inventaire UI-001 sera lancé depuis un poste du tailnet.
