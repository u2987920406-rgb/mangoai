---
type: veille
tags: [veille, multi-agents, orchestration, souverainete, externe, trinity, conductor]
statut: reference
sources: ["https://sakana.ai/fugu/", "ICLR 2026 TRINITY", "ICLR 2026 Conductor"]
maj: 2026-06-26
---

# Veille — Sakana Fugu (orchestration multi-agents commerciale)

**Sakana Fugu** (Sakana AI) = un système d'**orchestration multi-agents** derrière une seule API (compatible OpenAI) qui **coordonne dynamiquement** un ensemble de modèles spécialisés au lieu d'un seul modèle monolithique. **C'est la thèse de MangoOS poussée à l'échelle commerciale** — mais propriétaire et au routage opaque, là où MangoOS vise la [[souverainete-progressive|souveraineté progressive]] et un routage transparent.

## Rôle (pourquoi cette page)
Référence externe qui **valide la direction architecturale de MangoOS** : un acteur de recherche industrialise exactement le pari multi-cerveaux ([[brain-dispatch]] #150, [[gardien-cloture]] #161, [[atelier-cerveaux]] #162, [[le-stratege]] #164). Sert de boussole pour les prochains lots, sans rien implémenter à chaud (cohérent avec le cap [[souverainete-progressive]] : observer avant d'élargir).

## Détails clés (le système)
- **Fondements** : 2 papiers ICLR 2026 (chacun sa page-entité).
  - **[[trinity|TRINITY]]** — coordinateur LLM évolué qui assigne des rôles : **Penseur · Exécutant · Vérificateur**.
  - **[[conductor|Conductor]]** — **apprentissage par renforcement** pour découvrir des stratégies de coordination exprimées **en langage naturel**.
- **Architecture** : sélection dynamique des agents selon la tâche · facturation au **modèle le plus haut utilisé** (pas de cumul) · désactivation possible de fournisseurs (conformité).
- **Variantes** : *Fugu* (équilibre perf/latence) · *Fugu Ultra* (qualité max).
- **Perf annoncée** : SWE-Bench Pro 73.7 · GPQA-D 95.5 · Humanity's Last Exam 50.0 ; parité revendiquée avec « Fable 5 » / « Mythos Preview ».
- **Éco** : 20/100/200 $ par mois + à l'usage (Ultra 5 $/M entrée · 30 $/M sortie · 0,50 $/M cache). **Indispo UE/EEE** (RGPD). **Routage non divulgué** (propriétaire).

## Correspondance Fugu ↔ MangoOS
| Dimension | Fugu | MangoOS |
|---|---|---|
| Idée centrale | Orchestration dynamique derrière 1 API | Router l'intention vers le bon cerveau |
| Routage | Auto (TRINITY), **opaque** | `brain-registry.json` + [[brain-dispatch]], **déclaratif + mesuré** |
| Rôles | Penseur · Exécutant · Vérificateur | [[eleve-local|Élève]] (Exécutant) · [[gardien-cloture|Gardien]] + juge (Vérificateur) — **« Penseur » pas encore un rôle distinct** |
| Découverte de stratégie | Conductor (RL, langage naturel) | [[le-stratege]] #164 (P0 ✅ déterministe, P1-4 à venir) |
| Admission d'un modèle | Opaque | [[examen-cerveau]] #148 + [[atelier-cerveaux]] #162 |
| Goût / UX | Implicite | [[moteur-gout]] #149 + [[oeil-coach]] #152 **explicites** |
| Souveraineté / coût | Cloud propriétaire, 30 $/M sortie | Ollama local $0, registre auditable |

## 3 idées à reprendre (pour MangoOS)
1. **Conductor → [[le-stratege]] #164** : Fugu *apprend par RL* des stratégies de coordination en **langage naturel**. C'est la suite logique des Phases 1-4 du Stratège — faire émerger les remèdes depuis l'historique des runs plutôt qu'un diagnostic figé. Validation que la direction est juste.
2. **Promouvoir un rôle « Penseur » distinct** : la triade de Fugu (Penseur·Exécutant·Vérificateur) est formalisée. Côté Mango, l'Exécutant (Élève) et le Vérificateur (Gardien + juge) existent ; le *Penseur* est aujourd'hui dilué dans [[planifier-avant-agir]] #160. Piste : un cerveau Penseur séparé qui pose le plan **avant** que l'Élève code.
3. **« Facturer au modèle le plus haut utilisé » → escalade frugale** : équivalent souverain = essayer le **moins cher d'abord** (déterministe $0 → gemma4:12b local → cloud), monter d'un cran seulement si ça ne résout pas. Exactement l'**échelle d'escalade** du [[le-stratege]] (condition B).

## Méthodes des 2 papiers (creusé 2026-06-26)

Même problème — coordonner un pool de LLM hétérogènes **sans fusion de poids** (compatible API fermées) — par **deux optimisations opposées**.

### TRINITY — *An Evolved LLM Coordinator* (Xu et al., arXiv 2512.04695)
- **Coordinateur minuscule** : petit LM **~0,6 B** + tête légère **~10K paramètres**. Ne résout rien lui-même, il distribue.
- **Boucle tour par tour** : à chaque étape, assigne à un LLM **un** des 3 rôles **Thinker / Worker / Verifier**. Le travail circule entre modèles.
- **Optimisation = ÉVOLUTION, pas RL** : **sep-CMA-ES** (Separable Covariance Matrix Adaptation Evolution Strategy), revendiqué supérieur au RL/imitation/random search (structure quasi-séparable, sans gradient).
- **Pas de fusion de poids** (contourne architectures incompatibles + API fermées).
- **Résultat** : **86,2 % LiveCodeBench** + gains coding/math/raisonnement + robustesse hors-distribution.

### Conductor — *Learning to Orchestrate in Natural Language* (Sakana)
- **Modèle 7 B entraîné par RL** (récompense end-to-end). Écrit **un workflow collaboratif en langage naturel**, pas la solution.
- **Pour chaque appel, spécifie 3 choses** : (1) quel agent, (2) la sous-tâche précise (*expert prompt engineer*), (3) le **contexte visible** par cet agent.
- **Adaptation à la difficulté** : factuel simple → 1 agent ; dur → pipeline auto **planner-executor-verifier**.
- **Scaling récursif au test** : peut **se désigner lui-même comme worker** → relit, repère l'échec, déploie un correctif.
- **Résultats** : **LiveCodeBench 83,9 %**, **GPQA-Diamond 87,5 %** ; bat Mixture-of-Agents.

| | TRINITY | Conductor |
|---|---|---|
| Coordinateur | ~0,6 B + tête 10K | 7 B |
| Apprentissage | **Évolution** (sep-CMA-ES) | **RL** (reward end-to-end) |
| Sortie | Assignation **de rôle** | **Workflow langage naturel** (qui·quoi·contexte) |
| Récursion test-time | — | **Oui** (s'auto-appelle) |
| Force | Ultra-léger, frugal | Expressif, prompt-engineer |

## 5 leçons pour [[le-stratege]] #164
1. **TRINITY valide la frugalité (condition B)** : 0,6 B suffit à orchestrer des modèles frontière → le cerveau Stratège de la **Phase 3** n'a pas besoin d'être gros (`gemma4:12b` local large dans la cible). Manager léger, intelligence dans les ouvriers.
2. **CMA-ES avant RL (condition A déterministe)** : optimiser les **seuils/poids de `diagnose()` par CMA-ES** sur l'historique des runs — sans gradient, déterministe-compatible, souverain — avant tout RL (que Conductor exige, lourd).
3. **Triade réassignable tour par tour** : Thinker/Worker/Verifier = Penseur ([[planifier-avant-agir]] #160) / Exécutant ([[eleve-local|Élève]]) / Vérificateur ([[gardien-cloture]] #161 + juge). Leçon : rendre ces rôles **interchangeables sous la main du Stratège**, pas figés en modules.
4. **Récursion Conductor = condition C, version online** : « se relire, repérer l'échec, déployer un correctif » = le geste du Stratège. Conductor le recalcule au test-time ; Mango le **persiste** (procédure #75) — avantage souverain.
5. **« Contexte visible par agent » à voler tout de suite** : borner le contexte injecté au worker dans `eleve.ts` → moins de bruit, moins de tokens, moins de dérive (anti-L17 sur-exploration).

**Synthèse** : Fugu prouve à l'échelle que la direction MangoOS est juste, et donne 2 recettes — **TRINITY** (évolution, ultra-léger, déterministe-friendly) pour le *cœur souverain du Stratège*, **Conductor** (RL, langage naturel, récursion) comme *horizon d'expressivité*. Valeur ajoutée Mango = **persistance** (#75) + **souveraineté** (tout local).

## Ce que MangoOS fait mieux
Transparence du routage (`brain-registry.json` auditable) · souveraineté & coût ($0 local vs 30 $/M) · le **goût** comme objet de première classe (Moteur de Goût + Œil-Coach), absent chez Fugu.

## Liens
[[trinity]] · [[conductor]] · [[brain-dispatch]] · [[le-stratege]] · [[gardien-cloture]] · [[atelier-cerveaux]] · [[examen-cerveau]] · [[planifier-avant-agir]] · [[moteur-gout]] · [[oeil-coach]] · [[phase-e-multicerveaux]] · [[souverainete-progressive]] · [[kernel]] · [[statut]]

## Sources
[https://sakana.ai/fugu/](https://sakana.ai/fugu/) (examiné 2026-06-26 via WebFetch) · TRINITY [arXiv 2512.04695](https://arxiv.org/abs/2512.04695) (abstract lu) · Conductor [sakana.ai/learning-to-orchestrate](https://sakana.ai/learning-to-orchestrate/) (blog lu) · [MarkTechPost — annonce Fugu](https://www.marktechpost.com/2026/06/22/sakana-ai-launches-sakana-fugu-an-orchestration-model-that-routes-tasks-across-a-swappable-pool-of-frontier-llms/).
