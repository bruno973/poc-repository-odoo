# ADR-001 — Leila UI Schema v1

**Statut :** ✅ **validé sous conditions** (Bruno SOSIN, 22/10/2026) — arbitrages intégrés au § 9
**Lots :** L2–L3 · **Répond à :** D-04, D-05, D-09, § 3.4, § 3.6, § 3.7

## 1. Contexte

React doit afficher des écrans issus des vues Odoo 18 **résolues** (`get_views()`), héritages compris, sans jamais voir de XML, de nom de modèle, de domaine ni de session Odoo. Leila définit donc **son propre langage de présentation** ; Odoo 18 n'en est qu'un fournisseur.

## 2. Décision : deux documents, jamais mélangés

| Document | Contenu | Cache |
|---|---|---|
| **ViewSchema** (statique) | Structure, ordre, libellés, types de champs, conditions (AST, ADR-002), filtres, commandes proposées, diagnostics | Oui, côté BFF, clé isolée (§ 7) |
| **RecordPayload** (dynamique) | Valeurs typées d'**un** enregistrement, droits sur **cet** enregistrement, état des commandes | **Jamais** partagé entre utilisateurs ni enregistrements |

Types, schémas Zod, valeurs, diagnostics et versionnement vivent dans le **package partagé `@leila/ui-schema`** (§ 8).

## 3. ViewSchema

```ts
interface ViewSchema {
  schemaVersion: "1.0";             // le front refuse une version majeure inconnue
  viewKey: string;                  // opaque, émis par le BFF pour la session
  viewType: "list" | "form" | "search";
  title: string;
  resourceKey: string;              // opaque ; seul l'adaptateur sait à quoi il correspond
  resourceKind: "portable" | "compatibility";
  capabilities: { canCreate: boolean; canEdit: boolean; canDelete: boolean };  // présentation uniquement
  fields: Record<string, FieldDescriptor>;
  root: Node[];
  diagnostics: Diagnostic[];
}
```

### 3.1 Identifiants de champs (arbitrage 1)

- **Écrans importés d'Odoo** (`resourceKind: "compatibility"`) : le nom technique du champ (`name`, `department_id`…) est l'identifiant, **traité comme une chaîne opaque**. Le moteur React affiche tout champ décrit dans `fields` sans connaissance préalable : un champ ajouté à la vue XML apparaît sans modifier le front.
- **Écrans stratégiques Leila** (`portable`) : contrats métier indépendants d'Odoo (ports `EmployeeRepository`, `AttendanceRepository`, `SummaryRepository`).
- Aucun composant React générique ne contient de logique propre à un modèle Odoo ; identifiants de modèles, références de vues, actions et mécanismes Odoo restent dans l'adaptateur (`api/src/adapters/odoo18/ui/`) et ses métadonnées de compatibilité. Contrôlé par `test/boundaries.test.ts`.

### 3.2 Champs — périmètre MVP (arbitrage 2)

| `type` Leila | Source Odoo | Lecture | Écriture MVP |
|---|---|---|---|
| `text` / `multiline` | `char` / `text` | ✅ | ✅ |
| `integer` / `decimal` | `integer` / `float` | ✅ | ✅ |
| `boolean` | `boolean` | ✅ | ✅ |
| `selection` | `selection` | ✅ | ✅ |
| `date` / `datetime` | `date` / `datetime` | ✅ | ✅ |
| `reference` | `many2one` | ✅ | ✅ **seulement** si le domaine du champ est pris en charge (absent ou littéral) et la recherche autorisée ; sinon lecture seule + diagnostic |
| `money` | `monetary` | ✅ si la devise est résolue (champ devise lisible), sinon non pris en charge | ❌ (MVP) |
| `references` (1.1) | `many2many` | ✅ étiquettes : noms lus par le BFF avec les droits de l'utilisateur (illisibles → nombre) | ❌ |
| `lines` (1.1) | `one2many` (et `many2many` en sous-liste) | ✅ tableau : colonnes simples et lisibles de la sous-liste embarquée ; sans sous-liste ou en kanban → noms seuls ; 40 premières lignes + total | ❌ |
| `image` (1.1) | `binary` + widget `image` | ✅ par une route dédiée (PNG, JPEG, GIF, WebP vérifiés par signature ; jamais SVG) ; la valeur n'est qu'un jeton de version | ❌ |
| `unsupported` | `html`, `binary` hors image, `properties`… | Emplacement « non pris en charge » + diagnostic | ❌ |

```ts
interface FieldDescriptor {
  key: string; label: string; type: FieldType;
  readonly: boolean; required: boolean;        // statiques, pour CE compte
  options?: { value: string; label: string }[];
  digits?: [number, number];
  currencyField?: string;
  relation?: { lookup: boolean };               // reference : sélection possible ?
  help?: string;
}
```

**Version 1.1 (lot 1, 23/10/2026) :** ajouts compatibles — types `references`, `lines`, `image` ; `format: "steps"` (+ `visibleOptions`) pour `statusbar` sur une sélection ; nœud `groupBy` de recherche, `QueryRequest.groupBy` / `group`, `QueryResult.groups`, `ActionDescriptor.defaultGroupBy`. Regroupement à un niveau : groupes et domaines calculés par Odoo (`read_group`) ; la clé de groupe envoyée par le navigateur n'est qu'une référence comparée aux groupes recalculés, jamais interprétée.

**Widgets :** liste fermée de widgets de pure présentation (liens, avatars, étiquettes, `float_time`, `statusbar` sur sélection, `image`). Un attribut `widget` produit un diagnostic `unsupported_widget`. Le rendu de secours (rendu standard du type) n'est appliqué qu'en **lecture seule**, ce qui préserve le sens et les restrictions du champ. `statusbar` et les widgets OWL sont donc affichés en lecture seule, ou non pris en charge.

Un champ **non lisible** pour l'utilisateur (droits, groupes de champ) n'apparaît pas dans `fields`. Sa présence dans le XML est comptée dans un diagnostic `excluded_by_rights`, sans libellé ni valeur.

### 3.3 Nœuds (union discriminée par `kind`)

| `kind` | Propriétés | Source Odoo 18 |
|---|---|---|
| `sheet`, `header` | `children` | `<sheet>`, `<header>` |
| `group` | `label?`, `columns`, `children`, `invisible?` | `<group>` |
| `notebook` | `pages` | `<notebook>` |
| `page` | `label`, `children`, `invisible?` | `<page>` |
| `field` | `field`, `invisible?`, `readonly?`, `required?`, `showLabel` | `<field>` |
| `label` | `text?`, `for?` | `<label>` |
| `separator` | `label?` | `<separator>` |
| `button` | `label`, `commandKey?` (absent = non exécutable), `invisible?` | `<button>` |
| `column` (list) | `field`, `columnInvisible?`, `optional?` | `<list><field>` |
| `filter` (search) | `filterKey`, `label`, `available` | `<filter>` |
| `searchField` | `field`, `label`, `available` | `<search><field>` |
| `unsupported` | `sourceTag`, `reason`, `label?` | tout le reste |

Les balises HTML de mise en page présentes dans les vues (`div`, `h1`, `span`…) sont transparentes : leurs enfants sont importés. Leur texte libre ne l'est pas, ce qui produit un diagnostic. Aucun HTML n'est jamais injecté dans le DOM.

### 3.4 Diagnostics

`code` ∈ `unsupported_node`, `unsupported_widget`, `unsupported_expression`, `unsupported_field_type`, `excluded_by_rights`, `unsupported_action`, `unsupported_domain`, `unsupported_command`, `ignored_text` ; `severity` ∈ `info | warning | blocking` ; `path` ; `message` sans donnée personnelle.

**Règle de parité :** nombre de `<field>` et `<button>` du XML résolu = importés + exclus pour droits + non pris en charge. Elle est testée sur fixtures.

## 4. RecordPayload

```ts
interface RecordPayload {
  schemaVersion: "1.0"; resourceKey: string; id: number;
  values: Record<string, FieldValue>;        // champs lisibles uniquement (y compris invisibles utiles aux conditions)
  access: { canEdit: boolean; readonlyFields: string[] };
  commands: Record<string, { available: boolean }>;
}
```

Encodage : `date` → `"AAAA-MM-JJ"` ; `datetime` → ISO 8601 UTC ; `reference` → `{ id, label } | null` ; `money` → nombre (+ devise dans `values[currencyField]`) ; `selection` → valeur ; `false` Odoo → `null`.

## 5. Navigation, actions et commandes (arbitrage 3)

- **Navigation générique** : le BFF lit les menus et actions `ir.actions.act_window` **accessibles à la session** et les publie sous des clés opaques, sans enregistrer chaque menu à la main. Les autres types d'action apparaissent comme indisponibles (diagnostic).
- **Commandes métier** : seules celles du **registre fermé du backend** sont exécutables (`POST /api/ui/v1/commands/:commandKey`). Un bouton XML n'obtient un `commandKey` que s'il correspond à une entrée du registre ; sinon il est affiché désactivé, avec diagnostic.
- **Aucun** point d'accès n'appelle une méthode ORM, un bouton `type="object"` ou une action serveur arbitraire.
- Ajouter une commande = ajouter une entrée au registre côté BFF. Le moteur de rendu React n'est pas modifié.

## 6. Routes BFF (`/api/ui/v1`)

| Méthode | Route | Garde-fous |
|---|---|---|
| GET | `/navigation` | Menus/actions de la session |
| GET | `/actions/:actionKey` | Clé résolue pour la session (sinon 404) |
| GET | `/views/:viewKey` | ViewSchema validé par Zod |
| POST | `/resources/:resourceKey/query` | Filtres = `filterKey` et `searchField` du schéma, bornés ; jamais de domaine libre |
| GET | `/resources/:resourceKey/records/:id` | RecordPayload, droits sur l'enregistrement |
| PATCH | `/resources/:resourceKey/records/:id` | Champs du schéma uniquement ; revalidation serveur (§ 6.2.5–6) |
| GET | `/resources/:resourceKey/fields/:field/options` | Sélection `reference` si autorisée |
| GET | `/resources/:resourceKey/records/:id/images/:field` | Champ publié comme image ; lu avec les droits de l'utilisateur ; format vérifié ; `nosniff`, `Cache-Control: private` |
| POST | `/commands/:commandKey` | Registre fermé, conditions et droits revérifiés |
| POST | `/cache/refresh` | Invalidation explicite (administrateur technique) |

Toutes les clés sont émises **pour une session** : une clé d'une autre session, ou forgée, donne 404.

## 7. Cache (arbitrage 4)

- **Deux caches séparés** : les définitions de vues (ViewSchema) côté BFF ; les données et capacités d'enregistrement ne sont **jamais** mises en cache partagé.
- Clé ViewSchema : `base · uid · groupes · sociétés autorisées · langue · action · vues · options`. Durée courte (5 min par défaut, `UI_VIEW_CACHE_TTL_SECONDS`).
- Invalidation explicite : `POST /api/ui/v1/cache/refresh`, à appeler après une mise à jour de module ou une modification de vue.

## 8. Package partagé `@leila/ui-schema`

Il contient les types et schémas Zod du ViewSchema, du RecordPayload, des requêtes et des diagnostics, l'AST des conditions et son évaluateur pur (ADR-002), ainsi que la version du schéma. Il ne dépend **ni** d'Odoo, **ni** d'OWL, **ni** d'Astro, **ni** du DOM, **ni** de Fastify : `zod` est sa seule dépendance.

## 9. Arbitrages du 22/10/2026 (conditions de validation)

1. Noms techniques des champs Odoo conservés comme identifiants opaques pour les écrans importés ; aucune logique propre à un modèle dans les composants React génériques ; écrans stratégiques sur contrats métier.
2. Périmètre MVP limité (§ 3.2). Tout widget non pris en charge produit un diagnostic. Le rendu de secours n'est admis que s'il préserve sens et restrictions.
3. Liste fermée de commandes, extensible côté backend ; navigation générique ; aucun appel ORM arbitraire.
4. Caches séparés, cache court et isolé des métadonnées, invalidation explicite, aucune donnée d'enregistrement partagée.
