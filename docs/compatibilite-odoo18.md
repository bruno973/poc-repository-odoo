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
| `many2one` | ✅ | ✅ si les domaines du champ et de la vue sont des constantes **ou des valeurs de la fiche** (`[('company_id', 'in', [company_id, False])]`), substituées par le BFF avec les valeurs lisibles par l'utilisateur ; `uid`, `context`, appels → sélection désactivée. La valeur choisie est revérifiée (`search_count` dans le domaine calculé avec les valeurs après modification) |
| `monetary` | ✅ si la devise est lisible | ❌ |
| `many2many` (lot 1) | ✅ étiquettes (`read` de `display_name` sur le modèle lié, sous l'identité de l'utilisateur ; refus → nombre d'éléments) | ❌ |
| `one2many` (lot 1) | ✅ tableau des colonnes simples de la sous-liste `<list>` embarquée (colonnes masquées non publiées ni lues) ; sans sous-liste / kanban → noms ; 40 lignes + total ; en liste : nombre de lignes | ❌ |
| `binary` + widget `image` (lot 1) | ✅ route dédiée ; valeurs lues avec `bin_size` (jamais le contenu) ; PNG/JPEG/GIF/WebP seulement | ❌ |
| `statusbar` sur une sélection (lot 1) | ✅ barre d'étapes (`statusbar_visible` respecté) ; sur un `many2one` : rendu standard + diagnostic | ❌ |
| `binary` (autre), `html`, `properties`, sélection dynamique | « Non disponible dans Leila » | ❌ |
| Widgets de présentation `email`, `phone`, `url`, `many2one_avatar`, `many2one_avatar_user`, `many2one_avatar_employee` | Rendu standard (liens `mailto:` / `tel:` / URL) | Comme le type |
| Tout autre `widget` | Rendu standard du type | **Lecture seule** + diagnostic |

## Regroupements (lot 1)

Filtres de recherche `context="{'group_by': …}"` et `group_by` du contexte d'action : un niveau, sur un champ **stocké** de type `many2one`, `selection`, `char`, `boolean`, `integer`, `date`/`datetime` (granularité, `month` par défaut). Groupes calculés par `read_group` (lazy) avec l'identité de l'utilisateur ; les enregistrements d'un groupe sont lus avec le `__domain` renvoyé par Odoo. Défaut : `search_default_<regroupement>` ou `group_by` de l'action (plusieurs niveaux → le premier + diagnostic). Non pris en charge : champs non stockés (ex. `department_id` lié sur `hr.attendance`), plusieurs niveaux simultanés.

Effet sur l'inventaire (classements régénérés) : manager — types de champ 6 → 1 occurrence, widgets 17 → 8, recherche 35 → 18 ; admin — types de champ 45 → 14, widgets 58 → 35, recherche 67 → 28.

## Conditions (ADR-002)

| Expression | MVP |
|---|---|
| Constantes, champs (dont `id`, l'identifiant de la fiche), `parent.x`, `==` `!=` `<` `<=` `>` `>=` `in` `not in`, `and` `or` `not`, listes / tuples | ✅ |
| `uid`, `context.get(…)`, `today`, `now`, appels, indexation, attributs | ❌ → repli : `readonly` → lecture seule, `invisible` → masqué, `column_invisible` → colonne masquée, `required` → indéterminé (le serveur valide), bouton → désactivé, décoration → neutre |

## Commandes (registre fermé)

| Commande Leila | Bouton Odoo |
|---|---|
| `attendance.approve-hours` | `hr.attendance` · `action_approve_overtime` |
| `attendance.refuse-hours` | `hr.attendance` · `action_refuse_overtime` |

Ajout : `api/src/adapters/odoo18/ui/commands.ts`. Tout autre bouton est affiché désactivé.

## Premier relevé réel : fiche employé sur `amg` (22/10/2026)

65 diagnostics, dont 21 « à traiter ». Corrections apportées :
- `id` était refusé dans les conditions (« not id ») : **bug corrigé** ;
- 9 sélections désactivées par des domaines dépendant de la fiche (`company_id`, `address_id`, `work_contact_id`…) : **prises en charge** ;
- `email`, `phone`, `many2one_avatar_user` : **widgets de présentation** reconnus ;
- `<widget>` décoratifs (bandeau « Archivé », puce de chat, info-bulle) : rétrogradés en « Info » ;
- panneau « Compatibilité » regroupé par type.

Restent, conformes aux arbitrages : boutons hors registre (statistiques, création d'utilisateur…), `one2many` / `many2many` / `binary` / `html` / `properties`, `chatter`.

## Inventaire réel (compte admin, 23 actions, 69 vues) — 22/10/2026

Fichiers : `docs/inventaire/admin/`. Rejoué à chaque `npm test` (`test/ui-inventaire-amg.test.ts`) : aucune erreur d'analyse, parité respectée, schémas conformes, **100 % des conditions comprises**, tous les domaines d'action évaluables.

| Constat | Correction |
|---|---|
| Action « Employés » : domaine `[('company_id', 'in', allowed_company_ids)]` → action **indisponible** | `allowed_company_ids` = société courante, `uid` = utilisateur (serveur) |
| Champs « même société » : `(company_id and [...] or [...]) + ([])` | Évaluateur de domaines restreint côté serveur |
| `context.get('chat_icon')`, `context.get('default_res_model')` | Lus dans le contexte de l'action |
| 19 champs de recherche à `filter_domain` (`self`) | `self` = texte saisi |
| 45 filtres « regrouper par » affichés grisés | Retirés des filtres (diagnostic seul) ; filtres `invisible="1"` masqués |
| Filtres par défaut des actions (`search_default_*`) ignorés | Appliqués à l'ouverture |
| Widgets `float_time` (30), `boolean_toggle` / `boolean` / `boolean_switch` (24), `radio`, `badge`, `text` | Reconnus ; `float_time` en HH:MM |
| Paramètres (`res.config.settings`, 105 éléments non pris en charge) | Action indisponible : écran natif requis |

Fiche employé (`hr.employee`, vue 547) : **0 sélection désactivée** (9 auparavant). Restent : 15 boutons hors registre, `one2many` / `many2many` / image / `html` / `properties`, `chatter`, 5 regroupements.

## Points encore à vérifier sur `amg`

Script : `cd api && INVENTAIRE_LOGIN=… INVENTAIRE_PASSWORD=… npm run inventaire` (un passage par profil) → `docs/inventaire/<compte>/`.

**Classement des manques** : `docs/inventaire/<compte>/CLASSEMENT.md`, produit par l'inventaire et régénérable hors ligne (`cd api && npm run classement`) après chaque évolution du moteur. Les manques (types de champ, widgets, éléments, recherche, boutons) y sont triés par nombre de vues concernées ; « transversal » = plusieurs modèles (à implémenter), « propre à » = un seul modèle (candidat « Ouvrir dans Odoo »). Il liste aussi les boutons candidats au registre de commandes. Pour un nouveau module : l'ajouter à `UI_MENU_ROOTS`, lancer l'inventaire, lire le classement — sans ouvrir les fiches une à une. Seul le compte admin est inventorié : les profils non administrateurs (manager, employé) restent à passer, leurs vues diffèrent (groupes).

Constaté sur `amg` (inventaire admin du 22/10/2026) :
- `ir.ui.menu.load_web_menus` s'appelle par `call_kw` avec `[[], debug]` (ids en premier argument) — corrigé, et reproduit par le simulateur ;
- `get_views` renvoie bien les champs sous `models[modèle].fields` ;
- un compte non administrateur ne peut pas lire `ir.actions.act_window` par l'ORM (`AccessError`, réservé à Administration/Paramètres) : les actions sont chargées par la route du client web `/web/action/load` (lecture sudo d'Odoo), uniquement pour des actions issues des menus publiés à l'utilisateur. Le mode `shared` (jsonrpc, sans route web) garde la lecture ORM et suppose des comptes partagés qui y ont droit ;
- 100 % des conditions (`invisible`, `readonly`, `required`, `column_invisible`) des vues inventoriées sont comprises (test `ui-inventaire-amg.test.ts`).

- les employés de `amg` sont des **comptes portail** (sans « Utilisateur interne ») : ni menus (`ir.ui.menu`), ni actions, ni `hr.employee.public`. Le moteur générique, fondé sur les vues du back-office, ne peut pas les servir. Leila refuse leur connexion avec un message explicite (`PORTAL_REFUSED`) et l'inventaire s'arrête proprement. **Décision ouverte (Q-10)** : comment servir ces employés (voir ci-dessous).

**Cloisonnement portail (23/10/2026)** : la première sonde a révélé une fuite — le droit d'accès « hr.attendance portal access » (lecture, groupe Portail) n'avait **aucune règle d'enregistrement** pour ce groupe : un compte portail lisait les présences de tous les employés (504, dont 497 d'autres personnes) par un simple appel ORM. Corrigé dans `amg` par une règle sur Présence, groupe Portail :

```
[('employee_id.work_contact_id', '=', user.partner_id.id)]
```

Les comptes portail sont reliés à leur fiche employé par le **contact** (`work_contact_id`), pas par `user_id` (vide). Sonde après correction : 32 présences visibles, un seul propriétaire ✅. **À reporter dans le module** (`security/*.xml`) et à vérifier pour tout autre modèle ouvert au portail (ventilation, clôtures…).

### Q-10 — Employés en comptes portail (décidée)

**Décision (validée le 23/10/2026)** : option 4 — écrans employé dédiés dans Leila (contrats métier, pas le moteur générique sans menus), appelés avec la **session portail** de l'employé ; Odoo garantit le cloisonnement par ses règles. Conditions : chaque modèle exposé a une règle Portail vérifiée par `npm run sonde-portail` (cloisonnement ✅) ; l'employé est retrouvé par `work_contact_id = partenaire de l'utilisateur`. Accès actuel du portail : présences (lecture), son utilisateur, son contact ; pas de fiche employé, heures supplémentaires ni congés.

Options, à arbitrer (impact sécurité et licences) :
1. **Comptes internes** pour les employés : le moteur générique s'applique tel quel, droits garantis par Odoo ; coût de licence par utilisateur interne.
2. **Contrats métier Leila dédiés** (pas le moteur générique) servis par un compte technique : le BFF filtre lui-même sur l'employé connecté ; la sécurité repose alors sur Leila, à tester comme telle.
3. **Module Odoo dédié** exposant au portail des points d'accès restreints (contrôleurs vérifiant l'employé lié) : les droits restent dans Odoo, au prix d'un module à maintenir.

Sonde : `cd api && SONDE_LOGIN=… SONDE_PASSWORD=… npm run sonde-portail` → `docs/inventaire/<compte>/SONDE.md` (droits ORM, nombre d'enregistrements visibles, champs lisibles, `get_views` ; aucune donnée lue). Un module `amg` donne des droits au groupe Portail : la sonde dira s'ils passent par l'ORM (cas favorable, option 4 : écrans employé Leila appelés avec la session portail, droits garantis par Odoo).

Sonde du compte portail `agetre@yopmail.com` (23/10/2026) : **`hr.attendance` lisible par l'ORM** (504 visibles, 54 champs, `get_views` ✅), lecture seule ; `res.users` / `res.partner` : son propre enregistrement ; `hr.employee`, `hr.employee.public`, `hr.attendance.overtime`, `hr.leave*`, `ir.ui.menu` refusés ; `hr.payslip` absent (module paie non installé). `has_access` fonctionne en Odoo 18. Les droits du module portail passent donc par l'ORM : l'option 4 de Q-10 est possible pour les présences, **sous réserve du cloisonnement** (section « Cloisonnement » de la sonde : toutes les présences visibles doivent appartenir au même employé).

Reste à vérifier :
1. inventorier les profils non administrateurs (manager, employé) et rejouer `ui-inventaire-amg.test.ts` sur leurs dossiers ;
2. ~~`has_access` sur une liste vide~~ (constaté : fonctionne), signature positionnelle de `name_search`, lecture de `groups_id` pour un compte non administrateur.
