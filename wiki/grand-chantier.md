---
type: entité
tags: [orchestrateur, gros-projet, autonomie, phase-2]
statut: livré (gaté OFF, cœur prouvé 27/27 ; preuve live A-Z à venir)
sources: [statut, limites, "grand-chantier.ts"]
maj: 2026-06-29
---

# Grand Chantier

Orchestrateur qui enchaîne **tout seul** les incréments d'un gros projet A-Z, là où le mode « Gros Projet » #139 exigeait un clic manuel par incrément.

## Rôle
Transformer un `.project-plan.json` (squelette + incréments `todo/doing/done`, cf. [[mode-gros-projet]]/#139) en livraison autonome : squelette → **pour chaque incrément** (`runRelay`) → **Gardien+tests** ([[gardien-cloture]], Phase 1A) → `markIncrementDone` → suivant, jusqu'au plan complet ou au budget. C'est la **Phase 2** du grand plan (« le saut de Mango : fiable, rapide, gros projets »).

## Détails clés
- **Cœur PUR/testable** (`grand-chantier.ts`) : `runGrandChantier(projectDir, opts, deps)` avec deps injectées (`loadPlan`/`buildIncrement`/`checkIncrement`/`markIncrementDone`/`loadState`/`saveState`) → testé sans LLM réel. `pickNext(plan, failed)` PUR = premier incrément non-`done` hors quarantaine.
- **Checkpoint resumable** : `.grand-chantier.state.json` (`{skeletonDone, done[], failed[], costUsd}`), calqué sur `run-finish.ts` → reprend où ça s'est arrêté après coupure.
- **Budget** : `GRAND_CHANTIER_BUDGET_USD` (0 = illimité) → arrêt propre à la limite.
- **Quarantaine** : un incrément qui rate le Gardien après N tentatives (`attemptsPerIncrement`, défaut 2) est mis de côté (`failed[]`) → pas de boucle infinie ; `stopOnFailure` pour stopper au premier échec.
- **Gardien d'incrément** = `inspectProject` (build) + `runProjectTests` si `ELEVE_GATE_TESTS=on` (build vert ≠ tests verts, cf. [[limites|L55]]).
- **CLI** `run-grand-chantier.ts`, gaté `GRAND_CHANTIER=on` (zéro régression). Route/cockpit = Phase 4.
- **Tests** : `test-grand-chantier` 27/27 (happy path, reprise, budget, quarantaine, stopOnFailure, tests rouges, abort).

## Limites
- [[limites|L58]] — `buildIncrement` cadre chaque incrément par une consigne TEXTE (`PROJET_MODE_RULES` + `projectPlanSection`), pas par le prompt système « projet » complet assemblé dans `index.ts`. À enrichir avant un gros run réel.
- S'appuie sur la fiabilité Phase 1 ([[limites|L55]]/[[limites|L56]] ✅).

## Liens
[[gardien-cloture]] · [[planifier-avant-agir]] · [[le-stratege]] · [[souverainete-progressive]] · [[statut]] · [[limites]]

## Sources
`server/src/grand-chantier.ts`, `run-grand-chantier.ts`, `test-grand-chantier.ts` · statut.md (2026-06-29 ba) · limites.md L58
