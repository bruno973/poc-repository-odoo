# poc-odoo-repository — Leila One

Client **React + Vite** (Leila One) devant une API **Fastify** (BFF) qui expose Odoo 18 et le
module `leila_hr` par des ports métier (Repository Pattern). Le front ne sait rien d'Odoo.
Cahier de développement : [DEV.md](DEV.md) (v0.3) · baseline : [docs/baseline-L0.md](docs/baseline-L0.md) ·
décisions : [docs/adr/](docs/adr/).

Deux familles d'écrans :
- **écrans génériques** (menu *Applications*) : générés depuis les vues Odoo 18 résolues, traduites dans
  le langage de présentation Leila (**Leila UI Schema**, package `@leila/ui-schema`) — un champ ajouté
  dans une vue Odoo apparaît sans toucher au front ;
- **écrans métier Leila** : Employés, Pointer, Gestion, Synthèse, sur des contrats métier indépendants d'Odoo.

Compatibilité : [docs/compatibilite-odoo18.md](docs/compatibilite-odoo18.md) · jalon : [docs/jalon-moteur-generique.md](docs/jalon-moteur-generique.md).

Monorepo npm workspaces (`packages/ui-schema`, `api`, `web`) : **`npm install` à la racine**.

## Démarrage

### Avec Docker (recommandé)

Démo sans Odoo (aucun fichier à créer : `ADAPTER=mock` + `AUTH_MODE=fake-jwt` par défaut) :

```bash
docker compose up --build
# → http://localhost:4321 — abigail (manager), bruno (admin RH), camille (employée) ; mot de passe demo
```

L'API n'est **pas** publiée sur l'hôte : seul nginx (conteneur `web`) la joint et sert la SPA sur la
même origine. Avec ta base Odoo : `cp api/.env.example api/.env`, puis `ADAPTER=odoo`,
`AUTH_MODE=odoo-session`, `ODOO_URL`, `ODOO_DB`, et `COOKIE_SECURE=0` tant que tu es en http.

Contre une Odoo 18 locale jetable, avec `leila_hr` monté :

```bash
LEILA_HR_PATH=../leila_hr docker compose --profile odoo-local up --build
# 1. http://localhost:8069 : créer une base, installer leila_hr
# 2. api/.env : ADAPTER=odoo, ODOO_URL=http://odoo:8069, ODOO_DB=..., comptes par rôle
# 3. docker compose restart api
```

Diagnostic réseau vers Odoo (ton Dockerfile racine) : `docker compose --profile debug run --rm odoo-check`.

### Identité (`AUTH_MODE`)

| `AUTH_MODE` | Qui est l'utilisateur ? | Usage |
|---|---|---|
| `odoo-session` (défaut avec Odoo) | **Constaté** : connexion sur `/login` avec ses identifiants Odoo ; session Odoo gardée côté serveur | Référence |
| `fake-jwt` (défaut avec le mock) | Constaté via un JWT signé localement | Démo et tests sans Odoo |
| `shared` | Déclaré par en-têtes `x-viewer-*` (forgeables), comptes Odoo partagés | **Tests de comparaison seulement** : refusé au démarrage sans `ALLOW_SHARED_MODE=1` ; inutilisable depuis le front |

### Sans Docker

```bash
npm install                              # à la racine : dépendances + build du package partagé
cd api && npm run dev                    # API sur http://localhost:3001 (api/.env : COOKIE_SECURE=0)
cd web && npm run dev                    # Leila One sur http://localhost:4321, /api relayé par Vite
```

### Simulateur Odoo 18 (moteur générique sans accès à amg)

```bash
cd api && npm run simulateur             # Odoo simulé sur :8069 (p.admin/admin-pw, p.manager/manager-pw, p.employe/employe-pw)
ADAPTER=odoo AUTH_MODE=odoo-session ODOO_URL=http://127.0.0.1:8069 ODOO_DB=simulateur COOKIE_SECURE=0 npm run dev
curl -X POST http://127.0.0.1:8070/heritage   # simule un héritage de vue (nouveau champ sur la fiche employé)
```

### Inventaire des vues réelles (UI-001)

```bash
cd api   # api/.env : ODOO_URL, ODOO_DB
INVENTAIRE_LOGIN=p.manager INVENTAIRE_PASSWORD=… npm run inventaire   # un passage par profil
# → docs/inventaire/p.manager/ : vues résolues, métadonnées de champs, expressions non comprises
```

## Vérifications

```bash
cd api
npm run typecheck     # TypeScript strict, sources + tests
npm test              # 125 tests : contrat mock, droits simulés, visibilité, HTTP, protocole Odoo
                      # (faux serveur : /jsonrpc ET session), contrat d'identité (Odoo + faux JWT),
                      # sécurité (cookie, TTL, 429, en-têtes forgés, CSRF, CORS, mot de passe introuvable),
                      # frontières, répétition de la matrice de droits sur le mock
ADAPTER=odoo npm test # + champs présents dans Odoo et contrat rejoué contre ta base (deux modes)

cd ../web
npm run typecheck     # TypeScript strict (types partagés avec l'API)
npm run build         # build Vite
npm run e2e           # parcours navigateur (API mock + faux JWT et `npm run dev` lancés ;
                      # la première fois : npx playwright install chromium)
npm run e2e:ui        # jalon du moteur générique (simulateur Odoo + API odoo-session + front)

cd ../packages/ui-schema
npm test              # schéma, sémantique des conditions, replis prudents

# Pas de fuite Odoo dans le domaine ni dans le front : vérifié par test/boundaries.test.ts
# Plus aucune trace d'Astro : rg 'astro|@astrojs|\.astro' web/ docker-compose.yml → vide
```

Contre `amg` (lot 0 fait : profils du § 4.2 créés, résultats attendus constatés) :

```bash
cd api
cp rights-matrix.config.example.json rights-matrix.config.json   # ids réels + attendus (T-03)
# api/.env : ODOO_IDENTITY_*, MATRIX_PASSWORD_*, ODOO_WRITE_ALLOWED_DBS=amg
RIGHTS_MATRIX_CONFIG=rights-matrix.config.json npm test          # → docs/rights-matrix.json
npm run rapport                                                  # → docs/rapport-identite.md
```

Écritures dans les tests contre Odoo (cycle arrivée → départ → correction) :
`ODOO_TEST_EMPLOYEE_ID=<id>` et `ODOO_TEST_WRITES=1`. Toute suite qui écrit s'arrête si
`ODOO_DB` ne figure pas dans `ODOO_WRITE_ALLOWED_DBS` (valeur PoC : `amg`).

## Architecture

```
api/src/
  domain/         Types + Zod + ports + squelette + visibilité (AUCUN terme Odoo)
    tree.ts / tree.schema.ts / EmployeeRepository.ts / employee.skeleton.ts
    attendance.ts / attendance.schema.ts / AttendanceRepository.ts
    summary.ts / summary.schema.ts / SummaryRepository.ts
    visibility.ts   Évaluation VisibleIf + élagage de la fiche + editableIf (côté serveur)
    identity.ts     Principal, port IdentityProvider
    errors.ts       DomainError typées → codes HTTP
  adapters/mock/    Fixtures + pointages/synthèse en mémoire + droits simulés (rights.ts)
  adapters/odoo18/  transport.ts (comptes partagés /jsonrpc | session utilisateur),
                    OdooSessionIdentity, capabilities.ts (has_access, has_group), mapping, repositories
  adapters/fake/    FakeJwtIdentity (2ᵉ fournisseur d'identité : préfigure Keycloak)
  app/              Composition (adapter + AUTH_MODE), sessions, rôles, garde anti-dérive, journal
  routes/           Fastify : ne parlent qu'aux ports ; auth.ts (login / logout / me)
api/test/           Contrats (ports, identité), faux Odoo, sécurité, matrice de droits
api/scripts/        rapport-identite.ts (docs/rapport-identite.md)

packages/ui-schema/  Leila UI Schema : types, Zod, conditions + évaluateur pur (zod seul, aucune dépendance ERP/DOM)

api/src/  (suite)
  domain/ui/        Ports ViewRepository, RecordRepository, CommandDispatcher
  app/ui/           Clés opaques (HMAC par utilisateur), cache des définitions, règle d'édition, restrictions Leila
  adapters/odoo18/ui/  get_views → schéma (OdooViewParser), expressions → AST, registre fermé de commandes
  adapters/mock/ui/ Ressource portable « employés » (moteur sans ERP)
  routes/ui.ts      /api/ui/v1/*

web/                 Leila One : SPA React + Vite (ADR-003)
  vite.config.ts    /api relayé vers l'API en développement
  nginx.conf        Production : fichiers statiques + /api relayé, même origine, CSP
  e2e/smoke.mjs     Parcours navigateur (Playwright)
  src/
    app/            api-client (CSRF, 401 → /login), session (/api/auth/me), routeur, routes protégées
    layout/         AppShell, Navigation (identité constatée, déconnexion), journal des appels
    features/       auth/ (connexion), employees/ (annuaire, fiche, TreeForm transitoire),
                    attendance/ (Pointer, Gestion), summary/ (Synthèse)
    ui/             Moteur générique : ActionManager, AppsPage, renderers (Form, List, Search),
                    FieldRegistry (par type), diagnostics — aucune connaissance d'un champ ou d'un modèle
    lib/format.ts   Formats d'affichage (fuseau de Cayenne)
    types/domain.ts Ré-exporte les types de api/src/domain (imports « type » seulement)
```

### Routes

| Méthode | Route | Port |
|---|---|---|
| GET | `/api/employees`, `/api/employees/:id`, `/api/departments/tree` | EmployeeRepository |
| PATCH | `/api/employees/:id` | EmployeeRepository |
| GET | `/api/attendances` | AttendanceRepository |
| GET | `/api/employees/:id/open-attendance` | AttendanceRepository |
| POST | `/api/employees/:id/check-in`, `/check-out` | AttendanceRepository |
| PATCH | `/api/attendances/:id` | AttendanceRepository |
| POST | `/api/attendances/:id/approve`, `/refuse` | AttendanceRepository |
| GET | `/api/summary/groups`, `/api/summary/lines` | SummaryRepository |
| POST | `/api/auth/login`, `/api/auth/logout` | IdentityProvider (identité réelle) |
| GET | `/api/auth/me` | IdentityProvider |
| GET | `/api/ui/v1/navigation`, `/actions/:k`, `/views/:k`, `/resources/:k/records/:id`, `/resources/:k/fields/:f/options` | ViewRepository / RecordRepository |
| POST | `/api/ui/v1/resources/:k/query`, `/commands/:k`, `/cache/refresh` | RecordRepository / CommandDispatcher / ViewRepository |
| PATCH | `/api/ui/v1/resources/:k/records/:id` | RecordRepository (revalidation serveur) |
| GET | `/api/meta` (`authMode` seul), `/healthz` | — |
| GET | `/api/_trace` | — (`DEBUG_ENDPOINTS=1` uniquement) |

Toutes les routes métier exigent un viewer (sinon 401) : cookie `leila_sid` seul en identité réelle
(en-têtes `x-viewer-*` ignorés) ; en-têtes `x-viewer-id` / `x-viewer-role` en mode `shared` (tests).
En identité réelle, toute requête mutante exige l'en-tête `X-Leila-Csrf: 1` (403 sinon).
Chaque pointage porte `capabilities: { canEdit, canApprove }`, calculées par Odoo pour le viewer.

### Correspondances Odoo (adapters/odoo18)

| Domaine | Odoo |
|---|---|
| Mouvements | `hr.attendance` : `break_entry`, `break_exit`, `boat_arrival`, `boat_departure`, `meal_count` (leila_hr) |
| Approuver / Refuser | `action_approve_overtime` / `action_refuse_overtime` |
| Synthèse | `read_group` sur `hr.attendance.ventilation` |
| Axes pôle, service, employé, période, semaine, jour | `parent_id`, `department_id`, `employee_id`, `closure_id`, `week_label`, `day_of_week` |
| Fiche / pointage modifiable par CE viewer | `has_access("write")` (droits du modèle + règles d'enregistrement) |
| Approuver les heures | `canEdit` ∧ `res.users.has_group(APPROVAL_GROUP)` |
| Rôle Leila (présentation) | `res.users.has_group` selon `ROLE_GROUPS` |
| `AccessError` / `MissingError` / `ValidationError`, `UserError` | 403 / 404 / 422 |
| `SessionExpiredException` | 401 → `/login?retour=…` |
| Sortie non conforme au schéma Zod | 502 (« dérive du moteur ») |

## Sécurité : ce qui a changé, ce qui reste à faire

Fait :
- Visibilité évaluée **côté serveur** : les nœuds invisibles ne quittent jamais l'API.
- Plus de rôle `hr_admin` par défaut : viewer absent ou invalide → 401.
- API non publiée (SEC-001) : nginx est le seul point d'entrée ; pas de CORS ; anti-CSRF par
  en-tête ; mode `shared` verrouillé ; journal des appels réservé au développement.
- `.dockerignore` : `.env` et `node_modules` ne partent plus dans les images.
- Conteneurs exécutés sans root.

- **Identité réelle** (`AUTH_MODE=odoo-session`) : connexion avec les identifiants Odoo, session
  Odoo par utilisateur côté serveur, viewer constaté (uid, employé, groupes). Mot de passe en
  transit seulement ; cookie `leila_sid` httpOnly, SameSite=Lax, Secure, 256 bits ; inactivité
  1 h, durée absolue 8 h ; 5 tentatives / min / IP. Le filtre par département de
  `listEmployees` ne s'applique plus qu'en mode `shared`.
- `editable` = `fields_get` ∧ `has_access("write")` sur la fiche ∧ `editableIf` : plus de champ
  affiché modifiable puis refusé ; `updateEmployee` réévalue la même règle avant `write`.

Reste (hors PoC) :
- Keycloak : `KeycloakIdentity` à la place d'`OdooSessionIdentity` (même contrat, cf.
  `test/identity-contract.ts`) et un module connecteur côté Odoo qui agit au nom de l'utilisateur.
- Sessions en mémoire : perdues au redémarrage de l'API (R-06).
- Pas de journal d'audit des écritures (§ 6.2.10) : prévu avec le registre de commandes (L4).

## Points ouverts

- `has_access` répond pour un lot entier : un refus déclenche un appel par pointage pour savoir
  lesquels. À mesurer sur `amg` (S-5, R-07).
- ADR-001 (Leila UI Schema) et ADR-002 (expressions Odoo) à valider avant le moteur générique.
- Inventaire réel des vues sur `amg` (UI-001) et `docker compose up --build` à faire depuis le Mac.
