---
type: entite
tags: [mesure, jetons, cout, consommation, audit, observabilite]
statut: livré (mesure seule, sans tarification)
sources: ["audit-opus-2026-09-28.md §B4 / §D1", "lot1-mesure-cache-doc-2026-09-28.md", "limites.md L7"]
maj: 2026-09-28
---

# Compteur de jetons (consommation de la boucle)

> Ce que coûte une app, en jetons réellement renvoyés par les modèles — **plus une estimation, une mesure**. Livré le 2026-09-28 (action **D1** de l'audit du jour, constat **B4**).

## Le trou qu'il bouche

Tout endpoint OpenAI-compat renvoie un champ `usage` ; Ollama renvoie `prompt_eval_count` / `eval_count`. MangoOS **jetait tout** au transport : `openAiChat` ne lisait que `choices[0].message.content`. Le seul endroit du dépôt qui lisait un usage réel était le chemin SDK Claude (`agent.ts:276-306`) — c'est-à-dire précisément le chemin **inactif** dans la configuration courante, où `codeur`, `architecte`, `juge`, `stratege` sont tous en `provider: "openai"`.

Conséquence : « combien coûte une app ? » n'avait pour réponse qu'une **borne théorique** (jusqu'à 360 appels modèle par build, dérivée des constantes). Sans mesure, l'arbitrage « quel modèle sur quel rôle » — la question centrale posée à l'audit — ne pouvait être qu'une opinion. C'est pour ça que D1 passe avant le fusible de boucle (D2) et avant toute bascule de cerveau (D5).

## Comment ça marche

| Pièce | Fichier | Détail |
|---|---|---|
| Parseur | `llm/llm-usage.ts` `parseUsage` | **PUR**. Reconnaît OpenAI-compat (`prompt_tokens`/`completion_tokens`/`total_tokens`), Ollama natif (`prompt_eval_count`/`eval_count`) et la forme Anthropic (`input_tokens`/`output_tokens`). Rien d'exploitable → `null`, **jamais** une estimation. |
| Compteur | `llm/llm-usage.ts` | Cumul **par run**, ventilé **par modèle**, avec un compteur séparé d'appels **non mesurés**. Borné aux 20 derniers runs (jamais de fuite mémoire). Ne lève jamais. |
| Points de mesure | `llm/llm-transport.ts` | Les 4 briques de transport : `openAiChat` (chemin `askLLM`), `openAiChatTools` (**la boucle de l'Élève** — la consommation dominante), `ollamaChat`, `ollamaChatTools`. |
| Frontière de run | `eleve/relay-agentic.ts` | Un build = un run (`startLLMRun`). Les appels des sous-agents délégués s'accumulent dans le run du parent. |
| Lecture | `getLLMRun()` · gate `LLM_USAGE_LOG` | Le **comptage** n'est pas gaté (addition pure, aucune décision ne le lit) ; seul l'**affichage** console l'est, défaut OFF. |

**Addition pure** : aucune valeur de retour ne change, aucun chemin de décision ne bouge. On cesse simplement de jeter une donnée déjà reçue et déjà payée.

## Honnêteté de la mesure

Un appel dont la réponse ne porte aucun usage est compté dans `unmeasuredCalls` et **n'est pas estimé**. Un total est donc toujours un **plancher explicite**, avec à côté le nombre d'appels qu'on n'a pas su mesurer.

## Ce que ça ne fait pas (encore)

- Pas de **tarification** : des jetons, pas des euros. La table de coûts existante (`agent-contract.ts:164-175`) est par ailleurs fausse aux deux bouts (audit B14 : `claude/opus` chiffré à 30 $/Mtok alors qu'il passe par l'abonnement, `ollama/*` à 0 alors que tout passe par Ollama Cloud).
- Pas de **persistance** : compteur en mémoire, perdu au redémarrage.
- Pas de **lecture dans l'UI**.
- Le chemin SDK Claude garde sa comptabilité **séparée** (`agent.ts`), non agrégée avec celle-ci.

Ces quatre points sont consignés dans [[limites|L7]].

## Liens

[[brain-dispatch]] (le registre des rôles dont on veut arbitrer les cerveaux) · [[eleve-local]] (la boucle qui consomme) · [[le-stratege]] (le déblocage qui multiplie les appels) · [[audit-general]].
