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
