---
type: veille
tags: [veille, harnais, architecture, securite, templates, souverainete]
statut: #169 ✅ COMPLET · #170 🔨 slices 1-2 (coffre + utilise_secret + jonction securite/RGPD) · reste backend bws/age
sources: [statut, historique, idee]
maj: 2026-06-30
---

# Le « Harnais » (Flavien Chevret)

> Théorie de l'armature autour d'un LLM interchangeable : skills, scripts déterministes, **templates**, coffre-fort de secrets, boucles. Le modèle ne contient **aucune intelligence métier** — toute la valeur est dans la structure. C'est **exactement la thèse de MangoOS**, formalisée par un tiers.

## Rôle

Raf a partagé (2026-06-30) une synthèse de **Flavien Chevret** décrivant le concept de « Harnais » et de « Boucles ». En la comparant à MangoOS, on confirme que **MangoOS *est* un harnais** — et plus avancé que le texte sur plusieurs axes — mais que **deux briques du harnais lui manquent**, devenues les pistes [[statut#169]] et [[statut#170]].

L'argument de fond : un harnais mûr fait que l'IA « sort un produit propre du premier coup » → **moins de tokens, moins d'itérations**. Le chiffre avancé (≈ 20 min / ~17-24 k tokens *avec* harnais vs ~1 jour / ~1 M *sans*) est **marketing** — vrai surtout sur une tâche déjà templatée, beaucoup moins sur du neuf — mais la **direction est juste** et colle au cap de souveraineté progressive de MangoOS.

## Les composants du Harnais (et leur équivalent MangoOS)

| Composant (Flavien) | Équivalent MangoOS | État |
|---|---|---|
| **Agent (moteur) interchangeable** — 1 ligne pour switcher | [[brain-dispatch]] + [[atelier-cerveaux]] : **un modèle par agent** | ✅ plus avancé (par-agent, pas global) |
| **Skills utilisateurs** (~35) | Skills + KernelTools de l'Élève (`planifier`, `chercher_web`, `extraire_site`…) | ✅ via [[transmission-competences]] |
| **Skills internes** (protocoles inter-agents) | [[le-stratege]] · [[gardien-cloture]] · routage `route()` | ✅ |
| **Scripts déterministes** (~80) | `runParcours`, `measureDesign`, `sharinganAnalyze`, parsing pur… | ✅ (« éviter de cramer des tokens » = logique identique) |
| **Templates** (~100, dont **infra back** : BDD/paiement/RGPD/sécurité) | ~30 templates **front** (#81-#83) + **5 briques back composables livrées** (#169 : auth·db·paiement·securite·RGPD) | 🟢 **#169 : 5 briques ✅** (reste l'assemblage Élève) |
| **Gestion des secrets** (Bitwarden API) | coffre **chiffré AES-256-GCM** + `utilise_secret` (réf→résolu serveur, valeur rédigée) — #170 slice 1 | 🟢 **#170 slice 1 ✅** (Bitwarden/age = upgrade) |
| **Boucle fonctionnelle** (se réveille seule) | Runs autonomes ([[boucle-nocturne]], `run-mango-nuit.ts`) | ✅ |
| **Boucle architecturale** (réécrit ses propres skills) | [[auto-amelioration]] (`mango-self.ts` B1-B4) + [[auto-evolution]] (#168) | ✅ |

**Là où MangoOS dépasse le texte** : modèle par agent (vs moteur unique), **souveraineté mesurée** (`/api/sovereignty`), transmission de compétences *guidée* (prudence > auto-réécriture sauvage).

## Les 2 pistes nées de la comparaison

### #169 — Bibliothèque de templates d'infra back-end pré-câblés 🧠 Opus · L
Combler le trou « templates » côté **back**. 5 briques composables dans `server/templates/backend/<brique>/` + fiche d'assemblage lisible par l'Élève :
1. **auth** (sessions/JWT + refresh, argon2, reset email, rôles)
2. **schéma BDD + migrations** (Drizzle/Prisma, seed, RLS)
3. **paiement** (Stripe checkout + webhooks signés + idempotence)
4. **RGPD** (export/suppression, registre de consentement, rétention)
5. **durcissement sécurité** (helmet, rate-limit, Zod aux frontières, CORS, secrets hors-code → #170)

Passage de « l'IA *réécrit* l'infra à chaque app » (#35) à « l'IA *assemble* de l'infra déjà sûre ». Fidèle à #156 (réutiliser > réinventer) et #74 (constellations). **✅ RÉALISÉ** : les 5 briques existent et le KernelTool `assemble_brique` permet à l'Élève de les composer lui-même (prouvé live).

> **🔨 Slices 1-2 livrées (2026-06-30)** — squelette + briques `auth` et `db`, prouvées, qui **se composent**.
> - **Slice 1** : convention `server/templates/backend/_bricks/<brique>/` (`brick.json` machine-lisible + `RECIPE.md` + `src/` + `tests/`) ; brique `auth` (scrypt $0 pluggable→argon2, tokens HMAC horloge injectable, `UserStore` injectable, register/login/refresh + `requireAuth`) ; module pur serveur `backend-bricks.ts` (découverte/validation/`buildAssemblyPlan`).
> - **Slice 2** : brique `db` (SQLite via **`node:sqlite`** intégré Node 22+, **zéro dépendance native, $0**), migrations idempotentes+ordonnées, interface `Db` driver-agnostique, et **`createSqliteUserStore` qui implémente le contrat `UserStore` d'`auth`** → composition `createAuthRouter({ store })` **sans toucher à `auth.ts`**.
> - **Slice 3** : brique `paiement` (Stripe Checkout + webhooks signés + idempotence), 1ʳᵉ brique de niveau **`app`**. **Vérification de signature de webhook réimplémentée en `node:crypto`** (HMAC, temps-constant, anti-rejeu = zéro dépendance pour le point critique), idempotence par `event.id` (store injectable→`db`), client Stripe **injectable** → **prouvable sans compte Stripe ni réseau**.
> - **Slice 4** : brique `securite` (niveau **`core`**, transverse), **zéro dépendance** : en-têtes type helmet, CORS allowlist + préflight, rate-limit (horloge injectable), validation aux frontières **compatible Zod `safeParse`** + mini-schémas intégrés, `requireEnv` (échec rapide au boot, **couture vers #170**). Chaque garde remplaçable par son équivalent npm.
> - **Slice 5** : brique `RGPD` (niveau **`app`**) — machinerie GDPR générique : `PrivacyRegistry` (sources `collect`/`erase` → export + droit à l'oubli), consentement versionné (store injectable→`db`), rétention pure, router derrière l'auth. **1ʳᵉ brique à déclarer `requires: ["auth"]`** → exerce le lien de dépendance du plan.
> - **Slice 6 (CLÔTURE)** : KernelTool **`assemble_brique`** (`eleve-bricks.ts` orchestration pure + `eleve-bricks-tools.ts`, gaté `ELEVE_BRICKS=on`) → l'Élève **compose son infra seul** : catalogue, **résolution transitive des `requires`** (RGPD tire auth), copie des fichiers, fusion non destructive de `package.json`, snippets de montage. **PROUVÉ LIVE** : `assemble_brique(["RGPD","db"])` → auto-ajout auth, 13 fichiers + package.json écrits sur disque, montage ordonné.
> - **🎯 #169 COMPLET (✅ FAIT). 166 tests verts** (`backend-bricks` 36 · auth 20 · db 13 · paiement 26 · securite 24 · RGPD 20 · **eleve-bricks 27**), `tsc` 0. Le harnais back de Flavien Chevret, réalisé : 5 briques éprouvées + l'Élève les assemble lui-même. **L66 ✅ Résolu.**

### #170 — Coffre-fort de secrets : l'Élève manipule le coffre, jamais les clés 🧠 Opus · M
Le principe gravé de Flavien : *« le modèle manipule uniquement le coffre-fort ; aucune clé ne transite dans le prompt. »* MangoOS l'applique à moitié (`.env` gitignoré + réseau durci, mais protection **conventionnelle**, pas structurelle).
- **Référence** `secret://pexels/api_key` résolue **au dernier moment, côté serveur** ;
- la **valeur ne touche jamais la couche LLM** (ni prompt, ni texte de retour, ni fichier généré) ;
- fournisseur : **Bitwarden Secrets Manager** (`bws`) + repli souverain `age`/`sops` ;
- outil Élève `utilise_secret(ref)` à périmètre strict (injecte dans l'appel réseau autorisé #166, ne renvoie jamais la valeur) ;
- **règle absolue** : ni Claude ni l'Élève ne *saisit* une clé — uniquement des références opaques (cohérent **L27**).

> **🔨 Slice 1 (2026-06-30), prouvée live** : `secret-vault.ts` (références `secret://ns/clé`, **backend fichier chiffré AES-256-GCM** `node:crypto` zéro-dép, `resolveSecret`, garde **`redact`**) + KernelTool **`utilise_secret`** (gaté `ELEVE_VAULT=on` : résout côté serveur, injecte dans l'appel autorisé anti-SSRF, **rédige la valeur** → jamais dans la couche LLM) + CLI `vault-cli.ts`. **30 tests**. **Live** : secret chiffré → `utilise_secret` sur `httpbin.org/bearer` (200) → `"token": "«secret»"`.
>
> **🔨 Slice 2 (2026-06-30) — JONCTION #169↔#170** : les briques d'infra puisent leurs secrets dans le coffre. La brique **`securite`** (propriétaire naturel) gagne `createEncryptedVault` + `encryptSecrets` + **`requireEnv(names, { resolve })`** qui résout `AUTH_SECRET=secret://auth/secret` au boot (jamais en clair) ; provides `security`+`secrets`. **`RGPD`** (résolveur-agnostique) : un effaceur vers un sous-traitant externe résout sa clé via le coffre au moment de l'appel (clé absente de l'export). **securite 28/28** (+4) · **RGPD 23/23** (+3), `tsc` 0. Reste : backend Bitwarden `bws`/`age`. Limite **L67**.

## Liens

- Pistes : [[statut#169]] · [[statut#170]] · détails dans [[historique]] (« Détail des idées »)
- Briques MangoOS comparées : [[brain-dispatch]] · [[atelier-cerveaux]] · [[transmission-competences]] · [[le-stratege]] · [[gardien-cloture]] · [[auto-amelioration]] · [[auto-evolution]] · [[boucle-nocturne]]
- Point d'injection des secrets : `requete_web` #166 (la « main Internet »)
- Autre veille externe miroir de la thèse MangoOS : [[veille-sakana-fugu]] · [[trinity]] · [[conductor]]

## Sources

- Synthèse Flavien Chevret « logique du Harnais et des Boucles » (texte fourni par Raf, 2026-06-30)
- [[statut]] (tableau idées #169/#170) · [[historique]] (Détail des idées #169/#170)
