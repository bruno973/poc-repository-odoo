# Cahier de dev — PoC Repository Leila ⇄ Odoo : identité réelle par utilisateur

**Version :** 0.2 — DRAFT (réponses aux questions ouvertes intégrées)
**Date :** 12/10/2026
**Owner :** Bruno SOSIN
**Statut :** En attente de validation
**Dépôt :** `poc-odoo-repository` (api Fastify/TS + web Astro, Docker)

---

## 1. Objectif

> Prouver que si chaque utilisateur Leila agit dans Odoo **avec sa propre identité**, les droits d'Odoo (droits sur les modèles, règles d'enregistrement, groupes de champs, règles de `leila_hr`) pilotent l'interface Leila **sans qu'aucune règle de droit soit recodée** dans Leila — et chiffrer ce que l'identité partagée actuelle fait perdre.

Ce PoC utilise la connexion Odoo directe (login + mot de passe Odoo) comme **remplaçant temporaire** de Keycloak. Il ne construit pas Keycloak : il démontre que l'identité réelle vaut l'investissement, et il prépare la jointure où Keycloak viendra se brancher.

**Définition de succès (Go Keycloak) :**

| # | Critère | Cible |
|---|---|---|
| S-1 | Scénarios de la matrice de droits (§ 4.3) corrects en mode identité réelle | 100 % (≥ 10 scénarios) |
| S-2 | Scénarios dont le résultat diffère entre comptes partagés et identité réelle | ≥ 60 % |
| S-3 | Règles de droit recodées dans l'API ou le front en mode identité réelle | 0 |
| S-4 | Jointure identité prouvée : un 2ᵉ fournisseur d'identité (faux JWT) passe le même contrat | Oui |
| S-5 | Surcoût de latence lié aux contrôles de droits (`has_access`) | < 150 ms par fiche |
| S-6 | Mot de passe Odoo retrouvé dans un log, un cookie, une réponse ou un stockage | 0 occurrence |

**No-go (Keycloak repoussé ou repensé) si :** S-1 < 100 % parce que les règles Odoo ne couvrent pas le besoin métier. Dans ce cas, les droits devront de toute façon être modélisés côté Leila, et le sujet prioritaire devient le modèle de droits, pas le fournisseur d'identité.

---

## 2. Contexte & périmètre

### 2.1 Existant (acquis, à ne pas refaire)

- Ports `EmployeeRepository`, `AttendanceRepository`, `SummaryRepository` ; adaptateurs `mock` et `odoo18` ; schémas Zod en sortie ; garde anti-dérive (502).
- Visibilité de la fiche évaluée côté serveur ; opérateur `and` ; `HAS_SPOUSE` corrigé.
- Client Odoo sur l'API externe (`/jsonrpc`, clé d'API), `fields_get` en cache par compte.
- Erreurs typées (`DomainError`), journal des appels, 31 tests verts **dont le contrat en lecture contre la base `amg`** (`erp.ts.beatitude973.fr`, via Tailscale).
- Écrans Astro : Employés, Pointer, Gestion, Synthèse. Proxy `/api/*` qui injecte le viewer côté serveur.
- Docker (multi-étapes, `.dockerignore`, compose). Contrainte réseau connue : le serveur Linux n'atteint pas le tailnet depuis le pont Docker ; le Mac oui.

### 2.2 Limites actuelles que ce PoC lève

| Limite | Conséquence aujourd'hui |
|---|---|
| Trois comptes Odoo partagés par rôle | Les règles Odoo s'appliquent au compte « manager », pas au vrai manager |
| Viewer déclaré par `VIEWER_ROLE` / en-têtes `x-viewer-*` | Rôle choisi par configuration, pas constaté |
| `editable` = `fields_get` seul | Champs affichés modifiables puis refusés (403) |
| Filtre par département recodé dans `listEmployees` | Droit dupliqué hors d'Odoo |
| Mock : `editable: true` partout, enregistrement en 501 | Le mock ne représente pas les droits |

### 2.3 Ce que ce projet fait

- Connexion à Leila avec les identifiants Odoo ; session Odoo **par utilisateur**, conservée côté serveur.
- Viewer **déduit d'Odoo** (utilisateur, employé, groupes).
- Capacités calculées par Odoo : `editable` par champ, `canEdit` / `canApprove` par pointage.
- Mode comparatif `AUTH_MODE=shared | odoo-session` pour rejouer les mêmes scénarios.
- Matrice de scénarios de droits automatisée, rapport de comparaison.
- Port `IdentityProvider` prêt à recevoir un adaptateur Keycloak.

### 2.4 Ce que ce projet ne fait PAS

- Keycloak (ni serveur, ni realm, ni vérification JWT côté Odoo).
- Double authentification Odoo (TOTP) : comptes de test sans 2FA.
- Auto-modification de sa propre fiche par un employé : **hors besoin Leila** (décision Q-05). Aucune méthode dédiée ne sera prévue dans le connecteur.
- Multi-client (une base Odoo par exécution, configurable).
- Mode hors ligne, haute disponibilité, stockage de session distribué (mémoire seulement).
- Migration Odoo 19 (`hr.version`, API JSON-2).

### 2.5 Dépendances externes

| Dépendance | Détail | Bloquant ? |
|---|---|---|
| Base de test Odoo 18 | `amg` (base de test, décision Q-01), `leila_hr` installé ; écritures autorisées | Non |
| 5 utilisateurs de test | Profils du § 4.2 sur `amg`, sans 2FA, rattachés à des employés | Oui |
| Accès réseau | Mac sur le tailnet (ou conteneur Tailscale côté serveur) | Oui |

---

## 3. Contraintes

| Type | Contrainte | Dure/Souple |
|---|---|---|
| Temps | 3 semaines calendaires, 12–16 j de dev | Souple |
| Stack | Fastify 4 + TS strict + Zod ; Astro 4 SSR ; Docker | Dure |
| Moteur | Odoo 18 Community, multibase, `dbfilter = ^%d$` | Dure |
| Réseau | Odoo joignable uniquement via Tailscale | Dure |
| Données | Écritures autorisées sur `amg` (base de test) ; interdites sur toute base non listée dans `ODOO_WRITE_ALLOWED_DBS` | Dure |
| RGPD | Si `amg` contient des données personnelles réelles (sécu, adresse, conjoint), accès restreint aux personnes du PoC | Souple |
| Sécurité | Mot de passe Odoo en transit uniquement : jamais stocké, jamais journalisé | Dure |
| Performance | P95 < 600 ms par opération via le tailnet | Souple |

**Bottleneck identifié :** des utilisateurs de test aux droits **réellement différenciés** sur `amg` (managers, validateurs leila_hr, employés). Sans eux, la matrice ne prouve rien.

---

## 4. Exigences fonctionnelles

### 4.1 Exigences

| ID | Exigence | MoSCoW | Critère d'acceptance |
|---|---|---|---|
| F-01 | En tant qu'utilisateur, je me connecte à Leila avec mon login et mon mot de passe Odoo afin d'agir sous ma propre identité. | Must | `POST /api/auth/login` → 204 + cookie `leila_sid` (httpOnly, SameSite=Lax, Secure hors local). Mauvais mot de passe → 401 générique, sans indiquer lequel des deux champs est faux. |
| F-02 | En tant que système, je déduis le viewer d'Odoo (uid, employé lié, rôle) afin de ne plus dépendre d'une configuration. | Must | `GET /api/auth/me` renvoie `{ userId, employeeId, role, displayName, company }` ; `employeeId` = `hr.employee` où `user_id = uid` ; rôle selon la table § 6.4. |
| F-03 | En tant que système, chaque appel de port en mode `odoo-session` utilise la session Odoo de l'utilisateur. | Must | Le journal des appels affiche l'uid Odoo de chaque appel ; aucun appel par compte partagé dans ce mode (test automatisé). |
| F-04 | En tant qu'utilisateur, je ne vois modifiables que les champs que je peux réellement modifier. | Must | `editable = fields_get.readonly === false ∧ has_access("write") sur la fiche ∧ editableIf (squelette)`. Aucun 403 après un enregistrement de champs affichés modifiables (scénarios S-05, S-06). |
| F-05 | En tant que système, `updateEmployee` applique exactement la même règle que l'affichage. | Must | Champ non modifiable → 403 **avant** l'appel `write` (test protocole). |
| F-06 | En tant que manager ou validateur, je ne vois « Approuver », « Refuser » et les interrupteurs de Gestion que sur les pointages où j'en ai le droit. | Must | `Attendance.capabilities = { canEdit, canApprove }` calculé via `has_access` ; boutons masqués sinon ; scénarios S-03, S-04. |
| F-07 | En tant qu'utilisateur, je me déconnecte. | Must | `POST /api/auth/logout` détruit la session Leila **et** la session Odoo ; le cookie est supprimé ; l'appel suivant → 401. |
| F-08 | En tant qu'utilisateur dont la session Odoo a expiré, je suis renvoyé vers la connexion sans message technique. | Must | Session Odoo expirée → `DomainError("unauthenticated")` → 401 → redirection `/login?retour=…`. |
| F-09 | En tant que développeur, je bascule `AUTH_MODE=shared` / `odoo-session` sans changer de code afin de comparer les deux modes. | Must | Les deux modes passent le contrat des ports ; la matrice produit un rapport des écarts. |
| F-10 | En tant que développeur, le mock reflète les droits par rôle. | Should | `editable` et `capabilities` calculés depuis `editableIf` et le rôle ; `updateEmployee` implémenté en mémoire (plus de 501). |
| F-11 | En tant qu'architecte, je dispose d'un port `IdentityProvider` avec deux adaptateurs. | Must | `OdooSessionIdentity` (réel) + `FakeJwtIdentity` (tests) passent le même contrat d'identité (critère S-4). |
| F-12 | En tant que développeur, le cycle d'écriture (arrivée, départ, correction, approbation) est validé contre `amg`. | Must | Suite `ODOO_TEST_WRITES=1` verte sur `amg`, avec chacun des 5 profils. |
| F-13 | En tant que décideur, je dispose d'un rapport Go/No-go. | Must | `docs/rapport-identite.md` généré : matrice, écarts, latences, constats. |
| F-14 | En tant qu'utilisateur, je vois mon nom et mon rôle constaté dans la barre de navigation. | Could | Remplace `VIEWER_ROLE` dans `AppNav` en mode `odoo-session`. |

### 4.2 Profils de test (base `amg`)

| Profil | Groupes Odoo (à confirmer, cf. Q-02) | Rattachement leila_hr | But |
|---|---|---|---|
| `p.admin` | Employés : Administrateur ; Présences : Administrateur | — | Référence « tout voir » |
| `p.manager` | Employés : Officier ; Présences : Officier | `attendance_manager_id` de 3 employés | Périmètre d'équipe |
| `p.validateur` | Présences : utilisateur | Dans `attendance_validator_ids` de 2 employés hors de l'équipe de `p.manager` | Règle leila_hr de validation |
| `p.employe` | Employés : aucun droit RH ; Présences : ses propres présences | Employé de l'équipe de `p.manager` | Cas « soi-même » |
| `p.autre_societe` | Comme `p.manager`, société B | — | Règle multi-société |

### 4.3 Matrice de scénarios (livrable central)

Chaque scénario est un test automatisé (`api/test/rights-matrix.test.ts`) exécuté dans les deux modes. La colonne « attendu » décrit le comportement **défini par Odoo et leila_hr**, constaté dans l'interface Odoo avant d'écrire le test (T-01).

| ID | Profil | Action | Attendu (Odoo) | Partagé (prévision) | Identité réelle |
|---|---|---|---|---|---|
| S-01 | p.manager | Lister les présences (Gestion) | Seulement son équipe (règle leila_hr) | Équipe du compte partagé, ou tout | à mesurer |
| S-02 | p.manager | Ouvrir la Synthèse | Totaux de son équipe uniquement | Totaux d'un autre périmètre | à mesurer |
| S-03 | p.employe | Approuver ses propres heures | Refusé, bouton absent | Selon le compte « employee » | à mesurer |
| S-04 | p.validateur | Corriger un pointage d'un employé qu'il valide / qu'il ne valide pas | Autorisé / refusé | Indifférencié | à mesurer |
| S-05 | p.manager | Modifier l'intitulé de poste d'un membre de son équipe | Selon droits Odoo | Champ affiché modifiable, 403 à l'enregistrement | à mesurer |
| S-06 | p.employe | Ouvrir sa fiche : champs modifiables | Aucun (pas d'auto-modification, Q-05) | Champs affichés modifiables | à mesurer |
| S-07 | p.employe | Ouvrir la fiche d'un collègue : données privées | Absentes | Absentes (élagage serveur) | à mesurer |
| S-07b | p.manager | Ouvrir la fiche d'un membre de l'équipe : contact d'urgence | Absent (décision Q-03) | Absent | à mesurer |
| S-08 | p.manager | Lire le n° de sécurité sociale d'un membre de l'équipe | Selon groupes de champ Odoo | Selon le compte partagé | à mesurer |
| S-09 | p.autre_societe | Lister les employés | Société B uniquement | Société du compte partagé | à mesurer |
| S-10 | p.manager | Pointer pour un employé hors équipe | Refusé | Indifférencié | à mesurer |
| S-11 | p.validateur | Modifier une période clôturée | Refusé (règle de clôture leila_hr) | Indifférencié | à mesurer |
| S-12 | tout profil | Ancien en-tête `x-viewer-role: hr_admin` forgé en mode `odoo-session` | Ignoré | Accepté | à mesurer |

**Lecture du résultat :** chaque ligne où « Partagé » diffère de « Attendu » est un défaut que seule l'identité réelle corrige sans recodage. Le ratio de ces lignes alimente S-2.

---

## 5. Exigences non fonctionnelles

| Catégorie | Exigence | Valeur cible | Méthode de mesure |
|---|---|---|---|
| Performance | Connexion (authenticate + profil + rôle) | < 1,5 s | Chrono dans le test d'identité, 10 essais |
| Performance | P95 par opération de port via tailnet | < 600 ms | Journal des appels, export JSON, 100 appels |
| Performance | Surcoût `has_access` à l'ouverture d'une fiche | < 150 ms | Comparaison avec / sans, 20 fiches |
| Sécurité | Mot de passe jamais stocké ni journalisé | 0 occurrence | Recherche du mot de passe de test dans logs, store, réponses, cookies (test automatisé) |
| Sécurité | Cookie de session | httpOnly, SameSite=Lax, Secure (hors local), 256 bits d'aléa | Test HTTP |
| Sécurité | Durée de session | Inactivité 1 h, absolue 8 h | Test avec horloge simulée |
| Sécurité | Limitation des tentatives de connexion | 5 / min / IP, puis 429 | Test HTTP |
| Sécurité | En-têtes `x-viewer-*` en mode `odoo-session` | Ignorés | Scénario S-12 |
| Maintenabilité | Aucun terme Odoo dans `domain/` et `web/src` | 0 (hors commentaire d'en-tête) | `grep` en CI |
| Maintenabilité | Contrat des ports | Vert sur mock, odoo-apikey, odoo-session | `npm test` |

---

## 6. Architecture cible du PoC

### 6.1 Vue d'ensemble

```
Navigateur ──cookie leila_sid──▶ Astro (proxy /api/*, relaie Cookie / Set-Cookie)
                                   │
                                   ▼
                               API Fastify
   routes/auth.ts ──▶ IdentityProvider ──▶ SessionStore (mémoire)
   routes/*       ──▶ Principal (viewer + poignée de session opaque)
                  ──▶ ports (Employee / Attendance / Summary)
                         └─▶ adapters/odoo18 ──▶ OdooTransportFactory.for(principal)
                                                   ├─ ApiKeyTransport   (/jsonrpc)        mode shared
                                                   └─ SessionTransport  (/web/dataset/call_kw + cookie)  mode odoo-session
```

### 6.2 Nouveaux éléments du domaine (aucun terme Odoo)

```ts
// domain/identity.ts
export interface Principal {
  viewer: ViewerContext;          // userId, role, employeeId, companyId
  displayName: string;
  /** Poignée opaque vers la session moteur ; jamais exposée au client. */
  backendHandle: string;
}

export interface IdentityProvider {
  login(credentials: { login: string; password: string }): Promise<Principal>;
  logout(principal: Principal): Promise<void>;
  /** Vérifie que la session moteur est toujours valide ; null si expirée. */
  refresh(principal: Principal): Promise<Principal | null>;
}

// Capacités calculées par le moteur, jamais par Leila
export interface AttendanceCapabilities { canEdit: boolean; canApprove: boolean }
```

`Attendance` gagne `capabilities: AttendanceCapabilities`. `FormNode` garde `editable`, dont le calcul change (§ 6.5).

### 6.3 Adaptateurs

| Fichier | Rôle |
|---|---|
| `adapters/odoo18/transport.ts` | Interface `OdooTransport { callKw(params) }` ; `ApiKeyTransport` (client actuel) et `SessionTransport` (cookie `session_id`, reprise du client d'origine) |
| `adapters/odoo18/OdooSessionIdentity.ts` | `login` : `/web/session/authenticate` → uid ; lecture de `hr.employee` (`user_id = uid`) ; rôle via `res.users.has_group` ; `logout` : `/web/session/destroy` |
| `adapters/odoo18/capabilities.ts` | `has_access("write")` par lot d'ids (`hr.employee`, `hr.attendance`) ; `canApprove` via le groupe d'approbation des heures |
| `adapters/fake/FakeJwtIdentity.ts` | Tests uniquement : accepte un JWT signé localement → prouve la jointure Keycloak (S-4) |
| `app/sessions.ts` | `SessionStore` en mémoire : id aléatoire 256 bits → `Principal` ; TTL inactivité / absolue ; purge périodique |
| `app/repositories.ts` | Remplace `clientsByRole` par `OdooTransportFactory` ; `AUTH_MODE` choisit la fabrique |

Les repositories Odoo ne changent que leur constructeur : `clientFor(viewer)` devient `transports.for(principal)`. Les méthodes de port restent identiques.

### 6.4 Correspondance groupes Odoo → rôle Leila

Configurable (`ROLE_GROUPS` dans `api/.env`), évaluée dans l'ordre, première correspondance gagnante. XML ids **à vérifier sur `amg`** (Q-02).

| Rôle Leila | Groupe Odoo (proposition) |
|---|---|
| `hr_admin` | `hr.group_hr_manager` |
| `manager` | `hr_attendance.group_hr_attendance_officer` ou `hr.group_hr_user` |
| `employee` | sinon |

Le rôle ne sert plus qu'à **la présentation** (squelette, libellés). Les décisions d'accès viennent d'Odoo.

### 6.5 Calcul des capacités

```
editable(champ, fiche) = fields_get[champ].readonly === false      (déjà en cache par session)
                       ∧ has_access("write") sur la fiche            (1 appel par fiche)
                       ∧ editableIf(nœud, viewer, valeurs)           (règle Leila, optionnelle)

capabilities(pointage) = { canEdit:    has_access("write") sur le pointage,
                           canApprove: canEdit ∧ groupe d'approbation }   (1 appel par page de 80)
```

`has_access` existe en Odoo 18 sur les enregistrements (`models.py`) et couvre droits du modèle **et** règles d'enregistrement. `updateEmployee` et `updateAttendance` réévaluent la même règle avant d'écrire.

### 6.6 Routes ajoutées

| Méthode | Route | Effet |
|---|---|---|
| POST | `/api/auth/login` | `{ login, password }` → 204 + `Set-Cookie: leila_sid` ; 401 ; 429 |
| POST | `/api/auth/logout` | 204, session Leila et Odoo détruites |
| GET | `/api/auth/me` | Principal sans `backendHandle` |

En mode `odoo-session`, `extractViewer` lit **uniquement** le cookie ; les en-têtes `x-viewer-*` sont ignorés (S-12).

### 6.7 Front (Astro)

- Page `/login` (formulaire POST relayé, message d'erreur générique).
- Proxy `/api/*` : relaie `Cookie` vers l'API et `Set-Cookie` vers le navigateur ; ajoute `auth/login`, `auth/logout`, `auth/me` à la liste blanche.
- Pages SSR : lisent le cookie de la requête entrante et le transmettent à l'API ; 401 → redirection `/login?retour=<chemin>`.
- `AppNav` : nom et rôle constatés (`/api/auth/me`), bouton « Se déconnecter ».
- Gestion : interrupteurs et boutons pilotés par `capabilities`.
- Fiche : champs pilotés par le nouveau `editable`.

### 6.8 Ce qui changera avec Keycloak (hors périmètre, pour mémoire)

| Élément | Ce PoC | Avec Keycloak |
|---|---|---|
| Fournisseur d'identité | `OdooSessionIdentity` | `KeycloakIdentity` (vérification JWT, JWKS en cache) |
| Transport Odoo | Session Odoo de l'utilisateur | Jeton de l'utilisateur relayé à un module connecteur Odoo qui agit en son nom |
| Mots de passe | Transitent par l'API | Ne transitent plus |
| Ports, adaptateurs métier, écrans | — | **Inchangés** (c'est ce que S-4 doit prouver) |

---

## 7. Découpage & estimation

**Approche :** refactor minimal du transport, puis identité, puis capacités, puis preuve par la matrice. Chaque lot se termine par `npm test` vert et une démonstration.

| Lot | Tâches | Durée | Hypothèses |
|---|---|---|---|
| **0 — Prérequis** | T-01 Sauvegarde de `amg` (point de retour avant les tests d'écriture) ; T-02 Créer les 5 profils du § 4.2 et leurs rattachements leila_hr ; T-03 Constater dans Odoo le résultat attendu de chaque scénario S-01…S-11 (captures) | 1–1,5 j | Accès admin à l'instance |
| **1 — Transport** | T-10 Interface `OdooTransport` ; T-11 `SessionTransport` (authenticate, cookie, expiration → `unauthenticated`) ; T-12 `OdooTransportFactory` + `AUTH_MODE` ; T-13 tests protocole (faux serveur : cookie, expiration, relance) | 2 j | — |
| **2 — Identité** | T-20 Port `IdentityProvider` + `Principal` ; T-21 `OdooSessionIdentity` ; T-22 `SessionStore` (TTL, purge) ; T-23 routes `auth/*`, limitation des tentatives ; T-24 `extractViewer` par cookie ; T-25 `FakeJwtIdentity` + contrat d'identité commun | 2,5–3 j | `/web/session/authenticate` utilisable sans 2FA |
| **3 — Viewer constaté** | T-30 Recherche de l'employé lié ; T-31 rôle par `has_group` + table configurable ; T-32 `auth/me` ; T-33 retrait du filtre par département en mode `odoo-session` | 1 j | Q-02 tranchée |
| **4 — Capacités** | T-40 `capabilities.ts` (`has_access` par lot) ; T-41 nouveau calcul `editable` ; T-42 `editableIf` dans le squelette (schéma Zod + évaluation serveur) ; T-43 `capabilities` sur `Attendance` ; T-44 même règle dans `updateEmployee` / `updateAttendance` ; T-45 parité du mock (F-10) ; T-46 contact et téléphone d'urgence passent de `SELF_OR_MANAGER_PLUS` à `SELF_OR_ADMIN` dans le squelette (décision Q-03), test de visibilité mis à jour | 2–2,5 j | — |
| **5 — Front** | T-50 page `/login` ; T-51 proxy cookies ; T-52 redirections 401 ; T-53 `AppNav` (identité, déconnexion) ; T-54 Gestion et fiche pilotées par les capacités | 1,5 j | — |
| **6 — Preuve** | T-60 `rights-matrix.test.ts` (S-01…S-12, deux modes) ; T-61 écritures sur `amg` (F-12) ; T-62 mesures de latence et de sécurité (§ 5) ; T-63 générateur `docs/rapport-identite.md` | 2–3 j | Lot 0 terminé |
| **7 — Décision** | T-70 Revue du rapport, décision Go/No-go Keycloak, liste des écarts leila_hr découverts | 0,5 j | — |

**Estimation totale :** 12,5–15 j de dev, soit 3 semaines calendaires — fourchette ±30 % tant que Q-02 n'est pas tranchée.

### Définition de « terminé » (chaque lot)

- `npm run typecheck` et `npm test` verts (mock + odoo-apikey ; + odoo-session à partir du lot 1).
- `npx astro check` : 0 erreur.
- Aucun terme Odoo dans `domain/` et `web/src`.
- Démonstration enregistrée (capture vidéo courte) du comportement du lot.

---

## 8. Plan de tests

| Suite | Contenu | Exécution |
|---|---|---|
| `contract.ts` (existant, étendu) | Contrat des ports + `capabilities` | mock, odoo-apikey, odoo-session |
| `identity-contract.ts` (nouveau) | login valide / invalide, `me`, logout, expiration, refresh | OdooSessionIdentity (`amg`), FakeJwtIdentity |
| `rights-matrix.test.ts` (nouveau) | S-01…S-12 dans les deux modes ; écrit un JSON de résultats | `amg` |
| `odoo-protocol.test.ts` (étendu) | SessionTransport : cookie, `SessionExpired`, `has_access` par lot | faux serveur, partout |
| `security.test.ts` (nouveau) | Mot de passe absent des logs / store / réponses ; cookie ; limitation ; en-têtes forgés ignorés | partout |
| `odoo-live.test.ts` (existant) | Champs du mapping + contrat en lecture et en écriture | `amg` |

**Règle absolue :** toute suite qui écrit vérifie au démarrage que `ODOO_DB` figure dans `ODOO_WRITE_ALLOWED_DBS` (valeur PoC : `amg`) et s'arrête sinon. Garde-fou contre une erreur de configuration vers une base cliente.

---

## 9. Risques & mitigations

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | Tests d'écriture lancés par erreur sur une autre base que `amg` | Basse | Fort | Liste `ODOO_WRITE_ALLOWED_DBS` vérifiée au démarrage des suites (§ 8) |
| R-02 | Tests d'écriture qui laissent `amg` dans un état incohérent pour les tests suivants | Moy | Moy | Sauvegarde au lot 0 (T-01) ; tests idempotents (fermeture des arrivées ouvertes au démarrage) |
| R-03 | Les règles de `leila_hr` ne couvrent pas les scénarios (ex. droits CRUD trop larges sur les clôtures et mouvements, déjà repérés) | Haute | Moy | C'est un **résultat** du PoC : consigner, corriger dans leila_hr, rejouer |
| R-04 | `has_access("write")` vrai mais `write` refusé par une contrainte (`ValidationError`) | Moy | Faible | Distinguer 403 (droit) et 422 (règle métier) dans le rapport |
| R-05 | Utilisateurs avec 2FA | Moy | Moy | Profils de test sans 2FA ; flux TOTP hors périmètre |
| R-06 | Sessions perdues au redémarrage de l'API (stockage mémoire) | Haute | Faible | Accepté pour un PoC ; reconnexion |
| R-07 | Latence tailnet dégradant l'expérience | Basse | Moy | Mesures § 5 ; regrouper `has_access` par lot |
| R-08 | Serveur Docker Linux sans accès au tailnet | Haute | Moy | Développer sur le Mac ; conteneur Tailscale en option |
| R-10 | Le mode `shared` est supprimé puis manque pour les synchronisations de fond (Q-04 non tranchée) | Moy | Faible | Le garder derrière `AUTH_MODE` tant que Q-04 n'est pas tranchée : son coût de maintenance est faible |
| R-09 | `has_group` / XML ids de groupes différents sur la base | Moy | Faible | Table configurable + vérification au lot 3 |

---

## 10. Questions ouvertes

| # | Question | Owner | Statut |
|---|---|---|---|
| Q-02 | Quels groupes Odoo définissent manager et admin RH chez tes clients ? | Bruno | **Ouverte** — à trancher au lot 3 ; d'ici là, table § 6.4 configurable |
| Q-04 | Garde-t-on le mode `shared` après le PoC (synchronisations de fond, compte technique) ? | Bruno | **Ouverte** — conservé derrière `AUTH_MODE` en attendant (R-10) ; à trancher au lot 7 |

### Décisions prises (v0.2)

| # | Question | Décision | Impact sur ce cahier |
|---|---|---|---|
| Q-01 | `amg` est-elle une base de production ? | Non, base de test | Écritures autorisées sur `amg` ; plus de copie ni d'anonymisation ; garde-fou par liste de bases autorisées ; lot 0 raccourci |
| Q-03 | Contact d'urgence visible des managers ? | Non | Règle `SELF_OR_ADMIN` pour contact et téléphone d'urgence (T-46) ; scénario S-07b |
| Q-05 | Auto-modification de sa fiche par l'employé ? | Hors besoin | Aucune méthode dédiée dans le connecteur ; S-06 attend « aucun champ modifiable » |
| Q-06 | Seuil S-2 à 60 % ? | Validé | Critère S-2 inchangé |

---

## Next Actions

| Action | Owner | ETA |
|---|---|---|
| Valider ce cahier et les seuils de succès | Bruno | [DATE] |
| Sauvegarder `amg` (T-01) | Bruno | [DATE] |
| Trancher Q-02 (groupes manager / admin RH) | Bruno | Lot 3 |
| Créer les 5 profils de test et constater les résultats attendus (T-03) | Bruno | [DATE] |
| Démarrer le lot 1 (transport) | [Dev] | [DATE] |
