---
type: entité
tags: [hooks, garde, boucle-agentique, extensibilite]
statut: livré
sources: ["#172"]
maj: 2026-07-01
---

# Hooks (gardes déclaratives)

Un **contrat commun** — (événement + matcher + handler) — exécuté par UN dispatcher générique, pour qu'ajouter une garde ne demande plus un fichier `.ts` + un câblage manuel dans le noyau, mais **une entrée de config**. #172.

## Rôle

Mango avait déjà des « hooks » — le Gardien ([[gardien-cloture]]), l'anti-spirale, le scope-guard — mais chacun était une fonction TS câblée à la main dans `eleve.ts`. Les hooks leur donnent un contrat déclaratif : un **événement** (un point précis de la boucle), un **matcher** (quand ça s'applique), un **handler** (fonction / commande / prompt), stockés en JSON (`<projet>/.hooks/hooks.json`), exécutés par un seul dispatcher. Gaté **`ELEVE_HOOKS=off`** (défaut → zéro coût, zéro régression).

## Détails clés

| Pièce | Module | Détail |
|---|---|---|
| **Dispatcher pur** | `mango-hooks.ts` | `runHooks(input, handlers)` : sélection (event+matcher, **dédup par id**), exécution séquentielle, **timeout dur**, **fail-open absolu** (un handler qui plante/timeout = absent), agrégation `deny > ask > allow`, `updatedInput` fusionné+propagé (PreToolUse). `fireObservationHook` pour les événements de cycle de vie. |
| **Loader** | `mango-hooks-config.ts` | `loadHooks(projectDir)` lit `.hooks/hooks.json` et résout les handlers `function` (registre `FUNCTION_HOOKS`) ; hook-jouet de sûreté `block-dangerous-run` (refuse rm -rf / format / fork-bomb). Ne lève jamais. |
| **Branchement outils** | `eleve-runtime.ts` `runGatedInvoke` | Au call-site `registry.invoke` de **`buildAgentic`** (la vraie boucle chaude, ≠ `askEleveAgentic`) : PreToolUse (deny → outil non exécuté ; updatedInput → args réécrits) + PostToolUse (observation). Gate off → invocation directe. |
| **PreFinish** | `eleve.ts` | Point extensible au moment du finish : un hook de config peut renvoyer l'Élève corriger, EN AMONT du Gardien natif (non réécrit — cf. L71). |
| **Cycle de vie** | `eleve.ts` | `OnEscalate` (escalade Maître), `OnBlock` (diagnostic Stratège), `OnGapRecorded` (lacune #168) — observationnels, fail-open. |
| **UI / API** | `index.ts` `GET /api/hooks` · `HooksPanel.jsx` | Onglet Réglages › Automatisation : liste les hooks résolus d'un projet + état du gate (lecture seule V1). |

## Points d'ancrage réels (≠ walkés depuis la doc CC)

`PreToolUse`/`PostToolUse` (seuls sur la boucle chaude, via `runGatedInvoke`) · `PreFinish` (le Gardien #161) · `OnBlock`/`OnEscalate` (Stratège / escalade) · `OnGapRecorded` (auto-évolution #168, spécifique Mango). Handlers V1 : `function` (in-process) ; `command`/`prompt` = incréments suivants.

## Limite honnête

Les gardes à **verdict riche** (Gardien, anti-spirale, scope-guard) ne se réduisent pas au contrat `allow/deny/ask` sans perdre leur convergence → **non dégradées** : elles restent natives, les hooks rendent leurs points **extensibles**. Migration littérale = enrichir le contrat ([[limites|L71]]).

## État

**Livré, gaté OFF, prouvé par tests** (#172, 2026-07-01) : Phases **0** (dispatcher pur, 33 tests) · **1** (branchement boucle chaude + loader + hook-jouet, non-régression `eleve-runtime` 49/0) · **2** (PreFinish extensible) · **4** (route `/api/hooks` + onglet UI, build vert) · **5** (cycle de vie OnEscalate/OnBlock/OnGapRecorded). **Phase 3** = gardes riches préservées ([[limites|L71]]). Tests : mango-hooks 33 · mango-hooks-config 17 · eleve-runtime 49 · eleve-gate 40 · tsc propre.

## Liens
[[gardien-cloture]] · [[le-stratege]] · [[auto-evolution]] · [[planifier-avant-agir]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#172` (plan `docs/plan-172-hooks.md` · statut.md · historique.md) · modules `mango-hooks.ts` / `mango-hooks-config.ts` / `eleve-runtime.ts` / `eleve.ts` / `index.ts` · UI `HooksPanel.jsx`.
