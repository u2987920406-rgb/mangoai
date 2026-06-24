---
type: entite
tags: [multi-agents, cerveaux, orchestration, atelier]
statut: plan-approuvé-à-coder
sources: [statut #150, historique 2026-06-24, docs/plan-106-brain-dispatch.md]
maj: 2026-06-24
---

# Brain-Dispatch

> Système multi-agents à **cerveaux interchangeables** : 10 agents spécialisés, chacun branché sur son propre LLM configurable, orchestrés par un contrat universel. Conçu en session atelier le 2026-06-24 (idée **#150**).

## Rôle

Pousser la vision multi-cerveaux de [[phase-e-multicerveaux]] à sa forme la plus complète : non plus seulement *un cerveau par intention* (Construire/Planifier/Discuter), mais **une équipe nommée de 10 agents spécialisés**, chacun avec un LLM dédié et remplaçable. C'est la **réalisation concrète et plus riche** de l'idée fondatrice [[phase-e-multicerveaux]] #135 (marquée FAIT via la Phase E de #146) — Brain-Dispatch en est le palier suivant, pas un doublon.

## Détails clés

- **10 agents** : `orchestrateur` · `architecte` · `codeur` · `vision` · `designer_ux` · `extracteur` · `testeur` · `auditeur` · `optimiseur` · `chercheur`.
- **Registre de cerveaux** : `data/brain-registry.json` — chaque agent route vers son LLM (Claude / Ollama / Zhipu / DeepSeek / Mistral / Groq / LiteLLM…), éditable en live via un panneau UI « Cerveaux ».
- **Socle** :
  - `agent-contract.ts` — contrat universel `<<<MANGO>>>…<<<END>>>`, parseur 4 niveaux, `PipelineSession` immuable, `sanitizeExternal`, `withAgentTimeout`, `estimatePipelineCost`.
  - `brain-dispatch.ts` — `dispatch` + `dispatchParallel` + rate limiter + retry exponentiel.
- **16 failles** identifiées et adressées **dès le socle** (conception, pas patchage).
- **Câblage** : `orchestrator.ts` (conseil d'experts #44) + `patrol.ts` (l'armée #73) branchés sur les cerveaux par agent.
- **Architecture 6 couches**, gravée dans `docs/plan-106-brain-dispatch.md` (nom de fichier conservé tel quel — il reflète l'ancienne numérotation atelier #136/#106, qu'on ne casse pas).
- **Renumérotation** : l'atelier l'avait pris **#136**, déjà occupé par [[bureau-os]] côté maison → **#150** au merge atelier→maison du 2026-06-24.

## Liens

- [[phase-e-multicerveaux]] — l'idée fondatrice (#135) dont Brain-Dispatch est la réalisation aboutie.
- [[brains]] — registre `.brains` de fiches cerveau mesurées (Phase E) ; Brain-Dispatch généralise ce registre à 10 agents nommés.
- [[examen-cerveau]] — #148, le scan qui mesure un cerveau inconnu → alimente le placement dans le registre.
- [[kernel]] — #108 Brain Adapter (LiteLLM), socle du « cerveau remplaçable ».
- [[eleve-local]] — la boucle Élève agentique #146 (Phase E) sur laquelle Brain-Dispatch s'appuie.

## Sources

- [[statut]] — idée **#150** (⏳ PLAN APPROUVÉ — à coder).
- [[historique]] — journal du 2026-06-24 (session atelier — vision LLM + Brain-Dispatch).
- `docs/plan-106-brain-dispatch.md` — plan détaillé 6 couches + 9 étapes d'implémentation.
