---
type: entite
tags: [transport, api, ollama, tool-calling, compaction, invariants]
statut: livré (2026-09-29)
sources: ["historique.md Journal 2026-09-29 (soir)", "limites.md L147", "server/src/eleve-runtime.ts"]
maj: 2026-09-29
---

# Invariant des `tool_calls` — un appel reste du JSON valide

> Règle née d'un bug qui coûtait **un tour entier d'Élève par build** : l'API Ollama Cloud refuse tout historique contenant un `tool_call` aux arguments JSON **tronqués ou vides** (`invalid tool call arguments`, HTTP 400), et le refus emporte la totalité de la conversation, pas seulement le message fautif.

## La règle

**Aucun code qui réduit, tronque, compacte ou réécrit les `messages` d'un tour ne peut laisser un `tool_calls[].function.arguments` non parseable.** La réduction est autorisée (elle borne le contexte et le coût), mais elle doit produire **du JSON valide** — jamais une coupe en pleine chaîne.

Implémentation : `reduceToolArgs` (`server/src/eleve-runtime.ts`) — `write_file`/`edit_file` réduits au `path` seul (le contenu est déjà sur le disque, le modèle peut le relire) ; au-delà du budget, **élision à l'intérieur des valeurs de premier niveau** (`"…[réduit]"`) au lieu de tronquer la chaîne entière.

## Ce que la mesure a écarté (pour ne pas les re-suspecter)

Sondes isolées contre l'API réelle, 2026-09-29 :

| Hypothèse | Verdict |
|---|---|
| Arguments **vides** (`""`) | 400 — mais **déjà normalisés** en `"{}"` depuis le 2026-07-12 (`contract.ts`) |
| **Gros contenu** (32 ko de `write_file`) | **OK** — 12 101 jetons de sortie, JSON valide |
| **Nombre** de `tool_calls` (4 appels + 4 résultats) | OK |
| `tool_calls` **verbatim** de l'API (avec `index`/`type`/`reasoning`) | OK |
| Arguments **tronqués** | **400** ← la cause |

## Le deuxième trou : l'erreur était muette

`fetchWithRetry` (`eleve-retry.ts`) **jetait le corps** de la réponse d'erreur — il ne lisait que le code HTTP. Un 400 était donc indiagnosticable : ni la cause, ni le message du fournisseur. Désormais le corps est journalisé (600 car.) et `ELEVE_DEBUG_PAYLOAD` permet d'écrire le payload exact refusé. **Une erreur qu'on ne peut pas lire coûte un tour entier sans laisser de trace.**

## Garde

`tests/test-eleve-runtime.ts` bloc `[3d]` : au fil d'une boucle réellement compactée (arguments longs, imbriqués, tableaux), **chaque** `arguments` de **chaque** message est re-parsé — 72 vérifications, plus la preuve que la réduction a bien eu lieu (sinon le test ne prouverait rien).

## Voisin

[[limites|L147]] — l'autre panne silencieuse du même jour : un **modèle retiré** chez le fournisseur, que rien ne vérifiait. Même famille de leçon : *ce qui n'est pas vérifié au démarrage casse au milieu du run.*
