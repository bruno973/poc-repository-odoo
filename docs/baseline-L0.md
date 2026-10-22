# Baseline L0 — état du dépôt au démarrage de la refonte Leila One

**Date :** 22/10/2026 · **Branche :** `claude/leila-one-react` · **Cahier :** DEV.md v0.3

## 1. Point de départ

| Constat | Détail |
|---|---|
| `main` | `first commit` + DEV.md v0.3. Le travail « identité réelle » du cahier v0.2 n'y était **pas** : il vivait sur une branche non fusionnée (`claude/quirky-dirac-azsmym`, commit `200d07f`). |
| Reprise | Cette branche a été fusionnée dans `claude/leila-one-react` (commit de fusion `e651c05`), DEV.md v0.3 conservé. |
| Cahier v0.3, § 0.3 | Annonce « 31 tests verts » : chiffre du cahier v0.2 **avant** le lot identité. Mesuré ci-dessous : 72. |

## 2. Versions

| Outil | Version |
|---|---|
| Node.js / npm | 22.22.0 / 10.9.4 |
| API | Fastify 4.28, Zod 3.23, TypeScript 5.5 |
| Front avant | Astro 4.15 (+ `@astrojs/node` 8.2, SSR) |
| Front après | React 18.3.1, Vite 6.4.4, TypeScript 5.6 (cf. ADR-003) |

## 3. Tests — avant toute modification (commit `e651c05`)

| Commande | Résultat |
|---|---|
| `api: npm run typecheck` | ✅ 0 erreur |
| `api: npm test` | ✅ **72 / 72** (contrat mock, droits simulés, visibilité, HTTP, protocole Odoo sur faux serveur, contrat d'identité Odoo + faux JWT, sécurité, frontières, répétition de la matrice S-01…S-12 sur le mock) |
| `web: npx astro check` | ✅ 0 erreur |
| `web: npm run build` (Astro) | ✅ |
| Suites contre `amg` (`odoo-live`, contrat d'identité live, matrice live) | ⏸ **non exécutées** : l'environnement de développement n'a pas accès au tailnet |

## 4. Tests — après SEC-001 et L1 (ce lot)

| Commande | Résultat |
|---|---|
| `api: npm run typecheck` / `npm test` | ✅ **75 / 75** (+ CSRF, CORS, diagnostics masqués) |
| `web: npm run typecheck` / `npm run build` | ✅ |
| `web: npm run e2e` (mock + faux JWT, Chromium) | ✅ **15 / 15** vérifications |
| `rg 'astro\|@astrojs\|\.astro' web/ docker-compose.yml` | ✅ aucun résultat (condition de clôture D-01) |
| `npm audit` (web) | ✅ 0 vulnérabilité |
| `docker compose up --build` | ⏸ **non exécuté** : pas de démon Docker dans cet environnement — à faire sur le Mac |

## 5. Écarts constatés et corrections (SEC-001, § 2.3 du cahier)

| Problème constaté | Correction |
|---|---|
| API publiée `3001:3001` alors que `shared` lit des en-têtes forgeables | API en `expose` seulement ; le front (nginx) est le seul point d'entrée. `TRUST_PROXY=1` posé par compose (nginx écrase `X-Forwarded-For`). |
| `AUTH_MODE` par défaut = `shared` | Défaut = identité réelle (`odoo-session` avec Odoo, `fake-jwt` avec le mock). `shared` refusé au démarrage sans `ALLOW_SHARED_MODE=1`. |
| CORS `origin: true` | Aucun CORS par défaut (même origine) ; `CORS_ORIGINS` pour une liste explicite. |
| Pas de protection CSRF au-delà de SameSite=Lax | En-tête `X-Leila-Csrf: 1` exigé sur toute requête mutante en identité réelle (403 sinon), connexion comprise. |
| `/api/_trace` et le libellé de l'adapter publics | Exposés seulement avec `DEBUG_ENDPOINTS=1`. `/api/meta` ne publie plus que `authMode`. |
| Proxy Astro à liste blanche incomplète | Supprimé : proxy `/api` complet (Vite en dev, nginx en prod) ; l'autorisation reste dans l'API. |

## 6. Reste à faire pour clore L0

- **UI-001** — inventaire réel des menus, actions et vues du périmètre sur `amg` (formulaire `hr.employee`, liste `hr.attendance`, formulaire `hr.attendance.closure`) et des expressions `invisible` / `readonly` / `required` effectivement utilisées (Q-08). **Bloqué ici** (pas d'accès au tailnet) : script d'inventaire à écrire puis lancer depuis le Mac.
- Sauvegarde de `amg`, 5 profils de test (§ 8.1), Q-02, Q-07.
- `docker compose up --build` sur le Mac.
