# poc-odoo-repository

PoC — Repository typé (ports + adapters) pour exposer Odoo 18 et le module `leila_hr`
via une API REST découplée, et des écrans Leila qui n'en savent rien.

Écrans : **Employés** (listing + fiche pilotée par squelette), **Pointer**, **Gestion**, **Synthèse**.

## Démarrage

### Avec Docker (recommandé)

```bash
cp api/.env.example api/.env     # ADAPTER=mock par défaut : démarre sans Odoo
cp web/.env.example web/.env     # VIEWER_ROLE / VIEWER_ID du PoC
docker compose up --build
# → http://localhost:4321   (API sur http://localhost:3001)
```

Contre une Odoo 18 locale jetable, avec `leila_hr` monté :

```bash
LEILA_HR_PATH=../leila_hr docker compose --profile odoo-local up --build
# 1. http://localhost:8069 : créer une base, installer leila_hr
# 2. api/.env : ADAPTER=odoo, ODOO_URL=http://odoo:8069, ODOO_DB=..., comptes par rôle
# 3. docker compose restart api
```

Diagnostic réseau vers Odoo (ton Dockerfile racine) : `docker compose --profile debug run --rm odoo-check`.

### Identité réelle (`AUTH_MODE`, cahier de dev v0.2)

| `AUTH_MODE` | Qui est le viewer ? | Comptes Odoo |
|---|---|---|
| `shared` (défaut) | Déclaré par le front (`VIEWER_ROLE`, en-têtes `x-viewer-*`) | 3 comptes partagés par rôle |
| `odoo-session` | **Constaté** : l'utilisateur se connecte sur `/login` avec ses identifiants Odoo | Session Odoo de l'utilisateur, aucun compte partagé |
| `fake-jwt` | Constaté, via un JWT signé localement (démo sur `ADAPTER=mock`) | — (`abigail` manager, `bruno` admin RH, `camille` employée ; mot de passe `demo`) |

Dans `api/.env` : `AUTH_MODE=odoo-session`, `COOKIE_SECURE=0` en local http. Le front lit le mode
dans `/api/meta` : rien à configurer côté `web/`. Derrière le front, `TRUST_PROXY=1` fait compter
les tentatives de connexion par IP du navigateur (sinon toutes viennent du serveur Astro) — à
n'activer que si l'API n'est joignable que par le front.

### Sans Docker

```bash
cd api && npm install && npm run dev     # http://localhost:3001
cd web && npm install && npm run dev     # http://localhost:4321
```

## Vérifications

```bash
cd api
npm run typecheck     # TypeScript strict, sources + tests
npm test              # 72 tests : contrat mock, droits simulés, visibilité, HTTP, protocole Odoo
                      # (faux serveur : /jsonrpc ET session), contrat d'identité (Odoo + faux JWT),
                      # sécurité (cookie, TTL, 429, en-têtes forgés, mot de passe introuvable),
                      # frontières, répétition de la matrice de droits sur le mock
ADAPTER=odoo npm test # + champs présents dans Odoo et contrat rejoué contre ta base (deux modes)

cd ../web
npx astro check       # 0 erreur

# Pas de fuite Odoo dans le domaine ni dans le front : vérifié par test/boundaries.test.ts
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

web/src/
  middleware.ts     Mode d'identité + utilisateur courant ; sans session → /login
  pages/            employees/, pointer, gestion, synthese, login, logout, api/[...path] (proxy)
  components/       TreeForm, nœuds, AppNav (navigation + journal), Shell
  lib/              api (appels SSR), viewer (lu côté serveur), format
  types/domain.ts   Ré-exporte les types de api/src/domain (imports « type » seulement)
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
| GET | `/api/meta`, `/api/_trace`, `/healthz` | — |

Toutes les routes métier exigent un viewer (sinon 401) : en-têtes `x-viewer-id` et
`x-viewer-role` en mode `shared`, cookie `leila_sid` seul en identité réelle (en-têtes ignorés).
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
- Le proxy du front injecte le viewer côté serveur et ignore les en-têtes du navigateur.
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
- `/api/meta` est ouvert ; `/api/_trace` exige une session en identité réelle : à retirer hors PoC.

## Points ouverts

- `has_access` répond pour un lot entier : un refus déclenche un appel par pointage pour savoir
  lesquels. À mesurer sur `amg` (S-5, R-07).
- Odoo 19 : `hr.contract` devient `hr.version` (impacte leila_hr), et l'API JSON-2 remplace
  `/jsonrpc` (seul `adapters/odoo18/client.ts` change).
