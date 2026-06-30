---
type: entity
tags: [agent, souverainete, performance, deepspec]
statut: 🔨 slices 1-3 livrées (cœur + orchestration + draft GLM + exécuteur worktree, prouvés live) — #171
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

## Détails clés (slice 2)

- `eleve-speculative-runner.ts` — orchestration, deps injectées, ne lève jamais.
- `buildDraftPrompt` + `parseDraft` : le cerveau frugal rend un tableau JSON `{label, tool, args}` (extraction **tolérante** + **garde d'outils** : un `tool` hors liste blanche est filtré → pas d'outil inventé/dangereux).
- `draftSteps({ask}, goal, depth, tools)` : `ask` qui plante → `[]` (repli séquentiel sûr). L'adaptateur réel doit prévoir un budget de tokens suffisant (~2500 ; 800 → réponse vide observée).
- `speculativeAttempt(draft, {execute, verify})` : passe par `runSpeculative`, **décide l'escalade** vers le cerveau fort à la 1ʳᵉ divergence.
- **20 tests verts** + **PROUVÉ LIVE (GLM glm-5.2:cloud)** : sur « ajouter une page Contact + build », GLM drafte d'un coup **4 étapes cohérentes** (read App.jsx → write Contact.jsx → write App.jsx routing → check_build).

## Détails clés (slice 3 — exécuteur en worktree, prouvé live)

`eleve-speculative-exec.ts` — `runSpeculativeInWorktree(repoRoot, slug, draft, deps)`, **chemin additif** (ne touche pas `eleve-runtime`), réutilise l'infra [[auto-amelioration]] #167 :
- exécute le draft dans un **git worktree** (effets de bord jetables) ;
- chaque étape : invoke → si **mutante**, **type-check** (build vert ?) → accepte + **checkpoint (commit)** ou rejette ;
- au 1ᵉʳ rejet = **divergence** → `reset --hard` + `clean` jettent l'étape, on calcule `git diff baseRev..HEAD` et on **applique** le préfixe (`mergeSelfFiles`) ;
- **invariant de sûreté hérité de #167** : aucun `push`/`merge`, worktree retiré à la fin.
- **16 tests** + **PROUVÉ LIVE (vrai dépôt git)** : draft [bon → `BROKEN` → jamais atteint] → good.txt **appliqué**, bad.txt **jeté** (type-check rouge), never.txt **absent**.

## Garde-fou d'architecture

Les étapes à **effet de bord** (écritures, build) sont spéculées dans une **copie isolée** ([[auto-amelioration]] : git worktree) puis appliquées une fois le préfixe accepté — on ne peut pas « rejeter » un fichier déjà écrit dans le repo vivant. Implémenté en slice 3.

## Reste (auto-déclenchement)

Brancher l'**auto-déclenchement** dans la boucle live `eleve-runtime` (politique « quand spéculer » + draft GLM réel de la slice 2) et **mesurer** le gain réel de tours Claude économisés sur un vrai build. Le mécanisme (slices 1-3) est complet et prouvé de bout en bout.

## Liens

[[le-stratege]] · [[gardien-cloture]] · [[auto-evolution]] · [[eleve-local]] · [[souverainete-progressive]] · [[idee]] (#171) · [[statut]] · [[historique]] · [[limites]] (DeepSpec littéral = piste cloud-GPU)

## Sources

- Repo `deepseek-ai/DeepSpec` (lu via WebFetch, 2026-06-30) · [[statut]] (#171) · [[historique]] (Détail des idées #171)
