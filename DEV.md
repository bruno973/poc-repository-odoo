# Cahier de développement — Leila One : client React indépendant, compatible Odoo 18

**Version :** 0.3 — DRAFT / cadrage de la refonte frontend  
**Date :** 22/10/2026  
**Owner :** Bruno SOSIN  
**Statut :** Spécification à confier au développeur ; réalisation non commencée dans le cadre de ce document  
**Dépôt :** `poc-odoo-repository`  
**Périmètre :** backend Fastify/TypeScript existant, frontend React + Vite remplaçant intégralement Astro, Odoo **18 Community** + `leila_hr`

> **Instruction au développeur.** Ne pas implémenter un clone monolithique du client web Odoo. Construire **Leila One**, un client React fondé sur un **schéma de présentation indépendant du moteur ERP** (« Leila UI Schema »). Un adaptateur **Odoo 18** importe les vues XML résolues dans ce schéma ; des écrans Leila natifs consomment les contrats métier existants. **Astro doit disparaître complètement du code et de l'exécution.** Conserver le Repository Pattern et l'isolation des règles métier et des droits.

## 0. Décisions structurantes et lecture du cahier

### 0.1 Décisions actées pour cet axe (v0.3)

| ID | Décision | Implication impérative |
|---|---|---|
| D-01 | **Suppression complète d'Astro** | Zéro package `astro` / `@astrojs/*`, fichier `.astro`, middleware SSR Astro, adaptateur Node Astro, route proxy Astro ou commande `astro` dans la cible finale. |
| D-02 | **React + Vite + TypeScript strict** | SPA servie par un serveur statique et un reverse proxy ; développement Vite avec proxy `/api`. |
| D-03 | **Fastify reste le BFF/API** | Conserver les ports, repositories métier, adaptateurs `mock` / `odoo18`, validations Zod, contrats et tests existants ; ne pas reconstruire le backend. |
| D-04 | **Leila UI Schema, pas XML Odoo dans React** | Le moteur React rend un AST/JSON neutre, versionné et validé. XML, identifiants techniques Odoo, `ir.actions.*`, domaines et sessions Odoo restent confinés à l'adaptateur / couche BFF. |
| D-05 | **Les vues XML Odoo 18 restent une source d'écrans** | Lire les architectures **résolues** via `get_views()` / `get_view()` ; ne pas analyser directement les fichiers XML des addons ni reproduire les mécanismes d'héritage. |
| D-06 | **Deux familles d'écrans** | Écrans génériques importés depuis Odoo ; écrans stratégiques natifs Leila (pointage, kiosque, validations avancées, synthèses spécialisées). |
| D-07 | **Identité réelle et règles métier côté serveur** | Le frontend n'est jamais source d'autorisation ; les opérations restent exécutées sous l'identité du véritable utilisateur Odoo. |
| D-08 | **Indépendance progressive, non fictive** | Le moteur React et le schéma restent réutilisables sans Odoo. Les fonctions métier implémentées seulement dans `leila_hr`, les données et les écrans de modules Odoo spécifiques ne deviennent pas automatiquement portables. |
| D-09 | **Compatibilité explicite, pas silencieuse** | Une balise, un widget, une action ou une expression non pris en charge produit un diagnostic visible/testable et une stratégie de repli définie ; aucun champ ou bouton critique supprimé silencieusement. |
| D-10 | **Odoo 18 uniquement** | Pas de compatibilité multi-version, utiliser exclusivement `<list>` pour les nouvelles vues en liste. Aucun chantier de migration d'ERP dans ce lot. |

### 0.2 Deux objectifs distincts : continuité et autonomie

1. **Continuité Odoo** : installer un module Odoo 18 comportant des vues classiques doit pouvoir faire apparaître ses écrans dans Leila **sans créer de page React spécifique**, pour les fonctionnalités couvertes par notre moteur.
2. **Autonomie Leila** : remplacer ultérieurement Odoo par un autre moteur doit laisser réutilisables la SPA React, la navigation abstraite, les composants génériques, les contrats de présentation et les **contrats métier Leila**. Le remplacement de la logique métier et la reprise des données restent des projets à part entière.

**Ne pas promettre « 100 % des écrans Odoo automatiquement ».** Les vues OWL personnalisées, `ir.actions.client`, certains templates Kanban, widgets et processus propres aux modules exigent des composants/adaptateurs dédiés.

### 0.3 Conservation des acquis du cahier v0.2

Le précédent objectif — **prouver les droits Odoo avec une identité réelle par utilisateur** — devient une **condition préalable de sécurité et un chantier de non-régression**, et non plus l'unique finalité du projet. Ses scénarios S-01 à S-12, ses cinq profils de test, ses décisions Q-01/Q-03/Q-05/Q-06 et ses livrables de comparaison sont **conservés** aux § 8 et 11.

**État réel à revalider au démarrage :** le cahier v0.2 rapporte 31 tests verts et des fonctionnalités d'identité déjà développées ; le bundle transmis contient notamment `OdooSessionIdentity.ts`, `SessionTransport`, `rights-matrix.test.ts` et `FakeJwtIdentity.ts`. Cette présence de fichiers **n'atteste pas** de leur réussite actuelle : exécuter les suites de tests et constater leurs résultats avant toute modification.

---

## 1. Objectifs, périmètre, livrables

### 1.1 Résultat attendu

Un utilisateur se connecte à **Leila One** et peut :

- Parcourir les menus et actions **autorisés** par sa session, via une navigation React.
- Ouvrir une **liste** et une **fiche** dont les champs, la structure, les libellés et les états proviennent des **définitions effectives** des vues Odoo 18, y compris les héritages installés.
- Filtrer, trier, paginer, consulter et, lorsque pris en charge **et autorisé**, modifier des enregistrements ; déclencher les actions métier approuvées.
- Utiliser les pages métier de l'ancien PoC (Employés, Pointer, Gestion, Synthèse) **sans Astro** et sans régression des droits.
- Accéder aux écrans natifs Leila par les mêmes mécanismes de navigation et de session.
- Constater clairement lorsqu'un type de vue ou un widget d'un module installé est **non supporté**, avec diagnostic permettant de développer l'adaptateur manquant.

### 1.2 Périmètre du MVP de validation (obligatoire)

- Connexion / déconnexion sous identité utilisateur réelle ; barre de navigation, routes protégées.
- Navigation et actions Odoo **autorisées**, converties en contrats Leila (périmètre menus choisi sur `amg`).
- Un **`ListRenderer`**, un **`FormRenderer`**, un **`SearchRenderer`**, un `FieldRegistry` minimal.
- **Preuve sans squelette statique** : fiche `hr.employee` et liste `hr.attendance` générées depuis leurs vues résolues, avec personnalisation `leila_hr` visible quand elle existe.
- Types de champs MVP : `char`, `text`, `boolean`, `integer`, `float`, `monetary` (si utilisé), `date`, `datetime`, `selection`, `many2one` ; lecture pour `one2many` et `many2many` au minimum avec diagnostic si édition non prise en charge.
- Lecture/écriture en environnement de recette avec contrôles d'accès, limitations d'actions et conversion typée.
- Variante `mock` du service UI pour tester hors Odoo.
- Conteneur de frontend **statique** à la place du serveur Astro ; API uniquement sur réseau interne derrière proxy.

**Jalon technique central :** ajouter/modifier dans **Odoo 18** une vue héritée qui introduit un champ simple sur la fiche employé, actualiser l'écran Leila et constater le changement **sans modifier le code React ni le schéma à la main**. Prouver aussi que le changement est refusé ou masqué selon les droits du compte.

### 1.3 Extensions prévues, hors MVP initial

- Kanban à partir d'un sous-ensemble documenté des templates QWeb, avec journalisation des constructeurs non supportés.
- Regroupements avancés, édition de masse, pivot, graph, calendrier, actions contextuelles, assistants modaux.
- Organigramme et messagerie/chatter.
- Kiosque Leila React dédié, puis **mode hors ligne sécurisé** (chantier séparé : horodatage, identité, cache et synchronisation).
- Schéma matérialisé/versionné avec workflow de synchronisation et arbitrage des modifications Odoo.
- Keycloak/SSO, multi-client, migrations vers d'autres ERP, haute disponibilité des sessions.

### 1.4 Livrables du développeur

1. Nouveau frontend React + Vite compilable et déployable ; Astro totalement retiré.
2. **Contrat `Leila UI Schema` v1**, spécification JSON/TypeScript et validations Zod (avec jeux de fixtures).
3. Ports `ViewRepository` et `RecordRepository` **neutres**, adaptateur de métadonnées Odoo 18, adaptateur mock.
4. `ListRenderer`, `FormRenderer`, `SearchRenderer`, `FieldRegistry`, `ActionManager` et journal des nœuds non supportés.
5. Routes API BFF versionnées, documentation des entrées/sorties, gestion homogène des erreurs.
6. Tests unitaires, de contrats, d'intégration Odoo 18 et E2E des parcours principaux, dont la matrice d'identité.
7. `README.md`, `DEV.md`/ADR, guide de déploiement, tableau de compatibilité XML, journal de couverture, captures de recette.
8. **Rapport de sortie** : ce qui fonctionne, ce qui ne fonctionne pas, risques persistants, commandes testées et recommandations du lot suivant.

---

## 2. Existant : conserver / faire évoluer / supprimer

### 2.1 Backend à préserver

| Fichier / sous-système existant | Traitement |
|---|---|
| `api/src/domain/EmployeeRepository.ts` | Conserver le contrat métier. |
| `api/src/domain/AttendanceRepository.ts` | Conserver le contrat métier, les protections d'écriture. |
| `api/src/domain/SummaryRepository.ts` | Conserver. |
| `api/src/domain/identity.ts` | Conserver `Principal` / `IdentityProvider` ; séparer clairement contexte serveur et DTO exposé. |
| `api/src/app/repositories.ts` | Étendre la composition des dépendances ; ne pas remplacer les repositories métier par des CRUD génériques. |
| `api/src/adapters/odoo18/` | Conserver clients, transports, identité, mapping métier ; **ajouter** l'adaptateur de métadonnées UI. |
| `api/src/adapters/mock/`, `api/src/adapters/fake/` | Conserver et enrichir pour les contrats UI et d'identité. |
| `api/src/domain/tree.ts`, `tree.schema.ts` | Source d'inspiration pour les nœuds de présentation ; migration progressive vers `ui/` versionné. |
| `api/src/domain/employee.skeleton.ts` | **Décommissionner comme source des écrans génériques** ; à conserver temporairement comme fixture de non-régression si utile. |
| `api/test/*` | Ne pas supprimer les suites de droits, d'identité, de sécurité ou de contrat. |
| `api/src/routes/*` | Conserver les endpoints métier ; ajouter des endpoints de navigation, vues, ressources et commandes contrôlées. |

Le `formTree` existant contient `group`, `text`, `select`, `many2one` et des règles `visibleIf` / `editableIf`. Il démontre une première approche de rendu mais **repose sur un squelette `employee.skeleton.ts` codé dans le backend**, pas sur les vues XML installées. Ce n'est pas le moteur cible.

### 2.2 Frontend à remplacer intégralement

| Élément Astro existant | Remplacement |
|---|---|
| `web/astro.config.mjs` | `web/vite.config.ts` |
| `web/src/middleware.ts` | Protection des routes via session/API dans React |
| `web/src/pages/index.astro` | `HomePage.tsx` ou route d'action générique |
| `web/src/pages/login.astro`, `logout.ts` | `LoginPage.tsx`, session React, API Fastify |
| `web/src/pages/employees/*.astro` | Navigation action + vues génériques ; composants métier Leila conservables |
| `web/src/pages/pointer.astro` | `AttendanceKioskPage.tsx` (écran natif Leila) |
| `web/src/pages/gestion.astro`, `synthese.astro` | `ListRenderer` si vue standard ; composant natif si agrégat métier spécialisé |
| `web/src/components/TreeForm.astro`, `nodes/*.astro` | `FormRenderer.tsx`, `FieldRegistry`, composants de champs React |
| `web/src/components/Shell.astro`, `AppNav.astro` | `AppShell.tsx`, `Navigation.tsx` |
| `web/src/pages/api/[...path].ts` | Proxy `/api` au niveau Vite (dev) et reverse proxy HTTP (prod) |
| `web/src/lib/api.ts`, `format.ts`, `types/domain.ts` | Réutiliser ce qui est indépendant du framework ; refactoriser vers client typé / contrat partagé |
| `web/astro.config.mjs`, dépendances et lock Astro, SSR Docker | **Supprimer** et remplacer par dépendances React + Vite / Docker statique |

**Condition de clôture :** `rg 'astro|@astrojs|\.astro' web/ docker-compose.yml` ne doit plus trouver de dépendances effectives (hors documentation historique explicitement exclue de la recherche).

### 2.3 Problèmes constatés dans le bundle (à corriger, non à recopier)

- Le `docker-compose.yml` publie actuellement l'API par `3001:3001`, alors que le mode `shared` interprète des en-têtes d'identité. **Ne jamais exposer ce mode à des utilisateurs finaux.**
- Le serveur Fastify configure actuellement CORS avec `origin: true`. Passer à une politique d'origine restreinte, ou ne pas utiliser CORS lorsque le proxy fournit une même origine.
- Le proxy Astro est limité à une liste de chemins ; ne pas répliquer cette liste incomplète dans le nouveau frontend.
- Le squelette actuel et les composants de formulaires ne couvrent pas le rendu récursif complet, toutes les relations et toutes les conversions de types.
- Le droit d'écriture d'un champ doit être **recontrôlé côté serveur lors du `write`** et ne peut pas dépendre uniquement d'un attribut de présentation. Vérifier aussi l'élagage de visibilité et les règles métier personnalisées.
- Le `SessionStore` est en mémoire : maintien accepté pour PoC, non pour déploiement multi-instance ; aucun cookie Odoo ni mot de passe exposé au navigateur.

---

## 3. Architecture cible et frontières de dépendance

```text
Navigateur
  └─ Leila One (React + Vite, SPA)
       ├─ AppShell / Navigation / Session
       ├─ Leila UI Schema v1 (AST/JSON NEUTRE)
       ├─ ViewEngine : list / form / search / ...
       ├─ FieldRegistry / ActionManager
       └─ écrans natifs Leila : pointage, validations, synthèses
                 │ HTTPS même origine : /api/*
                 ▼
       Reverse proxy (statique React + /api vers Fastify)
                 │
                 ▼
       Fastify BFF / application Leila
         ├─ IdentityProvider / SessionStore / Principal
         ├─ UI contracts : ViewRepository / RecordRepository / CommandDispatcher
         ├─ Domain contracts : EmployeeRepository / AttendanceRepository / SummaryRepository
         ├─ Odoo18UiAdapter (XML résolu → Leila UI Schema)
         ├─ Odoo18Transport / OdooSessionIdentity / Odoo18 domain adapters
         └─ Mock UI + Mock domain adapters
                 │ réseau privé, session utilisateur
                 ▼
       Odoo 18 Community + leila_hr
         ├─ ir.ui.view, ir.actions.*, ir.ui.menu
         ├─ hr.employee, hr.attendance et modèles Leila
         ├─ ORM, ACL, ir.rule, groupes de champs
         └─ PostgreSQL
```

### 3.1 Règles d'isolation obligatoires

- **`web/src/` :** aucune importation d'un SDK Odoo, aucune balise ou chaîne de traitement XML Odoo, aucune logique de permission métier, aucun `execute_kw`, `call_kw` ou RPC vers Odoo.
- **`api/src/domain/` :** contrats fonctionnels génériques uniquement, sans nom de modèle Odoo et sans conditions fondées sur des groupes Odoo.
- **`api/src/app/` :** orchestration des ports, autorisations d'usage Leila si elles sont réellement propres à Leila, schémas de sorties, métriques.
- **`api/src/adapters/odoo18/` :** seule couche connaissant la signification de `hr.employee`, `ir.actions.act_window`, `get_views()`, `context`, `domain` et la session Odoo.
- **Aucune migration de données ni logique de calcul RH dans React.** Les opérations de pointage, ventilation, correction, approbation et clôture restent exécutées via les ports métier et Odoo 18.
- **Réutilisation ≠ autonomie fonctionnelle automatique.** Les écrans de modules tiers auto-importés appartiennent à la **couche de compatibilité Odoo** ; leur présentation est réutilisable mais leurs modèles/commandes pourront nécessiter de nouveaux adaptateurs ERP.

### 3.2 Deux catégories de ressources

- **Ressources métier portables** (`employees`, `attendances`, `attendanceSummaries`, etc.) : noms et contrats stables appartenant à Leila ; données fournies par les repositories métier. Les écrans stratégiques passent par elles.
- **Ressources de compatibilité** : enregistrées dynamiquement lors de l'import de vues Odoo. React reçoit une clé opaque et une description de capacités ; seul l'adaptateur connaît le modèle, les champs et l'action Odoo associés. Ces ressources peuvent être dépendantes d'Odoo dans leur sémantique : le document de couverture doit le signaler.

Les capacités d'un écran (`canCreate`, `canEdit`, `canDelete`, actions disponibles) servent à **configurer l'interface**, jamais à remplacer les contrôles d'accès réels sur chaque opération.

### 3.3 Navigation et découverte

La navigation doit être construite côté BFF à partir des menus/actions **accessibles à la session courante**. Ne pas supposer qu'un menu donne un droit sur les données ; les opérations sur les modèles restent contrôlées séparément.

Cycle attendu :

1. La session réelle détermine l'utilisateur, les sociétés autorisées, la langue et le contexte.
2. L'adaptateur Odoo récupère menus/actions autorisés et identifie le type d'action (au minimum `ir.actions.act_window`).
3. Pour l'action sélectionnée, l'adaptateur charge les types et identifiants de vues associés, puis récupère les vues résolues avec `get_views()` ou `get_view()` et les métadonnées de champs.
4. Le normaliseur produit le `Leila UI Schema` correspondant, applique le contrôle de compatibilité et expose les diagnostics.
5. React sélectionne le renderer et charge les enregistrements via une **ressource autorisée**.
6. Si l'action est `ir.actions.client`, un widget OWL personnalisé ou une vue non couverte, utiliser un **registre d'extensions React** ; sinon afficher un état explicitement non supporté. Ne pas exécuter de JS Owl dans React.

**Ne jamais assimiler XML récupéré à du HTML fiable** : pas d'injection DOM directe, assainir contenus et liens, interpréter les éléments sur liste blanche.

### 3.4 Schéma de présentation Leila v1

Le schéma est un contrat **propre à Leila**, versionné, validé par Zod et documenté. Il doit permettre des écrans natifs et des écrans importés sans distinction pour les renderers.

Exemple **illustratif du contrat Leila** (ce JSON n'est **pas** la réponse native de `get_views()` d'Odoo) :

```json
{
  "schemaVersion": "1.0",
  "viewKey": "employees-list",
  "viewType": "list",
  "title": "Employés",
  "resourceKey": "employees",
  "capabilities": { "canCreate": false, "canEdit": false, "canDelete": false },
  "nodes": [
    { "kind": "field", "key": "fullName", "label": "Nom", "fieldType": "text" },
    { "kind": "field", "key": "department", "label": "Département", "fieldType": "reference" },
    { "kind": "field", "key": "jobPosition", "label": "Fonction", "fieldType": "text" }
  ]
}
```

Le résultat réel devra inclure les propriétés nécessaires à `form` / `search` : composants conteneurs (`page`, `group`, `notebook`, `header`), nœuds `field`, `button`, `label`, valeurs typées, dépendances, états, actions autorisées, options d'affichage, ressources relationnelles et contexte de requête. Définir un **schéma strict par discriminants** pour les variantes de nœud.

**Deux niveaux à distinguer :**

- **Description statique** : structure/ordre/libellés/types de champs, filtres, fonctions supportées ; cache possible sous une clé de contexte contrôlée.
- **État dynamique** : valeurs d'enregistrement, `readonly` / `required` / `invisible` dépendant des valeurs, droits par enregistrement, domaine de sélection, actions disponibles ; ne jamais réutiliser cet état entre utilisateurs ou enregistrements.

### 3.5 Expressions XML Odoo 18 : traitement sécurisé

Odoo 18 autorise des **expressions Python** dans `readonly`, `required`, `invisible`, `domain`, `context`, `column_invisible` et les décorations. Elles peuvent dépendre des champs du record, de `parent`, de `context`, de `uid`, de `today`, de `now` et du contexte utilisateur.

- **Interdiction :** `eval()` JavaScript, transformation naïve de syntaxe Python en JS, exécution de code XML libre, ou confiance dans des capacités envoyées par le navigateur.
- **Choix de conception à documenter :** parseur d'un **sous-ensemble sûr** des expressions Odoo, normalisé en AST neutre ; l'évaluation de la présentation peut être faite côté front si AST sûr **sans donnée secrète** ou côté BFF si elle dépend des droits/contexte serveur.
- **Support MVP minimal testé :** constantes booléennes, comparaisons simples, `and`, `or`, `not`, vérifications de valeur de champs ; enrichissement progressif suivant les expressions réellement rencontrées dans `hr`/`hr_attendance`/`leila_hr`.
- **Non pris en charge :** diagnostic explicite et comportement prudent ; jamais transformer une condition de sécurité inconnue en autorisation d'écriture.
- **Actions et domaines :** sérialiser des opérations structurées et validées ; **ne jamais** fournir un endpoint d'exécution Python ou ORM arbitraire pilotable depuis le navigateur.

### 3.6 Contrats de données, commandes et actions

`ViewRepository` sert les écrans **sans** exécuter les transactions métier. `RecordRepository` fournit lecture, filtres, regroupements et écritures **explicitement autorisées**. `CommandDispatcher` invoque une commande métier déclarée et validée. Les actions React sont des identifiants de contrat, jamais des noms de méthodes Odoo adressables librement.

Routes proposées (noms internes sujets à ADR ; la séparation des responsabilités, elle, est obligatoire) :

| Méthode | Route BFF | Contrat / garde-fou |
|---|---|---|
| GET | `/api/ui/navigation` | Menus et actions visibles de l'utilisateur connecté. |
| GET | `/api/ui/actions/:actionKey` | Action normalisée, ses vues disponibles et sa cible ; `actionKey` opaque. |
| GET | `/api/ui/views/:viewKey` | Leila UI Schema validé + liste des parties non supportées. |
| POST | `/api/ui/resources/:resourceKey/query` | Recherche paginée, tri et filtres dans un format borné et typé. |
| GET | `/api/ui/resources/:resourceKey/records/:id` | Record autorisé + état des capacités nécessaire à la vue. |
| PATCH | `/api/ui/resources/:resourceKey/records/:id` | **Pas ouvert par défaut** ; contrôle explicite des ressources/champs modifiables et des droits à l'écriture. |
| POST | `/api/ui/commands/:commandKey` | Répertoire fermé de commandes approuvées ; pas d'appel générique d'une méthode ORM arbitraire. |

Chaque route de métadonnées est elle aussi soumise à authentification/autorisation. Toute donnée sensible est absente des réponses si l'utilisateur ne possède pas le droit de la lire.

### 3.7 Cache, multi-société et invalidation

- Cache de vues **côté BFF**, jamais partagé sans clé d'isolation correcte : base Odoo, identité/ensemble de droits, langue, sociétés autorisées, options de vue, action, références de vues, contexte pertinent et révision de métadonnées.
- Les résultats de `get_views()` peuvent dépendre notamment des droits, de la langue, du type de vue et de certaines options ; ne pas déduire une clé simpliste `model + type`.
- À installation/upgrade de module, modification d'une vue, changement de droits, société ou langue : invalider les métadonnées concernées. Pour le PoC, un TTL court et un **rafraîchissement explicite** suffisent si leur comportement est testé et documenté.
- Ne pas mélanger cache des **descriptions** de vues et cache des **données** métier ; ces dernières sont toujours filtrées par session, société et droits applicables.

---

## 4. Convention de code et arborescence cible

```text
api/
  src/
    domain/
      EmployeeRepository.ts                # existant
      AttendanceRepository.ts              # existant
      SummaryRepository.ts                 # existant
      ui/
        view.ts                            # types/contrats UI neutres
        view.schema.ts                     # Zod / version schema
        ViewRepository.ts
        RecordRepository.ts
        CommandDispatcher.ts
    app/
      repositories.ts                      # composition existante, étendue
      ui/
        normalize.ts                       # orchestration neutre
        capabilities.ts                    # contrat, sans groupe Odoo
    adapters/
      odoo18/
        ...                                 # transports/repos métier conservés
        ui/
          OdooViewRepository.ts
          OdooRecordRepository.ts
          OdooActionMapper.ts
          OdooViewParser.ts
          OdooExpressionParser.ts
          OdooFieldMapper.ts
      mock/
        ...                                 # existant, ajouter UI
    routes/
      ...                                   # métier et auth conservés
      ui.ts                                # nouvelles routes contrôlées
  test/
    ...                                     # existant non supprimé
    ui-schema.test.ts
    ui-odoo18-parser.test.ts
    ui-contract.test.ts
    ui-security.test.ts

web/
  index.html
  package.json
  vite.config.ts
  src/
    main.tsx
    app/
      App.tsx
      routes.tsx
      session.ts
      api-client.ts
    ui/
      ViewEngine.tsx
      ActionManager.tsx
      FieldRegistry.tsx
      renderers/
        ListRenderer.tsx
        FormRenderer.tsx
        SearchRenderer.tsx
      fields/
        TextField.tsx
        BooleanField.tsx
        DateField.tsx
        SelectionField.tsx
        RelationField.tsx
      diagnostics/
        UnsupportedNode.tsx
    layout/
      AppShell.tsx
      Navigation.tsx
    features/
      attendance/
      employees/
      summary/
    styles/
  Dockerfile                                  # build Vite + service statique
```

Les répertoires sont **proposés**, pas imposés octet par octet. Le développeur peut les ajuster dans une ADR, à condition que les frontières d'architecture restent mesurables et que les imports inter-couches soient vérifiés en CI.

### Politique de dépendances frontend

- React et ReactDOM, Vite, TypeScript strict.
- Router et bibliothèque de cache de données possibles, mais choix justifié (taille, maintenance, compatibilité).
- Pas de dépendance à OWL, à l'environnement navigateur d'Odoo ou à ses registries frontend.
- Pas de logique métier ou permissions développées dans les widgets : uniquement représentation et capture d'intentions utilisateur.
- CSS/style global maîtrisé dans Leila ; ne pas recopier les SCSS du frontend Odoo comme dépendance de fonctionnement.

---

## 5. Compatibilité Odoo 18 : périmètre réel du moteur

| Objet / syntaxe Odoo 18 | MVP | Après MVP / restriction |
|---|---|---|
| `ir.actions.act_window` et navigation par menus | **Oui** | Résolution de la bonne vue et contexte de l'action. |
| `<list>` : champs, ordre, pagination, tri, filtres basiques | **Oui** | Édition en ligne, regroupements complexes, totaux, décorations avancées à phaser. |
| `<form>` : `sheet`, `group`, `notebook`, `page`, `field`, `label` | **Oui** | Boutons métier et relations à contrôler séparément. |
| `<search>` : recherche, filtres simples, domaines validés | **Oui** | Expressions complexes et combinaisons avancées à phaser. |
| Types simples, date/datetime, selection, many2one | **Oui** | Validation de type, fuseau horaire, devise et requêtes de relation. |
| `one2many` / `many2many` | Lecture ou état « non supporté » explicite | Sous-vues, commandes relationnelles, éditions imbriquées. |
| `invisible`, `readonly`, `required` | **Sous-ensemble sûr** | Étendre sur fixtures réelles sans changer le principe de sécurité. |
| `groups`, ACL, règles d'enregistrement | **Oui, côté serveur** | Aucune conversion en contrôle d'accès uniquement visuel. |
| `<kanban>` / QWeb | Non bloquant pour MVP | Renderer + traduction d'un sous-ensemble ; pas de prétention de compatibilité universelle. |
| `<calendar>`, `<graph>`, `<pivot>` | Hors MVP | Renderers spécialisés et requêtes/agrégations adaptées. |
| `ir.actions.client`, widget OWL, `js_class` | Hors moteur générique | `CustomViewRegistry` React / écran Leila natif. |
| Chatter, activités, pièces jointes et messagerie | Hors MVP | Projet fonctionnel spécifique, permissions, flux, notifications. |
| Assistant / dialogue / actions de bouton `type="object"` | Cas approuvés seulement | Commandes déclarées, jamais passerelle générique vers n'importe quelle méthode. |

**Règle d'acceptation :** aucune erreur de parsing ou nœud non supporté n'est absorbé silencieusement. Les tests doivent pouvoir comparer le nombre de champs/boutons du XML résolu avec ceux importés, exclus pour droits ou explicitement non pris en charge.

### 5.1 Comment tester une vue réellement importée

Utiliser les vues **effectives** chargées pour l'utilisateur concerné, et non seulement des fichiers `views/*.xml` du module : elles prennent en compte les héritages appliqués en base. Le rapprochement doit être réalisé sur l'action, le type de vue et la langue, puis validé visuellement sur Odoo 18 et Leila.

Cas obligatoire : vue de fiche employé + une modification via héritage `leila_hr` ; cas liste : présences / Gestion ; cas formulaire personnalisé : clôtures (`hr.attendance.closure`). Les identifiants de vues existants présents dans le bundle doivent être vérifiés sur `amg` avant d'être retenus comme fixtures de référence.

### 5.2 Contrats de secours / extensions

- **Mode diagnostic** (`dev`/admin technique) : affiche source de l'action, type de nœud inconnu, vue concernée, identifiant de corrélation, version du schéma ; sans exposer de données personnelles hors autorisation.
- **Mode utilisateur** : message clair « Cette fonctionnalité n'est pas encore disponible dans Leila », possibilité de retourner à la navigation ; aucun lien de contournement vers une session Odoo plus privilégiée.
- Les écrans stratégiques Leila peuvent surcharger la représentation d'une action précise **sans altérer** ses droits ou ses commandes métier.

---

## 6. Identité, droits et sécurité — exigences conservées et renforcées

### 6.1 Modes d'authentification

- **`odoo-session`** : mode de référence pour toute navigation utilisateur réelle. Connexion via l'identité Odoo de l'utilisateur ; session Odoo conservée **sur le serveur** ; cookie opaque `leila_sid` dans le navigateur.
- **`shared`** : réservé aux comparaisons de tests en environnement isolé, jamais accessible depuis l'interface publique. Les en-têtes `x-viewer-*` ne sont jamais une preuve d'identité.
- **`FakeJwtIdentity`** : tests du contrat d'identité ; **ne signifie pas** que Keycloak est implémenté.
- **Keycloak** : hors périmètre de ce développement. Son futur connecteur devra garantir une **identité effectivement appliquée à Odoo** sans élévation de privilèges ; un JWT validé côté BFF ne vaut pas, à lui seul, une session Odoo correctement établie.

### 6.2 Invariants de sécurité

1. API Fastify non publiée directement sur Internet en production/recette accessible à d'autres utilisateurs : exposition uniquement par le reverse proxy contrôlé ; isoler les ports Docker.
2. Session utilisateur réelle exigée pour les métadonnées, les données et les écritures ; les requêtes `shared` ne passent pas par le proxy public.
3. Mot de passe Odoo jamais enregistré ni retourné. Cookies `HttpOnly`, `Secure` hors local et `SameSite=Lax` ; protection CSRF adaptée aux opérations mutantes par cookie ; CORS restrictif et contrôle d'origine.
4. **Jamais de `sudo` Odoo** dans les routes de consultation/écriture utilisateur ; aucune ACL, règle d'enregistrement ou restriction de champ ne doit être remplacée par un filtre frontend.
5. `fields_get` et les métadonnées de formulaire ne suffisent **pas** à établir un droit d'écriture effectif. Appliquer les ACL/règles d'enregistrement et revalider les champs/actions à chaque demande d'écriture ; laisser les contraintes métier Odoo contrôler la transaction.
6. En plus des droits Odoo, le serveur applique les restrictions métier Leila convenues (notamment pas d'auto-modification de la fiche par l'employé) de façon identique à l'affichage et à l'écriture.
7. Pas de proxy ORM générique accessible au navigateur (`model`, `method`, `args`, `kwargs` libres). Registre de ressources et de commandes autorisées avec validation Zod, taille maximale et contrôle de périmètre.
8. Validation / sanitation des libellés, liens, HTML et données XML ; protections contre les XSS, les appels externes involontaires et l'exposition de données inter-sociétés.
9. Diagnostics `_trace`, `/api/meta` et endpoints de debug à restreindre à l'environnement de développement ou aux administrateurs techniques authentifiés.
10. Journaux d'audit pour modification, approbation, refus et clôture ; tracer auteur réel, commande, référence métier et résultat sans secrets ni données sensibles inutiles.

### 6.3 Règles métier préservées du cahier précédent

- `editable` : doit tenir compte de `fields_get`, des droits effectifs sur le record, de l'état de la vue et des restrictions Leila ; l'écriture réévalue **les mêmes règles** au moment de la commande.
- Les capacités `canEdit` et `canApprove` sur présences sont **calculées sur le serveur** et recoupées avec la règle métier appropriée. Une simple appartenance à un groupe ne garantit pas qu'une approbation donnée est valide.
- Les `AccessError` et erreurs de validation métier doivent être distinguées dans les résultats de test. **Le fait d'afficher « modifiable » n'est pas une promesse qu'une contrainte métier arbitraire ne refusera jamais l'enregistrement.**
- Préserver la configuration `ODOO_WRITE_ALLOWED_DBS` : toute suite qui écrit s'arrête si la base courante n'y figure pas.

### 6.4 Contrats d'identité à maintenir

- `POST /api/auth/login` : 204, cookie `leila_sid` ; 401 générique en cas d'échec ; limitation des tentatives.
- `GET /api/auth/me` : identité de présentation `{ userId, employeeId, role, displayName, company }` sans `backendHandle` ni secret.
- `POST /api/auth/logout` : destruction des sessions Leila et Odoo ; suppression du cookie ; requête suivante 401.
- Expiration : 401, nettoyage de session, redirection React vers `/login?retour=…` (avec validation de la destination de retour).
- Un ancien en-tête `x-viewer-role: hr_admin` forgé par un utilisateur ne change jamais son identité réelle.

Les profils et scénarios exacts de validation historique figurent au § 8.

---

## 7. Découpage des travaux et estimation

**Estimation indicative pour 1 développeur expérimenté TypeScript/React + Odoo 18, hors création d'un client web Odoo complet.** Revoir après le lot 0, une fois confirmée la maturité de l'identité réelle et le volume des expressions/vues du périmètre.

| Lot | Travail attendu | Charge indicative | Validation de sortie |
|---|---|---:|---|
| **L0 — Baseline / risques** | Relever versions et suites de tests existantes ; établir le catalogue réel de vues/actions/champs du périmètre ; sauvegarde de `amg` ; sécuriser le mode `shared` et l'exposition API. | **3–5 j** | Baseline documentée, API non directement exposée, tests initiaux consignés. |
| **L1 — Sortie totale d'Astro** | Initialiser React + Vite, migrer navigation/auth/pages métier sans changer les contrats existants, remplacer proxy SSR par proxy HTTP/Vite, mettre à jour Docker/compose. | **5–8 j** | Tous parcours PoC existants utilisables sans aucun processus/package Astro. |
| **L2 — Métadonnées & Leila UI Schema** | Définir schéma v1 et Zod, ports UI, mock UI, récupérer menus/actions/vues résolues Odoo 18, normaliser champs et structures, diagnostics. | **7–12 j** | Fixtures et contrat pour une vue `list` et une vue `form` vérifiés sur Odoo. |
| **L3 — Renderers génériques lecture** | `FormRenderer`, `ListRenderer`, `SearchRenderer`, types de champs MVP, filtres, navigation, expressions sûres simples, chargement de données. | **12–20 j** | Fiche employé + liste présences générées **sans squelette statique**, vues héritées reflétées. |
| **L4 — Écriture et actions sécurisées** | Conversions typées, édition autorisée, vérifications serveur, actions/commandes approuvées, erreurs métier, tests de droits/CSRF/XSS. | **6–10 j** | Modification autorisée réussie ; refus empêchés côté API ; matrice de droits inchangée. |
| **L5 — Écrans Leila et compatibilité étendue** | Stabiliser Pointer/Gestion/Synthèse, registre de vues natives, Kanban restreint si jugé nécessaire, gestion des widgets inconnus et couverture. | **6–10 j** | Parcours fonctionnels conservés et écarts documentés ; les vues non supportées sont explicites. |
| **L6 — Stabilisation et transfert** | E2E, perf, contrôle des caches/identités multi-sociétés, déploiement, documentation, vidéo démo, rapport et ADR. | **5–8 j** | Critères § 9 remplis et procédure de déploiement reproductible. |

**Total estimé : 44–73 jours développeur (~9–15 semaines pleines)** pour le périmètre décrit, sous réserve que l'identité réelle existante soit suffisamment fonctionnelle. Un premier démonstrateur **lecture seule** sur 2 vues peut être extrait après L0–L3 ; ne pas confondre ce démonstrateur avec le périmètre complet. Si les travaux du PoC identité v0.2 ne sont pas terminés, ajouter leur reste à faire sur la base d'une nouvelle estimation ; les **12,5–15 j** de l'ancien cahier ne couvraient **pas** ce nouveau moteur UI.

### 7.1 Ordre de dépendance

- **Ne pas entamer les écritures génériques** tant que L0 (exposition API, identité) et L2 (contrats) ne sont pas validés.
- L1 peut avancer en parallèle de la conception de L2, mais L3 doit consommer **le schéma versionné**, jamais un DTO XML Odoo temporaire.
- Les écrans natifs métier demeurent opérationnels durant la migration ; préférer un basculement progressif local/recette plutôt qu'un « big bang » risqué.
- Tout lot est livré avec tests, capture de démo, décisions d'architecture et liste des limitations restantes.

### 7.2 Tâches de développement assignables (tickets suggérés)

| Ticket | Contenu | Lot |
|---|---|---|
| UI-001 | Inventaire des vues/actions Odoo et matrice de compatibilité initiale | L0 |
| SEC-001 | Isoler Fastify, désactiver identité forgée hors tests, restreindre CORS | L0 |
| UI-010 | Créer l'application React/Vite et routes protégées | L1 |
| UI-011 | Remplacer proxy Astro, Dockerfile et docker-compose | L1 |
| UI-012 | Migrer les parcours métier existants à contrats inchangés | L1 |
| UI-020 | Publier `Leila UI Schema v1` + Zod + fixtures | L2 |
| UI-021 | Créer ports UI + mock et endpoints Fastify sécurisés | L2 |
| UI-022 | Créer `OdooViewRepository` (`get_views`, actions, menus) | L2 |
| UI-023 | Parser/normaliser XML et métadonnées, gestion des inconnus | L2 |
| UI-030 | `FormRenderer` + champs simples et groupes/onglets | L3 |
| UI-031 | `ListRenderer` + pagination/tri | L3 |
| UI-032 | `SearchRenderer` + filtres contrôlés | L3 |
| UI-033 | Expressions Odoo → AST sûr ; cache isolé | L3 |
| UI-034 | Test « champ ajouté par héritage XML sans changement React » | L3 |
| UI-040 | Éditions typées et permissions serveur en double vérification | L4 |
| UI-041 | Registre de commandes métier et actions autorisées | L4 |
| UI-042 | Sécurité écritures, multi-société, tests négatifs | L4 |
| UI-050 | Registre d'écrans natifs Leila + migration Gestion/Pointer/Synthèse | L5 |
| UI-051 | Matrice support XML et rapport d'incompatibilités | L5 |
| QA-060 | E2E, test Odoo 18 `amg`, performances, recette et transfert | L6 |

---

## 8. Non-régression identité / droits (héritée du cahier v0.2)

### 8.1 Profils de test sur la base `amg`

| Profil | Droits/groupes à constater sur `amg` | Rattachement `leila_hr` | Objectif |
|---|---|---|---|
| `p.admin` | Employés : Administrateur ; Présences : Administrateur | — | Référence « tout voir ». |
| `p.manager` | Employés : Officier ; Présences : Officier | `attendance_manager_id` de 3 employés | Périmètre d'équipe. |
| `p.validateur` | Présences : utilisateur | Dans `attendance_validator_ids` de 2 employés hors équipe du manager | Validation métier. |
| `p.employe` | Aucun droit RH global ; présences propres | Employé de l'équipe manager | Cas « soi-même ». |
| `p.autre_societe` | Droits analogues au manager, société B | — | Cloisonnement inter-sociétés. |

**À vérifier (Q-02) :** XML IDs des groupes utilisés sur la base réelle. La table de rôle Leila est une représentation d'interface, pas un moteur d'autorisation.

### 8.2 Scénarios existants à rejouer **avant et après** migration

| ID | Profil | Action / résultat attendu |
|---|---|---|
| S-01 | `p.manager` | Gestion : uniquement les présences de son équipe selon règles `leila_hr`. |
| S-02 | `p.manager` | Synthèse : totaux de son périmètre uniquement. |
| S-03 | `p.employe` | Approbation de ses propres heures interdite ; bouton absent. |
| S-04 | `p.validateur` | Corriger un pointage autorisé vs non autorisé selon rattachement. |
| S-05 | `p.manager` | Modifier l'intitulé de poste d'un membre de l'équipe selon les droits réels. |
| S-06 | `p.employe` | Aucun champ de sa fiche modifiable (décision Q-05). |
| S-07 | `p.employe` | Données privées d'un collègue non exposées. |
| S-07b | `p.manager` | Contact d'urgence d'un membre de l'équipe non exposé (Q-03). |
| S-08 | `p.manager` | Numéro de sécurité sociale : lecture limitée aux groupes de champs habilités. |
| S-09 | `p.autre_societe` | Employés d'autres sociétés non exposés. |
| S-10 | `p.manager` | Pointage pour un employé hors équipe refusé. |
| S-11 | `p.validateur` | Période clôturée non modifiable. |
| S-12 | tous | En-tête `x-viewer-role: hr_admin` forgé, ignoré en identité réelle. |

**Ne pas supprimer** `api/test/rights-matrix.test.ts`, `identity.test.ts`, `security.test.ts`, `odoo-protocol.test.ts`, `contract.ts`, `odoo-live.test.ts`. Ces tests doivent survivre au changement de technologie et être complétés par des tests API de métadonnées et de compatibilité XML.

### 8.3 Indicateurs du PoC identité (héritage, objectif distinct de la livraison React)

| ID | Cible historique | Décision de maintien |
|---|---|---|
| S-I1 | 100 % des scénarios de droits sous identité réelle | **Bloquant pour la recette sécurisée**. |
| S-I2 | ≥ 60 % d'écarts observés entre shared et identité réelle | **Mesure comparative** pour décider du fournisseur d'identité ; pas une condition logique de rendu UI. |
| S-I3 | 0 règle de droit Odoo recodée dans le frontend ou les services génériques | **Bloquant** (les restrictions métier spécifiques Leila restent explicites et testées). |
| S-I4 | `FakeJwtIdentity` et `OdooSessionIdentity` satisfont le même port | **À conserver**. |
| S-I5 | Surcoût droits < 150 ms par fiche | **À mesurer**, objectif de performance hérité. |
| S-I6 | 0 mot de passe dans logs, cookies, réponses, stockages | **Bloquant**. |

**Écritures sur `amg` :** conserver sauvegarde préalable et garde `ODOO_WRITE_ALLOWED_DBS` (PoC : `amg`). Les tests doivent être idempotents ou nettoyer leurs créations ; jamais d'exécution involontaire sur une base cliente.

---

## 9. Plan de tests et critères de recette

### 9.1 Tests à automatiser

| Suite | Assertions obligatoires |
|---|---|
| `ui-schema.test.ts` | Version du schéma, parsing Zod, rejet des nœuds invalides, ordre des nœuds, régression de sérialisation. |
| `ui-odoo18-parser.test.ts` | XML résolu `list` / `form` / `search`, `group` / `notebook` / `page`, widgets connus/inconnus, attributs conditionnels, héritages. |
| `ui-contract.test.ts` | Même forme de réponse côté mock et côté Odoo 18 ; aucune fuite de détails de transport. |
| `ui-security.test.ts` | Interdiction d'accès aux vues/champs/records d'autrui ; absence de `sudo`, CSRF, XSS, méthodes non enregistrées, filtrage société. |
| `ui-dynamic.test.ts` | Modifier une vue héritée sur `amg` → écran React mis à jour après invalidation sans rebuild React. |
| E2E React | Connexion, navigation, liste, recherche, fiche, édition permise/refusée, session expirée, déconnexion, diagnostics inconnus. |
| Tests historiques de domaine/identité | Matrice S-01…S-12, ports mock/odoo18, non-régression des commandes métier. |
| Build / lint / typecheck | `npm ci`, `npm run build`, `npm run typecheck` et `npm test` sur `api/` et `web/` selon scripts documentés ; aucune commande Astro. |

### 9.2 Scénarios de recette démontrables (Go/No-go frontend)

| ID | Scénario | Condition « Go » |
|---|---|---|
| GO-01 | **Astro supprimé** | Build et conteneurs fonctionnent sans Astro ; recherches de dépendances et fichiers Astro vides pour le code actif. |
| GO-02 | **Schéma réellement neutre** | Aucun nom de modèle/commande Odoo dans `web/src` et les contrats métier ; Odoo est mentionné uniquement dans adaptateur, fixtures tests et documentation de compatibilité. |
| GO-03 | **Formulaire XML natif + héritage** | `hr.employee` apparaît depuis `get_views()`, et un champ ajouté par vue héritée s'affiche sans modification React. |
| GO-04 | **Liste XML native** | `hr.attendance` s'affiche via `<list>` résolue, avec pagination et filtre de recherche de base. |
| GO-05 | **Respect des droits de lecture** | Utilisateur sans droit : champ privé/record refusé par le backend ; ni métadonnées exploitables ni valeur sensible divulguées. |
| GO-06 | **Respect des droits d'écriture** | Écriture permise réussit ; demande interdite fabriquée à la main renvoie un refus ; aucune élévation par en-têtes. |
| GO-07 | **Gestion des incompatibilités** | Widget OWL / syntaxe non supportée → état de compatibilité traçable ; aucune disparition silencieuse. |
| GO-08 | **Parité métier de l'ancien PoC** | Employés, Pointer, Gestion, Synthèse et commandes existantes passent les scénarios fonctionnels retenus. |
| GO-09 | **Isolation de session** | Tests à deux utilisateurs/sociétés : aucun résultat de cache, de vue ou de données ne se mélange. |
| GO-10 | **Déploiement reproductible** | `docker compose up --build` démarre frontend et API ; API interne non accessible directement depuis l'extérieur ; guide de test rédigé. |

**Interdictions de validation :** ne pas accepter une capture visuelle seule, un champ modifié manuellement dans React pour simuler la découverte XML, ou un test de sécurité exécuté uniquement en compte administrateur.

### 9.3 Performance / exigences non fonctionnelles

- Maintenir l'objectif historique **P95 < 600 ms par opération métier** via le tailnet comme cible **indicative** ; distinguer temps réseau, métadonnées, chargement données et temps de rendu navigateur.
- Mesurer séparément le premier chargement d'une vue (cold cache), les suivants (warm cache), la latence des droits et le comportement lors d'invalidation.
- Tableaux paginés côté serveur, limite sur la taille des pages, pas de chargement complet de milliers de lignes par défaut.
- TypeScript strict, Zod pour les limites du BFF, CI avec tests de compatibilité et audit des dépendances.
- Accessibilité minimale des formulaires (labels, clavier, retours erreur), affichage utilisable ordinateur/tablette pour le périmètre testé.

---

## 10. Risques techniques et décisions d'arbitrage

| Risque | Impact | Stratégie retenue |
|---|---|---|
| **Dépendance cachée à Odoo** malgré schéma neutre | Très élevé | Isoler les ressources de compatibilité ; contrats métier portables ; audit statique des imports ; démontrer un écran mock sans Odoo. |
| **Écrans nouvellement installés incomplètement supportés** | Élevé | Couverture explicite, diagnostics, registry React natif et priorisation par usage. |
| **Sémantique des expressions Python** | Élevé | AST limité validé, fixtures Odoo 18 ; refus prudent si non supporté ; pas de JS eval. |
| **Sécurité d'un CRUD générique** | Très élevé | Liste de ressources/champs/commandes autorisées, permissions revérifiées par requête, aucun RPC ORM arbitraire. |
| **Confusion métadonnées/droits** | Très élevé | Protéger vues, données et commandes séparément ; aucun `sudo` en contexte utilisateur ; tests négatifs. |
| **Cache inter-société/inter-utilisateur** | Très élevé | Clés contextuelles et tests d'isolation à deux sessions ; invalidations documentées. |
| **Rupture des écrans métier lors de suppression d'Astro** | Moyen/élevé | Migration des pages à contrats identiques d'abord, E2E avant généralisation XML. |
| **Modification des modules Odoo / vues héritées** | Élevé | Import des architectures résolues, jeux de fixtures versionnés, comparaison après upgrade de module. |
| **Règles RH spécifiques non portables** | Structurel | Les ports métier restent stables, mais plan de réimplémentation à établir avant toute sortie effective d'Odoo. |
| **Temps de développement d'un clone universel d'Odoo** | Très élevé | Arrêt net au périmètre MVP, support incrémental documenté ; aucune promesse de parité universelle. |
| **Accès Odoo via Tailscale en Docker** | Moyen | Valider le routage du conteneur et le profil local ; garder le mode mock pour la CI. |
| **Données de test personnelles / RGPD** | Élevé | Limiter l'accès à `amg`, minimiser données dans logs/fixtures, anonymiser les captures diffusées. |

---

## 11. Décisions héritées, questions ouvertes, suite

### 11.1 Décisions historiques à conserver

| ID | Décision v0.2 | Conséquence |
|---|---|---|
| Q-01 | `amg` est une base de test, pas une base de production. | Écritures possibles uniquement si la liste blanche `ODOO_WRITE_ALLOWED_DBS` l'autorise ; sauvegarde avant les scénarios. |
| Q-03 | Contact et téléphone d'urgence non visibles pour les managers. | Appliquer l'exigence aux lectures **et** aux commandes ; conserver scénario S-07b. |
| Q-05 | L'employé n'édite pas sa propre fiche via Leila. | Ne pas introduire une édition générique qui contourne cette décision. |
| Q-06 | Mesurer le différentiel partagé / identité réelle avec une cible historique de 60 %. | Indicateur d'identité, séparé des critères de livraison UI. |

### 11.2 Questions ouvertes à instruire **sans bloquer le premier lot**

| ID | Question | Responsable / échéance |
|---|---|---|
| Q-02 | Quels XML IDs de groupes correspondent réellement aux rôles manager/admin RH chez les clients ? | Owner fonctionnel ; à confirmer pendant L0. |
| Q-04 | Le mode `shared` doit-il être conservé uniquement pour comparaisons, ou certains traitements techniques de fond ? | Owner ; avant sortie recette publique. |
| Q-07 | Quel ensemble précis d'actions et de menus Odoo 18 constitue la recette MVP ? | Owner + dev ; figer pendant L0. |
| Q-08 | Quelles expressions `invisible`/`readonly`/`domain` sont indispensables dans les vues `hr`/`hr_attendance`/`leila_hr` déployées ? | Dev ; catalogue en L0–L2. |
| Q-09 | Pour les vues non supportées : écran React natif prioritaire ou état indisponible ? | Décision par fonctionnalité, matrice de compatibilité L2. |
| Q-10 | Le futur schéma Leila sera-t-il matérialisé avec éditions locales, ou calculé à la demande à partir d'Odoo ? | MVP : dynamique ; matérialisation hors MVP avec ADR. |
| Q-11 | Quelle bibliothèque UI React et quelle convention de design Leila ? | Dev propose une ADR en L1. |

### 11.3 Premières actions demandées au développeur

1. **Ouvrir le dépôt** et exécuter les scripts `api`/`web`, dresser la baseline des tests, consigner les divergences éventuelles avec le bundle reçu.
2. **Contrôler l'identité et l'exposition API** : mode de production, absence d'accès direct à `3001`, politique CORS, anti-CSRF, cookies.
3. **Inspecter sur `amg` deux architectures réellement résolues** : une `list` de présence et une `form` d'employé, ainsi que les actions et menus qui les ouvrent.
4. **Rédiger l'ADR-001** présentant le `Leila UI Schema` (types, limites, exemples) et l'ADR-002 sur le traitement des expressions Python ; obtenir validation technique **avant** d'implémenter un moteur de rendu générique.
5. **Exécuter L1** : supprimer Astro de l'application et fournir le nouveau frontend React + Vite avec les fonctions existantes.
6. **Démarrer L2/L3** : afficher les deux vues issues de l'XML Odoo 18 sans `employee.skeleton.ts` ni définition manuelle des champs.
7. **Démontrer GO-03 et GO-06** avec deux utilisateurs de droits différents ; livrer le bilan de compatibilité et les tests.

---

## 12. Références techniques officielles — Odoo **18.0** exclusivement

- [Odoo 18 — View Records (`get_views`, `get_view`, héritage)](https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view_records.html)
- [Odoo 18 — View Architectures (`list`, `form`, `search`, expressions, widgets)](https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view_architectures.html)
- [Odoo 18 — Actions (`ir.actions.act_window`, `ir.actions.client`)](https://www.odoo.com/documentation/18.0/developer/reference/backend/actions.html)
- [Odoo 18 — ORM (`fields_get`, `search_read`, `read_group`, ACL et effets de `sudo`)](https://www.odoo.com/documentation/18.0/developer/reference/backend/orm.html)
- [Odoo 18 — Security in Odoo (ACL, record rules, field access)](https://www.odoo.com/documentation/18.0/developer/reference/backend/security.html)
- [Odoo 18 — Web Controllers (routes HTTP, sessions)](https://www.odoo.com/documentation/18.0/developer/reference/backend/http.html)
- [Odoo 18 — Framework Overview (contexte et actions côté client Odoo)](https://www.odoo.com/documentation/18.0/developer/reference/frontend/framework_overview.html)

**Principe de vérification :** lorsqu'un comportement Odoo 18 ne figure pas explicitement dans la documentation, le développeur le valide sur **la branche 18.0 officielle** et sur la base de recette `amg`, puis capture un test de contrat. Éviter de transformer un détail interne du client web Odoo en dépendance durable de Leila.

---

## Historique

| Version | Date | Évolution |
|---|---|---|
| 0.2 | 12/10/2026 | PoC identité réelle utilisateur, matrice de droits, jointure Keycloak. |
| **0.3** | **22/10/2026** | **Nouvelle orientation : suppression complète d'Astro, React + Vite, Leila UI Schema neutre, adaptateur Odoo 18 pour vues XML résolues, stratégie d'évolutivité et préservation des contrats métier et tests d'identité.** |
