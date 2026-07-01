---
type: entite
tags: [architecture, qa, audit]
statut: actif
sources: [statut, fondation, historique]
maj: 2026-07-02
---

# MangoQA

> Audit autonome « fantôme » qui observe les générations de MangoOS **sans jamais les bloquer ni les modifier de force**. Système séparé (repo `D:\IA\MangoQA`), sans serveur web frontal — il observe via fichiers. Trois visages historiques (cf. [[fondation]] §V) **+ l'Auditeur de Flux (#137, intra-app) + l'Auditeur de Suite (#138, cross-app)**.

## Rôle

Contrôle qualité en arrière-plan. Il lit le flux du [[kernel]] (exporté en `.mangoqa/bus-events.jsonl` par le pont) et rend des verdicts. Au run 2026-06-20, les 3 visages ont tous parlé sur du réel.

## Détails clés — les 3 visages

1. **① Disjoncteur** (#110) — gardien **déterministe, zéro LLM, défensif** (peut ARRÊTER, jamais créer/modifier). Moteur pur `disjoncteur.ts` (`evaluateBreakers`, 100 % testable), 5 réflexes : circuit nocturne (N échecs de suite), garde-fou coût, verrou régression, dérive mémoire, kill switch agent (tours/tokens/durée). Au run : 5 trips réels (le filet testé = succès). **Fiabilisé 2026-07-02 ([[limites|L70]])** : le watcher ne meurt plus en OOM sur les sessions multi-heures — `runner.ts` `readBusEvents` ne relit que la **QUEUE** (4 Mo) du flux `bus-events.jsonl` append-only qui grossit (cause racine), le kill switch **ignore les agents périmés** (`agentStalenessMs` 30 min → un projet terminé ne re-déclenche plus ~40 agents morts) et le **log est dédupliqué**. Staleness défaut `Infinity` → zéro régression ; test-disjoncteur 45/0.
2. **② Observateur-Conseil** (Visage 2) — audit multi-branches (architecture, tests, dépendances, régression, build, a11y). Rend des verdicts 🔴/🟢. Méta-pattern repéré et à arbitrer : la branche **architecture** tire souvent au rouge sur du subjectif (« trop stricte ? »).
3. **③ Œil Design** (#111) — couche **objective et déterministe** du design, **jamais bloquante** (`blocking: false` invariant). Moteurs purs : `contrast.ts` (WCAG 2.1 exact), `tokens.ts` (adhérence palette), `eye.ts` (`inspectDesign`). Sépare le **mesuré** du **subjectif** (présenté en questions de convergence). Limite connue : couverture dépend du style (mesure 0 sur UnoCSS atomic et CSS-vars non résolues).

4. **🧭 Auditeur de Flux** (#137, Tier 0 livré 2026-06-21) — dimension **conseil, jamais bloquante** (`blocking:false`), **déterministe zéro LLM**, calquée sur l'Œil Design. Audite le **chemin humain** (ce que tsc/lint/tests ne voient pas) : il reconstruit le **graphe de navigation** d'un projet (auto-découverte de la variable d'état + fenêtres + routes) et applique le **contrat de flux** ([[flux]], 5 règles). `src/flux-eye/` (`graph.ts`/`eye.ts`/`runner.ts`) → écrit `.mangoqa/flux-observations.json` ; câblé dans `handleSignal` + CLI `run-flux-eye.ts`. **Mesuré (dur)** = cible fenêtre/route sans handler (R3, fallback impossible = certain) ; **convergence (questions)** = inatteignabilité (R1/R5), fantôme d'état (R3 doux), doublons (R2). Surfacé au chat côté MangoOS (`mangoqa.ts buildFluxMessage`). Tests 29/29. Validé sur le cockpit (0 faux positif dur, détecte les routes mortes de P2/P4). **Tier 1 livré** (`flux-eye/deep.ts`) : audit **LLM conseil, cost-aware** — `shouldRunDeep` gate le déclenchement (retry≥2 · ≥12 surfaces · fantôme dur · escalade `resolvedBy=maitre` · à la demande), `auditFluxDeep` réutilise le graphe + `askClaude` ($0 abonnement) pour juger **R4 (surfaces homogènes)** + cohérence sémantique → `flux-deep-observations.json` + ligne 🧭+ au chat. Tests 18/18. Validé en réel (a trouvé l'hétérogénéité `metrics` du cockpit). Modèle local dans MangoQA = hors scope (abonnement déjà $0).

5. **🧩 Auditeur de Suite** (#138, Tier 0 livré 2026-06-21) — dimension **cross-app**, **déterministe zéro LLM**, **jamais bloquante** (`blocking:false`). Là où l'Auditeur de Flux regarde UNE app, celui-ci juge la **cohérence du graphe de données entre apps** d'une [[composer-os]] suite : il lit les manifests `.mangoapp.json` (qui lit/écrit quelle collection, quelle forme) et applique le contrat de données. `src/suite-eye/` (`audit.ts` pur + `runner.ts` I/O) → écrit `<workspace>/.mangoqa/suite-observations.json` ; CLI `run-suite-eye.ts <workspaceDir>`. **Mesuré (dur)** = **conflit de schéma** (même collection+champ déclaré avec des types de base incompatibles entre apps → un lecteur mal-typera CERTAINEMENT la donnée). **Convergence (questions)** = collection lue sans écrivain (seedée ailleurs ?), écrite sans lecteur (orpheline ?), app en silo (ne partage avec personne). Complète les 3 garde-fous de la donnée partagée (SSE sync · ACL accès · schéma forme) par un **regard d'ensemble**. Tests 29/29 ; validé sur le workspace réel (2 apps, collection `tasks`, graphe cohérent). **Reste** : surfacer le rapport dans la fenêtre Suite de MangoOS (intégration, comme `mangoqa.ts` surface le flux).

⚠ **Bug chokidar documenté** : le signal de phase doit être écrit via Node.js, pas PowerShell/MINGW.

## Liens

Observe le [[kernel]] (via l'observateur `*` du Bus) · indépendant de [[boucle-curation]] et [[eleve-local]] · architecture détaillée dans [[fondation]] §V.

## Sources

[[fondation]] §V (les 3 visages) · [[statut]] #110, #111 · [[historique]].
