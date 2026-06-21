---
type: entite
tags: [architecture, kernel, infrastructure]
statut: actif
sources: [statut, historique, fondation]
maj: 2026-06-20
---

# Kernel MangoOS

> Couche d'infrastructure model-agnostic qui rend MangoOS observable et remplaçable de bout en bout. Introduit complet en **#108**, activée (« de dormant à vivant ») en **#112**.

## Rôle

Le Kernel n'est pas le moteur de génération (la génération agentique reste sur `query()` du SDK, à coût $0). Il s'**active par observation** : il instrumente chaque tour, publie les événements sur un bus, et permet de remplacer le cerveau LLM sans toucher au flux. C'est la fondation sur laquelle s'appuient [[mangoqa]] (qui observe via `*`) et [[boucle-curation]].

## Détails clés — les 5 piliers

1. **Brain Adapter** (`kernel.ts`) — `MangosBrain`, cerveau remplaçable par env (`BRAIN_PROVIDER`/`BRAIN_MODEL`), provider `litellm` (proxy 100+ modèles), défaut `claude`/$0. Tous les appels one-shot passent par `getBrain().complete()` depuis #114 → point de passage unique pour retry/fallback/coût.
2. **Event Bus** (`kernel-bus.ts`) — Enveloppe Standard v1, routage ciblé/broadcast, **observateur `*`** (c'est par là que [[mangoqa]] voit tout), erreurs isolées.
3. **Blackboard** (`kernel-blackboard.ts`) — verrous FIFO + store d'artefacts. Détail → [[blackboard]].
4. **MCP / Registre d'outils** (`kernel-mcp.ts`) — `KernelTool` neutre + `ToolRegistry` (validation Zod) + adaptateurs `toMcpServer` (Claude) / `toOpenAITools` (litellm/Ollama).
5. **Tracing / OpenTelemetry** (`kernel-trace.ts`) — spans format OTel exportés sur le Bus (`kernel.trace`), lus par [[mangoqa]]. « OTel sans le SDK », local-first.

**Pont MangoQA** (`kernel-mangoqa-bridge.ts`) : MangoQA est un fantôme externe (filesystem) qui ne peut pas s'abonner au bus en-process → un observateur `*` exporte le flux vers `.mangoqa/bus-events.jsonl` que le fantôme lit. Câblé au boot d'`index.ts`.

**Chat branché** (#112, `kernel-chat-bridge.ts`) : chaque tour de `/api/chat` ouvre un span et publie son issue (succès/erreur + coût/tours/durée) → arme les visages de [[mangoqa]].

## Liens

Observé par [[mangoqa]] · alimente [[boucle-curation]] · persisté via [[blackboard]] · cohabite avec [[coque-souple]] et [[coque-rigide]].

## Sources

[[fondation]] (architecture du Kernel) · [[statut]] #108→#116 · [[historique]] (détail par idée).
