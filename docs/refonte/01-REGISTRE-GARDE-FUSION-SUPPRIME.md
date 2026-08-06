# Refonte Mango — 01 · Registre de traçabilité : gardé / fusionné / masqué / supprimé

> **C'est le fichier-trace demandé.** Rien ne disparaît sans une ligne ici.
> Établi le 2026-08-04. **Statut : ARRÊTÉ le 2026-08-05.** Les quatre points laissés en
> `⚠️ DÉCISION RAF` ont été tranchés — voir `07-PLAN-EXECUTION.md` § 3 pour le motif mesuré
> de chacun et ce qui l'invaliderait. Ce registre est désormais **exécutable**.
>
> **Exécution en cours depuis le 2026-08-05** (lot 1). Toute sortie réellement effectuée est
> datée dans le **§ L — Journal d'exécution**, en fin de document. Les verdicts corrigés en
> cours d'exécution portent la mention *« corrigé le … »* à leur ligne : **huit verdicts de ce
> registre se sont révélés faux à la vérification** (sur ~40 vérifiés, soit 20 %) — ils sont
> conservés barrés, avec le motif.
>
> ⚠️ **Avant d'exécuter une ligne, re-vérifier ses appelants.** Motif de recherche complet —
> guillemets simples **et** doubles, imports statiques **et** dynamiques :
> `(from|import|require)[[:space:]]*\(?[[:space:]]*["'][^"']*<module>(\.js)?["']`.
> Contrôler aussi qu'aucun fichier ne passe pour binaire (grep le sauterait en silence) :
> `for f in server/src/*.ts; do file "$f" | grep -q text || echo "$f"; done`.

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
| `axioms-drift.ts` (192 l.) | 🔵 **FUSIONNE** — *corrigé le 2026-08-05* | ~~ARCHIVE : jamais activée~~ **faux**. Deux modules **gardés** en dépendent : `axioms-validation.ts` importe `cosine`, `formatConflictReport`, `ATOMS_CONFLICTS_FILE_NAME`, `DRIFT_THRESHOLD` ; `axioms.ts` importe `checkAxiomDrift` et `loadExistingAxiomLines`. Le code le disait déjà : *« Exportée pour être RÉUTILISÉE par axioms-validation.ts — une seule implémentation cosinus pour tout le magasin d'axiomes »*. Rejoint `memory/` au lot 4 avec les deux autres modules axiomes. |
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
| `savoir/` (×4, 2 122 l.) | ⚪ **ARCHIVE** — *arrêté le 2026-08-05 (A1)* | Runner d'ingestion absent ; `SAVOIR_*` non définis dans le `.env` vivant → **le chemin outillé n'a jamais tourné** ; `savoir-extraction` et `savoir-reconcile` jamais importés. Le finir demande d'**écrire du neuf** avant que la frontière produit existe — le geste exact qui a produit les 23 fonctionnalités jamais exécutées. Rouvrable : la branche reste intacte.<br><br>⚠️ **Nuance mesurée le 2026-08-05 : le sous-système a servi en ad hoc.** `server/data/savoir/` contient 11 fichiers réels (`savoir.db`, `corpus.json`, 9 transcripts dont 6 sous `eleve-adhoc/`). Ce n'est pas du code mort — c'est du code à moitié construit qui a produit de vraies données.<br>⛔ **`server/data/savoir/` NE PART PAS avec le code.** Ces données ne sont pas suivies par git : une branche d'archive ne les préserverait pas. Elles restent sur disque ou sont copiées hors dépôt **avant** toute opération du lot 1. |

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
| `render-integrity.ts` | 🟢 **GARDE** — *corrigé le 2026-08-05* | ~~Jamais importé~~ **faux**. Chemin de production vivant : `taste/taste-render.ts:260` appelle `capturePreviewWithIntegrity` (`vision.ts`), qui charge `measureIntegrity` par import dynamique. Le critère de l'audit ne voyait ni les imports dynamiques ni les guillemets doubles. L'ancre `data/taste-anchors/floor.png` est une **mesure active**, pas un vestige. |
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
| `tonight-specs.ts`, `mango-nuit-specs.ts` | ⚪ ARCHIVE — *exécuté le 2026-08-05* | Specs de runs nocturnes ponctuels. Zéro importeur, zéro test. |
| `blueprints.ts` | 🟢 **GARDE** — *corrigé le 2026-08-05* | ~~Spec de run nocturne~~ — **erreur de classement par association de nom**. 14 importeurs de production (`agent.ts`, chaîne `eleve/relay-*`, `scenario.ts`, `patrol.ts`, `kernel-reuse.ts`). Porte `BLUEPRINTS_RULES` — le catalogue de stacks injecté dans **chaque** prompt système — et `detectProjectType`/`inferProjectType`. |

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
| `NOCTURNAL_*` | 🔵 → réglages **internes** du sous-système gardé en H. Plus des flags. |
| `STRATEGE_*` | ⚪ ARCHIVE — part avec `stratege/` (H) |
| `SAVOIR_*` | ⚪ ARCHIVE — part avec `savoir/` (A1) |
| `CODE_SECTION` | 🔴 SUPPRIME — l'écran Code sort de la v3 *(arrêté le 2026-08-05, A3)*. Jamais allumé une seule fois. |
| `FORMATION_TUTEUR`, `AB_HARNESS`, `DRY_RUN`, `BRAIN_ENSEMBLE`, `INTENT_ROUTER_LLM`, `FRONTIER_TOOLS_ANY_BRAIN`, `LLM_SEMANTIC_CACHE` | ⚪ ARCHIVE — non définis dans le `.env` vivant, donc jamais exécutés. Un flag jamais allumé n'est pas une capacité, c'est une intention. |

**Cible : 8 flags maximum, tous des réglages CLIENT, aucun gate de développement.**

---

## H. La couche autonome — 🟢 **assumée, mais réduite** *(arrêté le 2026-08-05, A2)*

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

**Verdict arrêté : option (1), réduite à `self/` + `nocturnal`.**

| Sous-système | Verdict | Motif |
|---|---|---|
| `self/` (self-evolution, 4 modules) | 🟢 **GARDE** | Re-mesuré le 2026-08-05 dans le `.env` vivant : `SELF_EVOLVE=on`, `SELF_EVOLVE_AUTO=on`, budget 0,50 $, plafond 24 agents. **Le seul bloc autonome réellement allumé.** Il tourne déjà — il lui manque une surface, pas du code. |
| `nocturnal.ts` + `nocturnal-budget.ts` (1 059 l.) | 🟢 **GARDE** | S'exécute (`NOCTURNAL_JUDGE_PROVIDER=ollama` défini). Rien ne le montre : c'est le défaut à corriger, pas le code. |
| `stratege/` (13 modules, ~1 800 l.) | ⚪ **ARCHIVE** | `STRATEGE_GLOBAL` non défini → **jamais exécuté une seule fois.** |
| `prompt-evolution.ts` (372 l.) | ⚪ **ARCHIVE** | `off`, jamais exécuté. |
| `train-loop.ts` (414 l.) | ⚪ **ARCHIVE** | jamais exécuté. |
| `auto-ablation.ts` (125 l.) + son UI | ⚪ **ARCHIVE** | jamais exécuté ; l'UI dédiée disparaît avec. |
| `reverse-learn.ts` (157 l.) | 🔴 **SUPPRIME** | jamais importé — mort confirmé, pas de branche nécessaire au-delà de l'historique git. |
| `veille.ts` + `radar.ts` (387 l.) | ⚪ **ARCHIVE** | veille IA : aucun usage mesuré. |
| `cron-scheduler.ts` | 🟡 **MASQUE** | reste, il porte `nocturnal`. Aucune surface. |
| `cron-breaker.ts` | 🟢 **GARDE** — *corrigé le 2026-08-05* | ~~jamais importé~~ **faux** : `cron-scheduler.ts` en importe 7 symboles (`cronBreakerConfig`, `canRunCron`, `recordCronRun`, `newCronBreakerState`, `computeNextRunHint`, `extractTouchedFiles`, `CronBreakerState`). Or `cron-scheduler` est **gardé** juste au-dessus. Le supprimer cassait le build. |

**Surface produit : un seul écran, « Ce que Mango a appris cette nuit ».** Pas un onglet par
sous-système. C'est la règle anti-rechute appliquée à la couche autonome.

> **Ce qui invaliderait ce verdict :** une mesure montrant que le Stratège global améliore un
> résultat. Elle n'existe pas — il n'a jamais tourné. Le jour où elle existe, la branche est là.

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
🔴 **SUPPRIME Code** *(arrêté le 2026-08-05, A3)* — `CODE_SECTION` n'est pas défini dans le
`.env` vivant : l'écran n'a **jamais été allumé une seule fois**. Un écran plein-cadre que
personne n'a jamais vu n'est pas une surface produit, c'est une intention. Rouvrable si un
usage le réclame.

**Un quatrième écran s'ajoute** — imposé par le verdict H : **« Ce que Mango a appris cette
nuit »**, seule surface de la couche autonome. Cible réelle : **6 → 4**, dont un nouveau.

**Composants orphelins : 🔴 SUPPRIME** `EstheteChat.jsx`, `ObserverConseil.jsx`, `StrategeGlobal.jsx`.

---

## J. Routes API — 214 → **~40**

Règle : une route existe si **une surface du produit l'appelle**. Toute route de diagnostic
devient un sous-chemin unique `/api/_debug/*`, non documenté, désactivable.

Familles supprimées ou fusionnées : `/api/ab/*`, `/api/ablation/*`, `/api/super-agent/*`,
`/api/council/*`, `/api/prompt-evolution/*`, `/api/stratege/*`, `/api/formation/*`,
`/api/veille`, `/api/radar`, `/api/constellations`, `/api/tokenize`, `/api/inspect`,
`/api/sovereignty`, `/api/curation/*`, `/api/reuse/*`, `/api/regression/*`, `/api/integrity/*`,
`/api/suite/*`, `/api/billing/*`.

> **`/api/billing/*` → ⚪ ARCHIVE** *(arrêté le 2026-08-05, A4)*. MangoOS v3 n'est pas vendu.
> Une famille de routes de facturation dans un produit sans facturation est du poids mort qui
> donne l'illusion d'une capacité. **Ce qui l'invaliderait :** la décision de vendre MangoOS —
> et ce jour-là la facturation se reconçoit avec le modèle économique, pas depuis un vestige.

---

## K. Récapitulatif chiffré de la cible

| | Aujourd'hui | Cible v3 | Δ |
|---|---|---|---|
| Modules backend | 346 | ~120 | **−65 %** |
| Routes API | 214 | ~40 | **−81 %** |
| Variables d'env lues | 252 | ~35 | **−86 %** |
| Flags | 31 | ≤ 8 | **−74 %** |
| Écrans | 6 | **4** (Accueil · Atelier · Réglages · « appris cette nuit ») | −33 % |
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

---

## L. Journal d'exécution

Chaque ligne réellement exécutée sur le code apparaît ici, datée. **Rien ne sort du produit
sans une ligne dans cette section.**

### 2026-08-05 — Lot 1, passe A · 21 fichiers retirés

**Archive :** `archive/pre-refonte-v3` → `054c9de` (référence unique, posée **avant** toute
suppression ; aucun `checkout`, aucun `commit`, aucun `push` — la copie de travail n'a pas
été touchée). Tout fichier retiré ci-dessous est récupérable par
`git show archive/pre-refonte-v3:<chemin>`.

| Retiré | Type | Pourquoi | Remplacé par |
|---|---|---|---|
| `forge-agents.ts` | module | jamais importé (§ C) | la Forge interne, pilotée par les lacunes |
| `agent/agent-scheduler.ts` | module | jamais importé (§ C) | — |
| `reverse-learn.ts` | module | jamais importé (§ H) | — |
| `audit-scan.ts` | module | jamais importé (§ E) | le Gardien + MangoQA |
| `apply-brain-profile.ts` | module | jamais importé | `brain-runtime` (résolution à chaud) |
| `compare-eleves.ts` | module | jamais importé | — |
| `bench-coque-rigide.ts` | module | jamais importé | — |
| `stratege/raf-tom.ts` | module | jamais importé | — |
| `stratege/eleve-workflow.ts` | module | jamais importé | — |
| `regression/chaos-runner.ts` | module | jamais importé (§ E, outillage de dev) | — |
| `regression/probe-content-gate.ts` | module | jamais importé (§ E, outillage de dev) | — |
| `grand-chantier.ts` | module | jamais importé (§ F) — le mode « Gros Projet » disparaît | **Le Plan** (étape unique de cadrage) |
| `test-agent-scheduler` · `test-reverse-learn` · `test-brain-profile` · `test-raf-tom` · `test-eleve-workflow` · `test-grand-chantier` | tests | testaient les modules ci-dessus | — |
| 4 entrées de `server/test-manifest.json` | manifeste | pointaient sur des tests retirés (233 → 229) | — |
| `EstheteChat.jsx` | UI | jamais montée (§ C) | équipe **Design** |
| `ObserverConseil.jsx` | UI | jamais montée | Observateur-Conseil de MangoQA |
| `StrategeGlobal.jsx` | UI | jamais montée | — (le Stratège est archivé, § H) |

**Mesuré après :** modules de production 343 → **331** · tests 245 → **239** · composants UI
107 → **104**. `tsc --noEmit` **0 erreur** · build UI **vert (8,4 s)**.

**Quatre lignes de l'audit rejetées avant exécution** — `kernel-curation-priority`,
`cron-breaker`, `render-integrity` (les trois ont des importeurs de production) et
`kernel-blackboard-sqlite` (substrat du lot 4). Détail et motif : `07-PLAN-EXECUTION.md`,
lot 1. **`dry-run.ts` reporté en passe B**, son retrait exigeant d'opérer sur un test partagé
avec d'autres blocs archivés.

### 2026-08-05 — Lot 1, passe B (partielle) · 7 fichiers retirés

**Retirés**, tous vérifiés à zéro importeur de production avant retrait :
`tonight-specs.ts` · `mango-nuit-specs.ts` · `auto-ablation.ts` (+ son UI) · `radar.ts` ·
`veille.ts` · `council-skills-routes.ts` · `test-radar.ts` · 1 entrée de manifeste.
**Débranchés** : 8 lignes dans `index.ts` (4 imports + 4 appels `register*Routes`) et
4 lignes dans `routes/chat-route.ts` — ces dernières étaient des **imports morts** :
importés, jamais appelés, jamais réexportés.

**Mesuré :** modules de production 331 → **327** · tests 239 → **238** · manifeste 229 → **228**.
`tsc --noEmit` **0 erreur** · build UI **vert (5,7 s)**.

### ⛔ Passe B arrêtée — 4 verdicts ⚪ ARCHIVE ne sont pas exécutables tels quels

| Bloc | Verdict corrigé | Ce que la vérification donne |
|---|---|---|
| `blueprints.ts` | 🟢 **GARDE** | **Erreur de classement grave.** Rangé au § F avec `tonight-specs`/`mango-nuit-specs` comme « spec de run nocturne » — par association de nom. C'est en réalité **14 importeurs de production** : `agent/agent.ts`, toute la chaîne `eleve/relay-*`, `scenario.ts`, `patrol.ts`, `kernel/kernel-reuse.ts`. Il porte `BLUEPRINTS_RULES`, le catalogue de stacks **injecté dans le prompt système de chaque tour**, plus `detectProjectType`/`inferProjectType`. L'archiver retirait le catalogue de tous les prompts. |
| `train-loop.ts` | ⚠️ **décision requise** | `nocturnal.ts` — **gardé au § H** — importe `generateUniquePrompts`. Archiver l'un casse l'autre. Il faut soit déplacer la fonction dans `nocturnal`, soit garder `train-loop`. |
| `axioms-drift.ts` | ⚠️ **décision requise** | `axioms-validation.ts` — **gardé** (🔵 fusionné dans `memory/`) — en importe 4 symboles (`cosine`, `formatConflictReport`, `ATOMS_CONFLICTS_FILE_NAME`, `DRIFT_THRESHOLD`). Le module ne contient pas que de la détection de dérive : il porte des **primitives partagées**. |
| `prompt-evolution.ts` | ⚠️ **décision requise** | `integrity-audit.ts` — **gardé** (🟡 masqué) — lit ses runs pour surveiller le magasin `prompt-evolution-runs`. L'archiver retire un magasin de la surveillance d'intégrité. |
| `super-agent-builder.ts` | ⚠️ **décision requise** | Pas un débranchement : `orchestrator.ts` appelle `matchAgentToProject` et `scenario.ts` appelle `superAgentPromptSection`. Le retirer **change le comportement** de l'orchestrateur et du scénario. |

> **Ce que la passe B apprend.** La colonne ⚪ ARCHIVE a été écrite sans vérifier les
> dépendances — **exactement comme la colonne 🔴 SUPPRIME**. Le motif est constant : un module
> est jugé sur son *thème* (« c'est du nocturne », « c'est de la dérive ») et non sur ses
> *appelants*. Trois des blocs restants sont importés par des modules que le même registre
> **garde** : ce ne sont plus des retraits, ce sont des **déplacements de code** — donc des
> décisions de conception, hors du périmètre « coupe gratuite » du lot 1.
>
> **Reste à trancher, avec `stratege/` (importé par `eleve/relay-*`), `savoir/` (un outil de
> l'Élève) et billing (`stripe.ts` + `Billing.jsx` + `Reglages.jsx`).**

### 2026-08-05 — Lot 1, passe B (suite) · couche STRATEGE_GLOBAL + A/B + évolution de prompt

#### ⚠️ Le § H archivait `stratege/` en bloc. C'était faux — le dossier contient DEUX choses

| Ce qui reste 🟢 | Ce qui part ⚪ |
|---|---|
| `stratege.ts` (racine) · `stratege-signals.ts` · `stratege-learn.ts` · `stratege-brain.ts` · `stratege-escalate.ts` | `stratege-global.ts` · `stratege-global-model.ts` · `stratege-collecteurs.ts` · `stratege-demandes.ts` · `stratege-run.ts` · `stratege-routes.ts` · `stratege-store.ts` |
| **Le routeur déterministe du #164** — diagnostic de blocage, choix de remède, `shouldStopRetrying` (la règle des 3 essais livrée au #196 C). Importé par `eleve/relay-agentic`, `relay-contract`, `relay-finalize` : il tourne **à chaque tour**. | **La couche `STRATEGE_GLOBAL`** — jamais exécutée, flag jamais défini. C'est elle, et elle seule, que visait le § H. |

> Le § H écrivait « `stratege/` (13 modules) — `STRATEGE_GLOBAL` non défini → jamais exécuté ».
> Le flag ne gouverne que `stratege-global.ts`, pas le dossier. **L'archiver en bloc supprimait
> le diagnostic de blocage et la règle des 3 essais de la chaîne Élève.**

**Retirés (12 modules + 9 tests) :** les 7 modules `STRATEGE_GLOBAL` ci-dessus ·
`ab-harness.ts` · `prompt-evolution.ts` · `dry-run.ts` · leurs 9 tests dédiés ·
9 entrées de manifeste.

**Débranchements :** `index.ts` (6 lignes) · `routes/chat-route.ts` (4 lignes) ·
`nocturnal.ts` (import + `maybeRunStrategistCycle`, gaté OFF donc neutre) ·
`integrity-audit.ts` (2 imports + les magasins surveillés `strategist-briefing-items` et
`prompt-evolution-runs`, devenus sans objet) · `chat-route.ts` (`maybeInjectStrategeBriefing`
sur projet neuf — gaté `STRATEGE_GLOBAL`, jamais allumé, retrait neutre en pratique).

**Chirurgie unique du test partagé** — `test-fondations-gates-combines.ts` **746 → 426 lignes** :
sections #182 (6 gates dont 5 archivés) et #176 (Stratège global) retirées, sections #180
(`DESKTOP_PERIMETER`, `DESKTOP_SYSTEM_SHELL` — **flags client gardés**) conservées intactes.
**Exécuté, pas seulement compilé : 34 pass, 0 fail.**

**Mesuré :** modules de production 327 → **317** · tests 238 → **229** · manifeste 228 → **219**.
`tsc --noEmit` **0 erreur** · build UI **vert (5,9 s)**.

#### Bilan du lot 1 à ce stade

| | Départ (audit) | Maintenant | Δ |
|---|---|---|---|
| Modules de production | 343 | **317** | **−26** |
| Fichiers de tests | 245 | **229** | −16 |
| Composants UI | 107 | **104** | −3 |
| Entrées de manifeste | 233 | **219** | −14 |

**47 fichiers retirés**, `tsc` et build verts à chaque étape, aucun commit.

**Reste à traiter :** `train-loop` (→ `nocturnal` gardé importe `generateUniquePrompts`) ·
`axioms-drift` (→ `axioms-validation` gardé importe 4 primitives) · `super-agent-builder`
(→ `orchestrator` et `scenario` l'appellent) · `savoir/` (→ un outil YouTube de l'Élève) ·
billing (`stripe.ts` + `Billing.jsx` + `Reglages.jsx`).

### 2026-08-05 — Lot 1, fin des 5 blocs restants

#### Retirés

| Bloc | Traitement |
|---|---|
| `super-agent-builder.ts` (467 l.) | ⚪ ARCHIVE exécuté. Débranché de `orchestrator.ts` (bloc `matchAgentToProject` de la construction du conseil), `scenario.ts` (registre de sections + **7 listes de modes** où figurait `"superAgent"`) et `chat-route.ts`. |
| `stripe.ts` (44 l.) + `Billing.jsx` | ⚪ ARCHIVE exécuté (A4). Vérifié avant retrait que ce n'était pas une brique offerte aux apps générées : ce sont bien les plans **de MangoOS** (Gratuit / Pro 19 € / Elite 49 €) et les routes `/api/billing/*`. Débranché d'`index.ts` et `Reglages.jsx`. |
| `savoir-extraction.ts` · `savoir-reconcile.ts` · `savoir-store.ts` | ⚪ ARCHIVE exécuté + leurs 3 tests. |
| `train-loop.ts` (414 l.) | ⚪ ARCHIVE exécuté, **après extraction** (voir ci-dessous). |

#### 🟢 Deux verdicts ⚪ ARCHIVE renversés à la vérification

**`savoir/savoir-transcript.ts` → GARDE.** L'arbitrage A1 archivait `savoir/` en bloc. Mais
`eleve-tools/eleve-youtube-tools.ts` en importe `fetchTranscript`, et cet outil est **allumé par
défaut** (`if (process.env.ELEVE_YOUTUBE !== "off")`). C'est lui qui a produit les 6 transcripts
`eleve-adhoc/` trouvés au lot 0. `savoir/` n'était pas un bloc : **un quart est vivant**, trois
quarts sont l'ingestion jamais construite. L'outil YouTube de l'Élève est conservé.

**`axioms-drift.ts` → 🔵 FUSIONNE (lot 4), pas ARCHIVE.** Deux modules **gardés** en dépendent :
`axioms-validation.ts` en importe `cosine`, `formatConflictReport`, `ATOMS_CONFLICTS_FILE_NAME`
et `DRIFT_THRESHOLD` ; `axioms.ts` en importe `checkAxiomDrift` et `loadExistingAxiomLines`. Le
commentaire du code le disait déjà : *« Exportée pour être RÉUTILISÉE par axioms-validation.ts —
une seule implémentation cosinus pour tout le magasin d'axiomes »*. Ce n'est pas une
fonctionnalité dormante, c'est un module du sous-système axiomes — il rejoint donc `memory/`
au lot 4 avec `axioms.ts` et `axioms-validation.ts`, au lieu de sortir.

#### Un déplacement, pas une réécriture

`nocturnal.ts` — **gardé au § H** — importait `generateUniquePrompts` de `train-loop`. Le moteur
de diversité (lignes 63-167 : `DOMAINS`, `STYLES`, `TASK_KINDS`, `composeTask`, `GenPrompt`,
`generateUniquePrompts`) est repris **à l'identique** dans un nouveau
`server/src/nocturnal-prompts.ts` — il rejoint le sous-système qui s'en sert, conformément à la
règle anti-rechute. Sa couverture suit : `test-train.ts` devient `test-nocturnal-prompts.ts`
(section `decideOllamaCircuitStop` retirée, elle part avec la boucle archivée). **Exécuté :
vert.** Le reste de `train-loop` (boucle d'entraînement, CLI, circuit breaker) est archivé.

#### 🐛 Défaut latent trouvé et corrigé — `axioms.ts` était invisible à grep

`axioms.ts` contenait **un octet NUL (0x00) à l'offset 5489**, entre deux fonctions. Conséquence :
`file` le classait `data`, donc **grep et ripgrep le sautaient par défaut**. C'est ce qui m'a fait
manquer, au premier passage, son import de `axioms-drift` — et c'est très probablement ainsi que
l'audit d'origine a sous-déclaré ses dépendances. L'octet est retiré (23 490 → 23 489 octets,
aucun effet sémantique) ; `file` reconnaît désormais un fichier UTF-8 et grep le voit.

> **À retenir pour les lots suivants :** une analyse de dépendances par grep est **muette** sur
> un fichier qu'un seul octet parasite fait passer pour binaire. Contrôler
> `for f in server/src/*.ts; do file "$f" | grep -q text || echo "$f"; done` avant tout audit.

#### Bilan du lot 1 — terminé

| | Départ (audit) | Fin de lot | Δ |
|---|---|---|---|
| Modules de production | 343 | **312** | **−31 (−9 %)** |
| Fichiers de tests | 245 | **226** | −19 |
| Composants UI | 107 | **103** | −4 |
| Entrées de manifeste | 233 | **216** | −17 |

**58 fichiers retirés**, `tsc --noEmit` et build UI verts **à chaque étape**, aucun commit.
Archive : `archive/pre-refonte-v3` → `054c9de`.

**Bilan des verdicts renversés : 8 sur ~40 vérifiés (20 %).**
`kernel-curation-priority` · `cron-breaker` · `render-integrity` · `kernel-blackboard-sqlite` ·
`blueprints` · `stratege/` (découpé) · `savoir-transcript` · `axioms-drift`.
Le motif ne varie jamais : **le module a été jugé sur son thème, pas sur ses appelants.**

### 2026-08-05 — LOT 2 · Les flags : 42 → 17

#### D'abord une correction de chiffre

L'audit annonçait **31 flags**. `flags.ts` en déclarait **42**. Et 10 `ELEVE_GATE_*`
supplémentaires sont lus via `process.env` **sans figurer au registre** (voir plus bas).

#### Étape 1 — 10 flags sans sujet (aucune mesure nécessaire)

Le lot 1 a retiré leur code, ou ils n'ont jamais été câblés : `AB_HARNESS` · `BRAIN_ENSEMBLE` ·
`DRY_RUN` · `SAVOIR_EXTRACTION` · `SAVOIR_RECONCILE` · `SAVOIR_TRANSCRIPT` (jamais branché au
module, qui existe pourtant) · `STRATEGE_GLOBAL` · `STRATEGE_PERIODIC` ·
`STRATEGE_QUESTION_DEMANDE` · `TRAIN_LOOP_OLLAMA_BREAKER`. **Zéro lecteur : 42 → 32.**

#### Étape 2 — mesurer AVANT de figer

C'est la clause qui fait ce lot : *un gate OFF depuis des mois peut être cassé sans que personne
le sache.* Chaque gate a été **allumé et exercé** avant d'être figé.

| Gate | Preuve | Résultat |
|---|---|---|
| `ELEVE_GATE_DUAL_SKIP_BLOCK` | `test-eleve-gate` ON | 66 pass, 0 fail |
| `ELEVE_GATE_PEDAGO` | `test-eleve-gate-pedago` ON | 45 pass, 0 fail |
| `ELEVE_GATE_IMAGES` | `test-eleve-gate-images` ON | 37 pass, 0 fail |
| `ELEVE_GATE_CONSTANTS` | `test-eleve-gate-constants` ON | 54 pass, 0 fail |
| `ELEVE_GATE_CONTENT` | `test-eleve-gate-content` ON — **juge LLM réel** | 30 pass, 0 fail |
| `ELEVE_PLAN_V2` | `test-eleve-plan` ON | 50 pass, 0 fail |
| `ELEVE_REFLEXION` | `test-eleve-runtime` ON | 66 pass, 0 fail |
| `ELEVE_ETAT` | `test-working-memory` ON | 27 pass, 0 fail |
| `ELEVE_RESUME` | `test-loop-state` ON | 33 pass, 0 fail |
| `ELEVE_MEMOIRE` | `test-fondations-gates-combines` ON | 34 pass, 0 fail |
| `BRAIN_FALLBACK` | `test-brain-fallback` ON | 18 pass, 0 fail |
| `TEMPORAL_AWARENESS` | `test-temporal-context` | tous verts |
| `ELEVE_CLOSURE_GATE` · `ELEVE_CONTEXT_LOOP` · `ELEVE_CONTEXT_CHAINE` | **aucun test** — mais `on` dans le `.env` vivant | preuve = **usage en production**, pas un test. Dit tel quel. |

**Aucun gate n'a échoué à l'allumage.** Aucune ligne n'a donc été ouverte dans `limites.md`.

#### Étape 3 — figés ON en dur (21 points d'appel), 32 → 17

Le gate disparaît de la condition, il ne devient pas `if (true)`. Trois cas particuliers :
la branche `else` de `formation-fabrique.ts` (« ne devrait jamais arriver ») est **littéralement
inatteignable** et part ; le forçage `process.env.ELEVE_CLOSURE_GATE = "on"` de
`formation-routes.ts` devient inutile ; trois blocs du Gardien passent en **bloc nu documenté**
plutôt que d'être ré-indentés de 15 lignes pour rien.

**13 assertions « gate OFF » retirées** des tests — elles vérifiaient une branche que le produit
n'a plus par décision. Vérifié une par une avant retrait : *aucune* n'était une régression.
Après : **13 suites, 0 échec**, `tsc` **0 erreur**, build UI **vert**.

#### 🐛 Le registre n'est pas la vraie surface — 10 gates non déclarés

`flags.ts` s'ouvre sur *« on y ajoute chaque nouveau flag — jamais un `process.env.X === "on"`
dispersé ailleurs »*. Or, lus en production et **absents du registre** :

| Vrais gates on/off (5) | Seuils numériques (5) |
|---|---|
| `ELEVE_GATE_BALANCE` · `ELEVE_GATE_PARCOURS` · `ELEVE_GATE_PLACEHOLDERS` · `ELEVE_GATE_TASTE_OBSERVE` · `ELEVE_GATE_TESTS` | `ELEVE_GATE_INTENT_MIN` · `ELEVE_GATE_RELANCE_MAX` · `ELEVE_GATE_TASTE_FLOOR` · `ELEVE_GATE_TASTE_MIN` · `ELEVE_GATE_WCAG_MAX_FAILS` |

> La surface réelle de bascules est donc **22**, pas 17 — et la règle que `flags.ts` énonce
> lui-même a été enfreinte 10 fois. À traiter avant de déclarer la cible ≤ 8 atteinte.

#### Où en est la cible ≤ 8

| Disposition | Flags | Sort |
|---|---|---|
| 🟢 **Réglages CLIENT — restent** | `BRAIN_LOCAL_ONLY` · `MANGOQA_STOP_AUTHORITY` · `DESKTOP_PERIMETER` · `DESKTOP_SYSTEM_SHELL` | **4** — la cible |
| 🔵 Détails du module mémoire → **lot 4** | `AXIOMS_ROTATE` · `AXIOMS_VALIDATION` · `AXIOMS_DRIFT` · `MEMORY_MANIFEST` · `BLACKBOARD_TTL` | 5, avec la fusion `memory/` |
| ⚪ À archiver (jamais exécutés, code encore présent) | `FORMATION_TUTEUR` · `FRONTIER_TOOLS_ANY_BRAIN` · `INTENT_ROUTER_LLM` · `LLM_SEMANTIC_CACHE` | 4 — retraits de type lot 1 |
| 🔴 `CODE_SECTION` | écran Code supprimé (A3) — reste à retirer le code | 1 |
| Sous-systèmes gardés → réglages internes | `HOME_QUICK_MODEL` (ON en prod) · `NOCTURNAL_QA_BUS` · `NOCTURNAL_BUDGET_HARD` | 3 |

**42 → 17 fait. 17 → 8 demande de retirer du code, pas de basculer un flag** — c'est la
suite du lot 2, de même nature que le lot 1.

### 2026-08-05 — Lot 2, suite · flags 17 → 13

#### 🐛 Le contrôle anti-binaire ajouté en tête de ce registre a servi immédiatement

`server/src/llm/llm-cache.ts` passait lui aussi pour un binaire — **et il ne fallait
surtout pas le « corriger »**. Contrairement à `axioms.ts` (octet parasite), ses trois NUL
sont **délibérés** : ce sont les séparateurs de la clé de hachage.

```js
createHash("sha256").update(`${providerModel}\0${promptVersion}\0${sys}\0${user}`)
```

Un séparateur qui ne peut apparaître dans aucun champ — exactement la bonne pratique. Les
retirer aurait invalidé toutes les clés de cache **et** supprimé la garantie d'unicité.

> **Le contrôle « aucun `.ts` ne passe pour binaire » se lit, il ne s'applique pas
> mécaniquement.** Deux fichiers, deux causes opposées : l'un se répare, l'autre se lit
> avec `grep -a`. Un correctif automatique aurait cassé le second en silence.

#### Retirés — 4 flags, 2 modules

| Flag | Verdict | Motif mesuré |
|---|---|---|
| `INTENT_ROUTER_LLM` | ⚪ ARCHIVE | gate OFF depuis toujours → la branche n'a jamais tourné. Retrait byte-identique. |
| `FORMATION_TUTEUR` + `formation/formation-tuteur.ts` | ⚪ ARCHIVE | seul `nocturnal.ts` l'appelait, gate OFF. |
| `LLM_SEMANTIC_CACHE` + `llm/llm-cache.ts` | ⚪ ARCHIVE | gate OFF → `cachedComplete` n'était **qu'un passe-plat** vers `opts.ask`. `eleve-content-tools` appelle désormais `real` directement. |
| `HOME_QUICK_MODEL` | 🟢 **figé ON** | `on` dans le `.env` vivant : figé dans son état **vécu**, pas dans une hypothèse. |

Plus 2 tests dédiés, 1 import mort dans le test partagé, 2 entrées de manifeste.
**Mesuré :** modules 312 → **310** · tests 226 → **224** · manifeste 216 → **214**.
`tsc` **0 erreur** · 9 suites **vertes** · build UI **vert**.

#### Deux blocs délibérément NON traités

**`FRONTIER_TOOLS_ANY_BRAIN`** — sa condition ouvre un `if/else` volumineux dans
`home-routes.ts`. Doublement mort (gate OFF **et** `ELEVE_PROVIDER=ollama` ≠ `openai`), mais
je viens de laisser un `else` orphelin sur `formation-fabrique.ts` en traitant trop vite un
bloc du même genre. **On ne répète pas la faute en fin de session.**

**`CODE_SECTION`** — n'est pas une coupe libre : `routes/code-route.ts` exporte
`externalHistoryDir`, importé par `project-io-routes.ts` **et** `preview-routes.ts`, tous deux
gardés. Neuvième fois qu'un verdict d'archivage bute sur un module gardé.

**`NOCTURNAL_QA_BUS` et `NOCTURNAL_BUDGET_HARD`** — non définis dans le `.env`, donc jamais
exécutés. Mais `NOCTURNAL_BUDGET_HARD` est un **arrêt dur sur budget** : le figer ON
imposerait une limite jamais éprouvée, le figer OFF retirerait un garde-fou. **Se tranche sur
un vrai lot nocturne**, pas au jugé.

#### État de la cible ≤ 8

| Disposition | Nombre |
|---|---|
| 🟢 Réglages client — définitifs | **4** |
| 🔵 Détails du module mémoire → lot 4 | 5 |
| À trancher (`CODE_SECTION`, `FRONTIER_TOOLS_ANY_BRAIN`, 2 × `NOCTURNAL_*`) | 4 |
| **Total déclaré** | **13** |

Après le lot 4, le registre tombe **à 8** sans autre travail. Reste la dette signalée plus
haut : **10 `ELEVE_GATE_*` lus en production sans figurer au registre** — la vraie surface
de bascules est donc encore supérieure au chiffre affiché.

### 2026-08-05 — Lot 3, préalable · cartographie des 16 rôles (aucune modification)

Avant de bâtir `v3/`, les 16 rôles ont été mesurés **par leurs appelants**, pas par le doc 03.

| Rôle | Fichiers de PROD | Lecture |
|---|---|---|
| `vision` | **15** | de très loin le plus sollicité |
| `juge` | **7** | second — la vérification est bien le cœur vivant |
| `codeur` | 5 | |
| `stratege` | 3 | (le routeur déterministe, gardé au lot 1) |
| `auditeur` | 2 | |
| `accueil` · `routeur` · `architecte` · `optimiseur` · `chercheur` · `designer_ux` · `forgeron` · `codeur_frontiere` | 1 chacun | |
| **`orchestrateur`** | **0** | ⚠️ voir ci-dessous |
| **`extracteur`** | **0** | ⚠️ |
| **`testeur`** | **0** (0 test aussi) | ⚠️ mort complet |

#### ⚠️ La conception cible bute sur la mesure

Le doc 03 fait de **🧭 Orchestrateur** « la seule équipe que l'utilisateur voit », et de
**📄 Extraction** une des 8 équipes. Or **leurs deux rôles ont zéro appelant en production**.

Symétriquement, `vision` (15 fichiers) et `juge` (7) portent l'essentiel du trafic réel — le
doc 03 les range en équipes ordinaires.

> **Lecture.** Les 8 équipes ont été dessinées depuis la structure *souhaitée*, pas depuis
> l'usage *mesuré*. Deux d'entre elles n'ont aujourd'hui aucun invocateur : les bâtir telles
> quelles créerait deux surfaces vides — exactement le défaut que la refonte corrige.
> **`v3/` doit partir de `vision` et `juge`, pas de l'organigramme.** À trancher avant le
> premier fichier de `v3/`.

`testeur` est le seul retrait sans discussion : **0 appelant, 0 test**.

#### ⛔ Pourquoi rien n'a été modifié

`server/data/brain-registry.json` porte une **modification non commitée de Raf** : le
basculement des rôles de `ollama/glm-5.2:cloud` vers `claude/opus`. Réduire les rôles
imposerait d'éditer ce fichier et d'entrer en collision avec ce travail en cours — c'est
précisément le conflit que la règle git de l'atelier existe pour empêcher. **Le lot 3
attend que ce basculement soit commité.**

### 2026-08-05 — Lot 2, fin · `FRONTIER_TOOLS_ANY_BRAIN` + la dette des gates non déclarés

#### `FRONTIER_TOOLS_ANY_BRAIN` ⚪ ARCHIVE — et son module avec

Sa branche ON était **doublement morte** : gate OFF depuis toujours, **et** la condition exige
`ELEVE_PROVIDER === "openai"` alors que le `.env` vivant est sur `ollama`. Le repli était donc
le seul chemin jamais emprunté — il devient le chemin unique (`home-routes.ts` −24 lignes,
corps de l'`else` désindenté).

Cette fois les **bornes ont été vérifiées avant de couper** (`if` en 196, `else` en 218,
fermeture en 234), avec abandon programmé du script si l'une ne correspondait pas — leçon de
l'`else` orphelin laissé sur `formation-fabrique.ts`.

**Conséquence en cascade :** l'import devenu mort a révélé que `runFrontierOrchestration`
n'était plus appelé nulle part — `chat-route.ts` et le test partagé ne portaient plus que des
imports morts. **`frontier-orchestration.ts` est donc archivé**, avec son test dédié.

#### La dette des 10 `ELEVE_GATE_*` hors registre — résolue

| Gate | Traitement |
|---|---|
| `ELEVE_GATE_BALANCE` · `ELEVE_GATE_PLACEHOLDERS` | ON par défaut (`!== "off"`) → **figés**, zéro changement de comportement |
| `ELEVE_GATE_PARCOURS` | `on` dans le `.env` vivant → **figé** dans son état vécu |
| `ELEVE_GATE_TASTE_OBSERVE` · `ELEVE_GATE_TESTS` | **déclarés au registre**, décision produit rendue visible (voir ci-dessous) |
| 5 seuils numériques (`INTENT_MIN`, `RELANCE_MAX`, `TASTE_FLOOR`, `TASTE_MIN`, `WCAG_MAX_FAILS`) | **restent des paramètres d'env** — `FlagSpec` est un registre de booléens, ils n'y ont pas leur place |

#### ⚠️ Un gel annulé — mon raisonnement était faux, le test l'a prouvé

J'ai figé `ELEVE_GATE_TASTE_OBSERVE` en justifiant que « ON par défaut ⇒ le figer ne change
rien ». **Faux.** `tasteObserve = true` met le volet goût en mode *observation* : il rapporte
mais ne bloque **jamais**. Le figer supprimait la capacité du Gardien à bloquer sur un score
esthétique — `test-eleve-gate` est tombé sur `ok:false (goût 55 < 80)`.

**Gel annulé, comportement restauré.** Le gate est déclaré au registre avec la question posée
en toutes lettres : *un auditeur qui ne bloque jamais sur le goût est-il un auditeur ?*
C'est une décision produit, pas un nettoyage. Même traitement pour `ELEVE_GATE_TESTS` : ON, le
Gardien **exécute vraiment** le script `test` du projet à la clôture — plus lent, et bloquant.
Se tranche sur un vrai tour de build.

> **La leçon.** « ON par défaut, donc le figer est neutre » est un raisonnement séduisant et
> faux dès que le gate ne pilote pas l'exécution mais la **sévérité**. Seul le test l'a
> montré. C'est le neuvième verdict renversé — et le premier qui vienne de **moi**, pas du
> registre d'origine.

**Mesuré :** flags **12 + 2 déclarés = 14** · modules **309** · tests **223** ·
`tsc` **0 erreur** · 9 suites **vertes** · build UI **vert**.

### 2026-08-05 — Lot 3 amorcé · suite offline **211 PASS · 0 FAIL**

#### Rôles 16 → 14

`extracteur` et `testeur` retirés : déclarés dans le type `AgentId` **et** dans les défauts
codés en dur, jamais récupérés par `getBrain` ni `dispatch`.

> **Dixième verdict corrigé.** J'avais annoncé `orchestrateur` comme troisième orphelin.
> **Faux** : aucun `getBrain("orchestrateur")`, mais il est le rôle **par défaut** du registre —
> `test-brain-dispatch` vérifie sur lui le repli quand le JSON est corrompu. Le critère
> « zéro appel nominatif » ne suffit pas : un rôle peut être structurel sans être appelé.

Restent **6 rôles à fusionner**, tous avec des sites d'appel réels : `accueil` · `routeur` ·
`stratege` · `optimiseur` · `forgeron` · `codeur_frontiere`.

#### L'étage 3 rétabli — deux lots qui se contredisaient

Le § G du lot 2 archivait `INTENT_ROUTER_LLM` (« jamais exécuté ») ; le doc 03 § 5 en fait
**l'étage 3 de l'escalier d'allumage** : *« on le garde, on l'allume, on le nomme »*.
Seul l'appel avait été retiré — `looksAmbiguous` et `routeAmbiguous` étaient intacts.
**Rétabli sans flag** : la capacité reste, le gate disparaît. C'est la règle du § G tenue dans
le bon sens (« un flag est ON et fait partie du produit, ou il n'existe pas »).

#### 4 régressions du lot 2 — et ce qu'elles apprennent sur la vérification

Ma vérification du lot 2 portait sur **13 suites choisies**. La suite complète en a révélé
**4 de plus**, toutes de la même racine : le figeage d'`ELEVE_PLAN_V2` sert désormais toujours
`etape_bloquee`. L'une était déjà commitée et poussée dans `0b15de7`.

- **golden `test-eleve-registry` régénéré** — mais seulement après avoir *mesuré* la dérive.
  Le script de régénération **refuse d'écrire** si un outil disparaît ou si autre chose que
  `etape_bloquee` apparaît. Une régénération à l'aveugle aurait masqué toute vraie régression.
- compteurs 27→28 / 26→27 propagés · assertions « gate OFF » retirées.

> **Un échantillon de tests ne vaut pas une suite.** Appris en le payant deux fois.

#### `test-relay` — réparé par des FIXTURES, pas en affaiblissant des assertions

Depuis que `ELEVE_CLOSURE_GATE` est figé ON, le Gardien tourne dans **tous** les chemins du
relais, y compris sur des répertoires temporaires qu'il ne peut pas satisfaire
(`intention 0/100`, pas de `package.json`) → boucle de re-correction du Maître, qui faussait
coût, tentatives et `incomplete`.

**Ce n'était pas une régression de production :** `ELEVE_CLOSURE_GATE` était déjà `on` dans le
`.env` vivant — la boucle existait, le test ne l'exerçait jamais.

`runClosureGate` acceptait **déjà** ses deps en dernier paramètre : c'est le relais qui ne
propageait rien. Ajout de `gateDeps?: GateDeps` à `RelayDeps`, suivant l'idiome déjà en place
(`judge?`, `agenticPost?`, `shouldAbort?`). Un défaut de paramètre s'applique sur `undefined` :
**la production est inchangée**. 16 scénarios câblés sur une clôture déterministe, sans réseau.
L'assertion de coût, que j'avais dû assouplir, est **remise au strict** (`=== 0.12`).

> Le test mesure de nouveau le **relais**. Le Gardien a ses propres suites (`test-eleve-gate*`).

#### Verdict

**211 PASS · 0 FAIL**, 537 s (contre 640 s et 4 échecs avant) · `tsc` 0 erreur · build UI vert.

### 2026-08-05 — Lot 3 · **Les 8 équipes** (rôles 14 → 8) · suite **211 PASS · 0 FAIL**

#### La cible du doc 03 § 7 est atteinte

`orchestrateur` · `architecte` · `codeur` · `vision` · `designer_ux` · `auditeur` ·
`chercheur` · `juge` — ce dernier **distinct de l'exécutant**, point que le doc 03 pose
comme non négociable.

| Fusionné | Dans | Motif (doc 03 § 7) |
|---|---|---|
| `accueil` | `orchestrateur` | l'Accueil **est** l'Orchestrateur |
| `routeur` | `orchestrateur` | l'étage 3 de l'escalier est une décision de l'Orchestrateur |
| `stratege` | `orchestrateur` | la classification de blocage lui revient |
| `optimiseur` | `architecte` | 🧠 Analyse & Plan |
| `forgeron` | `codeur` | la Forge devient interne — plus un rôle exposé |
| `codeur_frontiere` | `codeur` | l'écran Code sort de la v3 (arbitrage A3) |

#### Pourquoi c'était le bon moment — et pourquoi ça n'aurait pas été vrai la veille

Depuis le basculement `c113729`, **les 14 rôles pointaient tous sur `claude/opus`**. Aucune
fusion ne change donc le cerveau effectivement utilisé : l'opération est **neutre pour le
comportement actuel**. Faite avant ce basculement, chaque fusion aurait silencieusement changé
de modèle pour six chemins d'exécution.

#### La même table pour le code et pour les tests

Les tests ont reçu **exactement** la table ci-dessus, jamais une substitution choisie pour
faire passer une suite. Deux ajustements assumés :

- les assertions sur les défauts de `stratege` et `forgeron` sont devenues des **doublons**
  de contrôles déjà faits sur `orchestrateur` et `codeur` → retirées ;
- le trio « agents ollama → coût 0 » passe à **`juge` + `vision` + `codeur`**, les trois seuls
  rôles dont le défaut codé en dur est réellement `ollama` après la fusion.

#### ⚠️ Deux points que la fusion met en pleine lumière

**Le `juge` et le `codeur` partagent le même cerveau.** Dans le registre vivant, les 8 rôles
sont sur `claude/opus` — le vérificateur **est** le modèle vérifié. Le doc 03 pose la
distinction juge/exécutant comme *non négociable* ; elle n'existe plus qu'au niveau du **rôle**,
plus au niveau du **modèle**. À trancher : c'est le différenciateur produit n°1 qui est en jeu.

**Aucun rôle n'a de cerveau local dans le registre vivant.** Or `BRAIN_LOCAL_ONLY` est l'un des
4 réglages client conservés au lot 2 (« mode souverain »). Activé aujourd'hui, **aucun rôle ne
peut s'exécuter**. Les défauts codés en dur gardent `ollama` pour `codeur`/`vision`/`juge` —
c'est le seul filet.

#### Verdict

**211 PASS · 0 FAIL** (519 s) · `tsc` 0 erreur · build UI vert · modules de production **309**.

| | Départ (audit) | Fin du lot 3 |
|---|---|---|
| Rôles de cerveau | 16 | **8** ✅ cible atteinte |
| Modules de production | 343 | 309 |
| Flags déclarés | 42 | 14 |

### 2026-08-05 — Le juge repasse sur un cerveau distinct, et l'invariant devient GARDÉ

**Décision de Raf.** `juge` : `claude/opus` → **`claude/sonnet`**. `codeur` reste sur
`claude/opus`. Le vérificateur n'est plus le modèle vérifié.

#### Le garde-fou compte plus que le réglage

L'invariant du doc 03 § 2 — *« le juge reste **distinct** de l'exécutant — non négociable »* —
s'était perdu au basculement `c113729` (les 16 rôles envoyés en bloc sur `claude/opus`)
**sans que rien ne le signale**. Un réglage sans garde se reperd au basculement suivant.

Deux assertions ajoutées à `test-brain-dispatch` :

| Assertion | Portée |
|---|---|
| `défauts : juge ≠ codeur` | les défauts codés en dur de `brain-registry.ts` |
| `registre VIVANT : juge ≠ codeur` | **`server/data/brain-registry.json`** — le fichier qui s'exécute |

La seconde est celle qui protège vraiment : les défauts ne garantissent rien, puisque le
registre vivant les écrase. Le garde vérifie la **distinction**, pas la hiérarchie — il tient
donc quel que soit le sens choisi.

#### ⚠️ Réserve mesurée, à porter au dossier

`sonnet` est **moins fort** qu'`opus` : le juge est désormais plus faible que ce qu'il juge.
La mesure de MangoQA (ADR-001 § 1) est sans ambiguïté sur ce risque — `qwen2.5-coder:14b` a
rendu « aucun anti-pattern majeur » là où Opus 5 trouvait un défaut réel en 26,6 s. **Un juge
plus faible produit des feux verts faux.**

Le sens inverse est aussi défendable : `juge` sur `opus`, `codeur` sur `sonnet` — la
vérification reste au plus haut niveau, la construction baisse. Un seul mot suffit à basculer.

#### ⚠️ Le même problème subsiste à côté

**`auditeur` est toujours sur `claude/opus`, comme le `codeur`.** C'est l'autre rôle de
vérification, et la question est identique. Non traité : l'arbitrage ne portait que sur le juge.
→ **Traité le 2026-08-06**, entrée suivante.

**Suite offline : 211 PASS · 0 FAIL** (545 s) · `tsc` 0 erreur.

---

### 2026-08-06 — `auditeur` rejoint `juge` : le garde cesse de viser un rôle nommé

`server/data/brain-registry.json` : `auditeur` `claude/opus` → **`claude/sonnet`**.
`sonnet` est aussi son défaut codé en dur dans `brain-registry.ts` — le registre vivant est
donc **réaligné sur ce que le code prévoyait déjà**, il n'y a pas eu de nouveau choix de modèle.

#### Ce qui a réellement changé : la forme du garde

Le garde-fou posé la veille nommait un rôle. Corriger l'auditeur en dupliquant les deux
assertions aurait reconduit le même défaut : **un garde qui ne connaît qu'un cas se fait
contourner par le suivant.** L'assertion porte désormais sur la *classe* :

```ts
const VERIFICATEURS = ["juge", "auditeur"] as const;
```

Elle boucle sur les défauts **et** sur le registre vivant — 4 assertions au lieu de 2, et le
prochain rôle de vérification ajouté à la liste est gardé sans écrire une ligne de test.

| Assertion | Portée |
|---|---|
| `défauts : juge ≠ codeur` | défauts codés en dur |
| `défauts : auditeur ≠ codeur` | défauts codés en dur |
| `registre VIVANT : juge (claude/sonnet) ≠ codeur (claude/opus)` | **le fichier qui s'exécute** |
| `registre VIVANT : auditeur (claude/sonnet) ≠ codeur (claude/opus)` | **le fichier qui s'exécute** |

#### État du registre vivant après l'opération

| Rôle | Cerveau |
|---|---|
| orchestrateur | `claude/opus` |
| architecte | `claude/opus` |
| codeur | `claude/opus` |
| vision | `claude/opus` |
| designer_ux | `claude/opus` |
| **auditeur** | **`claude/sonnet`** |
| chercheur | `claude/opus` |
| **juge** | **`claude/sonnet`** |

#### ⚠️ La réserve n'est pas levée — elle est doublée

La réserve portée à l'entrée du 2026-08-05 vaut désormais pour **les deux** vérificateurs :
`sonnet` est moins fort qu'`opus`, donc **les deux rôles de vérification sont plus faibles que
ce qu'ils vérifient**. La mesure MangoQA (ADR-001 § 1) reste la même : un juge plus faible
produit des feux verts faux. Le sens inverse — `juge` et `auditeur` sur `opus`, `codeur` sur
`sonnet` — est à un mot près, et le garde tient dans les deux sens puisqu'il vérifie la
**distinction**, pas la hiérarchie.

**Suite offline : 211 PASS · 0 FAIL** (581 s) · `tsc` 0 erreur · `test-brain-dispatch` 40 pass.

---

### 2026-08-06 — Le socle `v3/` existe : 7 équipes, zéro réécriture

Le lot 3 avait amorcé sa moitié registre (16 rôles → 8). Voici sa moitié socle.

```
server/src/v3/
  teams.ts          le catalogue des équipes — déclaratif, aucune logique
  team-dispatch.ts  dispatchTeam() : l'enveloppe autour de dispatch()
  team-ignition.ts  l'escalier d'allumage, NOMMÉ (il existait déjà)
  team-journal.ts   le journal d'allumage → le bandeau de statut
  index.ts          la porte unique
```

**Rien n'a été réécrit.** Le doc 03 § 4 l'exige mot pour mot : « `dispatch()` reste
EXACTEMENT ce qu'il est. Trois ajouts seulement. » Ce sont ces trois-là, et strictement
eux. Rate limiting, fallback inter-providers, garde `localOnly`, contrat Mango,
anti-injection, timeout, « ne throw jamais » : tout est resté où c'était.

#### ⚠️ 7 équipes, et non 8 — écart assumé avec le doc 03

Le doc 03 § 2 décrit **8** équipes, dont 📄 **Extraction** portée par le rôle
`extracteur` — **retiré du registre sur ta décision au lot 3**. Une équipe sans cerveau
n'est pas une équipe. Le socle en déclare donc 7, et je le dis ici plutôt que de laisser
un « 8 » qui ne correspondrait à rien.

Ses 3 compétences sont **réaffectées, pas perdues** (le lot 3 exige « aucune capacité
perdue ») :

| Compétence | Va à | Motif |
|---|---|---|
| `lire_document` | 🔎 Recherche | sa mission est « trouver, lire et rapporter » — qu'il s'agisse d'une URL ou d'un PDF déposé ne change pas la nature du travail |
| `lire_archive` | 🔎 Recherche | idem |
| `decoupe_assets` | 👁️ Vision | découper une image est un travail d'image |

Réversible en deux lignes : rendre `extracteur` au registre, déclarer l'équipe.

#### La décision de conception qui n'était pas dans les docs

Les outils d'une équipe sont **déclarés nommément**, pas déduits de ses capacités.
`TOOL_CAPABILITIES` classe par capacité de **sûreté** (que risque-t-on à offrir cet
outil), pas par appartenance métier — et les deux ne coïncident pas : `verifie_design`
y est `read-local`, alors qu'il appartient sans ambiguïté au 🎨 Design.

Déduire les outils des capacités aurait donné à 🎨 Design **tous** les outils
`read-local` du produit : `read_file`, `list_files`, `check_build`… L'appartenance est
donc déclarée, la capacité **dérivée**. Deux assertions gardent ce point précis.

#### ⚠️ Correction de mesure — **42 outils, pas 41**

Le plan 07 et le doc 03 annoncent « les 41 outils de l'Élève ». Le compte réel dans
`TOOL_CAPABILITIES` est **42**, re-mesuré. Le test l'affiche à chaque exécution et
échoue si un seul cesse d'être joignable — la mesure ne peut plus dériver en silence.

#### Ce que le test garde vraiment (`test-v3-teams`, **72 assertions**)

| Invariant | Ce qu'il empêche |
|---|---|
| aucun outil orphelin (42/42 affectés) | qu'une capacité devienne injoignable sans que personne le voie |
| aucun outil fantôme | qu'une équipe croie savoir faire ce qu'elle ne fera jamais |
| aucun outil partagé entre deux équipes | le retour du fourre-tout que la refonte supprime |
| aucun rôle du registre sans équipe, **et réciproquement** | qu'on retire une équipe en laissant son rôle traîner |
| 🛡️ Vérification s'allume sur **tout** jeu de capacités | qu'un paramètre finisse par l'éteindre — « non désactivable » (doc 03 § 2) |
| 🛡️ Vérification toujours **en dernier** | qu'elle vérifie avant que le travail existe |
| même message → même allumage | un allumage non déterministe, indébogable pour l'utilisateur |
| le plafond `read-only` écarte les mutants | qu'un appelant distrait obtienne le droit d'écrire sans l'avoir demandé |
| budget épuisé → refus **sans appel modèle** | qu'un dépassement devienne un blocage au lieu d'une extinction propre |

#### Le premier branchement est une OBSERVATION, pas une substitution

`home-routes.ts` appelle désormais `observeAllumage(homeCaps, …)` juste après
l'escalier de capacités qui tournait déjà. Deux propriétés, toutes deux gardées :

- **Elle ne change aucun comportement.** Retirez la ligne : le produit se comporte à
  l'octet près comme avant.
- **Elle ne ment pas.** Les équipes sont journalisées **« pressenties »**, pas
  « allumées », parce que rien ne s'exécute encore. Un bandeau qui annonce un travail
  qui n'a pas eu lieu est pire qu'un bandeau vide.

C'est la discipline que le lot 2 a imposée aux gates : **mesurer d'abord, figer
ensuite.** On saura ce que le socle allumerait sur du trafic réel avant de lui confier
l'exécution.

#### Trouvé en chemin — deux imports morts

`chat-route.ts` et `index.ts` importaient `requiredCapabilities` et `toolDemandSignal`
**sans jamais les appeler**. Vérifié symbole par symbole avant de couper (le script
abandonne si l'un des deux apparaît ailleurs dans le fichier). Retirés.

#### ⚠️ Ce que ce lot ne fait PAS — à lire avant de le croire fini

Le critère d'achèvement du lot 3 dit : « **tout appel LLM du produit passe par `v3/`** ·
un parcours complet de bout en bout tourne. » **Ce n'est pas fait, et de loin :**

- **25 fichiers** appellent encore `askLLM` directement.
- Une façade **concurrente** existe déjà : `brain.ts`, dont l'en-tête annonce le même
  objectif (« à terme, tout appel de haut niveau passe par `brain(...)` ») avec
  **14 importateurs**. Deux façades qui visent la même place, c'est exactement la
  duplication que la refonte supprime — **il faut trancher laquelle survit**, et c'est
  une décision, pas une tâche.
- Aucun parcours de bout en bout n'a encore tourné à travers les équipes.

Le socle **existe et est gardé** ; il ne **pilote** encore rien.

#### Mesures — méthode inscrite, parce qu'elle avait dérivé

| Mesure | Portée exacte | Valeur |
|---|---|---|
| Modules de prod | `server/src/**/*.ts` hors `test-*` | **314** (309 + les 5 du socle) |
| Tests | `server/src/tests/test-*.ts` | **223** (222 + 1) |
| Composants UI | `ui/src/components/**/*.jsx` | **103** — inchangé |
| Flags | entrées de `flags.ts` | **14** — inchangé |
| Outils joignables | `TOOL_CAPABILITIES` | **42/42** |

> Les deux dernières lignes avaient l'air d'avoir bougé (109 et 17) : c'était **ma**
> méthode de mesure qui variait, pas le code — `find ui/src` au lieu de
> `ui/src/components`, et un `grep 'env:'` qui attrapait aussi la déclaration
> d'interface. D'où la colonne « portée exacte », pour que le prochain compte se fasse
> sur le même périmètre.

**`tsc` 0 erreur · build UI vert (7,06 s) · `test-v3-teams` 72 pass, 0 fail.**

---

### 2026-08-06 (suite) — Le parcours tourne, et 5 défauts SILENCIEUX sont tombés

`server/src/v3/team-run.ts` + `test-v3-parcours` (**29 assertions**). `runTour(task)`
enchaîne allumage → équipes dans l'ordre → clôture par la Vérification en deux temps
(l'auditeur vérifie, **le juge tranche**). Déterministe, transport injecté, zéro réseau.

C'est le dernier critère d'achèvement du lot 3 qui **ne dépendait pas** de l'arbitrage
resté ouvert entre `brain.ts` et `v3/` : `team-run.ts` n'appelle que `dispatchTeam`.

#### Ce que le parcours garde et que le test unitaire ne pouvait pas garder

Les invariants qui ne sont vrais **qu'en séquence**. Une équipe correcte prise isolément
peut être appelée dans le mauvais ordre, avec le mauvais cerveau, ou pas du tout :

- 🎨 Design s'exécute **après** 🔨 Construction — on embellit ce qui existe.
- Le verdict est rendu par le `juge`, et le transport espion prouve qu'il a **réellement
  parlé sur un autre modèle** que le codeur. `test-brain-dispatch` garde la distinction
  au registre ; ici on garde qu'elle est **empruntée**.
- La demande d'origine survit intacte jusqu'au verdict, et le premier appel ne contient
  aucun amont.
- Une équipe en **panne** n'emporte pas le tour : la Vérification doit pouvoir dire que
  ça s'est mal passé, ce qu'elle ne pourrait pas faire si l'échec avait arrêté le
  parcours avant elle.

---

### ⚠️ Défaut n° 1 — mes deux équipes principales ne se seraient **jamais** allumées

J'avais allumé 🔨 Construction sur les capacités `write-fs`/`run-cmd`, et 🧠 Analyse sur
`plan`. **L'escalier ne produit aucune de ces trois-là, et ne le peut pas.** C'est
délibéré (#182 D1) : les capacités portent l'axe **intention** et sont *read-safe par
construction* ; la mutation relève de l'axe **posture**. L'étage 2 ne détecte que du
read-safe, et l'allowlist de l'étage 3 exclut explicitement write/run/deps.

Deux équipes sur sept étaient donc **déclarées mais injoignables** — et les tests
unitaires les déclaraient conformes, parce qu'ils vérifiaient la *déclaration*.

**Correction :** l'allumage prend désormais **deux** entrées, capacités **et** plafond de
mutation. `surMutation` porte l'intention « construire ». Le commentaire dans
`teams.ts` interdit nommément de remettre une capacité de mutation dans `capacites`.

> **La leçon, et elle vaut au-delà de ce lot :** un test unitaire vérifie qu'une pièce est
> bien faite ; seul un parcours vérifie qu'elle est **appelée**. Les deux équipes qui
> portent le cœur du produit — celle qui construit et celle qui planifie — étaient
> mortes, et rien dans les 72 assertions précédentes ne le disait.

---

### ⚠️ Défaut n° 2 — sous plafond `read-only`, personne ne savait lire un fichier

Les quatre lecteurs du projet (`read_file`, `list_files`, `search_code`, `check_build`)
appartiennent à 🔨 Construction et **à aucune autre équipe** — 🔎 Recherche va chercher
*dehors*. Construction ne s'allumant que sur la mutation, une question aussi banale que
« que fait ce fichier ? » ne trouvait, en posture Discuter, **personne pour y répondre**.

Ce n'est pas un détail de cadrage : c'est une régression fonctionnelle par rapport au
comportement actuel, où `buildEleveDiscussTools` offre `read_file` par défaut.

**Correction :** 🔨 Construction s'allume aussi sur `read-local`. Sous `read-only`, le
plafond la réduit exactement à ses quatre lecteurs — **elle lit le projet, elle ne le
construit pas.**

> ### ⚠️ Conséquence à traiter au **lot 5** (surfaces), consignée pour ne pas la découvrir plus tard
>
> `read-local` étant sur-provisionné à chaque tâche, 🔨 Construction apparaîtra au
> bandeau de **presque tous les tours**. Afficher « Mango construit » pendant une simple
> question serait un contresens produit. **Le bandeau devra distinguer LIRE de
> CONSTRUIRE** — c'est une exigence de conception d'écran, pas un réglage.

---

#### Une seconde conséquence, moins visible : l'allumage coûte de l'argent

L'escalier sur-provisionne les capacités read-safe au motif explicite qu'« un outil non
appelé ne coûte rien » (function-calling paresseux). **Cet argument ne tient plus dans le
modèle par équipes** : `runTour` appelle *chaque* équipe allumée, donc chaque allumage
est un appel modèle payé. Le sur-provisionnement, gratuit côté outils, devient coûteux
côté équipes.

`runTour` est un **squelette** : il exécute toutes les équipes allumées, dans l'ordre.
Le doc 03 § 2 confie pourtant à l'Orchestrateur de « décider qui s'allume » — un vrai
orchestrateur en éteindrait. Non fait, et consigné plutôt que masqué.

#### Un troisième défaut, trouvé en relisant mon propre code

`dispatchTeam` documente que la policy de l'appelant **resserre, jamais n'élargit**.
Or `mergePolicies` fait primer l'appelant sur `allowRun` — sémantique juste pour un
sous-agent scellé (#175), fausse ici : un appelant pouvait **rendre le shell** à une
équipe à qui le plafond `read-only` venait de le retirer. Les deux sont désormais ET-és,
et deux assertions gardent les deux sens (on peut retirer, on ne peut pas rendre).

#### Deux autres pièges, trouvés en relisant — et ils ne se voyaient pas à l'exécution

**Le budget du processus au lieu du budget du tour.** `runTour` prenait par défaut le
singleton `budgetEquipes`, jamais réinitialisé. Le premier tour d'une session passait ;
**le deuxième trouvait tous les plafonds épuisés** et refusait chaque équipe d'un coup.
Un test à un seul tour ne pouvait pas le voir. Défaut par tour désormais NEUF ; un
appelant qui veut plafonner à travers plusieurs tours injecte le sien — c'est alors un
choix, pas un effet de bord. Gardé par « deux tours consécutifs aboutissent ».

**L'allowlist vide qui autorise tout.** `applyToolPolicy` traite `allowedTools: []`
comme « aucun filtre » (`allowedTools && allowedTools.length ? … : null`). La policy du
🧭 Orchestrateur — qui n'a **aucun** outil — lui aurait donc donné le **registre entier**,
l'exact contraire de son rôle : celui qui délègue et n'exécute pas se serait retrouvé
seul à tout pouvoir faire. Une équipe sans outil sort maintenant avec une denylist
explicite de tout le registre, et le test l'applique à un vrai `ToolRegistry` pour
vérifier qu'il n'en reste rien.

> Ces trois défauts (celui-ci, le budget, `allowRun`) ont un trait commun : **aucun ne
> produisait d'erreur.** Ils rendaient un résultat plausible. C'est le mode de panne
> contre lequel un test doit être écrit — pas contre l'exception, qui se signale seule.

**Suite offline complète : 213 PASS · 0 FAIL** (613 s) · `tsc` 0 erreur · build UI vert ·
`test-v3-teams` 79 pass · `test-v3-parcours` 30 pass.

Mesures après cette seconde passe (même portée que le tableau ci-dessus) : modules de
prod **315** · tests **224** · socle `v3/` **6 modules** · outils joignables **42/42**.

---

### 2026-08-06 (arbitrage) — `brain.ts` **et** `v3/` : superposées, pas concurrentes

**Décision de Raf : option A.** Le blocage du lot 3 est levé.

#### Ce qui était réellement en cause

Les deux fichiers annonçaient la même chose dans leur en-tête — « à terme, tout passe
par moi ». Posées côte à côte, elles ne répondent pourtant pas à la même question :

| | `brain.ts` | `v3/` |
|---|---|---|
| Question | **quel moteur ?** | **quelle équipe ?** |
| Sait | transport, retry, provider, `chatEleve`, `elevePost` | périmètre d'outils, budget, clôture par le juge |
| Ne sait pas | quels outils, quel budget | comment parler à un modèle |
| Importateurs | **14** | 0 (neuf) |

Elles n'étaient pas en concurrence : elles étaient **superposées**, et rien ne le
disait. C'est ça, le vrai défaut — pas la duplication, l'**absence de règle**. Sans
elle, le prochain développeur aurait tranché au hasard, fichier par fichier.

#### La hiérarchie, désormais écrite dans les deux fichiers

```
   produit    →  v3/  ............ QUELLE ÉQUIPE ? outils, budget, qui vérifie
                   │
                   ▼
   transport  →  brain.ts ........ QUEL MOTEUR ? dispatch / askLLM / chatEleve
                   │
                   ▼
                 brain-dispatch.ts  (implémentation privée)
```

#### Le changement de code : **une ligne**

```ts
- const r = await dispatch(brain, missionSystem, user, dispatchOpts);
+ const r = await brain(cerveau, missionSystem, user, dispatchOpts);
```

(la variable locale s'appelait `brain` — elle aurait masqué la façade ; renommée
`cerveau`.) **Aucun des 14 importateurs ne bouge.** Ce qui sera branché dans
`brain.ts` — observabilité, retry centralisé — vaudra désormais aussi pour les
équipes, sans double câblage. C'est tout l'intérêt de A sur B.

#### Le garde, et la preuve qu'il garde

Une convention non gardée est une convention orale, c'est-à-dire rien.
`test-v3-teams` lit maintenant les sources de `server/src/v3/` et échoue si l'une
d'elles importe `brain-dispatch` en direct. Il ne regarde que les lignes d'**import** :
l'en-tête de `team-dispatch.ts` nomme `brain-dispatch` précisément pour dire de ne
pas l'importer, et un test qui échouerait sur sa propre explication serait absurde.

**Vérifié par violation contrôlée** — un import ajouté à `team-journal.ts` fait bien
tomber l'assertion :

```
✗ aucun module de v3/ n'importe brain-dispatch en direct
  (fautifs : team-journal.ts → import { resetRateLimits } from "../brain/brain-dispatch.js")
```

Fichier restauré à l'identique après l'essai (`git status` vide). **Un garde qu'on n'a
jamais vu échouer ne garde rien** — c'est la même leçon que les 5 défauts silencieux
de la veille, appliquée au test lui-même.

#### Ce que ça débloque, et ce que ça ne débloque pas

- ✅ La règle existe et elle est tenue par un test. Le lot 3 peut avancer.
- ⏳ **25 fichiers appellent encore `askLLM` en direct.** L'arbitrage dit vers quoi
  migrer ; il ne migre rien. Le critère « tout appel LLM passe par `v3/` » reste ouvert.
- ⚠️ `brain.chatEleve` et `brain.elevePost` n'ont **pas** d'équivalent équipe. Le jour
  où on voudra les y faire passer, il faudra en inventer un — c'est le vrai coût que
  l'option B aurait facturé tout de suite, et que A reporte sans le supprimer.

**Suite offline complète : 213 PASS · 0 FAIL** (582 s) · `tsc` 0 erreur ·
`test-v3-teams` 81 pass (79 → 81) · `test-v3-parcours` 30 pass.

---

### 2026-08-06 (dispatcher) — Le Brain-Dispatch structuré, **rien retiré**

Consigne de Raf : *« il faut que tu gardes toute la mécanique du Brain dispatcher, tout
en l'améliorant et en le rendant plus léger et plus structuré. Le Brain dispatcher est
un des points forts de Mango. »*

Aucune capacité n'a été retirée. Le découpage est à **comportement identique**, et la
preuve tient en une phrase : **les 68 assertions qui couvrent le dispatcher passent sans
qu'une seule ligne de test ait été modifiée.**

```
test-brain-dispatch  40 pass   test-brain-fallback  17 pass   test-brain-facade  11 pass
```

#### Ce qui a bougé

| Avant | Après |
|---|---|
| tout dans `brain-dispatch.ts` | `brain-rate-limit.ts` — la fenêtre glissante |
| | `brain-attempt.ts` — UNE tentative sur un cerveau |
| | `brain-dispatch.ts` — l'entrée, et elle seule |
| repli écrit en ligne dans `dispatch()` | `rejoueLaChaine()`, fonction nommée |
| garde de souveraineté écrite **2 fois** | un seul prédicat `sortieInterdite()` |

#### Trois défauts que le découpage a mis au jour

**1. Les étapes numérotées mentaient.** `dispatch()` était commentée « 1, 2, 3, 4&5, 6,
7, 7bis, 9 ». **Il n'y avait pas de 8.** Elle avait disparu au fil des remaniements sans
que personne puisse le voir. Une numérotation fausse est pire qu'aucune : elle donne
l'illusion d'un plan. Remplacée par des en-têtes nommés, qui ne peuvent pas se
désynchroniser puisqu'ils décrivent ce qu'ils surmontent.

**2. La garde de souveraineté était écrite deux fois** — une fois pour le cerveau
principal, une fois dans la boucle de repli. Les deux disaient la même chose *aujourd'hui*.
À la première divergence, un repli aurait pu franchir une frontière que l'appel principal
refusait — et c'est la garantie la plus forte du produit (« un rôle `localOnly` ne sort
jamais vers un cloud »). **Une règle de sûreté dupliquée finit toujours par ne l'être
qu'à moitié.**

**3. `flag` était importé sans jamais être appelé** — le troisième import mort de la
semaine. Pire : un commentaire annonçait un *« double verrou : le flag ET une chaîne de
repli »* alors que le flag avait disparu au lot 2. Le verrou est bien double, mais c'est
« échec de **disponibilité** ET chaîne déclarée ». Import retiré, commentaire remis
d'aplomb.

---

#### Le vrai gain : une pièce isolable est une pièce prouvable

`acquireSlot` lisait `Date.now()` **en dur**. `sleep` était injecté, l'horloge non —
donc l'**expiration de la fenêtre de 60 s**, qui est le cœur du mécanisme, ne pouvait se
vérifier qu'en attendant soixante secondes réelles. Personne ne l'a jamais fait. Le rate
limiter était le seul organe du dispatcher **sans aucune assertion sur son comportement
propre**.

Horloge désormais injectable (paramètre optionnel — tout appelant existant est inchangé),
et `test-brain-rate-limit` : **16 assertions neuves**, dont celles qui étaient
matériellement impossibles à écrire :

- la fenêtre expire à 60 000 ms et le compteur repart à 1 ;
- **à 59 999 ms elle tient encore** — un `>` au lieu d'un `>=` passerait sans bruit et
  décalerait tout le rythme d'appel ;
- saturation → backoff exactement 1 s / 2 s / 4 s, puis laisser-passer délibéré ;
- saturer `claude` n'impose **aucun** backoff à `ollama` : un rôle local, gratuit et
  souverain, ne doit pas être ralenti par le quota d'un cloud qu'il n'utilise pas.

#### ⚠️ « Plus léger » : la mesure exacte, sans arrangement

| Mesure | Avant | Après |
|---|---|---|
| Total de lignes | 249 | **405** (3 fichiers) |
| Code hors commentaires dans `brain-dispatch.ts` | 165 | **114** (−31 %) |
| La fonction `dispatch()` elle-même | 83 lignes | **58** (−30 %) |

**Le total a augmenté**, et il faut le dire ainsi. Ce qui a maigri, c'est le **point
d'entrée** — la fonction qu'on lit pour comprendre le système. Le volume ajouté est du
commentaire et deux modules portant chacun un seul métier. Si la consigne « plus léger »
visait le nombre total de lignes, alors elle n'est **pas** tenue et il faut me le dire :
la seule façon de la tenir en ce sens serait de retirer de la mécanique, ce que la
consigne interdit par ailleurs.

**Suite offline complète : 214 PASS · 0 FAIL** (559 s) · `tsc` 0 erreur.

---

#### La question de Raf — « quel impact a de retirer la mécanique ? » — et sa réponse mesurée

Question posée après le remaniement. Répondre de mémoire aurait été facile et faux : on a
donc mesuré ce qui est **réellement emprunté**, pas ce qui est déclaré.

| Mécanisme | Emprunté aujourd'hui | Si on le retire |
|---|---|---|
| Rate limiter | **en permanence** — 8 rôles sur 8 sur `claude`, plafond **10/min** | seul retrait à effet **immédiat** |
| Repli inter-providers | **1 rôle sur 8** — `vision` seul (`opus` → `haiku`) | `vision` perd sa reprise ; les 7 autres inchangés |
| Garde `localOnly` | **0 rôle** — dormante | rien ne change aujourd'hui ; la promesse de souveraineté disparaît |
| Circuit breaker de session | 1 fichier | une boucle emballée n'a plus de frein |
| `freeform` | 13 fichiers | vision / Sharingan cassent |
| `brainOverride` | 3 fichiers | l'Accueil ne peut plus router sur le modèle choisi |
| Contrat Mango, `sanitizeExternal`, « ne throw jamais » | tous les appels | le produit s'arrête |

**Conclusion : il n'y a pas de gras.** Le seul retirable est ce qui est **dormant** — la
garde `localOnly` (3 lignes) et 7 des 8 plafonds providers (jamais joignables, seul
`claude` est au registre). **Une dizaine de lignes.** Or ces mécanismes sont dormants
parce que ce sont des **assurances**, pas parce qu'ils sont inutiles : `localOnly` ne
sert à rien jusqu'au jour où un rôle repasse en local, et c'est ce jour-là qu'il empêche
le code souverain de sortir. Ce que Raf ressentait comme du poids était l'**organisation**,
pas la mécanique — et c'est ce qui vient d'être traité.

---

### ⚠️ CONSTAT NOUVEAU, ET IL N'EST PAS DANS LE DISPATCHER — la concentration du registre

En mesurant ce qui précède, un chiffre est sorti que personne ne cherchait :

- **8 rôles sur 8 pointent sur `claude`** ;
- le plafond `claude` est **10 appels/minute**, le plus serré de la table ;
- un tour d'équipes (`runTour`) émet **6 à 8 appels** — Orchestrateur, Analyse,
  Construction, Design, puis l'audit **et** le verdict.

**Deux tours dans la même minute saturent la fenêtre.** Le troisième part en backoff
1 s → 2 s → 4 s, puis passe quand même et récolte le 429 de Claude.

Le rate limiter n'est donc pas du poids mort : c'est la pièce **la plus près de se
déclencher** de tout le dispatcher. Et le défaut n'est pas là où on le cherchait — **ce
n'est pas le dispatcher qui est trop lourd, c'est le registre qui est trop concentré.**

Cela rejoint et aggrave la note du 2026-08-06 sur `runTour` (« l'allumage coûte de
l'argent ») : il coûte aussi des **créneaux**. Le sur-provisionnement des capacités,
gratuit côté outils, se paie deux fois dans le modèle par équipes.

⏳ **Non traité, et à arbitrer** : répartir les rôles sur plusieurs providers, ou faire
en sorte que l'Orchestrateur éteigne les équipes dont il n'a pas besoin (doc 03 § 2 le
prévoit : « décider qui s'allume » — `runTour` les allume toutes). Les deux se défendent ;
c'est une décision, pas une tâche.

---

### 2026-08-06 (élagage) — L'🧭 Orchestrateur ÉTEINT les équipes, et ça ne coûte rien

**Décision de Raf**, entre les deux issues ouvertes par le constat de concentration :
non pas répartir les rôles sur plusieurs providers, mais **faire que l'Orchestrateur
éteigne les équipes dont il n'a pas besoin**. C'est la plus fidèle au produit — le doc 03
§ 2 lui donne littéralement cette mission : *« décider quelles équipes allumer »*.

Jusqu'ici il ne l'exerçait pas : `runTour` allumait tout ce que l'escalier proposait, et
l'Orchestrateur était une équipe parmi les autres, portant une mission qu'il n'appliquait
pas.

#### La propriété qui rend l'arbitrage GRATUIT

L'Orchestrateur est allumé à chaque tour et **parle déjà, en premier**. Son appel est donc
déjà payé — c'est sa **réponse** qui était jetée. On lui demande simplement de répondre à
la question qu'il était censé trancher.

**L'élagage se paie zéro appel, et en économise autant qu'il éteint d'équipes.** Il n'y a
donc aucun arbitrage coût/fidélité à rendre : c'est strictement meilleur que le statu quo.
Mesuré sur un tour de construction dans `test-v3-parcours` :

| | Appels modèle | Équipes exécutées |
|---|---|---|
| Avant (tout allumé) | **7** | 6 |
| Après (Orchestrateur élague) | **4** | 3 |

Rapporté au plafond `claude` de 10 appels/minute : on passe d'environ **1,4 tour par
minute à 2,5**. Le constat de concentration n'est pas résolu — les 8 rôles restent sur le
même provider — mais il n'est plus au bord du déclenchement à chaque double tour.

#### Les trois règles, et pourquoi ce sont des règles

**1. Il élague, il n'ajoute JAMAIS.** Le choix se fait dans l'ensemble que l'escalier
déterministe a proposé. Sans cette borne, un modèle pourrait rallumer des équipes
qu'aucun signal ne réclame et le coût redeviendrait non borné — c'est la même discipline
que « la policy de l'appelant resserre, jamais n'élargit ».

**2. Il ne peut PAS éteindre 🛡️ Vérification** — ni s'éteindre lui-même. « Toujours, à la
clôture de chaque tour. Non désactivable » (doc 03 § 2). Le jour où un modèle décide que
la vérification est superflue est le jour où la promesse produit tombe. La règle est
gardée par une assertion qui lui fait explicitement omettre la Vérification de sa liste.

**3. En cas de doute, ON GARDE TOUT.** Réponse illisible, `data` sans champ `equipes`,
liste vide, cerveau en panne : on retombe sur le comportement d'avant. Dégrader vers
« tout exécuter » coûte de l'argent ; dégrader vers « ne rien exécuter » perdrait du
travail **en silence**. `applique: false` distingue ce repli d'un élagage qui n'a
simplement rien trouvé à éteindre — l'un est un accident, l'autre une décision.

Deux détails qui n'en sont pas : l'**ordre d'exécution** est reconstruit depuis les
candidates, jamais depuis la réponse du modèle (sinon l'ordre du bandeau dépendrait de sa
fantaisie) ; et un identifiant **inventé** est ignoré, jamais deviné.

#### Le bandeau montre ce que Mango a décidé de NE PAS faire

Les équipes éteintes sont journalisées « **pressenties** », avec le motif et l'auteur de
l'extinction. C'est souvent plus informatif que la liste de ce qui a tourné : l'utilisateur
voit que la demande a été comprise assez finement pour écarter du travail.

#### ⚠️ Une assertion de MOI était fausse, pas le code

J'avais écrit qu'une demande « écris un composant Panier » ne rend pas 🔎 Recherche
candidate. **Faux** : `read-web` fait partie des capacités sur-provisionnées par défaut
(`DISCUSS_DEFAULT_CAPS`), donc Recherche est candidate à **chaque** tour. Le test a été
corrigé, pas l'implémentation — et la distinction est désormais écrite noir sur blanc :
la règle interdit d'**ajouter hors candidates**, elle n'interdit pas de **garder** une
candidate que l'escalier a proposée, si étonnante qu'elle paraisse.

C'est aussi ce qui rend l'élagage utile : le sur-provisionnement est gratuit côté outils
(un outil non appelé ne coûte rien) mais coûteux côté équipes. **L'Orchestrateur est
exactement le correctif de ce déséquilibre.**

#### Ce qui reste ouvert

- La **concentration du registre** demeure : 8 rôles sur 8 sur `claude`. L'élagage
  desserre l'étau, il ne le retire pas. L'autre issue — répartir les rôles — reste
  disponible et n'est pas exclusive.
- L'Orchestrateur **élague** mais ne **réordonne** pas et ne **fusionne** pas deux
  équipes en un appel. Ce sont des optimisations possibles, non faites, non promises.

**Suite offline complète : 214 PASS · 0 FAIL** (569 s) · `tsc` 0 erreur ·
`test-v3-parcours` **55 pass** (30 → 55).

---

### 2026-08-06 (migration) — Plus AUCUN appel ne contourne le dispatcher

Décision de Raf : traiter d'abord les appels directs, puis la concentration du registre.
Motif retenu : **on ne règle pas un problème de débit tant qu'on ne mesure pas tout le
débit** — des appels invisibles du compteur rendaient toute mesure fausse.

#### ⚠️ Rectificatif d'abord : **8 fichiers / 11 appels**, et non « 25 fichiers »

J'ai annoncé « 25 fichiers » à plusieurs reprises, y compris dans deux messages de commit
et dans `statut.md`. **Faux.** Mon comptage attrapait les fichiers qui *mentionnent*
`askLLM` — imports, commentaires, types — au lieu de ceux qui l'**appellent**. Le vrai
compte est **8 fichiers, 11 appels**.

L'erreur n'était pas neutre : un chiffre trois fois trop gros faisait passer pour un
chantier lourd ce qui tient en une session, et aurait pu justifier de le reporter encore.
Corrigé dans `statut.md` et dans le plan 07.

#### Il manquait un barreau à l'échelle

| | Contourne le dispatcher ? | Contrat |
|---|---|---|
| `brain.ask` (= `askLLM`) | **oui, tout** | rend du texte, **lève** |
| `brain(...)` (= `dispatch`) | non | rend un `AgentResult`, **ne lève jamais**, impose le format Mango |
| **`brain.askAs`** *(nouveau)* | **non** | rend du texte, **lève** |

Entre les deux, il n'y avait rien. C'est **ça** qui expliquait les 11 appels directs :
un appelant qui veut du texte et un `try/catch` n'avait pas d'autre porte que celle qui
contourne tout. `askAs` tient les deux bouts — et c'est ce qui a permis de migrer les
11 appels **sans toucher un seul `try/catch`**.

#### Deux blocages étaient dans le dispatcher, pas dans les appelants

`maxTokens` et `imageMimeType` existaient dans `AskLLMOptions` mais **pas** dans
`DispatchOpts` : router un appel par `dispatch` les **perdait en silence**. Or l'un des
11 plafonne sa sortie à **10 tokens** et un autre envoie une **image**.

Un plafond perdu ne casse rien — il produit une réponse plus longue, plus chère, et
personne ne le voit. C'est le mode de panne le plus coûteux : celui qui ne se signale pas.
Ajoutés, et gardés par 6 assertions dont **« `maxTokens` survit au repli inter-providers »** :
perdre le plafond au moment d'une panne rendrait une réponse plus longue que demandée,
précisément quand quelque chose vient déjà de mal se passer.

#### Ce qui a été migré, et ce qui n'a pas bougé

| Fichier | Rôle emprunté | Moteur |
|---|---|---|
| `agent/agent-forge.ts` (×2) | `codeur` | inchangé (celui du rôle / du spécialiste forgé) |
| `design/design-review.ts` | `designer_ux` | inchangé (override explicite) |
| `eleve-gate-pedago.ts` | `juge` | ⚠️ **était un défaut d'environnement** |
| `eleve-speculative/…-trigger.ts` | `codeur` | inchangé |
| `eleve-tools/eleve-content-tools.ts` | `designer_ux` | inchangé |
| `formation/formation-fabrique.ts` | `designer_ux` | inchangé |
| `specialist/specialist-agents.ts` | `codeur` | inchangé |
| `routes/home-routes.ts` (×3) | `orchestrateur`, `vision` | inchangé — voir ci-dessous |

**Aucun appel ne change de modèle.** Chacun conserve son moteur par override explicite.

Deux n'en avaient aucun et tombaient sur `resolveProvider()`, le défaut d'environnement :
- `eleve-gate-pedago` — désormais rendu sous l'identité du **`juge`**, dont c'est le
  métier (« cette affirmation est-elle soutenue par sa source ? »). C'est le seul appel
  dont le cerveau change, et c'est un gain : un choix invisible devient une décision.
- `home-routes`, cas « aucun cerveau choisi » — **chemin utilisateur principal**, donc
  traité autrement : `resolveProvider()` est passé **explicitement**. Le défaut reste
  rigoureusement le même, il cesse seulement d'être invisible. Sur le chat d'accueil,
  changer de fournisseur sans pouvoir l'essayer en vrai aurait été un pari, pas un choix.

#### Ce que les 11 gagnent

- **Le rate limiter les compte.** Le calcul de tout à l'heure (« 4 appels par tour sur un
  plafond de 10 ») était **incomplet** : ces appels consommaient le quota Claude sans être
  comptés. Le limiteur croyait qu'il restait de la place.
- La **garde de souveraineté** s'applique — un rôle `localOnly` ne peut plus être
  contourné par un appel direct.
- Le **repli inter-providers** du rôle joue.
- Le provider devient **explicite** partout.

#### Ce qui change, et qu'il faut savoir

La **conscience temporelle** est désormais injectée en tête de ces 11 prompts (figée ON au
lot 2). C'est cohérent avec la décision produit, mais ce n'est pas rien : onze prompts ont
changé. Le contrat Mango, lui, n'est **pas** imposé (`freeform`) et le contenu utilisateur
n'est **pas** encadré (`trustExternal`) — le prompt reste sinon celui que l'appelant avait
écrit, à l'octet près.

#### L'invariant le plus important d'`askAs`

**Un override choisit un MOTEUR, il ne lève pas une GARDE.** Quand un appelant impose un
provider, la fusion conserve `localOnly` et la chaîne de repli **du rôle**. Un rôle
souverain reste souverain même si l'appelant demande un cloud — et c'est testé.

**7 imports morts** retirés au passage (les `askLLM` devenus inutiles).

**Suite offline complète : 214 PASS · 0 FAIL** (562 s) · `tsc` 0 erreur ·
`test-brain-facade` **21 pass** (11 → 21) · `test-brain-dispatch` **46 pass** (40 → 46).

#### Reste ouvert

La **concentration du registre** — 8 rôles sur 8 sur `claude` — est maintenant mesurable
pour la première fois : plus rien n'échappe au compteur. C'est la décision suivante.

---

### 2026-08-06 (inventaire) — `ollama` n'est pas toujours local, et ça faussait tout

Raf : « regarde ». En regardant l'inventaire RÉEL des cerveaux disponibles — plutôt que
ce que le registre déclare — un défaut est sorti, et il invalidait la mesure précédente.

#### L'inventaire réel

| Cerveau | Coût | Employé aujourd'hui |
|---|---|---|
| `claude` (abonnement) | inclus, **10 appels/min** | **les 8 rôles du registre** |
| `qwen2.5-coder:14b` (9 Go, LOCAL) | **gratuit** | **nulle part** |
| `glm-5.2:cloud` | **payant** (forfait Ollama) | `ELEVE_MODEL` — l'Élève de l'Atelier |
| `qwen3.5:cloud` | **payant** | l'appel « Qwen » de l'Accueil |
| OpenRouter (clé présente) | selon modèle | nulle part |

#### ⚠️ Le défaut : le limiteur comptait les appels les plus chers comme gratuits

`RATE_LIMITS.ollama = 999` portait un motif écrit noir sur blanc :
*« local → pas de limite réelle »*. **Faux pour les modèles à suffixe `:cloud`** —
`glm-5.2:cloud`, `qwen3.5:cloud` — qui tournent CHEZ Ollama, sont distants et facturés
sur le forfait de Raf.

Or ce sont exactement eux qui portent le vrai travail de construction. Le limiteur
n'était donc pas simplement inexact : **il l'était précisément là où il aurait servi.**

C'est aussi la troisième fois cette semaine qu'un **commentaire** énonçait une règle que
le code ne tenait plus (après les étapes numérotées sans 8, et le « double verrou : le
flag ET la chaîne » dont le flag avait disparu). Le motif se répète assez pour être noté :
**un commentaire qui justifie une constante vieillit plus vite que la constante.**

#### Ce qui est corrigé, et ce qui ne l'est PAS

Les modèles `:cloud` ont désormais leur **propre fenêtre** (`ollama:cloud`), séparée du
local. `cleDeFenetre(provider, model)` est la seule chose qui distingue « chez moi » de
« chez eux » ; `dispatch` lui passe le modèle, y compris pour chaque cible de repli.

**Le plafond reste volontairement à 999.** Le débit réel du forfait Ollama de Raf n'est
pas connu, et inventer un chiffre brimerait le produit sur une supposition. Le compteur
existe et se lit (`slotsConsommes("ollama:cloud")`) : **le renseigner est une donnée à
fournir, pas une décision de code.**

7 assertions neuves — dont « le suffixe `:cloud` n'affecte QUE ollama » : un test qui
tomberait sur `claude/opus:cloud` signalerait qu'on a écrit une règle trop large.

---

### La répartition du registre — analyse rendue, décision NON prise

J'avais annoncé, la veille : « le `codeur` devrait être en local, c'est l'argument de
vente du doc 03 ». **Après inventaire, je me corrige.**

Le seul cerveau réellement gratuit est `qwen2.5-coder:14b`. Or MangoQA l'a déjà mesuré
(ADR-001 § 1) : il a rendu *« aucun anti-pattern majeur »* là où Opus 5 trouvait un défaut
réel en 26,6 s. **Le placer sur le `juge` ou l'`auditeur` serait refaire l'erreur déjà
payée.** Sur le `codeur`, c'est un arbitrage réel — 14 milliards de paramètres contre
Opus, pour la pièce qui produit le livrable.

**Proposé, non appliqué :**

| Rôle | Proposition | Motif |
|---|---|---|
| `chercheur` | → `qwen2.5-coder:14b` (local, gratuit) | lire une page et la rapporter est la tâche la moins exigeante en jugement, et c'est du volume ; gain immédiat sur la fenêtre Claude, risque faible |
| `juge`, `auditeur` | **rester sur Claude** | la mesure MangoQA est sans ambiguïté |
| `codeur` | **ne pas bouger** | la promesse du doc 03 suppose un local assez fort ; celui installé ne l'est pas |

> **La vraie question n'est pas « quel rôle déplacer » mais « quel modèle installer ».**
> Le 1080 Ti (11 Go de VRAM) plafonne le choix autour de 9 Go — `qwen2.5-coder:14b` en
> occupe déjà 9. Tant que ce point n'est pas tranché, déplacer le `codeur` échange de la
> qualité contre du quota, sans que personne ait décidé du taux de change.

Trois lignes de `brain-registry.json`, aucune de code, réversibles en une minute — mais
c'est une décision produit, pas une tâche.

**Suite offline complète : 214 PASS · 0 FAIL** (602 s) · `tsc` 0 erreur ·
`test-brain-rate-limit` **23 pass** (16 → 23).

---

### 2026-08-06 (matériel) — Le local est fermé, et ce n'est pas le logiciel qui ferme

Raf voulait savoir quel modèle rentre dans sa configuration. `llmfit` a répondu :
**`Qwen/Qwen3.5-9B`**, quantifié `Q6_K`, 🟢 *Perfect*, 9,2 Go sur 11 — et multimodal,
donc candidat pour 👁️ Vision autant que pour 🔎 Recherche. Téléchargé (6,6 Go via Ollama,
Q4_K_M), il tient effectivement : **6,2 Go, 100 % sur GPU, contexte 16 384**.

Puis on a mesuré. Et c'est là que la soirée a basculé.

#### La mesure : 5,3 tok/s, trois fois, 0 % de dispersion

| Étape | Résultat | Ce que ça disait |
|---|---|---|
| `llmfit bench` | **4,5 tok/s** | Ollama alloue les **262 144** tokens du modèle → 16 Go réclamés → **46 % délesté sur le CPU** |
| bench par contexte | 5,9 → 33,9 tok/s | 100 % GPU partout, 4-5 Go libres → **du bruit**, pas une mesure |
| protocole propre | **5,3 tok/s, 0 %** | contexte fixe, modèle chaud, 3 passes |

> Le curseur « Context length » de l'application Ollama était à **256k** — c'est ce que
> `llmfit` a subi. **MangoOS, lui, n'aurait pas eu ce problème** : `llm-transport.ts`
> impose `num_ctx: 16384` à chaque appel. Le produit était protégé ; l'outil de mesure
> ne l'était pas.

#### La cause, et les cinq hypothèses éliminées une à une

Sous charge, la carte tombe en **P5 avec la mémoire à 810 MHz sur 5505** — 15 % de la
bande passante, soit ~71 Go/s au lieu de 484. Pour un modèle de 6,6 Go, ça plafonne à
**~11 tok/s en théorie**. On mesure 5,3. Tout concorde.

| Hypothèse | Verdict |
|---|---|
| Débordement VRAM | ❌ 100 % sur GPU, 4-5 Go libres |
| **Limite de puissance 150 W** | ❌ **la carte atteint P2 / 5005 MHz SOUS 150 W** pendant le chargement |
| Panneau NVIDIA « performances maximales » | ❌ appliqué, sans effet (agit sur la 3D, pas CUDA) |
| `nvidia-smi -lgc` (verrou de fréquences) | ❌ **non supporté** — GeForce Pascal, le verrou n'existe qu'à partir de Turing |
| `nvidia-smi -ac` (application clocks) | ❌ non supporté non plus |

**La deuxième ligne est celle qui compte.** J'avais présenté la limite de 150 W comme
« la dernière hypothèse sérieuse ». La mesure l'a réfutée : la carte monte à 5005 MHz
sous cette limite, elle en est capable — **elle redescend au moment précis où le décodage
commence**. Le décodage LLM, c'est des milliers de petits noyaux qui attendent la
mémoire : le pilote voit 45 W et peu de calcul, conclut qu'elle n'a besoin de rien, et
l'endort exactement quand il faudrait accélérer.

> Le seul apport du réglage NVIDIA aura été de faire tomber la dispersion de **199 % à
> 2 %**. Les pointes à 32 tok/s observées avant n'étaient donc pas un potentiel — c'était
> du bruit. Sans ce nettoyage, on aurait pu conclure « ça monte parfois à 32, c'est
> jouable » et bâtir dessus.

#### ⚠️ Conséquence produit : le doc 03 promet quelque chose que la machine ne peut pas tenir

Doc 03 § 2, 🔨 CONSTRUCTION : *« Coût : `$0` — c'est l'équipe qui travaille le plus, et
elle est gratuite. **C'est l'argument de vente.** »*

À **5,3 tok/s**, un composant de 300 lignes demande ~10 minutes de génération pure. Ce
n'est pas un arbitrage qualité/prix : c'est inutilisable. **Le registre reste sur
`claude` — non par choix d'architecture, par contrainte matérielle mesurée.**

Consigné en **L138** (`limites.md`) avec les cinq hypothèses éliminées, pour que personne
ne refasse l'enquête. Le doc 03 devra porter cette réserve, ou la promesse devra changer.

#### Trouvé en chemin, et indépendant du sujet — **L139**

La protection de L61 (`nvidia-smi -pl 150`, posée après les coupures d'alimentation du
2026-06-30) **a été posée à la main et rien ne la réapplique** : aucun outil de tuning en
mémoire, aucune tâche planifiée. Or un `-pl` **ne survit pas à un redémarrage**.

**Au prochain reboot, la carte repasse à 250 W et la faille d'alim se rouvre en silence.**
Si le PC a redémarré depuis, elle a déjà sauté au moins une fois. Une tâche planifiée au
démarrage suffit — 10 minutes de travail, et ça vaut d'être fait quelle que soit la suite
donnée au local.

#### Rectificatif sur une note qui m'appartient

Je portais en mémoire « deux coupures sèches le 2026-08-04 ». Les documents ne consignent
**aucune coupure en août** — les incidents tracés sont du **2026-06-30**. La note était
fausse ou visait autre chose ; elle est corrigée.

#### Ce qui reste ouvert

- **Rien du côté logiciel.** Tous les leviers pilote ont été essayés et documentés.
- Un outil tiers (Afterburner) pourrait forcer les fréquences — mais il **combat la
  protection PSU de L61**. À ne pas faire avant d'avoir traité l'alimentation.
- Un GPU Turing ou plus récent lèverait les deux contraintes d'un coup : verrouillage de
  fréquences supporté, et bande passante bien supérieure.

**État matériel à la fin des tests, vérifié : `power.limit = 150 W`, aucun verrou posé,
607/405 MHz au repos. Rien n'a été laissé modifié.**

---

### 2026-08-06 (lot 4, ouverture) — **98,9 % de la mémoire n'est jamais relue**

Avant d'écrire une ligne du lot 4, on a mesuré. Comme aux lots précédents, la mesure
contredit le document de conception — et cette fois elle donne aussi la réponse exacte
à la phrase qui a lancé toute la refonte : *« je pense que le système de mémoire doit
être mieux géré »*.

#### Le chiffre

```
workspace/.axioms.md      273 859 caractères  (~68k tokens · 1 419 axiomes appris)
cap d'injection             3 000 caractères  → dépassement ×91
réellement injecté          3 055 caractères  →  1,1 %
```

**Et ce 1,1 %, ce sont les PLUS ANCIENS.** `capRegistry()` fait `text.slice(0, 3000)` :
elle garde le **début** du fichier. Les axiomes s'ajoutent à la fin. Donc ce qui remonte
à chaque tour, ce sont toujours les mêmes premiers axiomes — `AXIOME-UIUX-01, vu le
2026-06-13` — et tout ce qui a été appris depuis est écrit puis **jamais relu**.

Ce n'est pas « la mémoire est mal gérée ». C'est **une mémoire qui écrit 100 % et lit
1,1 %, toujours le même**. Le ressenti de Raf était exact ; il lui manquait le chiffre.

#### La rotation existe, elle est OFF, et sa propre description dit le problème

`AXIOMS_ROTATE`, défaut `false` :
> *« au-delà du cap, archive le surplus dans `.axioms.archive.md` **au lieu de le couper
> en silence** »*

Le flag décrit donc littéralement ce qui se passe quand il est éteint. Essai à blanc avec
la vraie fonction (`planAxiomRotation`) sur le vrai fichier, **sans rien écrire** :

| | |
|---|---|
| rotation déclenchée | **oui** (seuil = cap × 3 = 9 000) |
| archivé (les plus anciens) | 270 983 caractères |
| conservé (les plus récents) | 2 874 caractères |

L'activer ferait passer l'injection « des 15 plus vieux » à « des plus récents », **sans
rien perdre** (l'archive garde tout). C'est un progrès net — mais ça reste de la
récence, pas de la pertinence. Le vrai correctif est le lot lui-même.

#### ⚠️ Le doc 05 est en partie périmé — trois rectificatifs

**1. Sa trouvaille centrale est déjà résolue.** Le doc écrit : *« Le vrai problème :
`ELEVE_MEMOIRE=off` … le système écrit énormément et ne relit presque rien. »* Le flag a
été **figé ON au lot 2** ; les appels de `memoireSection` et `buildMemoireTool` sont
désormais **inconditionnels** (sautés uniquement quand un transport est injecté, donc en
test). Le rappel proactif **tourne en production**.

> Mais **trois commentaires disent encore « Gaté ELEVE_MEMOIRE »** (`relay-agentic.ts`
> ×2, `eleve-memoire.ts`). **Cinquième fois cette semaine** qu'un commentaire énonce une
> règle que le code ne tient plus. À corriger dans le lot.

**2. Le compte est faux dans les deux sens :** 17 modules annoncés → **21 présents** ;
« ~5 700 lignes » → **3 826 mesurées**.

**3. Quatre modules n'ont aucune donnée.** `references.ts` (179 l.), `procedures.ts`
(248 l.), `lexique.ts` (237 l.), `concept-registry.ts` (323 l.) : **zéro fichier
correspondant sur les 425 projets**. Presque 1 000 lignes de magasins vides — à trancher
(⚪ archive ?) plutôt qu'à migrer.

#### Où vit réellement la mémoire — les trois substrats, mesurés

| Emplacement | Contenu réel | Volume |
|---|---|---|
| `workspace/` (racine, **global**) | `.axioms.md` **274 Ko** · `.preferences.md` 680 o · `.procedures/` | ~275 Ko |
| `workspace/<projet>/` (**par projet**) | `.chat-history.json` ×**204** · `.memory.md` ×**95** · `.architecture.md` ×**16** | 5,7 Mo |
| `server/data/` (**central**) | `blackboard.sqlite` **1,45 Mo** · `notes.jsonl` · 35 entrées | ~25 Mo avec `savoir/` |

**425 projets, dont 204 portent de la mémoire.** C'est la vraie échelle de la migration —
le doc n'en parle pas. « 17 modules → 1 » est un refactor ; déplacer la mémoire de
204 projets vers un SQLite unique est un changement de sémantique (par projet → global
avec scope), et il touche des données réelles.

#### Ce que ça change pour le lot

L'ordre du doc 05 § 6 reste bon, mais sa **priorité** change : le rappel proactif étant
déjà actif, le gain immédiat n'est plus « allumer le rappel » mais **arbitrer ce qui
remonte**. Un rappel qui tourne sur 1,1 % du magasin, toujours le même, ne vaut guère
mieux qu'un rappel éteint.

⏳ **Décision ouverte pour Raf** : activer `AXIOMS_ROTATE` maintenant (un mot, archive
tout, fait passer l'injection aux axiomes récents) ou attendre le budget de rappel du
lot 4, qui remplacera la récence par la pertinence. Les deux sont compatibles ; le
premier est disponible ce soir.

**Aucun code écrit, aucune donnée touchée. L'essai de rotation était à blanc.**

---

### 2026-08-06 (lot 4, geste 1) — La mémoire cesse de ne relire que ses plus vieux souvenirs

Deux défauts, et il fallait **les deux** : corriger l'un sans l'autre ne suffisait pas.

#### Défaut 1 — la rotation existait, éteinte

`AXIOMS_ROTATE` était à `false` par défaut, et sa propre description énonçait ce que
l'éteindre provoquait : *« archive le surplus **au lieu de le couper en silence** »*. Le
silence était donc le comportement **normal**. Résultat mesuré : 273 859 caractères pour
un cap de 3 000 — **91 fois le cap**.

**Figée ON, le flag disparaît** (règle du lot 2 : un flag est ON et fait partie du
produit, ou il n'existe pas). **13 flags** désormais.

#### Défaut 2 — `capRegistry` gardait le DÉBUT du fichier

```diff
- return text.slice(0, AXIOMS_MAX_CHARS)     // les plus ANCIENS
+ // la queue, coupée à une frontière de ligne  // les plus RÉCENTS
```

Les axiomes s'**ajoutent à la fin** ; `slice(0, cap)` gardait donc systématiquement les
premiers. Ce n'était pas un choix — c'est le sens par défaut de `slice`. Personne ne
l'avait décidé, et le message de troncature (« condense le registre ») laissait croire à
une perte marginale.

**Sans le défaut 1, le 2 restait actif** dans la bande `[cap, cap×3]` : entre 3 000 et
9 000 caractères, la rotation ne se déclenche pas et la troncature coupait encore les
récents. D'où la nécessité de traiter les deux ensemble.

La coupe se fait désormais à une **frontière de ligne**. Injecter un demi-axiome — un
« Contexte : » sans sa « Règle d'or » — est pire que ne rien injecter : le modèle lit une
prémisse et la prend pour une conclusion.

#### Le test dit maintenant ce qui compte

L'ancienne assertion « gate off → aucune archive créée » affirmait le comportement qu'on
vient de supprimer. Elle est devenue :

> **« `AXIOMS_ROTATE=off` résiduel → la rotation a QUAND MÊME eu lieu »**

C'est la bonne question quand on fige un flag : pas « le off fonctionne-t-il ? » mais
**« un vieux `.env` peut-il rallumer le comportement qu'on vient d'interdire ? »**.
Plus 6 assertions sur `capRegistry` (garde le récent, écarte l'ancien, coupe à la ligne,
annonce ce qu'il a écarté). **22 pass** (14 → 22).

#### Et les 3 commentaires qui mentaient

`relay-agentic.ts` ×2 et `eleve-memoire.ts` annonçaient « Gaté ELEVE_MEMOIRE » alors que
le flag avait disparu au lot 2. Corrigés. **Cinquième fois cette semaine** — après les
étapes numérotées sans 8, le « double verrou » sans flag, le `ollama = local` faux, et le
« Ollama plafonne à 4096 » démenti par la mesure.

---

### 2026-08-06 — Le cerveau central passe sur `glm-5.2:cloud`

Demande de Raf. **Vérifié avant de brancher, et c'était nécessaire.**

**`glm-5.2` est un modèle à RAISONNEMENT** : il consomme ses tokens dans un champ
`thinking` séparé et laisse `response` **vide** tant qu'il n'a pas conclu. Premier essai
à 200 tokens : réponse vide, `done_reason: length` — il réfléchissait encore.

Le risque était précis et silencieux : pour l'🧭 Orchestrateur, une réponse vide signifie
« arbitrage illisible → on garde toutes les équipes » (règle 3 de l'élagage). **L'élagage
aurait disparu sans qu'aucune erreur ne le signale.**

Deux mesures ont levé le risque :

| Vérification | Résultat |
|---|---|
| MangoOS gère-t-il le champ `thinking` ? | **oui** — `llm-transport.ts:152` bascule dessus si `content` est vide |
| Tient-il le contrat Mango via `dispatch` ? | **oui**, même au budget par défaut (1024) — 7 s puis 4 s |
| Son arbitrage est-il juste ? | **oui** — `["construction","design"]` pour « écris un composant Panier » |

`timeoutMs: 180 000` pour ce rôle : mesuré à 4-7 s, mais une demande complexe le fera
réfléchir bien plus longtemps et le défaut de 60 s aurait été trop juste.

> **Effet non prévu, et il tombe juste.** Ce rôle passant par `ollama`, il compte
> désormais dans la fenêtre **`ollama:cloud`** — celle qu'on a séparée le matin même en
> découvrant que le limiteur comptait les modèles `:cloud` comme du local gratuit. Le
> cerveau le plus sollicité du produit sort donc du plafond `claude` de 10/min, **et sa
> consommation est comptée**. La correction du limiteur et la demande de Raf se
> rejoignent sans avoir été coordonnées.

⚠️ **Réserve** : `glm-5.2:cloud` est **facturé** sur le forfait Ollama (les modèles à
suffixe `:cloud` ne sont pas gratuits). On déplace une charge, on ne la supprime pas —
mais on la déplace vers un quota qui n'était pas saturé, et qui est maintenant mesurable.

**Suite offline complète : 214 PASS · 0 FAIL** (575 s) · `tsc` 0 erreur ·
`test-axioms-rotation` 22 pass · flags **14 → 13**.

---

### 2026-08-06 (rectificatif) — Trois des quatre « magasins vides » sont pleins

**Erreur de ma mesure, corrigée dans l'heure.** L'entrée d'ouverture du lot 4 affirmait :
*« Quatre modules n'ont aucune donnée : `references`, `procedures`, `lexique`,
`concept-registry` — zéro fichier correspondant sur les 425 projets. ~1 000 lignes de
magasins vides, à archiver plutôt qu'à migrer. »*

**C'est faux pour trois d'entre eux.**

| Magasin | Fichier RÉEL | Contenu mesuré |
|---|---|---|
| `procedures` | `workspace/.procedures/` | **57 procédures** |
| `lexique` | `.lexique.md` (par projet) | **119 projets** en ont un |
| `concept-registry` | `server/data/concept-gaps.json` | **14 645 octets** |
| `references` | `.references/` | **0** — seul réellement vide |

#### La cause, et elle s'est déjà produite aujourd'hui

J'ai cherché des noms de fichiers que j'avais **devinés** — `lexique.json`,
`concept-registry.json`, `references.json` — au lieu de ceux que le code utilise :
`.lexique.md`, `concept-gaps.json`, `.procedures/`. Une absence de résultat sur un nom
inventé n'est pas une absence de données.

**Deuxième fois dans la même journée** : le matin, « 25 fichiers appellent `askLLM` »
comptait les fichiers qui *mentionnent* le symbole au lieu de ceux qui l'*appellent*
(vrai chiffre : 8 fichiers / 11 appels). Le motif est le même à chaque fois — **je
mesure une approximation de la question au lieu de la question**, et le chiffre obtenu
est plausible, donc il ne se signale pas.

Contre-mesure appliquée ici : demander le nom au **code** (`grep 'FILE_NAME = '`) avant
de chercher sur le disque, jamais l'inverse.

#### Ce que ça change pour le lot 4 — l'inverse de ce qui était écrit

**Ces modules ne sont pas à archiver.** Vérification des appelants (motif complet,
imports statiques et dynamiques, deux styles de guillemets) :

| Module | Appelants de PRODUCTION |
|---|---|
| `procedures` | **9** — `agent`, 4× `eleve/relay-*`, `eleve-artefact-tools`, `knowledge-stores-routes`, `review`, `stratege-learn` |
| `lexique` | **7** — `git-signals`, `miroir`, `orchestrator`, `plan`, `chat-route`, `scenario`, `knowledge-stores-routes` |
| `references` | **5** — `components`, `library-routes`, `nocturnal`, `scenario`, `knowledge-stores-routes` |
| `concept-registry` | **4** — `chaine-ambigue`, `concept-consolidation`, `integrity-audit`, `verificateur-contexte` |

**25 appelants de production au total.** Les archiver aurait cassé 25 points d'appel —
exactement la faute que le lot 1 avait déjà commise et documentée (*« jamais importé »
n'est pas *« mort »*), cette fois dans sa variante symétrique : **« sans données » n'est
pas « mort » non plus** — et ici, même les données étaient là.

#### Le seul cas qui reste ouvert

`references` : **5 appelants, 0 donnée**. Un magasin câblé que rien ne remplit —
`saveReference` n'a qu'**un** appelant. C'est une capacité qui existe et qu'on ne
nourrit jamais. À trancher au lot 4 : la nourrir, ou l'admettre morte et la retirer avec
ses 5 appelants. **Ce n'est pas la même question que « l'archiver », et elle ne se
tranche pas sur un compte de fichiers.**

Les entrées précédentes ne sont pas réécrites — elles portent la mesure telle qu'elle a
été faite, et ce rectificatif dit en quoi elle était fausse. Effacer l'erreur effacerait
aussi sa leçon.

---

### 2026-08-06 (lot 4, geste 2) — `recall()` : la mémoire a enfin un arbitre

`server/src/memory/` — `budget.ts` (l'arbitrage, **pur**) et `recall.ts` (la porte
unique, adossée aux magasins existants). **Aucun magasin réécrit** : `loadAxioms`,
`loadPreferences`, `loadUserProfile`, `loadSelfKnowledge`, `loadMemory`,
`loadLexique`, `proceduresPromptSection` restent la source. Même règle que `v3/` pour
le dispatcher — on ajoute ce qui manquait, on ne refait pas ce qui marche.

C'est l'étape 1 du doc 05 § 6, pas la migration. Rien n'est déplacé, rien n'est supprimé.

#### La règle qui structure le module : **une coupe se déclare**

C'est la leçon des axiomes, transformée en contrainte de conception. `.axioms.md` a
atteint 273 859 caractères pour un cap de 3 000 ; 98,9 % n'était jamais relu ; **personne
ne l'a vu pendant deux mois parce que la coupe ne disait rien**. Elle rendait un texte
plausible, borné, sans indiquer qu'elle venait d'écarter 270 000 caractères.

`arbitre()` rend donc toujours **ce qu'il a écarté, d'où ça venait, combien ça pesait et
pourquoi** (`budget-etage` · `budget-total` · `etage-eteint`). Et quand un étage
**incompressible** (① Identité, ③ Projet) doit malgré tout être amputé, `incompressibleAmpute`
passe à `true` : c'est une **anomalie journalisée**, pas un fonctionnement.

> L'assertion centrale du test n'est donc pas « le budget est respecté » mais
> **« tout ce qui est écarté est déclaré »**. Un budget silencieux est un bug qui met
> deux mois à se voir.

`test-memory-recall` : **37 assertions**. Dont : ne throw jamais (un magasin corrompu
n'emporte pas le tour — même garantie que `dispatch`), ④ Savoir tombe avant ② Goût,
① et ③ jamais avant les deux autres, l'arbitre **n'invente pas de pertinence** (il
respecte l'ordre que l'appelant lui donne, faute de pouvoir juger un texte).

---

#### ⚠️ La mesure sur les VRAIES données déséquilibre le doc 05

`recall()` lancé sur `workspace/` avec le vrai compteur de tokens :

```
retenus : 3 souvenirs · 2 314 tokens / 8 000
  ✓ identite  .axioms.md          1 463
  ✓ identite  .preferences.md       308
  ✓ savoir    .procedures/          543
écartés : 2
  ✗ identite  profil utilisateur  1 441  (budget-etage)
  ✗ identite  self-knowledge      1 974  (budget-etage)
```

**Premier constat : la correction du geste 1 tient sur le réel.** `.axioms.md` pèse
toujours 273 000 caractères, mais ce qui remonte est désormais **1 463 tokens des plus
RÉCENTS** — plus les mêmes quinze du 2026-06-13.

**Second constat, non prévu : les budgets du doc 05 ont été écrits sans mesurer.**

| Étage | Budget doc 05 | Candidats réels |
|---|---|---|
| ① Identité | 2 000 | **5 186** — saturé de 2,6× |
| ② Goût | 1 500 | **0** (non câblé) |
| ③ Projet | 2 000 | 0 (hors projet ici) |
| ④ Savoir | 2 500 | 543 |

**L'Identité déborde du double pendant que Goût et Savoir dorment.** Et le détail qui
compte : `self-knowledge` pèse **1 974 tokens** — à lui seul la quasi-totalité du budget
Identité. **Ce que Mango sait de LUI-MÊME concurrence directement ce qu'il sait de Raf**,
et c'est le second qui tombe.

Ce déséquilibre existait avant ce soir. La différence est qu'il **se voit** maintenant.
C'est le mode de panne des axiomes, à un autre étage — et il aurait suivi exactement la
même trajectoire : invisible, plausible, deux mois.

⏳ **À trancher au lot 4** : `self-knowledge` appartient-il à l'étage Identité ? Le
doc 05 § 2.2 l'y range (« absorbe : axioms · preferences · identity · self-knowledge »),
mais il décrit ce qui est **rappelé sur pertinence**, pas ce qui devrait vivre en dur
dans le prompt système. Le rebudgéter ou le déplacer sont deux réponses différentes,
et aucune ne se décide sans Raf.

#### Ce qui reste, honnêtement

- **② Goût n'a aucune lecture câblée** — il est éteint **sans condition**, et
  `scope.tacheVisuelle` est accepté sans rien changer encore. C'est écrit dans le code
  plutôt que suggéré par un `if` qui aurait l'air d'arbitrer : un étage vide qu'on croit
  allumé est un étage dont on ne remarque jamais l'absence.
- `remember()` et `forget()` du doc 05 § 2.1 ne sont **pas** écrits. `recall` seul est
  livré — c'est la moitié qui manquait, l'écriture fonctionne déjà via les magasins.
- **Aucun appelant de production ne passe encore par `recall`.** Le socle existe et est
  prouvé ; le brancher est le geste suivant.

**Suite offline complète : 215 PASS · 0 FAIL** (570 s) · `tsc` 0 erreur ·
`test-memory-recall` 37 pass.
