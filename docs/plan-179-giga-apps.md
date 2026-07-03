# Plan #179 — Giga-apps type Office : décomposition contractuelle & orchestration à l'échelle

> Conception Fable 5, 2026-07-03. Document autonome : exécutable par Sonnet/Opus sans retour vers l'architecte. L'annexe (section 5) alimente le corpus d'étude du raisonnement (`docs/corpus-fable/`).
>
> **Existant lu avant de concevoir** : `fondation.md` · `docs/revue-fable-fondations-2026-07-03.md` · `server/src/grand-chantier.ts` · `project-plan.ts` · `perfect-plan.ts` · `eleve-runtime.ts` (buildAgentic, delegate, budget, snapshots) · `eleve.ts` (runRelay, escalade) · `eleve-gate.ts` (Gardien #161) · `constellations.ts` · `kernel-blackboard.ts` · `agent-lock.ts` · `eleve-bricks.ts` (#169) · `eleve-speculative-exec.ts` (worktrees #171) · `limites.md` (L51) · survol `D:\IA\MangoQA` (flux-eye, suite-eye #138) · `docs/plan-178-bible-narrative.md` (document jumeau).

---

## 1. Contexte & contraintes

### 1.1 Le problème, reformulé — qu'est-ce qui casse EXACTEMENT aujourd'hui ?

Demander « fais-moi un tableur complet avec formules et graphiques » à Mango aujourd'hui emprunte l'un de deux chemins, et les deux cassent — pas au même endroit :

**Chemin A — run unique (`runRelay`).** GLM tient ~36 itérations avec un contexte plafonné à `ELEVE_AGENTIC_CTX_MAX = 60 000` caractères. Un tableur MVP fait ~80 fichiers / ~8 000 lignes ≈ 300 000+ caractères. Le modèle qui écrit le composant grille ne peut **jamais** voir le moteur de formules qu'il consomme :

```
Poids du code d'une giga-app     ≈  300 k – 2 M caractères
Fenêtre de travail de la boucle  ≈  60 k caractères (compaction comprise)
Ratio : le modèle voit ~3–20 % de l'app au moment où il écrit — et ce ratio EMPIRE avec la taille
```

En pratique, le run meurt bien avant : anti-exploration-stérile (6 lectures sans écrire), plafond d'itérations, ou le motif documenté « 12 search_code, 0 écriture » (#149). Ce n'est pas un réglage à monter — monter `maxIterations` à 200 ne crée pas de la fenêtre de contexte.

**Chemin B — Grand Chantier (#139/#166).** Le bon squelette existe : squelette → incréments Kanban → `runGrandChantier` enchaîne avec checkpoint/budget/quarantaine. Mais son modèle de décomposition est **« 1 incrément = 1 page »** (`kind: "page" | "stage" | "feature"`, stack figée `ts+rrv7`, `SCAFFOLD_RULES` parle de placeholders de *pages*). Or un tableur n'est pas une collection de pages :

1. **La difficulté est dans les moteurs, pas dans les écrans.** Parseur de formules, graphe de dépendances, recalcul, modèle de sélection, undo/redo : des modules profonds, purs, sans route ni preview — le vocabulaire « page » ne peut même pas les nommer.
2. **Aucun contrat d'interface entre incréments.** Le seul partage est le squelette (router, layout, tokens). Quand l'incrément 9 (grille) consomme l'API du moteur de formules posé par l'incrément 3, rien ne garantit que cette API est stable, documentée, ni même retrouvable sans brûler la moitié du budget d'itérations à relire du code. Deux runs séparés qui doivent s'emboîter n'ont aucun point de rendez-vous.
3. **Aucun ordre de dépendance.** `pickNext` prend le premier `todo` de la liste — ordre d'écriture, pas ordre topologique. La grille peut être tirée avant le moteur qu'elle affiche.
4. **Vérification aveugle aux modules.** Le gate d'incrément = build + tests globaux (opt-in) ; le Gardien #161 juge l'intention et le *rendu visuel*. Un moteur de formules n'a pas d'écran : son seul juge fiable est une suite de tests d'interface — qui n'existe nulle part dans le pipeline.
5. **Aucune mémoire de chantier.** Le run du module N ne sait pas ce que les modules 1..N-1 exposent, sauf en relisant les fichiers (impossible à l'échelle, cf. ratio ci-dessus).

> **Ce n'est pas un problème de génération de code. C'est un problème de frontières.**
> La question n'est pas « comment générer 300 fichiers » mais : **comment découper pour que chaque morceau tienne dans un run Élève prouvé (~36 itérations, ≤ ~15 fichiers), et comment garantir que des morceaux générés par des runs qui ne se sont jamais vus s'emboîtent quand même.** La réponse de l'industrie a un nom : des contrats d'interface écrits AVANT le code, et une intégration continue qui vérifie l'emboîtement à chaque pas — pas à la fin.

### 1.2 Contraintes non négociables (héritées du système)

| Contrainte | Source | Conséquence pour #179 |
|---|---|---|
| Gardien TOUJOURS actif, build-vert ≠ réussi | Règle absolue Raf 2026-07-02 | Chaque module passe un gate ; l'app assemblée passe le Gardien complet + `teste_parcours` |
| L'Élève apprend, on ne code pas à sa place | Directive transmission | La génération reste GLM ($0) ; le Maître cadre et arbitre, il ne génère pas les modules |
| Qualité en situation réelle | Règle ⭐⭐⭐ | La preuve de #179 est UNE app réelle utilisable (tableur MVP), pas un benchmark |
| Coût : GLM $0, Claude plafonné | Boucle nocturne, `GRAND_CHANTIER_BUDGET_USD` | La décomposition Maître est UN appel cher amorti sur ~15 runs gratuits |
| Un seul agent à la fois (verrou global) | `agent-lock.ts` (N18) | Le parallélisme n'est pas gratuit — décision explicite en D3, séquentiel d'abord |
| Toute injection de prompt est plafonnée | Revue Fable 🔴2 (cap références) | La mémoire de chantier injectée est cappée dès sa conception |
| Fichiers à la racine du projet = source de vérité | `.perfect-plan.json`, `.project-plan.json`, `.grand-chantier.state.json` | Le plan de modules et les contrats vivent en FICHIERS, pas seulement en Blackboard |
| Reprise sur interruption | Auto-reprise (règle 2026-07-03), snapshots durcis par la revue | Un chantier de 15+ runs doit survivre à un crash à n'importe quel run |

### 1.3 Ce qui existe déjà et se réutilise tel quel (à ne PAS réinventer)

- **`runGrandChantier`** : boucle checkpoint/budget/quarantaine/disjoncteur — le moteur d'orchestration séquentiel est bon, seul `pickNext` et `buildTask` évoluent.
- **`runRelay` + `buildAgentic`** : le moteur d'un run (Élève → Gardien → escalade Maître), durci par la revue (budget B0.1 câblé, snapshots bornés, reprise réparée).
- **Gardien #161 (`runClosureGate`)** : gère déjà proprement le cas « pas de rendu jugeable » (critique sautée) et les tests (`ELEVE_GATE_TESTS`, L55) — exactement le mode dont un module moteur a besoin.
- **Hooks #172 (`runGatedInvoke`)** : PreToolUse peut REFUSER une écriture — le mécanisme tout trouvé pour rendre les contrats immuables pendant les runs de modules.
- **Blackboard (verrous FIFO + store SQLite)** : verrou par-projet pour la phase parallèle ; store pour la réutilisation cross-projet (déjà prouvée : palettes/composants, reuseRate).
- **Worktrees #171 (`eleve-speculative-exec`)** : isolation git jetable + `apply` sur vert — la brique d'isolation de la phase parallèle existe et est testée.
- **Briques back #169 (`assemble_brique`)** : la preuve interne que « composer des modules pré-contractés » marche — les briques ont `provides`/`requires` résolus transitivement. #179 généralise ce modèle aux modules *générés*.
- **`teste_parcours`, MangoQA flux-eye (intra-app) et suite-eye (#138, cross-app)** : les juges d'intégration existent, il faut juste les câbler aux bons moments.
- **Bible narrative #178** : le document jumeau a établi le pattern « état hors contexte + Gardien de cohérence » pour la prose ; #179 est le même pattern pour le code, où on a un avantage énorme — **le compilateur et les tests sont des vérificateurs déterministes gratuits** que la prose n'a pas.

---

## 2. Décisions d'architecture

### D1 — Modèle de décomposition : un DAG de MODULES contractés (cœurs purs + tranches UI), pas une liste de pages

**Décision.** La giga-app est décomposée en **modules** organisés en **graphe orienté acyclique (DAG)** de dépendances. Deux natures de modules :
- **Modules cœur** (`core/*`) : TypeScript pur, zéro UI, zéro DOM — moteur de formules, modèle de cellules, graphe de recalcul. Jugés par tests d'interface uniquement.
- **Modules tranche** (`ui/*`, `feature/*`) : une tranche verticale visible (grille, barre de formule, panneau graphiques) qui CONSOMME les API des cœurs. Jugés par tests + Gardien visuel.

Chaque module est **dimensionné pour l'Élève** : ≤ ~12-15 fichiers, ≤ ~1 500 lignes — la taille qu'un run GLM de ~36 itérations boucle de façon prouvée. C'est la contrainte de dimensionnement PREMIÈRE : on ne découpe pas selon l'élégance conceptuelle, on découpe selon la capacité mesurée du générateur.

Concrètement : **`.project-plan.json` passe en v2** — `kind` gagne la valeur `"module"`, chaque incrément gagne `deps: string[]` (ids de modules), `contract: string` (chemin du fichier de contrat) et `palier: number` (point de synchronisation, cf. D4). Rétrocompatible : les champs sont optionnels, `normalizePlan` les tolère absents (les plans « pages » actuels restent valides).

**Alternatives considérées et rejetées :**
- *(a) Par pages (statu quo Kanban).* Rejeté : un tableur a 1 à 3 « pages » et 12 modules ; le vocabulaire ne peut pas exprimer là où est la difficulté. C'est la racine exacte de la limite actuelle.
- *(b) Par couches techniques horizontales* (tous les types → toute la logique → toute l'UI). Rejeté : rien de testable ni de montrable avant la dernière couche ; l'intégration devient un big-bang final — le mode d'échec le plus documenté du génie logiciel, et l'anti-pattern exact des axiomes AVOID (diagnostiquer à la racine : ici la racine serait « on a différé toute vérification d'emboîtement »).
- *(c) Par features verticales uniquement* (chaque feature embarque sa part de moteur). Rejeté : le moteur de formules est consommé par la grille, la barre de formule, les graphiques ET l'export — en tranches pures, il serait généré 4 fois, divergent 4 fois. Les cœurs partagés doivent être des modules propres.
- *(d) Un nouveau fichier `.giga-plan.json` séparé.* Rejeté après hésitation (cf. annexe) : ça dupliquerait la source de vérité du chantier et rendrait le Kanban UI aveugle aux giga-chantiers. Étendre `.project-plan.json` réutilise le Kanban, `markIncrementDone`, la réconciliation backend, et `runGrandChantier` sans copie.
- *(e) Monorepo à packages npm réels* (un `package.json` par module, workspaces). Rejeté pour la V1 : la mécanique d'install/link multiplie les points de panne (trauma orphelin-port, `0xC0000142` sur spawns) pour un bénéfice d'isolation que `tsc` + tests ciblés donnent déjà. Réévaluable à l'échelle Office réelle (500+ fichiers) — noté en risques.

### D2 — Stabilité des interfaces : CONTRATS-D'ABORD, en code exécutable, gelés par hooks

**Décision.** Avant toute génération de module, une phase unique écrit pour CHAQUE module :

1. **Le fichier de contrat** `contracts/<module>.ts` : les types publics + les signatures exportées du module, en TypeScript réel (pas de la prose), avec un commentaire d'en-tête de 5-10 lignes (rôle, invariants, ce que le module ne fait PAS).
2. **Les tests d'interface** `contracts/<module>.contract.test.ts` : une suite Vitest qui importe le module par son point d'entrée public (`src/<module>/index.ts`) et vérifie le COMPORTEMENT promis (ex. `evaluate('=SUM(A1:A3)')` sur un modèle seedé rend `6` ; une référence circulaire rend `#CIRC!` sans boucle infinie).

Le module généré doit satisfaire trois choses, toutes machine-vérifiables : `src/<module>/index.ts` ré-exporte exactement le contrat (`export * from '../../contracts/<module>'` côté types + implémentations conformes — `tsc` tranche), le build passe, ses tests d'interface passent.

**Le gel.** Pendant les runs de modules, le dossier `contracts/` est en LECTURE SEULE, imposé par un hook #172 (`PreToolUse` deny sur `write_file`/`edit_file` ciblant `contracts/**`) généré automatiquement dans `<projet>/.hooks/hooks.json` à la fin de la décomposition. Le mécanisme existe, est testé, et le message de refus explique à l'Élève quoi faire à la place (« le contrat est la spec : adapte TON code, ou marque le module bloqué avec ta raison »). Modifier un contrat reste possible — mais c'est un ÉVÉNEMENT DE CHANTIER (cf. D6 : arbitrage Maître + invalidation des dépendants), jamais une dérive silencieuse au fil d'un run.

**Pourquoi ça tient à travers des runs séparés.** Le run du module `ui/grid` (jour 2) n'a pas besoin de lire le code du moteur (jour 1) : il reçoit dans son prompt le CONTRAT du moteur (quelques centaines de lignes, pas des milliers), qui est garanti identique à ce que le moteur implémente — parce que `tsc` + les tests d'interface du moteur l'ont prouvé au moment de son propre gate. Le point de rendez-vous entre deux runs qui ne se verront jamais, c'est ce fichier-là.

**Alternatives considérées et rejetées :**
- *(a) Contrats en prose (markdown de spec par module).* Rejeté : non machine-vérifiable — le drift s'installe silencieusement et n'est détecté qu'à l'intégration. La prose reste, mais en COMMENTAIRE du contrat code, jamais comme source de vérité seule.
- *(b) Schémas formels type OpenAPI/JSON-Schema.* Rejeté : ce sont des contrats de FRONTIÈRE RÉSEAU. Ici les frontières sont des imports TypeScript intra-app — `tsc` est déjà le vérificateur de forme le plus strict disponible, gratuit, et l'Élève le parle nativement. (Garder OpenAPI pour le futur cas front/back séparés — les briques #169 couvrent déjà ce flanc.)
- *(c) « Le run relit le code des modules voisins ».* Rejeté : c'est le statu quo, et c'est arithmétiquement impossible (§1.1) en plus de brûler le budget d'itérations en exploration — le mode d'échec n°1 documenté de GLM.
- *(d) Tests d'interface générés APRÈS le module, par le même run.* Rejeté : un modèle qui écrit le test après son code écrit un test qui valide son code (biais de confirmation mécanique). Le test écrit AVANT, par un autre cerveau, est une spec ; écrit après, c'est un miroir.
- *(e) Gel des contrats « par consigne de prompt » sans hook.* Rejeté : une consigne se dilue au fil de la compaction ; un deny hook est déterministe et déjà branché dans `runGatedInvoke`. Consigne + hook, pas consigne seule.

### D3 — Orchestration : séquentiel topologique d'abord (Grand Chantier v2) ; parallélisme borné par worktrees en phase 2, prouvé avant d'être promu

**Décision (phase 1 — la seule requise pour la preuve).** `runGrandChantier` reste le moteur. Deux évolutions chirurgicales :
- `pickNext` devient **topologique** : éligible = `status ≠ done` ET pas en quarantaine ET **toutes ses `deps` sont `done`**. Si un module en quarantaine bloque des dépendants, les dépendants sont signalés `bloqué-par-dépendance` (pas quarantaine — la nuance compte pour la reprise Maître, D6).
- `buildTask` construit la consigne module : contrat du module (INTÉGRAL) + contrats de ses deps directes (INTÉGRAUX) + une ligne par autre module (nom + rôle) + règles de non-débordement (« ne touche QUE `src/<module>/` + le câblage listé »).

Le séquentiel n'est pas un pis-aller : GLM est $0, les chantiers tournent la nuit, et le coût réel d'un chantier est le TAUX D'ÉCHEC, pas le wall-clock. Un tableur de 14 modules × ~20 min = une nuit. C'est acceptable pour prouver la mécanique.

**Décision (phase 2 — opt-in, gaté `GIGA_PARALLEL=on`, seulement après la preuve).** Paralléliser les FEUILLES INDÉPENDANTES du DAG (modules dont toutes les deps sont done et qui ne partagent aucun fichier de câblage) : 2-3 workers max, chacun dans un **git worktree jetable** (réutilisation directe de la mécanique #171 : worktree + build vert + `apply` des fichiers vers le projet), la fusion se faisant **sous verrou Blackboard par-projet** (`blackboard.withLock('giga:'+projectDir, …)`), un module à la fois. Le verrou global `agent-lock` reste ce qu'il est : il protège le CHAT et ses singletons (currentQuery, contexte vision, preview 5174) ; le runner giga-chantier prend le verrou agent une fois pour tout le chantier (comportement actuel), et le parallélisme vit ENTRE le runner et ses workers, pas entre plusieurs agents de chat.

**Alternatives considérées et rejetées :**
- *(a) Parallèle-d'abord, N runs Élève simultanés dans le même dossier.* Rejeté fermement : collisions d'écriture sur les fichiers partagés (router, `package.json`), snapshots de reprise par `projectDir` qui s'écraseraient (la revue Fable vient de corriger EXACTEMENT ce bug pour les sous-agents, 🟠2 — le recréer en pire serait ironique), HMR/preview non multiplexée, npm concurrents. Le système dit lui-même, par ses singletons, qu'il est mono-écrivain par projet.
- *(b) Parallélisme par sous-agents `delegate` dans UN run.* Rejeté comme mécanisme d'échelle : les sous-agents partagent le contexte-budget du parent et tournent séquentiellement dans sa boucle ; `delegate` reste utile À L'INTÉRIEUR d'un module (déléguer un fichier pénible), pas pour orchestrer le chantier.
- *(c) Multi-process (N backends, N ports).* Rejeté : le trauma orphelin-port-3000 est documenté en CLAUDE.md comme erreur récurrente ; multiplier les process node non supervisés sous Windows est la recette exacte de ce trauma à l'échelle.
- *(d) Attendre le parallélisme pour livrer.* Rejeté : le goulot aujourd'hui est la COHÉRENCE, pas le débit. Livrer la phase 1 seule a de la valeur ; la phase 2 est une optimisation mesurable (accélération ×2-3 sur les paliers larges) qu'on n'achète qu'une fois la correction prouvée.

### D4 — Intégration continue interne : vérité à chaque module, cérémonie aux paliers

**Décision.** Deux rythmes de vérification, jamais différés à la fin :

**À chaque module (dans le gate du run, avant `markIncrementDone`) :**
1. Build complet (`inspectProject` — déjà là).
2. **Tests d'interface DU module** (nouveaux, obligatoires pour les modules — pour un giga-chantier, `ELEVE_GATE_TESTS` est forcé `on` par le runner : la règle « Gardien toujours actif » prime sur le défaut opt-in).
3. **Toute la suite accumulée** (les contrats des modules précédents re-tournent — c'est ça, l'anti-régression inter-runs : le module 9 qui casse le module 3 est refusé SUR-LE-CHAMP, pendant que le contexte du coupable est encore chaud pour la relance corrective).
4. Gardien #161 en mode adapté : intention toujours ; goût/WCAG seulement si le module a un rendu (le Gardien saute déjà proprement la critique quand il n'y a rien à voir — aucun code nouveau, juste le bon usage).

**Aux paliers (points de synchronisation définis à la décomposition — typiquement 3-4 par app : « cœurs posés », « grille utilisable », « MVP complet ») :**
1. `teste_parcours` sur les parcours utilisateur du palier (définis À LA DÉCOMPOSITION, pas improvisés — ex. « saisir 3 valeurs, écrire =SUM, voir le résultat, modifier une valeur, voir le recalcul »).
2. MangoQA **flux-eye** (auditeur de flux intra-app) sur l'app assemblée.
3. Gardien VISUEL complet sur l'app entière (pas module par module) : goût, WCAG, équilibre, vraies images — c'est ici que « la somme de modules corrects » est jugée comme UNE app (axiome UX 34 : somme de biens ≠ mémorable).
4. Échec de palier → le runner ne continue PAS aveuglément : diagnostic (quel module du palier est en cause via les tests/parcours), relance corrective ciblée, et au-delà du budget → arrêt propre avec état parlant (pas 10 modules construits sur des fondations rouges).

**Alternatives considérées et rejetées :**
- *(a) Tout vérifier seulement à la fin.* Rejeté : big-bang, cf. D1(b). Avec 15 runs, une dérive au run 3 coûte 12 runs de travail contaminé.
- *(b) Gardien visuel complet à CHAQUE module.* Rejeté : les modules cœur n'ont pas d'écran (critique systématiquement sautée = bruit de log), et les modules UI intermédiaires seraient jugés sur une app incomplète (faux négatifs de goût sur des placeholders assumés). Le goût se juge aux paliers, sur du montrable.
- *(c) Suite de tests ciblée seulement (pas d'accumulation).* Rejeté : c'est l'accumulation qui attrape les régressions inter-modules — le point le plus précieux. Vitest sur ~15 suites de contrat reste sous la minute ; si ça enfle, on optimisera avec `--changed` (noté, pas requis V1).

### D5 — Mémoire de chantier : le manifest v2 + les contrats SONT la mémoire ; injection cappée ; Blackboard en index secondaire

**Décision.** Le run du module N sait ce que 1..N-1 exposent par TROIS canaux, tous dérivés des fichiers du projet (source de vérité crash-proof, versionnable, lisible par Raf) :

1. **`.project-plan.json` v2** : l'état du DAG (fait/à faire/quarantaine, fichiers de chaque module) — injecté comme aujourd'hui via une `gigaPlanSection` héritière de `projectPlanSection`.
2. **`contracts/`** : la connaissance PRÉCISE — contrats intégraux du module courant et de ses deps directes injectés dans la consigne (cf. D3).
3. **`.chantier-memo.md`** (nouveau, léger) : 1-3 lignes par module FAIT, écrites par le RUNNER (pas par l'Élève — fiabilité) à partir du résumé de run : décisions notables, pièges rencontrés (« le recalcul est synchrone, ne pas l'appeler dans un render »), à destination des runs suivants. Injecté en queue de consigne.

**Caps dès la conception** (leçon revue Fable 🔴2 — la seule injection sans cap était un défaut critique) : contrats deps ≤ 12 000 car. au total (au-delà : les signatures seules, marqueur `[contrat tronqué — relis contracts/x.ts]`) ; memo ≤ 2 000 car. (les plus récents d'abord) ; section plan ≤ 100 lignes.

Le **Blackboard** n'est PAS la mémoire de chantier primaire : il reste l'index CROSS-PROJET (le chantier y dépose, module par module, les composants réutilisables — mécanique constellation/reuseRate existante — pour que le PROCHAIN chantier tableur/texteur réutilise le moteur déjà prouvé).

**Alternatives considérées et rejetées :**
- *(a) Blackboard comme mémoire primaire du chantier.* Rejeté après hésitation sérieuse (cf. annexe — c'était le choix « élégant ») : le Blackboard SQLite vit dans le workspace MangoOS, pas dans le projet ; un projet copié/zippé/rejoué perdrait sa mémoire de chantier ; et le pattern maison éprouvé (perfect-plan, project-plan, grand-chantier.state) est « fichier à la racine ». La cohérence du système bat l'élégance de la nouveauté.
- *(b) L'Élève met à jour lui-même le memo.* Rejeté : on vient de voir (garde-fou `markIncrementDone` « même si l'agent a oublié de cocher ») que la bookkeeping confiée au modèle est best-effort. Le runner écrit le memo depuis `result.text` — déterministe.
- *(c) Résumé LLM du code des modules faits (à la #178).* Rejeté ici : le code a déjà son résumé exact et exécutable — le contrat. La prose de #178 a besoin d'extraction de faits parce qu'elle n'a pas de compilateur ; le code n'a pas ce problème. Ne pas importer la complexité du jumeau là où elle est inutile.

### D6 — Rôle du Maître vs GLM : le Maître DÉCOMPOSE et ARBITRE ; GLM GÉNÈRE ; le déterminisme INTÈGRE

**Décision.** Répartition par valeur marginale du QI :

| Phase | Qui | Pourquoi |
|---|---|---|
| Décomposition (spec → DAG + contrats + tests d'interface + parcours de palier) | **Maître (Opus)** — UN run cher | C'est LE point de levier : une mauvaise décomposition condamne 15 runs gratuits. Axiome AVOID 38-39 : l'échec systémique vient de la racine. Le contrat 30-questions (`.perfect-plan.json` mode chantier) est son INPUT, pas son substitut — les 30 réponses cadrent le produit, pas l'architecture. |
| Revue de décomposition | **Raf (checkpoint optionnel, Kanban)** | Le DAG s'affiche dans le Kanban existant ; Raf peut réordonner/renommer AVANT le lancement (mécanique `replaceIncrements` existante). Non-bloquant : en run nocturne, on continue sans lui (règle : ne jamais attendre un humain). |
| Génération de chaque module | **Élève GLM** ($0), `runRelay` inchangé | Capacité prouvée sur cette taille. L'escalade Maître par-module existe déjà dans runRelay — inchangée. |
| Intégration | **Déterministe** (tsc + tests accumulés + teste_parcours) | Le compilateur ne fatigue pas et ne coûte rien. Aucun « agent intégrateur » LLM. |
| Arbitrage (quarantaines, conflit de contrat) | **Maître**, en fin de chantier ou sur événement | Deux cas : (i) module en quarantaine après épuisement → le Maître fait UNE passe corrective avec le diagnostic accumulé ; (ii) l'Élève marque un contrat intenable (le hook l'a bloqué mais il a une raison) → le Maître tranche : amender le contrat (et invalider/relancer les dépendants DÉJÀ faits — le DAG dit exactement lesquels) ou reformuler la consigne du module. |

**Alternatives considérées et rejetées :**
- *(a) GLM décompose aussi (tout à $0).* Rejeté pour la V1 : la décomposition contractuelle est un raisonnement d'architecture cross-cutting — exactement le profil de tâche où GLM décroche (L51 : la capacité agentique soutenue est LE mur). On pourra le mesurer plus tard (faire décomposer les deux, comparer) — c'est même un bon exercice de transmission ; mais on ne fait pas reposer la preuve de #179 dessus.
- *(b) Le Maître génère les modules difficiles d'office.* Rejeté : contraire à la directive de transmission et au modèle de coût. Le Maître n'écrit du code de module QUE via l'escalade existante ou la passe de quarantaine.
- *(c) Un « agent intégrateur » LLM qui relit les jointures.* Rejeté : relire les jointures = relire le code = le problème de contexte de §1.1. Les jointures sont vérifiées par construction (contrats) et par exécution (tests, parcours) — du déterminisme, pas un troisième cerveau.

### D7 — Vérification à l'échelle : Gardien de module + Gardien d'intégration (deux niveaux, zéro nouveau juge LLM)

**Décision.** Formalisation de D4 côté responsabilités :
- **Niveau module** = `runClosureGate` existant, mode piloté par la nature du module (le champ `kind`/absence de route dit au runner s'il y a un rendu à juger). Pour les cœurs : intention + tests (les seuls signaux FIABLES — le juge d'intention existant lit tâche/résumé/fichiers, il fonctionne sans écran).
- **Niveau intégration (palier)** = un orchestrateur mince `giga-palier-gate.ts` qui séquence l'existant : `teste_parcours` → flux-eye → Gardien visuel complet → verdict agrégé `{ ok, raisons[] }` au même format que `GateVerdict` (relance corrective via le nudge existant `buildGateNudge`).
- **Niveau suite (Office multi-apps, plus tard)** = MangoQA **suite-eye** (#138) tel quel : cohérence cross-app (navigation, tokens partagés) — déjà conçu pour ça, rien à inventer.

**Alternatives rejetées :** un « Gardien d'intégration » LLM dédié (cf. D6-c) ; abaisser les seuils du Gardien pour les giga-apps (« c'est gros, soyons indulgents ») — rejeté frontalement : la règle ⭐⭐⭐ dit l'inverse, et un chantier qui accumule 15 modules « presque bien » livre une app médiocre uniformément (axiome AVOID 23).

### D8 — Premier produit : le TABLEUR (MangoSheet), et pourquoi lui

**Décision.** La preuve de #179 est un tableur MVP (~80 fichiers), pas un texteur ni un outil de slides.

**Pourquoi le tableur :**
1. **C'est le stress-test exact du mécanisme.** Son cœur (parseur → évaluateur → graphe de recalcul) est le module pur le plus profond des trois produits Office : si contrats-d'abord + tests d'interface marchent là-dessus, ils marchent partout. Un outil de slides prouverait surtout ce que Mango sait DÉJÀ faire (du visuel).
2. **Ses contrats sont naturellement nets.** `evaluate(formula, ctx) → value`, `recalc(changedCell) → affectedCells` : des frontières franches, idéales pour la première exécution du pipeline. Le texteur, lui, a la pire frontière qui soit (le modèle de document riche + contenteditable — un marécage connu où la difficulté est DANS un module, pas ENTRE les modules : ça ne testerait pas l'orchestration).
3. **Le DAG est assez profond pour être probant** (3-4 niveaux de dépendances, ~14 modules) et assez petit pour tenir en une-deux nuits.
4. **Vérifiable sans subjectivité** : `=SUM(A1:A3)` vaut 6 ou ne vaut pas 6. Les parcours de palier s'écrivent en une ligne. Le Gardien d'intégration a du grain solide à moudre dès le premier essai.

**Choix de stack du tableur** (règle proactivité : standard éprouvé, jamais custom si mieux existe — et tracer la stack) : React+Vite+TS (starter existant) · grille virtualisée **@tanstack/react-virtual** (des centaines de lignes fluides — ne JAMAIS rendre 10 000 cellules en DOM naïf) · état **zustand** (déjà vu dans les stacks prouvées) · graphiques **recharts** (template `charts/` existant) · **parseur de formules MAISON** (descente récursive, ~300 lignes pour l'arithmétique + références + plages + 15 fonctions) — alternative HyperFormula REJETÉE : licence GPLv3 (contaminante pour les apps générées) et boîte noire là où un parseur maison est un exercice de transmission parfait et un module-contrat exemplaire.

---

## 3. Plan d'implémentation par étapes

> Rappel des symboles : ⚡ Haiku 4.5 · ⚖️ Sonnet 4.6 · 🧠 Opus 4.8. Chaque étape liste ses fichiers, la réutilisation, et son test de preuve. `tsc --noEmit` + build UI verts exigés à chaque étape (règle projet).

| # | Étape | Contenu | Test de preuve | Modèle optimal | Effort |
|---|---|---|---|---|---|
| E1 | Plan v2 : modules + DAG | `project-plan.ts` : `kind:"module"`, `deps`, `contract`, `palier` (optionnels, rétrocompat) ; `grand-chantier.ts` : `pickNext` topologique + état `bloqué-par-dépendance` distinct de la quarantaine | `test-project-plan` étendu : normalisation v2 + anciens plans intacts ; `test-grand-chantier` : ordre topologique respecté, dépendant d'un quarantiné signalé non quarantiné, cycle détecté → plan rejeté | ⚖️ | S |
| E2 | Décomposeur Maître | Nouveau `giga-decompose.ts` : prompt Opus (input : `.perfect-plan.json` 30 q + description) → écrit `contracts/*.ts`, `contracts/*.contract.test.ts`, `.project-plan.json` v2 (DAG + paliers + parcours de palier), `.hooks/hooks.json` (deny écriture `contracts/**`, réutilise le format #172) ; CLI `run-giga-decompose` + route. Validation DÉTERMINISTE post-génération : le DAG parse, est acyclique, chaque module a contrat+test, `tsc` passe sur les contrats seuls | Test avec deps injectées (LLM mocké) : sortie invalide → rejet propre ; sortie valide → fichiers posés, hook actif (une écriture sur `contracts/` refusée via `runGatedInvoke`) | ⚖️ (le code) — le cerveau runtime est Opus | M |
| E3 | Mémoire de chantier + consigne module | `giga-plan-section.ts` : `gigaPlanSection(dir, moduleId)` (contrat intégral + contrats deps + résumé du reste + memo, TOUS cappés, marqueurs de troncature) ; runner écrit `.chantier-memo.md` depuis le résumé de run ; `buildTask` du grand-chantier branche le tout pour `kind:"module"` | Test pur : caps respectés au caractère près, deps directes intégrales, non-deps en une ligne ; sous les caps = byte-identique (pattern revue Fable) | ⚖️ | S |
| E4 | Gate deux niveaux | Runner force `ELEVE_GATE_TESTS=on` pour les chantiers-modules ; `checkIncrement` lance la suite ACCUMULÉE ; nouveau `giga-palier-gate.ts` : séquence `teste_parcours` → flux-eye → Gardien visuel, verdict agrégé format `GateVerdict`, relance via `buildGateNudge` ; échec de palier → arrêt propre du chantier (pas de fuite en avant) | Tests deps injectées : module cœur jugé sans critique visuelle ; régression inter-module (test du module 3 cassé par le 9) → refus immédiat ; palier rouge → chantier s'arrête avec état parlant | ⚖️ | M |
| E5 | **PREUVE : MangoSheet MVP (~80 fichiers) bout-en-bout** | Décomposition Opus réelle (~14 modules, 3 paliers) → chantier nocturne GLM → app réelle. Filet de reprise posé (tâches + cron heartbeat, règle 2026-07-03). Mesures : modules bouclés/quarantaine, coût $, itérations/module, verdicts de palier | LE test : `=SUM(A1:A3)` recalcule à la modification d'A1 ; parcours de palier verts via `teste_parcours` ; Gardien final vert ; **Raf utilise le tableur** (qualité en situation réelle — le seul juge qui compte) | ⚖️ (supervision) — runtime GLM+Opus | M-L |
| E6 | Rétex + durcissement | `limites.md` (limites honnêtes découvertes), axiomes chantier (quelle taille de module a le meilleur taux ?), dépôt Blackboard des modules réutilisables (moteur de formules → prochain chantier), MAJ statut/historique/wiki | Relance d'UN module depuis son contrat seul dans un projet vierge → il se génère et passe ses tests (preuve de réutilisabilité) | ⚖️ | S |
| E7 | Parallélisme borné (opt-in, APRÈS E5) | `giga-parallel.ts` gaté `GIGA_PARALLEL=on` : feuilles indépendantes du DAG en worktrees (réutilise `eleve-speculative-exec` : worktree + link modules + apply-sur-vert), fusion séquentielle sous `blackboard.withLock`, 2-3 workers max, mêmes gates | Test : 2 modules feuilles en parallèle, fusion sans conflit, suite accumulée verte ; conflit provoqué (fichier partagé) → refus de fusion propre + re-run séquentiel | 🧠 | L |
| E8 | Office-scale : texteur, slides, suite | 2e et 3e produits via le même pipeline ; suite-eye #138 câblé (cohérence cross-app : tokens, navigation) ; design system partagé déposé/rappelé via Blackboard + constellation « office » | Suite 2 apps : suite-eye vert ; réutilisation mesurée (reuseRate) des modules communs | 🧠 (cadrage) + ⚖️ (exécution) | XL |

**Ordre strict E1→E5** : la preuve (E5) est le point de non-retour — rien de E7/E8 ne se lance avant qu'un tableur réel généré par ce pipeline soit utilisé par Raf. Si E5 révèle que la taille de module prouvée est plus petite que prévu, on redécoupe (le DAG absorbe ça) — on ne gonfle PAS les bornes de la boucle Élève pour compenser.

---

## 4. Risques & limites honnêtes

| Risque / limite | Gravité | Réalité assumée | Mitigation |
|---|---|---|---|
| **Un contrat mal conçu contamine tous ses dépendants** | 🔴 | C'est LE risque central du contrats-d'abord : l'erreur du Maître au jour 0 coûte plus cher que n'importe quelle erreur de GLM | Validation déterministe post-décomposition (E2) ; checkpoint Raf Kanban ; procédure d'amendement de contrat (D6) qui invalide EXPLICITEMENT les dépendants — jamais de patch silencieux |
| **GLM ne tient pas certains modules même bien dimensionnés** (parseur = code dense) | 🟠 | Possible — L51 montre que la capacité agentique est le mur, et un parseur récursif est le genre de code où un modèle moyen s'emmêle | Escalade Maître par-module existante ; passe de quarantaine Maître ; mesure en E5 : si les cœurs denses partent trop souvent en escalade, on route les modules `core/*` directement vers un cerveau plus fort (le registre de cerveaux par intention existe — Phase E3 de `delegate`) |
| **Le câblage partagé reste une zone sans contrat** (router, `App.tsx`, `package.json`) | 🟠 | Deux modules qui ajoutent chacun « leur ligne » au même fichier = le seul vrai point de collision restant | Le squelette pose des POINTS D'ANCRAGE explicites (registre de panneaux, table de routes) ; consigne « ne touche que ton module + les ancrages listés » ; en phase parallèle, tout module touchant un fichier partagé est déclaré non-feuille (fusion séquentielle) |
| **Cohérence VISUELLE de 15 runs séparés** — correcte mais fade (axiome 34 : somme de biens ≠ mémorable) | 🟠 | Réel : chaque run optimise localement ; l'angle d'ensemble n'appartient à personne | L'ANGLE se décide à la décomposition (le Maître écrit la direction visuelle dans le squelette : tokens + 5 lignes d'intention par palier) ; le Gardien de palier juge l'app ENTIÈRE ; le goût reste calibré par Raf (mode observe) |
| **Wall-clock : ~14 runs séquentiels ≈ une-deux nuits par app** | 🟡 | Assumé en phase 1 — le débit n'est pas le goulot, la correction si | E7 (parallélisme borné) après la preuve ; reprise crash-proof déjà en place (grand-chantier.state + snapshots v2 + heartbeat cron) |
| **La suite accumulée ralentit avec le nombre de modules** | 🟡 | À ~40+ suites, le gate par-module se compte en minutes | Acceptable jusqu'à Office-scale ; ensuite Vitest `--changed`/sharding — optimisation connue, non spéculative |
| **Le tableur lui-même a des gouffres produit** (undo/redo transverse, perf 10k+ lignes, copier-coller sémantique) | 🟡 | Un MVP honnête en exclut une partie ; il faut le DIRE dans la décomposition, pas le découvrir | Le contrat de chaque module liste « ce que ce module ne fait PAS » ; le hors-scope MVP est écrit dans le plan (undo/redo = module V2 avec contrat command-pattern posé dès la V1, non implémenté) |
| **Monorepo-lite** : tout dans un `src/`, pas de vrais packages | 🟡 | À 500+ fichiers, l'absence de frontières de build réelles (imports profonds contournant les contrats) se paiera | Règle lint simple posée dès E1 (interdire l'import `src/<autre-module>/...` hors `index.ts` — vérifiable par le scan déterministe du gate, même mécanique que la garde placeholders) ; migration workspaces = décision Office-scale, pas avant |
| **Limite honnête (→ `limites.md` à la clôture d'E5)** : la décomposition reste un run LLM non reproductible — deux exécutions donnent deux DAG différents | 🟡 | Assumé : pas de « décomposition canonique » d'un produit | Piste 🟢 codage interne : bibliothèque de DAG-gabarits par domaine (le DAG tableur prouvé devient un TEMPLATE réutilisable, comme les 20 manifests de domaine) — la 2e app d'un domaine ne re-décompose pas de zéro |

---

## 5. ANNEXE OBLIGATOIRE — Trace de raisonnement

*(Corpus d'étude `docs/corpus-fable/` — écrit pour être étudié, pas pour briller.)*

### 5.1 Démarche effective (dans l'ordre réel, avec les impasses)

1. **J'ai lu la revue de fondations AVANT le code.** Choix délibéré : la revue de la veille dit où le système est fragile (injections non cappées, snapshots, gates jamais testés ensemble) — ces fragilités sont des CONTRAINTES de conception au même titre que les features. Trois décisions de ce plan (caps de D5, snapshots/worktrees de D3, memo écrit par le runner en D5-b) descendent directement de défauts que la revue venait de corriger : je conçois pour ne pas recréer les bugs qu'on vient de payer.
2. **J'ai cherché le point de casse EXACT avant de concevoir.** Le prompt disait « décomposition et orchestration » ; j'ai vérifié dans le code que c'était vrai et OÙ : `ELEVE_AGENTIC_CTX_MAX=60_000` dans eleve-runtime, `kind: "page"|"stage"|"feature"` dans project-plan, `pickNext = find(todo)` dans grand-chantier. Le diagnostic §1.1 n'est pas une reformulation du prompt : chaque affirmation a une ligne de code source. Sans ça, j'aurais conçu contre un problème imaginé.
3. **J'ai inventorié les mécanismes avant d'inventer.** Passage systématique : « de quoi ai-je besoin ? → existe-t-il déjà sous un autre nom ? ». Résultat : le gel des contrats, ce sont les hooks #172 ; l'isolation parallèle, ce sont les worktrees #171 ; le modèle provides/requires, ce sont les briques #169 ; les juges d'intégration, ce sont teste_parcours + flux-eye + suite-eye. **La quasi-totalité de ce plan est du câblage, pas de l'invention** — c'est voulu, et c'est ce qui le rend exécutable sans moi.
4. **J'ai dimensionné depuis la capacité prouvée, pas depuis le produit.** Le chiffre fondateur du plan n'est pas « un tableur a 14 modules » mais « GLM boucle ~36 itérations / ~15 fichiers ». Le découpage est DÉRIVÉ de cette mesure. C'est le renversement central : on ne demande pas au générateur de grandir jusqu'à la tâche, on découpe la tâche jusqu'au générateur.
5. **J'ai écrit les décisions avec leurs rejets AVANT le plan d'étapes.** Le plan d'implémentation s'est presque écrit tout seul une fois les 8 décisions posées — signe habituel qu'une conception est mûre. Quand les étapes résistent, c'est presque toujours qu'une décision amont est floue.

### 5.2 Alternatives failli-choisies, et les points de bascule

- **Blackboard comme mémoire de chantier (D5).** Ma première inclination — c'est l'outil « noble », avec recherche sémantique, et la fondation le nomme pilier. Bascule : en relistant les fichiers `.perfect-plan.json` / `.project-plan.json` / `.grand-chantier.state.json`, j'ai vu que le système a déjà tranché ce débat trois fois dans le même sens (état de chantier = fichier à la racine du projet), et que le Blackboard vit dans le workspace, pas dans le projet — un projet archivé perdrait sa mémoire. **Heuristique révélée : quand le système a un pattern répété trois fois, le prolonger vaut mieux que l'améliorer.** Le Blackboard garde le rôle où il est irremplaçable : le cross-projet.
- **Parallélisme au cœur de la V1 (D3).** Le prompt met « les paralléliser » dans le problème central — j'ai failli organiser tout le plan autour. Bascule en lisant `agent-lock.ts` (26 lignes, un booléen global, commentaire N18 récent expliquant les singletons protégés) : le système DIT qu'il est mono-écrivain, et la revue venait de corriger un bug de snapshots concurrents. Deuxième poussée : GLM est $0 et tourne la nuit — le wall-clock séquentiel ne coûte presque rien, alors que le débogage de courses coûterait des sessions. **Ce qui a failli me tromper : traiter la formulation du problème par le demandeur comme la structure de la solution.** La parallélisation reste (E7), mais comme optimisation prouvable, pas comme fondation.
- **Nouveau fichier `.giga-plan.json` (D1-d).** Failli-choisi pour « ne rien casser ». Bascule : `normalizePlan` est défensif par conception (il tolère et normalise n'importe quoi) — l'extension optionnelle est QUASI gratuite, et elle garde le Kanban UI, `markIncrementDone`, la réconciliation. Créer un fichier jumeau aurait créé deux sources de vérité — la catégorie de bug la plus chère à long terme.
- **HyperFormula pour le moteur de formules (D8).** Réflexe « proactivité technos : jamais custom si mieux existe ». Bascule en vérifiant la licence : GPLv3 — contaminante pour des apps générées qu'on veut libres d'usage. La règle de proactivité a une clause implicite que j'ai dû me rappeler : *standard éprouvé ET compatible*. Vérifier la licence AVANT de recommander une lib devrait être un réflexe systématique du système, pas une chance.
- **Un Gardien d'intégration LLM (D7).** Séduisant par symétrie (« un Gardien par niveau »). Bascule : me demander ce qu'il LIRAIT — la réponse est « le code des jointures », donc le problème de contexte de §1.1 réapparaît déguisé. Un juge qui ne peut pas voir son objet est du théâtre de vérification. Le compilateur et les tests VOIENT tout, gratuitement.

### 5.3 Heuristiques employées (formulées pour être réutilisables)

1. **Découpe la tâche jusqu'au générateur, jamais l'inverse.** La capacité mesurée de l'exécutant est la maille de décomposition. Tout plan qui suppose « le modèle tiendra plus » est un pari, pas un plan.
2. **Le point de rendez-vous de deux runs qui ne se verront jamais doit être un artefact vérifiable par une machine.** Prose = drift silencieux ; code + test = drift impossible sans alarme.
3. **Chaque injection de prompt naît avec son cap** (et son marqueur de troncature). Corollaire de la revue 🔴2 — une injection sans cap est un bug en incubation.
4. **Le QI cher au point de levier maximal, le déterminisme partout où il suffit.** Un run Opus qui cadre 15 runs GLM gratuits est le meilleur ratio du système ; un LLM qui refait le travail de `tsc` est le pire.
5. **Quand le système a tranché trois fois pareil, prolonge le pattern.** (Fichier-à-la-racine, gates opt-in fail-open, deps injectées pour tester sans réseau — ce plan les suit tous les trois.)
6. **La bookkeeping ne se confie jamais au modèle génératif** — le runner l'écrit depuis les sorties. (Déjà gravé dans `markIncrementDone` ; généralisé au memo.)
7. **Une vérification qu'on ne peut pas exécuter tôt est une dette d'intégration.** D'où : tests d'interface AVANT le code, suite accumulée à CHAQUE module, cérémonie aux paliers — jamais « on verra à la fin ».

### 5.4 Ce qui a failli me tromper (au-delà des bascules ci-dessus)

- **La collision des mots.** « Contrat » désigne déjà `.perfect-plan.json` (contrat produit des 30 questions) ET la coque rigide `<mangoos>`. Introduire les « contrats d'interface » sans le dire aurait semé la confusion dans toutes les sessions futures. J'ai nommé les fichiers `contracts/*.ts` et je réserve « contrat » nu au sens produit dans le reste des docs. Les collisions de vocabulaire sont des bugs de documentation qui deviennent des bugs de code.
- **L'analogie avec #178.** Le jumeau narratif m'a d'abord poussé vers « extraction d'état + bible » pour le code aussi. Il m'a fallu un arrêt explicite pour voir la dissymétrie : la prose n'a pas de compilateur, le code en a un — importer la machinerie d'extraction de faits là où `tsc` existe aurait été de la complexité de contrebande. **Les analogies internes au système sont précieuses ET dangereuses : elles transportent la solution avec ses hypothèses.**
- **Le prestige du « Office-scale » immédiat.** La tentation de concevoir directement pour 500 fichiers et trois apps. La règle qualité-en-situation-réelle m'a ramené : la première marche est UNE app moyenne-grosse utilisée par Raf. Tout ce que E5 ne prouve pas, E8 le paiera au centuple.

### 5.5 Ce qu'il faut étudier dans ma façon de raisonner (pour la distillation)

1. **Je raisonne par propagation de contraintes depuis des invariants prouvés** (capacité GLM mesurée, caps de la revue, verrou global) plutôt que par vision descendante du produit. Force : les plans sont exécutables. Faiblesse à surveiller : ce style peut rater la solution qui exigerait de CASSER un invariant (ex. : et si le vrai bon plan était d'investir dans un cerveau à plus grande fenêtre plutôt que dans la décomposition ? Je l'ai écarté implicitement parce que L51/le coût le rendent non actionnable — mais je ne l'ai jamais formulé comme décision. Un futur lecteur devrait vérifier que mes « invariants » sont encore vrais avant de réutiliser le plan).
2. **Mon biais de réutilisation est fort et généralement payant, mais il a un angle mort** : je préfère câbler dix mécanismes existants plutôt qu'en créer un — si les mécanismes existants sont médiocres, je propage leur médiocrité avec assurance. Contre-mesure que j'applique sans toujours la nommer : je ne réutilise que ce qui a des TESTS et un historique de durcissement (hooks, worktrees, grand-chantier en ont ; c'est pour ça qu'ils sont éligibles).
3. **Je convertis les incertitudes en points de mesure datés** (E5 mesure la taille de module optimale, le taux d'escalade des cœurs denses) plutôt qu'en opinions. Étudier : la liste de ce que je choisis de mesurer révèle ce dont je doute vraiment — ici, je doute de la capacité de GLM sur le code dense, et du goût d'ensemble d'une app cousue de 15 runs. Les décisions D6 et D7/palier-visuel sont mes couvertures contre ces deux doutes précis.
4. **Je décide de l'ordre des preuves avant l'ordre des features.** E5 avant E7/E8 n'est pas de la prudence générique : c'est l'idée que chaque étage doit produire une évidence que l'étage suivant consomme (le DAG tableur prouvé devient gabarit ; le module moteur prouvé devient dépôt Blackboard). Un plan, pour moi, est une chaîne d'évidences, pas une liste de tâches.

---

*Fin du plan #179. Prochaine action : E1 (⚖️, S) — aucune dépendance externe, tout est dans le repo.*
