# Refonte Mango — 00 · État des lieux (audit mesuré)

> Établi le 2026-08-04 par mesure directe sur `C:\Users\Raf\Desktop\mangoai` (HEAD `054c9de`)
> et `C:\Users\Raf\Desktop\MangoQA`, avec vérification des flags réellement actifs dans
> `D:\IA\MangoOS\server\.env` (la copie vivante).
>
> **Tout chiffre de ce document est mesuré, pas estimé.** Les jugements sont marqués
> « **Lecture** » et sont, eux, une opinion d'expert — discutables.

---

## 1. Le volume

### MangoOS

| Mesure | Valeur |
|---|---|
| Modules TypeScript de production (`server/src`) | **346** (193 à la racine + 153 dans 19 sous-dossiers) |
| Lignes à la racine de `server/src` seule | **36 575** |
| Fichiers de tests | **246** |
| Routes HTTP exposées | **214** |
| Variables d'environnement **lues dans le code** | **252** |
| Variables réellement **définies** dans le `.env` vivant | **58** |
| Flags centralisés (`flags.ts`) | **31** |
| … dont ON par défaut | **2** |
| … dont ON dans le `.env` vivant | **5** |
| Composants UI (`ui/src/components`) | **61 fichiers · 9 493 lignes** |
| Écrans plein-cadre | **6** (Home, Workspace, Contrôleur, Métriques, Réglages, Code) |
| Fenêtres flottantes | **9** |
| Modes de construction (dropdown) | **8** |
| Modèles au choix (dropdown) | **4** |
| Outils du rail Workspace | **15** |
| Outils de l'Élève (function-calling) | **41** |
| Rôles du registre de cerveaux | **16** |
| Agents spécialistes forgés | **11** |
| Limites documentées (`limites.md`) | **137** |
| Projets dans `workspace/` | **7** |

### MangoQA

| Mesure | Valeur |
|---|---|
| Modules TypeScript | **34** |
| Lignes totales | **4 361** |
| Branches d'audit | **6** (architecture, sécurité, accessibilité, performance, tests, design-system) |
| Visages | **3** (Disjoncteur, Observateur-Conseil, Œil Design) |

**Rapport de masse : MangoOS ≈ 8 × MangoQA.**

---

## 2. Les quatre constats structurels

### Constat 1 — 78 % des réglages ne sont branchés sur rien

Le code lit **252** variables d'environnement. Le `.env` vivant en définit **58**.
**194 leviers n'ont donc aucune valeur en usage réel** — ils tombent sur leur défaut, et
personne ne sait lequel sans lire le code.

Pire, sur les **31 flags centralisés** de `flags.ts` :

- **2** sont ON par défaut (`TEMPORAL_AWARENESS`, `ELEVE_GATE_IMAGES`, `ELEVE_GATE_CONSTANTS` — 3 en fait)
- **5** de plus sont activés dans le `.env` vivant (`BRAIN_FALLBACK`, `ELEVE_CLOSURE_GATE`,
  `ELEVE_CONTEXT_LOOP`, `ELEVE_CONTEXT_CHAINE`, `HOME_QUICK_MODEL`)
- → **~23 fonctionnalités construites, testées, documentées… et jamais exécutées.**

Concernées : `DRY_RUN`, `AB_HARNESS`, `BRAIN_ENSEMBLE`, `STRATEGE_GLOBAL`, `STRATEGE_PERIODIC`,
`STRATEGE_QUESTION_DEMANDE`, `FORMATION_TUTEUR`, `ELEVE_GATE_PEDAGO`, `SAVOIR_*` (×3),
`NOCTURNAL_QA_BUS`, `NOCTURNAL_BUDGET_HARD`, `MANGOQA_STOP_AUTHORITY`, `DESKTOP_PERIMETER`,
`DESKTOP_SYSTEM_SHELL`, `LLM_SEMANTIC_CACHE`, `INTENT_ROUTER_LLM`, `FRONTIER_TOOLS_ANY_BRAIN`,
`MEMORY_MANIFEST`, `ELEVE_MEMOIRE`, `ELEVE_ETAT`, `ELEVE_RESUME`, `ELEVE_PLAN_V2`,
`ELEVE_REFLEXION`, `AXIOMS_*` (×3), `BLACKBOARD_TTL`, `CODE_SECTION`.

> **Lecture.** Ce n'est pas de la négligence — c'est la conséquence directe d'une règle de
> discipline saine (« un gate ne change jamais le comportement quand il est OFF ») appliquée
> sans jamais de contre-partie : *rien n'oblige jamais à allumer, ni à supprimer*. Le résultat
> est un système qui a **deux fois plus de capacités théoriques que de capacités vécues**.
> Sur un produit client, chaque flag est soit ON et fait partie du produit, soit il n'existe pas.

---

### Constat 2 — La surface de décision imposée à l'utilisateur est ingérable

Avant de taper un seul mot, l'utilisateur choisit :

- **1 modèle parmi 4** (Haiku / Sonnet / Opus / Élève)
- **1 mode parmi 8**
- **jusqu'à 15 bascules** dans le rail projet
- **9 fenêtres** possibles depuis le hamburger

Le dropdown « mode » est le symptôme le plus net. Ses 8 entrées mélangent **quatre axes différents** :

| Mode | Ce que c'est vraiment |
|---|---|
| MVP | un **niveau de qualité** |
| Élite | un **niveau de qualité** |
| Finition | une **phase du cycle** |
| Esthétique | une **phase du cycle** |
| Gros Projet | une **forme de projet** |
| App composable | une **forme de projet** |
| Agent UX/UI | un **agent spécialisé** |
| Agent Layout | un **agent spécialisé** |

> **Lecture.** Aucun utilisateur — même Raf — ne peut choisir correctement dans une liste qui
> mélange qualité, phase, forme et exécutant. Ces 8 entrées doivent devenir **1 curseur**
> (qualité) + **de la déduction automatique** (forme, phase) + **des équipes invisibles** (agents).

---

### Constat 3 — Chaque concept existe 3 à 9 fois

C'est le cœur du problème « ça ne s'imbrique pas ».

| Concept | Nombre d'implémentations concurrentes | Modules concernés |
|---|---|---|
| **Mémoire** | **17 modules · 3 supports de stockage** | `axioms` · `preferences` · `references` · `lexique` · `procedures` · `skills` · `identity` · `self-knowledge` · `memory` · `working-memory` · `memory-manifest` · `eleve-memoire` · `compaction` + `eleve-compaction` · `notes-rag` · `concept-registry` · `kernel-blackboard` (×4 fichiers) · `savoir/` (×4) |
| **Agent** | **6 concepts** | rôles `brain-registry` (16) · `specialist-agents` (11 forgés) · `agent-factory` (registre **vide**) · `super-agent-builder` · `eleve-delegate` · `council-skills` |
| **Design / goût** | **9 points d'entrée** | `taste/` (14 modules) · `design/` (5) · `esthete-agent` · `design-loop` · `wireframe-fork` · `ideation` · `perfect-plan` · `layout-balance` · Œil Design (MangoQA) |
| **Vérification** | **9 mécanismes** | `eleve-gate` (+5 volets) · MangoQA (6 branches) · `build-review` · `design-review` · `audit-scan` + `audit-verify` · `integrity-audit` · `patrol` · `regression/` · `render-integrity` |
| **Planification** | **8 mécanismes** | `perfect-plan` · `ideation` · `project-plan` · `eleve-plan` · `plan.ts` · `grand-chantier` · `project-backlog` · Kanban UI |
| **Observabilité** | **6 tableaux de bord** | `metrics` · `metrics-dashboard` · `metrics-insights` · `trace-dashboard` · `control-board` · `sovereignty-metrics` |

> **Lecture.** Ce n'est pas 6 fois le même code — chaque implémentation résout un cas légèrement
> différent, découvert à un moment donné. Mais du point de vue **produit**, ce sont 6 réponses à
> la même question, dont aucune n'est *la* réponse. C'est exactement ce que tu décris par
> « n'arrivent pas à s'imbriquer ensemble » : il n'y a pas de couche qui arbitre.

---

### Constat 4 — Du code mort et des surfaces orphelines

**Modules jamais importés hors tests (26).** Certains sont des points d'entrée CLI légitimes
(`index.ts`, `watchdog.ts`, `vault-cli.ts`, `test-runner.ts`, `*-specs.ts`) — les autres sont
réellement dormants :

`dry-run.ts` · `reverse-learn.ts` · `savoir/savoir-extraction.ts` · `savoir/savoir-reconcile.ts` ·
`stratege/raf-tom.ts` · `stratege/eleve-workflow.ts` · `grand-chantier.ts` · `compare-eleves.ts` ·
`bench-coque-rigide.ts` · `audit-scan.ts` · `kernel/kernel-curation-priority.ts` ·
`kernel/kernel-blackboard-sqlite.ts` · `render-integrity.ts` · `apply-brain-profile.ts` ·
`cron-breaker.ts` · `forge-agents.ts` · `agent/agent-scheduler.ts` · `regression/chaos-runner.ts` ·
`regression/probe-content-gate.ts`

**Composants UI jamais montés (3) :** `EstheteChat.jsx` · `ObserverConseil.jsx` · `StrategeGlobal.jsx`

**Registre vide :** `data/agents-registry.json` = `[]` — l'Agent Factory a une UI, une route,
un builder… et zéro agent.

**137 limites documentées** dans `limites.md` (195 Ko). C'est une force intellectuelle rare —
mais 137 dettes explicites, c'est aussi le signe qu'on a construit plus vite qu'on n'a refermé.

---

## 3. Ce qui est réellement solide (à ne pas casser)

L'audit n'est pas à charge. Quatre briques sont d'une qualité qui justifie de bâtir **autour**
d'elles plutôt que de repartir de zéro :

1. **`brain/brain-dispatch.ts` (252 lignes).** Excellent. Routage par rôle, contrat injecté,
   anti-injection sur l'entrée externe, rate-limiting par provider avec backoff, timeout dégradé,
   fallback inter-providers avec garde `localOnly` re-vérifiée à chaque saut, et le contrat
   « ne throw jamais ». C'est la pièce la plus mûre du système. **Elle devient le socle de la refonte.**

2. **MangoQA (4 361 lignes).** Petit, cadré, indépendant, contrat I/O figé, fail-open par
   construction, watchdog éprouvé sur de vrais crashs. C'est le seul sous-système qui a une
   **frontière nette**. Il est déjà « livrable ».

3. **Le Gardien de clôture (`eleve-gate*`).** Le seul mécanisme de l'écosystème qui vérifie la
   correspondance *intention → livré* et la cohérence sémantique image/contenu. C'est un
   différenciateur produit réel.

4. **La discipline documentaire.** `limites.md`, `fondation.md` v2 avec ses marqueurs
   RÉEL/PARTIEL/ASPIRATIONNEL, le triptyque statut/historique/wiki. Aucun projet de cette taille
   n'a ça. **À conserver intégralement** — c'est ce qui rend la refonte possible.

---

## 4. Diagnostic en une phrase

> **MangoOS n'est pas trop complexe : il n'a jamais eu de frontière produit.**
> C'est un laboratoire de R&D où chaque expérience a reçu une surface UI permanente et un flag
> permanent, et où rien n'a jamais été retiré. La qualité d'ingénierie est réelle ; ce qui manque
> est un **acte de sélection**.

La refonte n'est donc pas un travail de réécriture — c'est un travail de **découpe**.
Suite : `01-REGISTRE-GARDE-FUSION-SUPPRIME.md`.
