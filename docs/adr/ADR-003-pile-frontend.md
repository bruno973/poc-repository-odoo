# ADR-003 — Pile du frontend Leila One

**Statut :** ✅ **validé** (Bruno SOSIN, 22/10/2026) · **Lot :** L1 · **Répond à :** D-01, D-02, Q-11 (en partie)

Validation : React + Vite + TypeScript ; nginx pour servir les fichiers compilés et assurer le reverse proxy en production ; Astro supprimé intégralement (ni serveur SSR, ni proxy) ; Fastify reste le BFF et le point d'entrée des contrats métier et des métadonnées. Package partagé API/front validé (cf. ADR-001 § 8).

## Contexte

Astro (SSR) est retiré (D-01). Le front devient une SPA React + Vite (D-02), servie statiquement derrière le même reverse proxy que l'API.

## Décision

| Sujet | Choix | Pourquoi |
|---|---|---|
| UI | React 18.3.1 + ReactDOM | Imposé (D-02). React 19 non retenu : rien à y gagner pour le MVP. |
| Build / dev | Vite 6.4.4 + `@vitejs/plugin-react` 4.7.0 | Imposé (D-02). 6.4.4 : première version 6.x sans avis de sécurité (`npm audit` à 0). |
| Routage | **Routeur maison** (`web/src/app/router.tsx`, API History, ~90 lignes) | React Router 6.x porte des avis de sécurité non corrigés en v6 (redirections ouvertes), la v7 change d'API. Le futur `ActionManager` pilotera la navigation à partir de clés d'action : un routeur générique n'apporterait presque rien. À réévaluer si les routes imbriquées se multiplient. |
| Données | Hook `useApi` (annulation, rechargement), pas de bibliothèque de cache | Le cache des **descriptions** de vues est côté BFF (§ 3.7) ; le cache des **données** côté navigateur serait une source d'incohérence entre utilisateurs/sociétés. À réévaluer en L3 (TanStack Query) si les écrans génériques le justifient. |
| Styles | CSS global maîtrisé (`styles/global.css`), aucune feuille Odoo | § 4. Bibliothèque de composants : **décision Q-11 laissée ouverte** (ADR à part en L3). |
| Typage | TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) ; types partagés avec l'API par `import type` (`@api/*`) | Une seule source de vérité des contrats ; effacés au build. |
| Service en production | nginx : fichiers statiques + `/api` relayé vers Fastify, même origine ; CSP, `nosniff` | Pas de serveur Node côté front ; cookie de session sans CORS. |
| E2E | Script Playwright (`web/e2e/smoke.mjs`) sur mock + faux JWT | Parcours GO-08 rejouable sans Odoo. |

## Conséquences

- Le front ne voit jamais un cookie, un jeton ou un rôle autrement que par `/api/auth/me` ; il n'injecte plus d'en-têtes `x-viewer-*` (mode `shared` = tests seulement).
- Toute requête mutante porte `X-Leila-Csrf: 1` (`app/api-client.ts`).
- Le code exécutable partagé (schéma Zod, évaluateur de conditions) vit dans le package `@leila/ui-schema` (`packages/ui-schema`). Le dépôt est un **monorepo npm workspaces** (`api`, `web`, `packages/*`) avec un seul `package-lock.json` à la racine ; les images Docker se construisent depuis la racine.
- Les types métier historiques restent partagés par `import type` (`@api/*`), effacés au build.
