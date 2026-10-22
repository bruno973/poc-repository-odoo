# Jalon — moteur générique (L2/L3) : rapport

**Date :** 22/10/2026 · **Branche :** `claude/leila-one-react` · **Décisions :** ADR-001/002/003 validés sous conditions

## Critères du jalon

| # | Critère | Démontré | Preuve |
|---|---|---|---|
| 1 | Récupérer une vue Odoo 18 résolue, héritages compris | ✅ contre le simulateur ; ⏸ `amg` | `get_views` de la session (`OdooUiAdapter.bundle`) ; le simulateur applique les `groups` comme Odoo |
| 2 | La convertir en Leila UI Schema | ✅ | `OdooViewParser` → `ViewSchemaSchema` (Zod, package partagé) ; `test/ui-odoo18-parser.test.ts` |
| 3 | La rendre dans React sans configuration manuelle des champs | ✅ | `web/src/ui` (FormRenderer, ListRenderer, SearchRenderer, FieldRegistry) ; E2E `e2e:ui` |
| 4 | Champ ajouté à la vue → affiché automatiquement | ✅ contre le simulateur | `test/ui-dynamic.test.ts` ; E2E « JALON » (héritage installé → invalidation → champ affiché et modifiable) |
| 5 | Droits de lecture et d'écriture respectés | ✅ | `test/ui-security.test.ts` : 3 profils, onglet / champ RH absents, 10 écritures forgées refusées **avant** Odoo, commandes revérifiées, clés inutilisables d'un compte à l'autre |
| 6 | Diagnostics explicites | ✅ | Panneau « Compatibilité » ; parité champs/boutons XML testée ; détail réservé au mode diagnostic |
| 7 | Aucune dépendance métier à Odoo dans le moteur React | ✅ | `test/boundaries.test.ts` (termes Odoo, noms de champs métier, imports du package) ; contrat identique mock / Odoo (`test/ui-contract.test.ts`) |

## Commandes testées (22/10/2026)

| Commande | Résultat |
|---|---|
| `packages/ui-schema: npm test` | ✅ 77 (dont 58 cas de sémantique Python et replis) |
| `api: npm run typecheck` / `npm test` | ✅ / ✅ 122 |
| `web: npm run typecheck` / `npm run build` | ✅ / ✅ |
| `web: npm run e2e` (mock + faux JWT) | ✅ 15/15 |
| `web: npm run e2e:ui` (simulateur Odoo 18, 3 profils) | ✅ 21/21 |
| Étapes des Dockerfiles rejouées hors Docker (`npm ci --ignore-scripts`, builds, `npm ci --omit=dev`, démarrage) | ✅ |
| `docker compose up --build` | ⏸ pas de démon Docker dans l'environnement de développement |
| Contre `amg` | ⏸ pas d'accès au tailnet |

## Ce qui ne fonctionne pas encore / limites

- **Pas encore prouvé sur une vraie base** : toute la démonstration utilise le simulateur. Les points Odoo 18 supposés sont listés dans `docs/compatibilite-odoo18.md` (§ « À établir sur amg »).
- Pas de création, de suppression, d'édition en ligne ni de sous-vues de relation ; kanban, pivot, graph, calendrier hors MVP.
- Aucun widget interprété : les champs à widget sont en lecture seule (choix prudent, à assouplir widget par widget).
- Les vues sont celles de l'action ; le contexte d'action n'est pas appliqué (seulement vérifié littéral).
- Clés opaques : stables pour un utilisateur tant que l'API ne redémarre pas.
- **Fastify 4** : `npm audit` signale des avis corrigés seulement en Fastify 5 (montée de version majeure, à planifier).

## Recommandations pour la suite

1. Lancer depuis le Mac : `docker compose up --build`, puis l'inventaire UI-001 sur `amg` (script d'extraction des vues résolues par profil) et remplacer les fixtures.
2. Rejouer `e2e:ui` contre `amg` avec les 5 profils (même scénario, vrais comptes).
3. Élargir la liste blanche de widgets d'après l'inventaire (`email`, `phone`, `float_time`, `statusbar` en lecture).
4. Migrer Gestion / Pointer / Synthèse vers le registre d'écrans natifs (L5) ; planifier Fastify 5.
