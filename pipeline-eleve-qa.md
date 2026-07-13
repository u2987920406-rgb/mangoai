# Câblage du pipeline Élève + MangoQA — état technique (2026-07-14)

Complément OPÉRATIONNEL de `fondation.md` (section V, MangoQA — vision) : ici,
le câblage CONCRET (fichiers, variables d'env, mécanismes) tel qu'il existe
réellement dans le code aujourd'hui. Ce fichier décrit un ÉTAT DATÉ — vérifier
`.env`/le code si un doute apparaît, ne pas le traiter comme une vérité figée.

## 1. Vue d'ensemble

- **MangoOS** (ce dépôt) : orchestrateur — chat, gestion de projets, l'Élève
  (le cerveau qui code), le Stratège (déblocage), la Forge (auto-évolution).
- **MangoQA** (`D:\IA\MangoQA`, dépôt SÉPARÉ) : auditeur qualité indépendant —
  process à part (`npm start`), écoute les événements émis par MangoOS et rend
  un verdict (vert/rouge) par phase de projet.

## 2. Le cerveau Élève — qui code

- Configuré dans `server/.env` : `ELEVE_PROVIDER` + `ELEVE_MODEL`. Actuellement
  `ollama` / `qwythos-tools:q6` (local, $0, tool-calling natif réel).
- `resolveProfile(model)` (`server/src/models/profile.ts`) détermine la
  FAMILLE du modèle → un `ModelProfile` avec un flag `agentic`. PREMIER MATCH
  gagne (ordre du tableau `PROFILES` important — le plus spécifique avant le
  plus général).
- Selon `agentic`, deux moteurs distincts :
  - **Agentique** (`relay-agentic.ts`) — function-calling réel (outils :
    `read_file`, `write_file`, `edit_file`, `list_files`, `planifier`,
    `chercher_image`, `chercher_web`, `check_build`, `teste_parcours`, `finish`…).
  - **Contrat** (`relay-contract.ts`) — modèles faibles, DSL texte
    `<write>/<edit>/<run>`, pas d'outils. Pas d'intégration MangoQA native
    (contrairement au chemin agentique) — à ajouter manuellement si besoin.
- **⚠️ 3 registres de modèle, JAMAIS unifiés automatiquement** (limite connue,
  `limites.md`) — à resynchroniser À LA MAIN si on change de cerveau :
  1. `server/.env` (`ELEVE_MODEL`, le cerveau par défaut global)
  2. `server/src/data/brain-registry.json` (15 RÔLES indépendants — voir §3)
  3. `.brains/registry.json` (routage par intention, souvent vide/à part)

## 3. Le registre des cerveaux par RÔLE (Brain-Dispatch #150)

`server/src/data/brain-registry.json` (vivant, éditable dans Réglages →
Atelier des cerveaux) + `brain-registry.ts::DEFAULT_REGISTRY` (repli de
dernier recours si le fichier disparaît). 15 rôles, chacun avec son propre
`provider`/`model`/`timeoutMs`, ex. : `codeur` (= l'Élève), `vision`,
`stratege`, `forgeron`, `juge`, `routeur`, `orchestrateur`…

- Chaque rôle peut avoir un `fallback` (chaîne de repli inter-cerveaux,
  gaté `BRAIN_FALLBACK`) — ex. `vision` replie sur `qwen3.5:cloud` si le
  local `qwen3-vl:8b` échoue.
- Un seul modèle Ollama réside en VRAM à la fois (GTX 1080 Ti, 11 Go) — sollicter
  deux rôles différents en parallèle cause un swap/contention, pas un crash.

## 4. La boucle agentique — budgets et déblocage

- **Par appel** : `ELEVE_AGENTIC_MAX_ITER` (36) = plafond d'itérations outil.
  `ELEVE_AGENTIC_MAX_CORRECTIONS` (8, PLUS BAS, coupe AVANT) = détecteur
  anti-répétition/anti-exploration-stérile — c'est LUI qui coupe court en
  pratique la plupart du temps, pas le plafond de 36.
- **Auto-relances** : `ELEVE_SELF_RELANCE_MAX` (10) — si bloqué sans `finish`,
  le moteur se relance seul, jusqu'à 10 fois, SANS jamais appeler Claude par
  défaut (`ELEVE_ESCALATE_ON_BLOCK` OFF = souveraineté assumée).
- **Le Stratège** (`stratege.ts` + `stratege/stratege-signals.ts`) diagnostique
  chaque blocage en une CLASSE (`missing-dependency`, `knowledge-gap`,
  `wrong-tool`, `repetitive-failure`, `wandering`, `plateau-iterations`,
  `ambiguous`) et choisit un remède :
  - `install-dependency` → installe le paquet, relance.
  - `nudge` → consigne ciblée (ex. décomposer via `delegate`).
  - `reframe` (2026-07-14) → si le MÊME blocage récidive après son remède
    standard, remise en question bornée (1 fois max) : cite l'historique des
    tentatives déjà faites (accumulation, pas répétition) et exige un angle
    STRUCTURELLEMENT différent, pas un réajustement.
  - `escalate` → budget/tentatives épuisés, ou classe non couverte.
- **Budget du Stratège** : `ELEVE_STRATEGE_BUDGET` (3 déblocages par
  RUN, PUR — pas lié aux lacunes de la Forge, voir §5).
- **Cas `ambiguous`** : si `ELEVE_STRATEGE_BRAIN=on`, un cerveau reclasse
  (barreau 1 local `qwythos-tools:q6`) avant d'abandonner ; si
  `STRATEGE_BRAIN_ESCALATE=on`, barreau 2 cloud (`STRATEGE_ESCALATE_AGENT`,
  défaut `routeur` = GLM 5.2 cloud).
- **Montée de cerveau EXÉCUTANT** (Phase 4, `ELEVE_BRAIN_ESCALATE`) : si un
  barreau supérieur est configuré (`STRATEGE_EXEC_ESCALATE_MODEL`), swap tout
  le cerveau de l'Élève pour CE projet. Sans modèle configuré → aucun effet.
- **Fin de tout** : le moteur rend TOUJOURS la main honnêtement (jamais
  d'abandon silencieux) — soit succès, soit un message précis sur où ça coince.

## 5. Auto-évolution / la Forge (#168)

- `SELF_EVOLVE` (détecte les lacunes) + `SELF_EVOLVE_AUTO` (forge SANS clic,
  sous disjoncteur : `SELF_EVOLVE_MAX_FORGES`/run, `SELF_EVOLVE_OPUS_BUDGET_USD`,
  `SELF_EVOLVE_MAX_FORGE_ATTEMPTS` = 3 tentatives CUMULÉES, PAR CLASSE DE
  BLOCAGE, TOUS PROJETS CONFONDUS — pas par projet, volontairement (pour
  construire une bibliothèque de spécialistes réutilisables plutôt que
  reforger la même chose à chaque projet).
- Registre vivant : `server/src/data/open-gaps.json` (⚠️ un doublon orphelin
  existe à `server/data/open-gaps.json` SANS `src/` — ne rien y lire/écrire,
  plus rien ne le référence).
- `ELEVE_DELEGATE(_AGENTIC)` : réutilise un agent DÉJÀ forgé
  (`server/src/data/specialist-agents.json`) via `consultSpecialist`, filtré
  par winrate (`ELEVE_DELEGATE_MIN_WINRATE`/`_MIN_USES`) — pas de re-forge si
  un spécialiste pertinent existe déjà.
- **UI** : Réglages → Intelligence → « Lacunes à combler » (`AutoEvolution.jsx`,
  routes `/api/gaps*`). Badge de notification (2026-07-14) sur le dock
  (`Sidebar.jsx`) et l'item de nav — compte les lacunes `status:"proposed"`,
  visible sans avoir à naviguer dans Réglages.
- **Décision Raf pour valider une lacune** : pas une urgence de déblocage —
  un investissement (« ce mur revient-il assez souvent pour mériter un agent
  dédié permanent ? »), voir le champ `hits`.

## 6. Le Gardien / clôture (#161)

- `ELEVE_CLOSURE_GATE=on` — RÈGLE ABSOLUE, ne jamais désactiver. Vérifie
  intention + goût + QA AVANT de considérer un livrable fini. « Build vert »
  ne suffit jamais seul.
- Intègre MangoQA via `runClosureMangoQA()` (`relay-closure.ts`) : émet un
  signal de phase `"closure"`, attend un verdict (`waitForVerdict`, timeout
  `MANGOQA_CLOSURE_TIMEOUT`, défaut 60s), un `red` force une correction avant
  de conclure. Fail-open si MangoQA est absent (jamais bloquant).

## 7. MangoQA — le gardien séparé

- Process indépendant (`D:\IA\MangoQA`, `npm start`) — **ne démarre PAS tout
  seul avec MangoOS**, doit être lancé à part.
- Vivant = sentinelle heartbeat (`workspace/.mangoqa-active`, JSON avec
  `heartbeat` ISO) — `isMangoQaActive()` la juge périmée après 5 min sans
  battement. **Un fichier sentinelle PRÉSENT ne veut pas dire un process
  VIVANT** — toujours vérifier la fraîcheur du `heartbeat`, pas juste
  l'existence du fichier (cause réelle d'un run sans audit ce soir).
- Écoute un bus d'événements (`bus-events.jsonl`/`phase-complete.json`) émis
  côté MangoOS.
- 6 branches d'audit (architecture, security, accessibility, performance,
  tests, design-system) + Disjoncteur (pause après 3 échecs consécutifs sur un
  même projet, alerte Raf) + Œil Design + Auditeur de Flux + Observateur-Conseil.

## 8. Capacité matérielle (GTX 1080 Ti, 11 Go VRAM)

- `OLLAMA_NUM_CTX=49152` (mesuré en réel : marge saine ~1,7 Go ; 65536 devient
  fragile <1 Go libre ; 131072+ bascule en offload CPU, perd l'intérêt du GPU).
- `ELEVE_FETCH_TIMEOUT_MS=360000` (6 min, relevé après des timeouts réels sous
  charge — mesure encore partielle, à réévaluer si ça persiste).
- Un seul modèle Ollama chargé à la fois — tout appel à un AUTRE rôle
  (vision, stratege cloud…) pendant que l'Élève tourne cause un swap.

## 9. Avant tout run long/autonome

Dérouler `PRELAUNCH_CHECKLIST.md` (racine du repo) — services vivants (Ollama,
MangoQA), cohérence des 3 registres modèle, cohérence prompt↔chemin
(contrat vs agentique), capacité VRAM, hygiène du run (état nettoyé, filet de
reprise posé). Né d'un run où MangoQA était mort sans que ce soit détecté
avant lancement.
