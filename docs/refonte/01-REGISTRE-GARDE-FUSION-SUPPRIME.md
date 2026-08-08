# Refonte Mango — 01 · Registre de traçabilité : gardé / fusionné / masqué / supprimé

> **C'est le fichier-trace demandé.** Rien ne disparaît sans une ligne ici.
> Établi le 2026-08-04. Statut : **proposition d'expert, en attente d'arbitrage de Raf.**
> Aucune ligne n'a encore été exécutée sur le code.

## Conventions de verdict

| Verdict | Signification | Réversible ? |
|---|---|---|
| 🟢 **GARDE** | Fait partie du produit livrable. Sort de l'ombre, est assumé, testé, documenté côté client. | — |
| 🔵 **FUSIONNE** | Le besoin est réel mais résolu ailleurs. Le code est absorbé dans un module cible unique. | oui (git) |
| 🟡 **MASQUE** | Le code reste, la **surface utilisateur** disparaît. Devient interne, appelable par l'orchestrateur, jamais par un menu. | oui, immédiat |
| ⚪ **ARCHIVE** | Sort du produit. Le code part sur une branche `archive/<nom>` + une ligne ici. Ne s'exécute plus. | oui (branche) |
| 🔴 **SUPPRIME** | Mort confirmé (jamais importé, registre vide, doublon strict). Retiré. | oui (git) |

**Règle absolue de la refonte : rien n'est supprimé sans être d'abord archivé sur une branche
nommée, et sans une ligne dans ce registre indiquant _pourquoi_ et _ce qui le remplace_.**

---

## A. Le socle — 🟢 GARDE intégralement

| Module / dossier | Rôle | Pourquoi il reste |
|---|---|---|
| `brain/brain-dispatch.ts` | routage rôle → cerveau | **Pièce maîtresse.** Devient le point de passage unique de tout appel LLM du produit. |
| `brain/brain-registry.ts` | 16 rôles + fallback + `localOnly` | Devient le registre des **équipes** (voir doc 03). Rôles réduits de 16 → 8. |
| `brain/brain-runtime.ts` | résolution à chaud | Permet de changer de cerveau sans redémarrer. Argument de vente. |
| `llm/` (4 modules) | transport, endpoints, cache | Multi-provider maison. Solide. |
| `eleve/` (11 modules) | boucle agentique, relais, escalade | Le moteur d'exécution. |
| `agent/agent-contract.ts` | contrat Mango, anti-injection, timeout | Sécurité. Non négociable. |
| `eleve-gate*.ts` (6 fichiers) | Gardien de clôture | **Différenciateur produit n°1.** Devient l'équipe Vérification. |
| `MangoQA` (repo entier) | auditeur indépendant | **Différenciateur produit n°2.** Livrable tel quel. |
| `safe-io.ts`, `perimeter*.ts`, `secret-vault*.ts` | I/O sûres, périmètre, coffres | Sécurité. |
| `watchdog*.ts`, `backend-heartbeat.ts`, `turn-ledger.ts` | résilience process | Éprouvés sur de vrais crashs. |
| `flags.ts` | registre de gates | Reste, mais **passe de 31 flags à ≤ 8** (voir section G). |
| `limites.md`, `fondation.md`, `historique.md`, `wiki/` | documentation | Patrimoine. Intouchable. |

---

## B. Mémoire — 🔵 FUSIONNE 17 modules → **1 module, 4 étages**

Cible : `memory/` (voir doc 05 pour la conception). Un seul point de lecture : `recall(scope, query, budget)`.

| Module actuel | Verdict | Absorbé dans |
|---|---|---|
| `axioms.ts` (480 l.) | 🔵 | étage **Identité** |
| `axioms-validation.ts` (332 l.) | 🔵 | étage Identité (dédup à l'écriture) |
| `axioms-drift.ts` (192 l.) | ⚪ ARCHIVE | détection de dérive : bonne idée, jamais activée (`AXIOMS_DRIFT=off`). À rouvrir plus tard. |
| `preferences.ts` (124 l.) | 🔵 | étage **Identité** |
| `identity.ts` (126 l.) | 🔵 | étage **Identité** |
| `self-knowledge.ts` (49 l.) | 🔵 | étage Identité |
| `references.ts` (178 l.) | 🔵 | étage **Goût** |
| `lexique.ts` (236 l.) | 🔵 | étage **Savoir** |
| `procedures.ts` (247 l.) | 🔵 | étage **Savoir** |
| `skills.ts` (213 l.) | 🔵 | → catalogue de compétences (doc 02), plus un magasin mémoire |
| `working-memory.ts` (83 l.) | 🔵 | étage **Projet** |
| `memory.ts` (58 l.) | 🔵 | remplacé par l'API unique |
| `memory-manifest.ts` (117 l.) | 🔵 | versioning de schéma → interne au nouveau module |
| `eleve-memoire.ts` (130 l.) | 🔵 | rappel sémantique → devient le **comportement par défaut**, plus un flag |
| `compaction.ts` + `eleve-compaction.ts` (263 l.) | 🔵 | un seul compacteur |
| `notes-rag.ts` (308 l.) | 🔵 | étage **Savoir** (le moteur RAG y est bon — c'est lui qu'on garde) |
| `kernel/kernel-blackboard*.ts` (×4, 636 l.) | 🔵 | **substrat unique** : SQLite. Les autres stockages deviennent des exports. |
| `concept-registry.ts` + `concept-consolidation.ts` (464 l.) | 🟡 MASQUE | vérification de sens : utile, mais interne — jamais une UI. |
| `savoir/` (×4, 2 122 l.) | ⚠️ **DÉCISION RAF** | Sous-système à moitié construit (runner d'ingestion absent). Soit on finit (2 modules à écrire), soit ⚪ ARCHIVE. **Ne peut pas rester dans cet état.** |

**Bilan : 17 modules / ~5 700 lignes → 1 module `memory/` estimé ~1 200 lignes + 1 base SQLite.**

---

## C. Agents & équipes — 🔵 FUSIONNE 6 concepts → **1 concept : l'Équipe**

| Actuel | Verdict | Devient |
|---|---|---|
| `brain-registry` — 16 rôles | 🔵 | **8 rôles**, un par équipe (doc 03) |
| `specialist/specialist-agents.ts` + les 11 spécialistes forgés | 🔵 | **membres** d'une équipe, jamais un concept de premier niveau |
| `agent/agent-factory.ts` + `AgentFactory.jsx` + `/api/agents/*` | 🟡 MASQUE | Registre **vide** (`agents-registry.json = []`). La Forge reste, en interne, pilotée par les lacunes — sans UI dédiée. |
| `super-agent-builder.ts` (467 l.) + `/api/super-agent/*` | ⚪ ARCHIVE | Troisième couche d'agents au-dessus de deux qui existent déjà. Doublon conceptuel net. |
| `council-skills-routes.ts` (150 l.) | ⚪ ARCHIVE | Quatrième couche. Même raison. |
| `eleve-delegate` / `specialist-delegate` | 🔵 | mécanisme de délégation → **c'est l'allumage d'une équipe** |
| `self/self-evolution*.ts` (×3) | 🟡 MASQUE | La forge auto sur détection de lacune est une vraie force, mais c'est un **comportement**, pas un menu. Reste, sans surface. |
| `forge-agents.ts`, `agent/agent-scheduler.ts` | 🔴 SUPPRIME | Jamais importés. |
| `esthete-agent.ts` + `esthete-routes.ts` + `EstheteChat.jsx` | 🔵 | absorbé dans l'équipe **Design** (l'Esthète est déjà un spécialiste forgé — doublon avec lui-même) |

---

## D. Design & goût — 🔵 FUSIONNE 9 points d'entrée → **1 équipe Design + 1 mémoire Goût**

| Actuel | Verdict | Justification |
|---|---|---|
| `taste/` (14 modules) | 🔵 | Le **moteur de goût** (comparaison relative, ancres, directions) est bon → devient le cœur de l'équipe Design. Les 14 modules se réduisent à ~4. |
| `taste-nocturnal.ts`, `taste-queue.ts` | 🟡 MASQUE | Boucle d'apprentissage du goût : garde le mécanisme, retire la file d'attente visible. |
| `design/` (5 modules) | 🔵 | fusionne avec `taste/` |
| `design-loop.ts` + toggle rail | 🔵 | devient un **cran du curseur qualité** (« Soigné » ⇒ loop design activée), plus une bascule |
| `wireframe-fork.ts` + `ideation.ts` | 🔵 | les 2 sont déjà censés être fusionnés (#196 A) → **une seule étape : « 3 directions, tu choisis »** |
| `perfect-plan.ts` (481 l.) | 🔵 | fusionne avec l'étape ci-dessus → **un seul cadrage avant build** |
| `layout-balance.ts` | 🔵 | compétence de l'équipe Design |
| Modes `uxui` / `layout` du dropdown | 🔴 SUPPRIME (du menu) | Ce sont des **membres de l'équipe Design**, pas des modes utilisateur. |
| Œil Design (MangoQA visage 3) | 🟢 GARDE | Reste côté auditeur — c'est sa place. |

---

## E. Vérification — 🔵 FUSIONNE 9 mécanismes → **2 : le Gardien (interne) + MangoQA (externe)**

| Actuel | Verdict | Justification |
|---|---|---|
| `eleve-gate*` (6 fichiers) | 🟢 GARDE | Devient l'équipe **Vérification**. Tous les volets passent **ON par défaut** (aujourd'hui 3/6 seulement). |
| MangoQA (6 branches) | 🟢 GARDE | Auditeur indépendant. Inchangé. |
| `build-review.ts` + `BuildReview.jsx` | 🔵 | fusionne dans le rapport de fin de tour du Gardien |
| `design-review.ts` | 🔵 | → équipe Design |
| `audit-scan.ts`, `audit-verify.ts`, `audit-tasks.ts` | ⚪ ARCHIVE | `audit-scan` jamais importé. Outils de dev interne, pas du produit. |
| `integrity-audit.ts` + `integrity-log.ts` + `/api/integrity/*` | 🟡 MASQUE | Vérificateur d'intégrité des stores : **précieux**, mais devient un check de démarrage silencieux, pas une route ni une UI. |
| `patrol.ts` | 🟡 MASQUE | idem |
| `regression/` (4 modules) | 🟡 MASQUE | Outillage de qualité interne. Sort du produit livrable, reste dans le repo. |
| `render-integrity.ts` | 🔴 SUPPRIME | Jamais importé. |
| `verificateur-contexte.ts` + `chaine-ambigue.ts` | 🟢 GARDE | Vérification de sens en amont : c'est ce qui évite de partir dans le mauvais sens. **ON par défaut.** |

---

## F. Planification — 🔵 FUSIONNE 8 mécanismes → **1 : le Plan**

| Actuel | Verdict |
|---|---|
| `perfect-plan.ts` | 🔵 → **Le Plan** (étape unique de cadrage) |
| `ideation.ts` | 🔵 → Le Plan |
| `project-plan.ts` | 🔵 → Le Plan |
| `eleve-plan.ts` | 🔵 → Le Plan (partie exécution) |
| `plan.ts` | 🔵 → Le Plan |
| `grand-chantier.ts` (327 l.) | ⚪ ARCHIVE | Jamais importé. Le mode « Gros Projet » disparaît du menu. |
| `project-backlog.ts` + `ProjectKanban.jsx` | 🟡 MASQUE | Le Kanban n'apparaît que **si** le plan compte > 5 étapes. Plus un mode à choisir. |
| `blueprints.ts`, `tonight-specs.ts`, `mango-nuit-specs.ts` | ⚪ ARCHIVE | Specs de runs nocturnes ponctuels. |

---

## G. Flags — 🔵 31 → **≤ 8**

Principe : **un flag est soit ON et fait partie du produit, soit il n'existe pas.**

| Flag | Verdict |
|---|---|
| `ELEVE_CLOSURE_GATE`, `ELEVE_GATE_IMAGES`, `ELEVE_GATE_CONSTANTS`, `ELEVE_GATE_CONTENT`, `ELEVE_GATE_PEDAGO` | 🔵 → **ON en dur**, plus de flag. Le Gardien vérifie toujours. |
| `ELEVE_CONTEXT_LOOP`, `ELEVE_CONTEXT_CHAINE` | 🔵 → ON en dur |
| `ELEVE_MEMOIRE`, `ELEVE_ETAT`, `ELEVE_RESUME`, `ELEVE_PLAN_V2`, `ELEVE_REFLEXION` | 🔵 → ON en dur (c'est le comportement attendu d'un agent en 2026) |
| `BRAIN_FALLBACK` | 🔵 → ON en dur |
| `TEMPORAL_AWARENESS` | 🔵 → ON en dur |
| `AXIOMS_ROTATE`, `AXIOMS_DRIFT`, `AXIOMS_VALIDATION`, `MEMORY_MANIFEST`, `BLACKBOARD_TTL` | 🔵 → détails d'implémentation du module mémoire. Plus des flags. |
| `BRAIN_LOCAL_ONLY` | 🟢 **GARDE comme flag** — c'est un **réglage client** (« mode souverain »), pas un gate de dev. |
| `MANGOQA_STOP_AUTHORITY` | 🟢 GARDE comme flag client (« MangoQA peut-il arrêter la production ? ») |
| `DESKTOP_PERIMETER`, `DESKTOP_SYSTEM_SHELL` | 🟢 GARDE comme flags client (**sécurité** — doivent rester des décisions explicites) |
| `NOCTURNAL_*`, `STRATEGE_*`, `FORMATION_TUTEUR`, `SAVOIR_*`, `AB_HARNESS`, `DRY_RUN`, `BRAIN_ENSEMBLE`, `INTENT_ROUTER_LLM`, `FRONTIER_TOOLS_ANY_BRAIN`, `LLM_SEMANTIC_CACHE`, `CODE_SECTION` | ⚪ ARCHIVE ou 🟡 MASQUE selon décision Raf sur la couche autonome (voir H) |

**Cible : 8 flags maximum, tous des réglages CLIENT, aucun gate de développement.**

---

## H. La couche autonome — ⚠️ **la vraie décision produit**

Ce bloc représente à lui seul plusieurs milliers de lignes d'ingénierie de haut niveau,
**invisible dans l'UI et éteinte dans le `.env`** :

| Sous-système | Lignes | État réel |
|---|---|---|
| `nocturnal.ts` + `nocturnal-budget.ts` | 1 059 | boucle nocturne — s'exécute, mais rien ne la montre |
| `train-loop.ts` | 414 | apprentissage nocturne |
| `stratege/` (13 modules) | ~1 800 | `STRATEGE_GLOBAL=off` → **jamais exécuté** |
| `prompt-evolution.ts` | 372 | `off` |
| `self/` (4 modules) | ~600 | `SELF_EVOLVE=on` ✅ (le seul allumé) |
| `veille.ts` + `radar.ts` | 387 | veille IA — utile ? |
| `cron-scheduler.ts` + `cron-breaker.ts` | 382 | planificateur |
| `auto-ablation.ts` | 125 | + UI dédiée |
| `reverse-learn.ts` | 157 | jamais importé |

> **Trois options, à trancher (question posée à Raf) :**
> **(1) On l'assume** — elle devient une promesse produit visible : *un seul écran* « Ce que
> Mango a appris cette nuit », tout le reste masqué. Les flags passent ON.
> **(2) On la masque** — elle tourne, mais aucune surface. Le client ne sait pas qu'elle existe.
> **(3) On l'archive** — hors produit v3, réintégrée plus tard si la demande client apparaît.
>
> **Recommandation : (1), mais réduite à `self-evolution` + `nocturnal` uniquement.**
> Le Stratège global, prompt-evolution, auto-ablation, reverse-learn et le train-loop sont
> ⚪ ARCHIVE : jamais exécutés, jamais vus, coût de maintenance non nul.

---

## I. Surfaces UI — 15 outils du rail → **4**

| Outil du rail | Verdict | Devient |
|---|---|---|
| Mémoire | 🟢 GARDE | **1 des 4** — vue de ce que Mango sait sur ce projet |
| Versions | 🟢 GARDE | **1 des 4** |
| Backend | 🟢 GARDE | **1 des 4** (apparaît seulement si le projet a un backend) |
| Exporter (zip) | 🟢 GARDE | **1 des 4** |
| Revue du build | 🔵 | → rapport automatique de fin de tour, dans le chat |
| Perfect Plan | 🔵 | → Le Plan, dans le chat |
| Dosage de style | 🔵 | → réglage projet, dans « Avancé » |
| Multi-Projet | 🟡 MASQUE | comportement auto quand ≥ 2 projets partagent des composants |
| Loop Design | 🔵 | → cran « Soigné » du curseur qualité |
| Diagrammes | 🔵 | → produit automatiquement, affiché dans le chat |
| Chantier (Kanban) | 🟡 MASQUE | apparaît si plan > 5 étapes |
| MangoQA | 🔵 | → **bandeau de statut permanent**, pas un bouton |
| Mode Miroir | ⚪ ARCHIVE | |
| Mode Client | 🔵 | → devient un **profil de projet** au moment de la création |
| Afficher/masquer la réflexion | 🔵 | → réglage global, pas par projet |
| GitHub | 🟢 GARDE | mais dans le menu « Publier » avec Cloudflare/Vercel/Netlify |

**Fenêtres flottantes : 9 → 2.** Gardées : `projects`, `taste` (galerie).
⚪ ARCHIVE : `suite`, `ideation`, `docs`, `multi`, `agent-factory`, `image-creator`, `music-creator`
— chacune est une *application* dans un produit qui n'a pas encore fini d'être *un* produit.

**Écrans : 6 → 3.** Gardés : Accueil, Atelier, Réglages.
🔵 Contrôleur → bandeau MangoQA · 🟡 Métriques → une page dans Réglages ·
⚠️ Code (`CODE_SECTION=off`, jamais activé) → décision Raf.

**Composants orphelins : 🔴 SUPPRIME** `EstheteChat.jsx`, `ObserverConseil.jsx`, `StrategeGlobal.jsx`.

---

## J. Routes API — 214 → **~40**

Règle : une route existe si **une surface du produit l'appelle**. Toute route de diagnostic
devient un sous-chemin unique `/api/_debug/*`, non documenté, désactivable.

Familles supprimées ou fusionnées : `/api/ab/*`, `/api/ablation/*`, `/api/super-agent/*`,
`/api/council/*`, `/api/prompt-evolution/*`, `/api/stratege/*`, `/api/formation/*`,
`/api/veille`, `/api/radar`, `/api/constellations`, `/api/tokenize`, `/api/inspect`,
`/api/sovereignty`, `/api/curation/*`, `/api/reuse/*`, `/api/regression/*`, `/api/integrity/*`,
`/api/suite/*`, `/api/billing/*` (⚠️ sauf si le produit est vendu — décision Raf).

---

## K. Récapitulatif chiffré de la cible

| | Aujourd'hui | Cible v3 | Δ |
|---|---|---|---|
| Modules backend | 346 | ~120 | **−65 %** |
| Routes API | 214 | ~40 | **−81 %** |
| Variables d'env lues | 252 | ~35 | **−86 %** |
| Flags | 31 | ≤ 8 | **−74 %** |
| Écrans | 6 | 3 | −50 % |
| Fenêtres flottantes | 9 | 2 | −78 % |
| Modes de build | 8 | **1 curseur, 3 crans** | — |
| Outils du rail | 15 | 4 | −73 % |
| Rôles de cerveau | 16 | 8 | −50 % |
| Concepts d'agent | 6 | **1 (l'Équipe)** | −83 % |
| Modules mémoire | 17 | 1 | −94 % |

> **Aucune capacité réelle n'est perdue dans ce plan.** Ce qui disparaît, ce sont des
> *surfaces*, des *doublons* et des *options jamais activées*. Les 41 outils de l'Élève, le
> Gardien, MangoQA, le dispatcher et le moteur de goût sont tous conservés — simplement
> **rangés dans 8 équipes au lieu d'être exposés à plat.**
