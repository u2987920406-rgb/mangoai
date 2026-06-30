---
type: entity
tags: [agent, souverainete, performance, deepspec]
statut: 🔨 slice 1 livrée (cœur prouvé) — #171
sources: [statut, historique, idee]
maj: 2026-06-30
---

# Exécution agentique spéculative

> Le *speculative decoding* (DeepSpec) transposé du niveau **token** au niveau **action** : un cerveau **frugal** drafte une séquence d'étapes, on **accepte le plus long préfixe valide**, on rend la main au 1ᵉʳ point de divergence. Acceptation haute → moins de tours du cerveau fort (plus de souveraineté).

## Rôle

Né de la lecture de `deepseek-ai/DeepSpec` (2026-06-30, partagé par Raf). DeepSpec entraîne des *draft models* qui proposent des tokens qu'un *target model* valide en bloc — accélère l'inférence. L'**outil littéral ne convient pas** à Mango (entraîner un draft-model = 8 GPU, même mur que [[eleve-local]]/#55 ; et le local bute sur la **capacité**, pas la vitesse — L51). **Mais le concept « draft → verify »** est déjà l'ADN de Mango au niveau agent, et #171 le rend explicite et réutilisable.

## Le pattern, déjà présent au niveau agent

| DeepSpec (token) | MangoOS (action) |
|---|---|
| draft model propose des tokens | Élève GLM (frugal) drafte les étapes |
| target valide en un passage | [[gardien-cloture]] #161 / juge valide |
| acceptance rate | métrique `/api/sovereignty` (taux Claude) |
| draft frugal → target fort | [[le-stratege]] #164 : échelle d'escalade |

## Détails clés (slice 1)

- `eleve-speculative.ts` — cœur **PUR**, I/O injectée, ne lève jamais.
- `runSpeculative(draft, { execute, verify })` : exécute la séquence draftée, **accepte le préfixe valide**, s'arrête à la **divergence** (n'exécute pas la suite — elle dépendait d'un état devenu invalide). Métriques : `accepted`, `divergedAt`, `acceptanceRatio`, `savedRoundTrips`.
- `nextDepth(depth, ratio, policy)` : **profondeur adaptative** (acceptation haute → +1, basse → ÷2) — comme on règle la longueur du draft en spec-decoding.
- `summarizeSpeculation` : ligne de log lisible.
- **22 tests verts**, `tsc` 0, **zéro GPU**.

## Garde-fou d'architecture

Les étapes à **effet de bord** (écritures, build) doivent être spéculées dans une **copie isolée** ([[auto-amelioration]] : git worktree) puis appliquées une fois le préfixe accepté — on ne peut pas « rejeter » un fichier déjà écrit dans le repo vivant.

## Reste (slice 2)

Câbler dans la boucle agentique : l'Élève drafte N étapes, spéculation en worktree, `verify` = build / Gardien #161 ; preuve live avec GLM. Mesurer le gain réel de tours économisés.

## Liens

[[le-stratege]] · [[gardien-cloture]] · [[auto-evolution]] · [[eleve-local]] · [[souverainete-progressive]] · [[idee]] (#171) · [[statut]] · [[historique]] · [[limites]] (DeepSpec littéral = piste cloud-GPU)

## Sources

- Repo `deepseek-ai/DeepSpec` (lu via WebFetch, 2026-06-30) · [[statut]] (#171) · [[historique]] (Détail des idées #171)
