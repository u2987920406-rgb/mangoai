---
type: entite
tags: [veille, orchestration, multi-agents, coordinateur, evolution, frugal, externe]
statut: reference
sources: ["arXiv 2512.04695", "ICLR 2026", "https://sakana.ai/fugu/"]
maj: 2026-06-27
---

# TRINITY — *An Evolved LLM Coordinator* (Sakana, ICLR 2026)

**TRINITY** (Xu et al., arXiv 2512.04695) = un **coordinateur LLM minuscule** (petit LM ~0,6 B + tête légère ~10K paramètres) qui, **tour par tour**, assigne à un modèle d'un pool hétérogène **un** des 3 rôles **Thinker · Worker · Verifier**. Il ne résout rien lui-même : il **distribue**. C'est l'un des deux moteurs de [[veille-sakana-fugu|Sakana Fugu]], et la **validation externe de la frugalité** visée par [[le-stratege]] #164 (condition B).

## Rôle (pourquoi cette page)
TRINITY répond à une question centrale de MangoOS : *de quelle taille doit être le cerveau qui ORCHESTRE ?* Réponse mesurée par Sakana : **0,6 B suffit à coordonner des modèles frontière**. C'est l'argument scientifique derrière le choix du cerveau Stratège **local `gemma4:12b`** (Phase 3 de [[le-stratege]]) — *manager léger, intelligence dans les ouvriers* (l'[[eleve-local|Élève]]). Sert de boussole, pas d'implémentation à chaud (cohérent avec [[souverainete-progressive]]).

## Détails clés
- **Coordinateur ultra-léger** : ~0,6 B + tête ~10K params. Aucune résolution de tâche en propre.
- **Triade réassignable tour par tour** : à chaque étape, un LLM reçoit le rôle **Thinker** (penser) / **Worker** (exécuter) / **Verifier** (vérifier). Le travail circule entre modèles.
- **Optimisation = ÉVOLUTION, pas RL** : **sep-CMA-ES** (Separable Covariance Matrix Adaptation Evolution Strategy) — sans gradient, revendiqué supérieur au RL / imitation / random search sur cette structure quasi-séparable.
- **Pas de fusion de poids** : contourne les architectures incompatibles ET les API fermées → compatible avec un pool de modèles hétérogènes (exactement le cas de MangoOS : local Ollama + cloud).
- **Résultat** : **86,2 % LiveCodeBench** + gains coding/math/raisonnement + robustesse hors-distribution.

## Correspondance TRINITY ↔ MangoOS
| Dimension | TRINITY | MangoOS |
|---|---|---|
| Coordinateur | ~0,6 B + tête 10K, **opaque** | `diagnose()` déterministe + cerveau `stratege` `gemma4:12b`, **déclaratif/mesuré** ([[le-stratege]]) |
| Rôles | Thinker · Worker · Verifier, **réassignables** | Penseur ([[planifier-avant-agir]], pas encore distinct) · Exécutant ([[eleve-local]]) · Vérificateur ([[gardien-cloture]] + juge) |
| Apprentissage | **Évolution** sep-CMA-ES (sans gradient) | déterministe d'abord, procédures #75 persistées (≠ recalcul) |
| Modèles | pool figé, pas de fusion de poids | registre `brain-registry.json` ([[brain-dispatch]]), swappable à chaud |

## Pistes pour MangoOS (le concret)
1. **CMA-ES avant RL** (condition A déterministe) : optimiser les **seuils/poids de `diagnose()`** par sep-CMA-ES sur l'historique des runs — sans gradient, déterministe-compatible, souverain — **avant** tout RL (que [[conductor|Conductor]] exige, plus lourd). Piste portée dans `docs/plan-164` (§ veille Sakana).
2. **Triade réassignable, pas figée** : rendre Thinker/Worker/Verifier **interchangeables sous la main du Stratège**, plutôt que des modules en dur.
3. **Frugalité validée** : le cerveau qui classe l'ambigu n'a pas besoin d'être gros → garder Phase 3 local `$0`.

## Liens
[[veille-sakana-fugu]] · [[conductor]] · [[le-stratege]] · [[brain-dispatch]] · [[planifier-avant-agir]] · [[eleve-local]] · [[gardien-cloture]] · [[souverainete-progressive]]

## Sources
TRINITY [arXiv 2512.04695](https://arxiv.org/abs/2512.04695) (abstract + méthode lus 2026-06-26) · contexte [[veille-sakana-fugu]] · [Sakana Fugu](https://sakana.ai/fugu/).
