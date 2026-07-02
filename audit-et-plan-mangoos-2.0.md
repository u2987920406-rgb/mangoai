# Audit complet & Plan MangoOS 2.0

> Rédigé le 2026-07-02 (atelier). Base : audit multi-agents du code réel (407 fichiers serveur ~67K lignes, 82 fichiers UI, docs, données), `fondation.md`, `limites.md` (73 entrées), `audit-general-2026-06.md`.
> Objectif : préparer la refonte « MangoOS 2.0 — un OS frontière dans l'air du temps ».

---

# PARTIE I — AUDIT : LES QUALITÉS

## 1. Une vision fondatrice rare et tenue

`fondation.md` est un vrai document d'architecture 10 ans (5 piliers : local-first, LLM-agnostique, auto-apprenant, extensible, souverain). L'audit 2026-06 le confirmait déjà : **le cœur custom promis est réellement construit et prouvé** — contrat d'exécution, Kernel, moteur agentique, multi-cerveaux, MangoQA 3 visages. En 20 jours : 46 sessions, 175 idées numérotées, 40 apps générées, gradient de réutilisation 0→67 %.

## 2. Un cœur agentique bien conçu

- **`eleve-runtime.ts` est un module PUR** : ne connaît ni l'env, ni la config, ni le réseau. Transport injecté (`PostFn`), testable sans réseau.
- **Injection de dépendances généralisée** (`RelayDeps`, deps injectées dans stratège, spéculation, forge, vault, hooks...) → le couplage au cœur est léger : on ajoute un juge/garde/spécialiste **sans toucher `eleve.ts`**.
- **Fail-open systématique** : un fichier absent/corrompu ne crash jamais (brain-registry, hooks, MangoQA bridge...).
- **`brain-registry`** : 13 cerveaux typés par rôle, hot-reload JSON, politique d'outils par force du cerveau.

## 3. Une culture d'ingénierie honnête (le vrai différenciateur)

- **`limites.md`** : 73 limites tracées, chacune avec cause, piste, faisabilité. Aucun projet ne fait ça.
- **Gates OFF par défaut + zéro régression** : chaque feature livrée gatée, prouvée live avant activation.
- **158 fichiers de tests** couvrant tous les sous-systèmes critiques.
- **Wiki de 56 pages-entités à jour**, système documentaire discipliné (statut/historique/limites/wiki).

## 4. Des sous-systèmes matures et prouvés live

| Sous-système | État | Verdict audit |
|---|---|---|
| Le Stratège (diagnostic + remèdes + apprentissage) | Prouvé live, pur, déterministe | ⭐ Excellent — socle du 2.0 |
| Hooks (dispatcher déclaratif) | Cœur pur 33 tests, Gate 1 ON | ⭐ Excellent |
| Spéculation (draft→verify, DeepSpec transposé) | Noyau pur, mesuré e2e | Très bon (à unifier) |
| Secret-vault (AES-256-GCM + Bitwarden) | Critique-grade, zéro dep | ⭐ Excellent |
| Vision/Sharingan + Design-Coach 7 lentilles | Production | Très bon |
| Forge d'agents + subagents exécutants | Prouvé live, gaté | Bon (à intégrer au Stratège) |
| Briques infra back (5 briques) + templates (21 verts) | Prouvés | Bon |
| Nocturne + MangoQA bridge | Stables | Bon |

## 5. Frugalité assumée

9 dépendances npm de prod côté serveur (aucune obsolète), `node:sqlite` natif, zéro service cloud obligatoire. La souveraineté est engagée : 12 agents sur Ollama, projets récents à 0 % Claude.

---

# PARTIE II — AUDIT : LES LIMITES ET DETTES

## 1. 🔴 God-files — la dette n°1

| Fichier | Taille | Problème |
|---|---|---|
| `server/src/eleve.ts` | **1 800 lignes / 104 Ko** | Boucle relais + clôture + escalade + câblages de 10 features dans un fichier |
| `server/src/index.ts` | **1 292 lignes / 86 imports** | Bootstrap god-file : 28 routes directes + 86 `registerRoutes()` = **156+ routes** ; impossible de tester une feature isolément |
| `ui/src/components/Knowledge.jsx` | **1 676 lignes** | 30+ useState, 10 éditeurs inline |
| `ui/src/Chat.jsx` | **1 500 lignes** | SSE + fichiers + attachments + modes dans un composant |
| `ui/src/App.jsx` | 30+ useState, 50+ props drillées | Prop drilling massif |

## 2. 🔴 164 variables d'environnement sans schéma

Chaque module relit `process.env` en direct (311 références). Aucune validation, aucun typage, aucune doc centrale. C'est la **complexité cachée principale** du système : chaque feature a ajouté son gate, personne ne peut plus énumérer l'état d'une instance.

## 3. 🔴 Patterns réinventés 3 à 5 fois

- **3 disjoncteurs** (cron-breaker, antispiral, gate) — même question « quand s'arrêter ? », 3 implémentations
- **4 juges** (intention, goût, diff, design-coach) — 4 cerveaux, 4 parseurs, 4 formats de verdict
- **4 boucles spéculatives** (speculative, vision, design-coach, autoforge) — même patron guess→execute→judge
- **5 stores** (specialist-agents, skills, open-gaps, blackboard, cron-tasks) — 5 persistances ad-hoc

## 4. 🔴 158 tests… sans runner ni CI

`npm test` n'existe pas. Les tests se lancent un par un à la main (`npx tsx test-x.ts`). Aucune CI. **C'est le risque bloquant de toute refonte** : sans filet automatisé, on ne peut pas refactorer en confiance.

## 5. 🔴 L'écart fondation ↔ réalité sur les « standards à la périphérie »

| Promesse fondation | Réalité code | Écart |
|---|---|---|
| LiteLLM (100+ providers) | Absent (routeur maison `llm-engine.ts`, LiteLLM = un provider optionnel) | 🟡 le routeur maison marche, mais c'est du custom à maintenir |
| MCP (standard Anthropic) | `kernel-mcp.ts` = implémentation MAISON, pas `@modelcontextprotocol/sdk` | 🔴 zéro interop réelle avec l'écosystème MCP |
| OpenTelemetry | `kernel-trace.ts` maison, **zéro export OTel** ; traces en mémoire → crash = tout perdu | 🔴 absent (L42) |
| SQLite-vec (ANN) | Cosinus JS O(N) sur colonne JSON | 🟡 tiendra jusqu'à ~10K artefacts |
| A2A (Google) | Dispatch multi-cerveaux interne, pas de protocole A2A | 🔴 absent (L39) |

Le principe fondateur « standards à la périphérie, custom au cœur » s'est **inversé en pratique** : le cœur custom est excellent, mais la périphérie aussi est devenue custom.

## 6. 🔴 Cécité financière et observabilité incomplète

- **Le coût GLM/Ollama Cloud n'est tracé nulle part** (L7/L40) : les métriques comptent l'Élève à $0 alors que le cloud GLM facture. Les 182,87 $ mesurés sous-estiment la réalité.
- Traces en mémoire seulement, spans perdus au crash (L42).
- Souveraineté historique encore minoritaire : Claude 1 182 tours résolus vs Élève 134 (l'inversion est récente : projets post-bascule à 0 % Claude — à confirmer par l'OBS).

## 7. 🟡 UI : fonctionnelle mais en retard sur le serveur

- **Zéro TypeScript** (100 % JSX), zéro aria/rôle (accessibilité), 181 `fetch` bruts sans client API centralisé, 11 tests seulement.
- 2 fenêtres stub jamais construites (IMAGE_CREATOR, MUSIC_CREATOR) — promesses fondation (agents Image/Music/Office) non tenues.
- Points forts à garder : design tokens cohérents, nav.js centralisé, lazy-loading, hooks customs propres, `apps/command-center` = modèle TypeScript à répliquer.

## 8. 🟡 Hygiène du repo

- **18 scripts jetables versionnés dans `src/`** (`run-*.ts`, `_prove-*.ts`) — ~5K lignes de code mort.
- `historique.md` = 926 Ko (à archiver par période), `statut.md` = 512 Ko.
- `specialist-agents.json` (58 Ko) : état runtime versionné — source de conflits de merge avec la session maison.
- Clé API en clair dans `server/.env` (non versionné ✅, mais à faire tourner par hygiène).
- État in-process non persisté (plans Élève, usage artefacts, sessions) → perdu à chaque redémarrage.
- Chemins Windows en dur (`D:\IA\...`), mono-machine.

## 9. Les 26 limites encore ouvertes (dont 4 bloquantes)

Bloquantes pour le 2.0 : **L37** (portages hors `query()` Claude : compaction/review/Lab), **L38** (validation réelle du moteur local tool-capable), **L39** (A2A), **L40** (coût cloud GLM non tracé). Le reste : voir `limites.md`.

---

# PARTIE III — LE PLAN MANGOOS 2.0

## Philosophie de la refonte

**Pas de big-bang.** Les deux audits de code convergent : le cœur (eleve-runtime, stratège, hooks, vault, blackboard) est sain et prouvé — le réécrire serait détruire de la valeur. La méthode : **strangler fig** — on construit le socle 2.0 autour du cœur existant, on migre sous-système par sous-système, chaque étape verte avant la suivante. C'est exactement la discipline (gates + zéro régression + preuve live) déjà pratiquée.

**Trois axes stratégiques :**
1. **Consolider** — payer la dette (god-files, config, duplication, CI) pour que le système redevienne simple à faire évoluer.
2. **Tenir la promesse « standards »** — MCP réel, OTel réel, vec réel : MangoOS devient interopérable avec l'écosystème agentique 2026 au lieu d'être une île.
3. **Souveraineté majoritaire mesurée** — coût réel tracé, escalade Claude < 10 %, dashboard de souveraineté.

---

## Phase 0 — Filet de sécurité & mesure (prérequis absolu, ~1 semaine)

> Règle : AUCUNE refonte ne commence avant la fin de la Phase 0.

| # | Action | Pourquoi |
|---|---|---|
| 0.1 | **Runner de tests unique** : `npm test` qui exécute les 158 `test-*.ts` (glob + tsx, ou migration légère vers node:test/vitest) + rapport agrégé | Le filet sans lequel toute refonte est aveugle |
| 0.2 | **CI GitHub Actions** : tsc + npm test + build UI sur chaque push | Protège aussi la session auto de la maison |
| 0.3 | **Tracer le coût GLM cloud (L40/L7)** : lire les headers d'usage OpenAI-compat → tarifer dans `recordTurnMetrics` | On ne peut pas optimiser ce qu'on ne mesure pas ; toute décision 2.0 dépend de ce chiffre |
| 0.4 | **Archiver le code jetable** : `run-*.ts` + `_prove-*.ts` → `server/scripts/` (hors `src/`) | -5K lignes de bruit |
| 0.5 | **Faire tourner la clé Ollama** + sortir `specialist-agents.json` du versioning (état runtime) | Hygiène |
| 0.6 | **Baseline chiffrée** : figer les métriques actuelles (coût/tour, temps de boot, tours/app, taux d'escalade) | Pour prouver que le 2.0 fait mieux |

## Phase 1 — Le socle : config, noyau, primitives (~2-3 semaines)

### 1.1 Configuration centralisée (tue les 164 flags)
- `server/src/config.ts` : **schéma Zod unique** validé au boot, typé, documenté par champ.
- Regrouper en **profils** : `dev` / `observation` / `production` — un gate devient un champ de profil, plus une env var éparse.
- Route `GET /api/config` + panneau UI : l'état complet d'une instance devient enfin énumérable.
- Objectif chiffré : **164 flags → ~40 champs structurés**.

### 1.2 Démanteler les god-files
- `index.ts` → `boot/` (bootstrap, DI léger par constructeur — pas besoin de framework) + `features/*/routes.ts`. Chaque feature = module chargeable/testable seul.
- `eleve.ts` → `relay/` : orchestration (boucle) · clôture (gardien/parcours/QA) · escalade (Maître) · câblage features. Cible : aucun fichier > 500 lignes.

### 1.3 Les 4 primitives unifiées (tue la duplication)
```
core/primitives/
├── breaker.ts   Breaker<Config, State, Decision>   ← cron-breaker, antispiral, gate
├── judge.ts     Judge<Input, Verdict>              ← intention, goût, design, diff
├── store.ts     Store<T> (backend FS | SQLite)     ← specialists, skills, gaps, cron
└── speculative.ts SpeculativeMachine<Draft,Outcome> ← speculative, vision, coach, forge
```
Les gardiens de clôture s'expriment ensuite comme **hooks `PreFinish`** (le dispatcher #172 existe déjà) : une seule mécanique de garde dans tout l'OS.

### 1.4 Persistance de l'état vivant
- Plans Élève, usage artefacts, sessions : in-process → SQLite (le Blackboard est déjà là).
- Un crash/redémarrage ne perd plus rien.

## Phase 2 — Standards frontière : tenir la promesse fondation (~2-3 semaines)

### 2.1 MCP réel — le chantier « air du temps » n°1
- Adopter `@modelcontextprotocol/sdk` : `kernel-mcp.ts` devient un adaptateur du vrai standard.
- **MangoOS = serveur MCP** : exposer la mémoire (blackboard, axiomes, skills, procédures) et les outils Élève comme serveur MCP → n'importe quel agent externe (Claude Code, autres) peut utiliser la mémoire de Mango. C'est le geste qui fait de MangoOS un **hub** et plus une île.
- Client MCP réel pour consommer l'écosystème (les serveurs Blender/GIMP/Playwright déjà déclarés dans `mcp-servers.json`).

### 2.2 Observabilité réelle
- Export OpenTelemetry (`@opentelemetry/sdk-node`) : spans persistés, MangoQA lit un standard, crash ≠ perte (L42).
- **Dashboard de souveraineté v2** : coût Claude + coût GLM cloud (Phase 0.3) + $0 local, par projet et par jour. La métrique-mère du projet.

### 2.3 Mémoire sémantique à l'échelle
- Brancher **sqlite-vec** (déjà prévu dans `kernel-blackboard-sqlite.ts`) : recherche ANN au lieu du cosinus O(N) — prêt pour 10 ans d'artefacts.

### 2.4 Alignement sur les patterns agents 2026
- Skills : converger vers le format **Agent Skills** (SKILL.md + frontmatter — déjà quasi identique) → les skills de Mango deviennent portables.
- Hooks/subagents : déjà alignés sur les patterns Claude Code — documenter la correspondance.
- **A2A (L39) : arbitrage honnête** — ne l'implémenter que si un vrai second nœud arrive (mobile/robot). D'ici là, MCP couvre l'interop. À inscrire comme décision, pas comme dette.

## Phase 3 — UI 2.0 (~3-4 semaines, parallélisable avec Phase 2)

| # | Action | Modèle |
|---|---|---|
| 3.1 | **Migration TypeScript** progressive (command-center = référence) : nouveaux fichiers en .tsx, gros composants convertis à la découpe | strict |
| 3.2 | **Découper les monolithes** : Chat.jsx → 6 composants · Knowledge.jsx → 8 · Home.jsx → 3 | < 300 lignes/fichier |
| 3.3 | **Store centralisé (Zustand)** : remplace les 30 useState d'App.jsx + le prop drilling | -300 lignes |
| 3.4 | **Client API unique** (`api/client.ts`) : timeout, retry, erreurs uniformes — remplace 181 fetch bruts | |
| 3.5 | **Accessibilité WCAG AA** : l'OS qui audite le WCAG des apps générées doit l'appliquer à lui-même | cohérence |
| 3.6 | **Trancher les stubs** : IMAGE_CREATOR (le backend Flux existe ! il manque juste la fenêtre) → construire ; MUSIC_CREATOR → retirer ou dater | honnêteté |

## Phase 4 — Souveraineté majoritaire & intelligence (~4+ semaines, après OBS)

1. **#165 Souveraineté MangoQA** : sortir du `claude-agent-sdk`, router vers Ollama — la dernière grosse dépendance Claude.
2. **L38** : valider un moteur local tool-capable en réel (le transport est prêt).
3. **L37** : porter compaction/review/Lab hors `query()` Claude.
4. **Allumer les gates un par un** (CRON_AGENTIC, ELEVE_DELEGATE_AGENTIC, SPECULATIVE...) selon ce que l'OBS révèle — le 2.0 hérite d'un système où tout ce qui a été construit gaté tourne enfin.
5. **Multimodal** (tirer la trajectoire 2029 vers 2026-27) : voix locale (Whisper + TTS) en entrée/sortie du chat — le geste « OS personnel » le plus visible pour un coût modéré, les briques locales existent.

## Ce qu'on NE fait PAS (décisions anti-dispersion)

- ❌ Réécrire eleve-runtime, stratège, hooks, vault, blackboard — ils sont bons.
- ❌ LiteLLM en dépendance obligatoire — le routeur maison couvre 7 providers et marche ; on garde LiteLLM comme provider optionnel.
- ❌ A2A tant qu'il n'y a qu'un nœud.
- ❌ Microservices/queues/Redis — un process Node + SQLite est LA bonne architecture pour un OS personnel mono-utilisateur.
- ❌ Geler les features pendant 3 mois — chaque phase livre du visible, la génération d'apps ne s'arrête jamais.

## Séquencement et critères de sortie

```
Phase 0 (1 sem)  → npm test vert en CI · coût GLM visible · baseline figée
Phase 1 (2-3 sem)→ config.ts unique · aucun fichier >500 lignes au cœur · 4 primitives · état persisté
Phase 2 (2-3 sem)→ MangoOS serveur+client MCP réel · OTel exporté · sqlite-vec · dashboard souveraineté
Phase 3 (3-4 sem)→ UI TS >50% · monolithes découpés · client API · WCAG AA
Phase 4 (4+ sem) → escalade Claude <10% mesurée · MangoQA souverain · gates ON · voix (option)
```
Total : **~3 mois** en travaillant par tranches, sans jamais casser le vert. Chaque phase suit la discipline existante : gaté OFF → tests → preuve live → ON.

## Les 5 chiffres qui diront que le 2.0 est réussi

| Métrique | 1.0 (aujourd'hui) | Cible 2.0 |
|---|---|---|
| Flags d'env non typés | 164 | ~40 champs validés Zod |
| Plus gros fichier du cœur | 1 800 lignes | < 500 |
| Tests en CI | 0 (158 orphelins) | 158+ verts à chaque push |
| Coût réel/app (Claude + cloud GLM) | inconnu (cécité GLM) | mesuré, en baisse |
| Taux de résolution souverain (sans Claude) | ~8 % historique / ~100 % récent non confirmé | > 90 % confirmé sur 30 jours |

---

*Audit et plan rédigés le 2026-07-02. Sources : rapports d'exploration multi-agents sur le code réel + `fondation.md` + `limites.md` + `audit-general-2026-06.md`. Zéro git (en attente de Raf).*
