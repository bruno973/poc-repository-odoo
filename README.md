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

### Sans Docker

```bash
cd api && npm install && npm run dev     # http://localhost:3001
cd web && npm install && npm run dev     # http://localhost:4321
```

## Vérifications

```bash
cd api
npm run typecheck     # TypeScript strict, sources + tests
npm test              # 23 tests : contrat mock, visibilité, HTTP, protocole Odoo (faux serveur)
ADAPTER=odoo npm test # + champs présents dans Odoo et contrat rejoué contre ta base

cd ../web
npx astro check       # 0 erreur

# Pas de fuite Odoo dans le domaine ni dans le front
grep -rE "execute_kw|jsonrpc|res\.partner|hr\.employee|hr\.attendance" api/src/domain/ web/src/
# → seul le commentaire d’en-tête de tree.ts, qui cite ces termes
```

Écritures dans les tests contre Odoo (cycle arrivée → départ → correction) :
`ODOO_TEST_EMPLOYEE_ID=<id>` et `ODOO_TEST_WRITES=1`, **sur une base de recette uniquement**.

## Architecture

```
api/src/
  domain/         Types + Zod + ports + squelette + visibilité (AUCUN terme Odoo)
    tree.ts / tree.schema.ts / EmployeeRepository.ts / employee.skeleton.ts
    attendance.ts / attendance.schema.ts / AttendanceRepository.ts
    summary.ts / summary.schema.ts / SummaryRepository.ts
    visibility.ts   Évaluation VisibleIf + élagage de la fiche (côté serveur)
    errors.ts       DomainError typées → codes HTTP
  adapters/mock/    Fixtures + pointages/synthèse générés en mémoire
  adapters/odoo18/  Client API externe (/jsonrpc) + mapping + repositories
  app/              Composition (choix de l'adapter), garde anti-dérive, journal des appels
  routes/           Fastify : ne parlent qu'aux ports
api/test/           Contrat commun à tous les adapters + tests ciblés

web/src/
  pages/            employees/, pointer, gestion, synthese, api/[...path] (proxy)
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
| GET | `/api/meta`, `/api/_trace`, `/healthz` | — |

Toutes les routes métier exigent `x-viewer-id` et `x-viewer-role` (sinon 401).

### Correspondances Odoo (adapters/odoo18)

| Domaine | Odoo |
|---|---|
| Mouvements | `hr.attendance` : `break_entry`, `break_exit`, `boat_arrival`, `boat_departure`, `meal_count` (leila_hr) |
| Approuver / Refuser | `action_approve_overtime` / `action_refuse_overtime` |
| Synthèse | `read_group` sur `hr.attendance.ventilation` |
| Axes pôle, service, employé, période, semaine, jour | `parent_id`, `department_id`, `employee_id`, `closure_id`, `week_label`, `day_of_week` |
| `AccessError` / `MissingError` / `ValidationError`, `UserError` | 403 / 404 / 422 |
| Sortie non conforme au schéma Zod | 502 (« dérive du moteur ») |

## Sécurité : ce qui a changé, ce qui reste à faire

Fait :
- Visibilité évaluée **côté serveur** : les nœuds invisibles ne quittent jamais l'API.
- Plus de rôle `hr_admin` par défaut : viewer absent ou invalide → 401.
- Le proxy du front injecte le viewer côté serveur et ignore les en-têtes du navigateur.
- `.dockerignore` : `.env` et `node_modules` ne partent plus dans les images.
- Conteneurs exécutés sans root.

Reste (hors PoC) :
- **Identité réelle** : les en-têtes `x-viewer-*` et les comptes Odoo partagés par rôle sont
  des béquilles. Cible : jeton Keycloak de l'utilisateur, vérifié côté Odoo par un module
  connecteur, qui agit en son nom (droits et règles d'Odoo appliqués à la vraie personne).
  Le filtre par département dans `listEmployees` disparaîtra alors.
- `editable` vient de `fields_get` (champ en lecture seule ou non), pas des droits d'écriture
  du compte : Odoo reste le dernier rempart (AccessError → 403).
- `/api/_trace` et `/api/meta` sont ouverts : à retirer ou protéger hors PoC.

## Points ouverts

- Le contact d'urgence est déclaré `SELF_OR_MANAGER_PLUS` mais rangé dans le groupe
  « Informations privées » (`SELF_OR_ADMIN`) : les managers ne le voient pas. À trancher.
- Odoo 19 : `hr.contract` devient `hr.version` (impacte leila_hr), et l'API JSON-2 remplace
  `/jsonrpc` (seul `adapters/odoo18/client.ts` change).
