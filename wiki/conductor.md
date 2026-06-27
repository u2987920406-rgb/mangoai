---
type: entite
tags: [veille, orchestration, multi-agents, coordinateur, rl, langage-naturel, recursion, externe]
statut: reference
sources: ["https://sakana.ai/learning-to-orchestrate/", "ICLR 2026", "https://sakana.ai/fugu/"]
maj: 2026-06-27
---

# Conductor — *Learning to Orchestrate in Natural Language* (Sakana, ICLR 2026)

**Conductor** = un modèle **7 B entraîné par RL** (récompense end-to-end) qui, pour résoudre une tâche, **écrit un workflow collaboratif en langage naturel** au lieu de la solution elle-même. C'est le second moteur de [[veille-sakana-fugu|Sakana Fugu]] (l'autre étant [[trinity|TRINITY]]), et **l'horizon d'expressivité** de [[le-stratege]] #164 : faire émerger les stratégies de déblocage depuis l'historique plutôt que d'un diagnostic figé.

## Rôle (pourquoi cette page)
Conductor formalise deux gestes que MangoOS approche déjà mais n'a pas unifiés : (1) **planifier en langage naturel qui-fait-quoi-avec-quel-contexte** avant d'exécuter (le « Penseur » manquant, dilué dans [[planifier-avant-agir]]), et (2) **se relire, repérer l'échec, déployer un correctif** au test-time (le geste même du Stratège). Mango le rend **persistant** (procédure #75) là où Conductor le recalcule à chaque fois — l'avantage souverain. Boussole, pas implémentation à chaud ([[souverainete-progressive]]).

## Détails clés
- **Coordinateur 7 B entraîné par RL** (reward end-to-end). Écrit le **plan d'orchestration**, pas la réponse.
- **Pour chaque appel, spécifie 3 choses** : (1) **quel agent**, (2) la **sous-tâche précise** (en *expert prompt engineer*), (3) le **contexte visible** par cet agent.
- **Adaptation à la difficulté** : factuel simple → 1 agent ; dur → pipeline auto **planner → executor → verifier**.
- **Scaling récursif au test-time** : peut **se désigner lui-même comme worker** → relit, repère l'échec, déploie un correctif.
- **Résultats** : **LiveCodeBench 83,9 %**, **GPQA-Diamond 87,5 %** ; bat Mixture-of-Agents.

## TRINITY vs Conductor (les deux moteurs de Fugu)
| | [[trinity]] | Conductor |
|---|---|---|
| Coordinateur | ~0,6 B + tête 10K | 7 B |
| Apprentissage | **Évolution** (sep-CMA-ES, sans gradient) | **RL** (reward end-to-end) |
| Sortie | Assignation **de rôle** | **Workflow langage naturel** (qui · quoi · contexte) |
| Récursion test-time | — | **Oui** (s'auto-appelle) |
| Force | Ultra-léger, frugal, déterministe-friendly | Expressif, prompt-engineer |
| Pour Mango | cœur souverain du Stratège | horizon d'expressivité |

## Pistes pour MangoOS (le concret)
1. **« Contexte visible par agent » à voler tout de suite** : borner le contexte injecté au worker dans `eleve.ts` → moins de bruit, moins de tokens, moins de dérive (anti-[[planifier-avant-agir|L17]] sur-exploration). Piste portée dans `docs/plan-164` (§ veille Sakana).
2. **Promouvoir un rôle « Penseur » distinct** : un cerveau qui pose le plan **avant** que l'Élève code, séparé de [[planifier-avant-agir]] (aujourd'hui dilué).
3. **Récursion = condition C, version persistée** : « se relire, repérer l'échec, corriger » = le geste du Stratège ; Conductor le recalcule au test-time, Mango le **persiste** en procédure #75 → moins de recomputation, capitalisation.
4. **RL = horizon, pas point de départ** : commencer par l'évolution déterministe ([[trinity]], CMA-ES) ; le RL de Conductor reste l'expressivité visée plus tard.

## Liens
[[veille-sakana-fugu]] · [[trinity]] · [[le-stratege]] · [[planifier-avant-agir]] · [[gardien-cloture]] · [[eleve-local]] · [[brain-dispatch]] · [[souverainete-progressive]]

## Sources
Conductor [sakana.ai/learning-to-orchestrate](https://sakana.ai/learning-to-orchestrate/) (blog lu 2026-06-26) · contexte [[veille-sakana-fugu]] · [Sakana Fugu](https://sakana.ai/fugu/).
