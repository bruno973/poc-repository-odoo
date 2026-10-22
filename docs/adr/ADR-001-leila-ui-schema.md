# ADR-001 — Leila UI Schema v1

**Statut :** proposé — **à valider avant d'implémenter le moteur générique** (DEV.md § 11.3, étape 4)
**Date :** 22/10/2026 · **Lots :** L2–L3 · **Répond à :** D-04, D-05, D-09, § 3.4, § 3.6, § 3.7

## 1. Contexte

React doit afficher des écrans issus des vues Odoo 18 **résolues** (`get_views()`) sans jamais voir de XML, de nom de modèle, de domaine ni de session Odoo. Il faut donc un contrat de présentation propre à Leila, versionné, validé par Zod, que produisent indifféremment l'adaptateur Odoo 18, le mock et les écrans natifs.

## 2. Décision : deux documents, jamais mélangés

| Document | Contenu | Cache |
|---|---|---|
| **ViewSchema** (statique) | Structure, ordre, libellés, types de champs, conditions (AST), filtres, commandes proposées, diagnostics | Oui, côté BFF, clé complète (§ 6) |
| **RecordPayload** (dynamique) | Valeurs typées d'**un** enregistrement, droits sur **cet** enregistrement, état des commandes | **Jamais** partagé entre utilisateurs ni enregistrements |

## 3. ViewSchema

```ts
interface ViewSchema {
  schemaVersion: "1.0";             // semver : le front refuse une majeure inconnue
  viewKey: string;                  // opaque, émis par le BFF
  viewType: "list" | "form" | "search";
  title: string;
  resourceKey: string;              // opaque ; seul l'adaptateur sait à quoi il correspond
  resourceKind: "portable" | "compatibility";   // § 3.2 — signalé dans la couverture
  capabilities: { canCreate: boolean; canEdit: boolean; canDelete: boolean };  // présentation uniquement
  fields: Record<FieldKey, FieldDescriptor>;
  root: ContainerNode;              // form : sheet ; list : columns ; search : filters
  diagnostics: Diagnostic[];
}
```

### 3.1 Champs

```ts
type FieldType =
  | "text" | "multiline" | "boolean" | "integer" | "decimal" | "money"
  | "date" | "datetime" | "selection"
  | "reference"        // many2one : { id, label } | null
  | "referenceList"    // one2many / many2many : lecture seule en MVP
  | "unsupported";     // binaire, html, propriétés… → diagnostic

interface FieldDescriptor {
  key: FieldKey;
  label: string;
  type: FieldType;
  readonly: boolean;               // statique (définition du champ pour CE compte)
  required: boolean;
  options?: { value: string; label: string }[];      // selection
  digits?: [number, number];                          // decimal
  currencyField?: FieldKey;                           // money
  relation?: { resourceKey: string; lookup: boolean }; // reference : recherche via le BFF
  help?: string;
}
```

**Clés de champ (`FieldKey`)** — proposition à valider :
- ressources **portables** (`employees`, `attendances`…) : noms Leila (`fullName`, `jobTitle`) ;
- ressources **de compatibilité** : le nom technique du champ Odoo (`job_title`) est réutilisé tel quel, **comme chaîne opaque**. React ne l'interprète jamais. C'est la dépendance assumée de la couche de compatibilité (§ 3.2) ; le renommer ajouterait une table de correspondance sans bénéfice de portabilité.

Un champ absent de `fields_get` pour l'utilisateur (droits de lecture, groupes de champ) **n'apparaît pas** dans `fields` : sa présence dans le XML est comptée dans les diagnostics (`excluded_by_rights`), sans libellé ni valeur.

### 3.2 Nœuds (union discriminée par `kind`)

| `kind` | Propriétés | Source Odoo 18 |
|---|---|---|
| `sheet`, `header`, `footer` | `children` | `<sheet>`, `<header>`, `<footer>` |
| `group` | `label?`, `columns` (1–4), `children` | `<group col>` |
| `notebook` | `pages: PageNode[]` | `<notebook>` |
| `page` | `label`, `children`, `invisible?` | `<page string>` |
| `field` | `field: FieldKey`, `widget?` (indice de rendu sur liste blanche), `labelMode: "inline" \| "above" \| "none"`, `invisible?`, `readonly?`, `required?` | `<field>` |
| `label` | `text` ou `for: FieldKey` | `<label>` |
| `separator` | `label?` | `<separator>` |
| `button` | `commandKey` (opaque, registre fermé § 3.6) **ou** `unsupported: true`, `label`, `style`, `invisible?` | `<button>` |
| `column` (list) | `field`, `width?`, `optional?: "show" \| "hide"`, `columnInvisible?` | `<list><field>` |
| `filter` (search) | `filterKey` (opaque ; le domaine reste au BFF), `label`, `group?` | `<filter>` |
| `searchField` | `field`, `label` | `<search><field>` |
| `unsupported` | `sourceTag`, `reason`, `severity`, `label?` | tout le reste |

`invisible`, `readonly`, `required`, `columnInvisible` : **`Condition`** (ADR-002) ou booléen.

Aucune chaîne XML, aucun attribut HTML libre : un nœud inconnu devient `unsupported` (D-09), il ne disparaît pas.

### 3.3 Diagnostics

```ts
interface Diagnostic {
  code: "unsupported_node" | "unsupported_widget" | "unsupported_expression"
      | "unsupported_field_type" | "excluded_by_rights" | "unsupported_action";
  severity: "info" | "warning" | "blocking";
  path: string;              // ex. "root/notebook[0]/page[2]/field[job_title]"
  sourceTag?: string;
  message: string;           // sans donnée personnelle
}
```

**Règle de parité (§ 5) :** pour chaque vue, nombre de `<field>` / `<button>` du XML résolu = importés + exclus pour droits + non pris en charge. Testé sur fixtures.

## 4. RecordPayload

```ts
interface RecordPayload {
  schemaVersion: "1.0";
  resourceKey: string;
  id: number;
  values: Record<FieldKey, FieldValue>;     // champs lisibles uniquement
  access: {
    canEdit: boolean;                        // droits effectifs sur CET enregistrement (has_access)
    readonlyFields: FieldKey[];              // restrictions serveur en plus des conditions de vue (Q-05…)
  };
  commands: Record<string, { available: boolean }>;
}
```

Encodage des valeurs : `date` → `"AAAA-MM-JJ"` ; `datetime` → ISO 8601 UTC ; `reference` → `{ id, label } | null` ; `referenceList` → `{ ids, count }` ; `money` → `{ amount, currency }` ; `selection` → la valeur (le libellé est dans `options`). `false` Odoo → `null`.

## 5. Routes BFF

Celles du § 3.6, toutes authentifiées, sous `/api/ui/v1/…`. Les clés (`actionKey`, `viewKey`, `resourceKey`, `commandKey`, `filterKey`) sont émises par le BFF et résolues **côté serveur pour la session courante** : une clé forgée ou d'une autre session → 404. Le PATCH n'accepte que des champs présents dans le schéma, modifiables, et revalide droits + conditions + restrictions Leila au moment de l'écriture (§ 6.2.5–6).

## 6. Cache (§ 3.7)

Clé du ViewSchema : `base · uid · ensemble de groupes · langue · sociétés autorisées · action · ids de vues · options · révision des métadonnées`. TTL court (proposé : 5 min) + `POST /api/ui/v1/cache/refresh` (administrateur technique). La révision des métadonnées = max(`write_date`) des `ir.ui.view` concernées, si lisible par l'utilisateur ; sinon TTL seul — **à vérifier sur `amg`**.

## 7. Conséquences

- `employee.skeleton.ts` et `formTree` restent pour les écrans du PoC jusqu'à ce que le `FormRenderer` les remplace (GO-03) ; ils deviennent ensuite une fixture de non-régression.
- Le schéma Zod vit côté API (`api/src/domain/ui/view.schema.ts`). Si le front doit **valider** à l'exécution (et pas seulement typer), il faut un paquet partagé (cf. ADR-003, conséquences).

## 8. Questions à trancher

1. Clés de champ Odoo réutilisées pour les ressources de compatibilité (§ 3.1) : OK ?
2. `widget` : liste blanche initiale proposée — `email`, `phone`, `url`, `badge`, `boolean_toggle`, `float_time`, `many2one_avatar_user` ; les autres → `unsupported_widget` + rendu par défaut du type. OK ?
3. Boutons `type="object"` : uniquement via `commandKey` du registre fermé ; les autres affichés désactivés avec diagnostic. OK ?
