# Compatibilité Odoo 18 → Leila UI Schema (v1.0)

État du moteur générique au 22/10/2026. Toute ligne « non » produit un **diagnostic** visible (panneau « Compatibilité » de chaque écran) ; rien ne disparaît en silence (D-09).

## Actions et navigation

| Élément | Pris en charge | Comportement sinon |
|---|---|---|
| Menus `ir.ui.menu` de la session (`load_web_menus`) | ✅ limités à `UI_MENU_ROOTS` (défaut : Employés, Présences) | — |
| `ir.actions.act_window` | ✅ si domaine et contexte **littéraux** | Action indisponible + diagnostic `unsupported_action` |
| `ir.actions.client`, serveur, URL | ❌ | Menu affiché « non disponible » |

## Vues

| Vue / balise | MVP | Remarque |
|---|---|---|
| `<form>` : `header`, `sheet`, `group`, `notebook`, `page`, `field`, `label`, `separator`, `button` | ✅ | |
| Balises HTML de mise en page (`div`, `h1`…`h6`, `span`, `p`…) | transparentes | Texte libre non importé (`ignored_text`) |
| `<list>` : colonnes, `optional`, `column_invisible`, `invisible` de cellule, décorations de ligne | ✅ | Boutons de liste et décorations de cellule : diagnostic |
| `<search>` : `field`, `filter` à domaine littéral, `separator` (groupes OU / ET) | ✅ | `filter_domain`, `date`, `group_by`, `searchpanel` : désactivés + diagnostic |
| `<kanban>`, `<calendar>`, `<pivot>`, `<graph>`, `<chatter>`, `<widget>`, `js_class` OWL | ❌ | Nœud « non pris en charge » visible |
| Sous-vues de relation (`<field><list>…</list></field>`) | ❌ | Ignorées + diagnostic |

## Champs

| Type Odoo | Lecture | Écriture |
|---|---|---|
| `char`, `text`, `integer`, `float`, `boolean`, `selection` (statique), `date`, `datetime` | ✅ | ✅ (revalidée par le BFF) |
| `many2one` | ✅ | ✅ si les domaines du champ et de la vue sont absents ou littéraux ; la valeur est revérifiée (`search_count` dans le domaine, sous l'identité de l'utilisateur) |
| `monetary` | ✅ si la devise est lisible | ❌ |
| `one2many`, `many2many`, `binary`, `image`, `html`, `properties`, sélection dynamique | « Non disponible dans Leila » (nombre d'éléments pour les relations) | ❌ |
| Attribut `widget` (quel qu'il soit) | Rendu standard du type | **Lecture seule** + diagnostic |

## Conditions (ADR-002)

| Expression | MVP |
|---|---|
| Constantes, champs, `parent.x`, `==` `!=` `<` `<=` `>` `>=` `in` `not in`, `and` `or` `not`, listes / tuples | ✅ |
| `uid`, `context.get(…)`, `today`, `now`, appels, indexation, attributs | ❌ → repli : `readonly` → lecture seule, `invisible` → masqué, `column_invisible` → colonne masquée, `required` → indéterminé (le serveur valide), bouton → désactivé, décoration → neutre |

## Commandes (registre fermé)

| Commande Leila | Bouton Odoo |
|---|---|
| `attendance.approve-hours` | `hr.attendance` · `action_approve_overtime` |
| `attendance.refuse-hours` | `hr.attendance` · `action_refuse_overtime` |

Ajout : `api/src/adapters/odoo18/ui/commands.ts`. Tout autre bouton est affiché désactivé.

## À établir sur `amg` (UI-001, Q-08)

Les tests reposent sur des **reconstructions** des vues standard (`api/test/fixtures/odoo18`). À faire depuis un poste du tailnet :
1. extraire les architectures réellement résolues de `hr.employee` (fiche, liste, recherche), `hr.attendance` et `hr.attendance.closure` pour chacun des 5 profils ;
2. les déposer comme fixtures et mesurer le taux de nœuds / expressions pris en charge ;
3. constaté sur `amg` (22/10/2026) : `ir.ui.menu.load_web_menus` s'appelle par `call_kw` avec `[[], debug]` (ids en premier argument) — corrigé, et reproduit par le simulateur ;
4. vérifier les autres points d'Odoo 18 supposés ici : `has_access` sur une liste vide (droit du modèle), signature de `name_search`, forme `models[modèle].fields` de `get_views`, lecture de `groups_id`.
