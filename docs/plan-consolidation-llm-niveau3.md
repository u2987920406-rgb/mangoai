# Plan — Consolidation LLM niveau 3 : point d'entrée cerveau unique

## Contexte

Chantier d'architecture #2 (après le runner de tests). MangoOS a **deux familles de transport LLM parallèles et redondantes** : la famille `llm-engine`/`ollama` (moteur one-shot, config centralisée `brain-registry.json`) et la famille `eleve.ts` qui réimplémente à elle seule 4 des 8 transports bruts + sa propre résolution d'endpoint + la seule vraie logique de retry HTTP. Objectif : **un point d'entrée cerveau unique** (`brain()`), sous lequel vivent UNE couche transport, UNE résolution d'endpoint, UNE stratégie retry/timeout.

**Ce chantier CHANGE du comportement** (contrairement au refactoring de nettoyage). Chaque tranche : `tsc --noEmit` à 0 + `npm run test:offline` vert (hors 3 tests `broken` préexistants : test-brain-profile, test-brain-dispatch 37/38, test-specialist-agentic 24/27) + commit atomique + rollback `git reset --hard` si échec. Exécution par Opus 4.8 sur branche dédiée `archi/llm-consolidation`, fusion après revue Raf.

## Piège découvert (décisif) : les deux résolveurs d'endpoint NE sont PAS byte-identiques

- `llm-engine.askOpenAI` : URL = `LLM_OPENAI_URL ?? ELEVE_API_URL ?? deepseek` ; clé = `LLM_OPENAI_KEY ?? ELEVE_API_KEY`.
- `eleve.openAiEndpoint` : URL = `baseUrl || ELEVE_API_URL` (**pas de LLM_OPENAI_URL**) ; clé = `apiKeyEnv || ELEVE_API_KEY` (**pas de LLM_OPENAI_KEY**).

→ Unifier ne peut PAS être un simple remplacement. Il faut un **résolveur sur-ensemble paramétré par famille** (`'engine' | 'eleve'`), sinon régression silencieuse dès qu'un `.env` porte `LLM_OPENAI_*`. C'est le risque #1.

## Principe : extraire-puis-rediriger, jamais réécrire

Chaque nouvelle brique est posée à côté, testée en isolation, puis les anciens sites redirigés un par un. Un appelant redirigé = une preuve par les tests existants. On avance du **pur/isolé** vers le **chaud/branché**. La façade `brain()` est la DERNIÈRE tranche.

## Tranches

### T0 — Filet : oracle faux-serveur (le plus important pour la sûreté)
Avant tout, un test d'intégration (`http.createServer`) qui capture, pour chaque provider × override, l'URL finale + en-têtes `Authorization` produits par les DEUX chemins (`askOpenAI` et `openAiEndpoint`), en **golden de l'état actuel**. C'est l'oracle des tranches 1-3 (les chemins réseau réels ne sont PAS dans `test:offline`).
Commit : `test(brain): oracle faux-serveur endpoints openai-compat (A+B) avant consolidation`

### T1 — Résolveur d'endpoint unique (pur, sans toucher au transport)
Nouveau `llm-endpoint.ts` : `resolveEndpoint(provider, family, overrides) → {url, key}`, sur-ensemble strict des deux chaînes, `family` sélectionne l'inclusion de `LLM_OPENAI_*` et l'ordre preset. `llm-engine` et `eleve` délèguent (signatures publiques inchangées, adaptateurs minces).
Vérif : golden `test-eleve-registry.golden.json` byte-identique + oracle T0.
Commit : `refactor(brain): résolveur d'endpoint unique paramétré par famille, byte-identique`

### T2 — Couche transport bas-niveau unique (8 fetch/query → ~4)
Nouveau `llm-transport.ts` : `claudeQuery`, `ollamaChat`, `openAiChat` + function-calling `openAiChatTools`/`ollamaChatTools` + mappers `toOllamaMessages`/`fromOllamaResponse` déplacés d'eleve.ts. Préservations fines : `keep_alive:'10m'` (famille A) vs absent (famille B) → option `keepAlive?` ; `claudeQuery` paramétrée (systemPreset/allowedTools/maxTurns/deadline×) pour reproduire askClaude ET claudeWebResearch à l'octet ; `subscriptionEnv()` (neutralise ANTHROPIC_API_KEY — garde-fou abonnement) conservé.
Vérif : relecture obligatoire (query() SDK non testable offline) + mock du flux query() + oracle payloads.
Commit : `refactor(brain): couche transport unique, payloads préservés par famille`

### T3 — Retry/timeout partagé (opt-in, défaut = pas de retry)
`eleve-retry.ts` généralisé (exports actuels gardés en alias). Les transports acceptent `retry?: RetryPolicy`, **défaut AUCUN retry** (préserve les chemins qui n'en avaient pas). Seul `postEleveCompletions` active la politique 429/503 existante — comportement identique. L'extension du retry à d'autres transports est REPORTÉE (changerait un comportement → tranche séparée à décider par Raf).
Vérif : `test-eleve-retry` vert sans modif + `test-brain-fallback`.
Commit : `refactor(brain): politique retry/timeout partagée (opt-in), retry Élève 429/503 identique`

### T4 — Convergence d'eleve.ts vers les briques partagées
eleve.ts n'a plus aucune réimplémentation : ses 4 transports + résolution d'endpoint deviennent des liaisons. Fichier maigrit (-300/-500 l. sur 2108). **Invariant cardinal : la PostFn d'elevePost NE CHANGE PAS de signature** `(messages, tools) => Promise<{content, toolCalls?}>` (30+ appelants indirects via buildAgentic). Points d'entrée publics (chatEleve/elevePost/askEleveAgentic/askEleveDispatch) identiques.
Vérif : suite Élève complète + golden.
Commit : `refactor(eleve): délègue 100% du transport/endpoint, points d'entrée inchangés`

### T5 — Façade brain() unique (adossée, pas substituée)
Nouveau `brain.ts` : façade par laquelle passent tous les appels de haut niveau. Elle **oriente** vers dispatch/askLLM/chatEleve/elevePost déjà consolidés — on ne réécrit PAS brain-dispatch (son « ne throw jamais » + rate-limit + fallback + brainOverride sont précieux et testés, ils deviennent l'implémentation privée de la façade). Redirections des appelants chauds (chat-route, nocturnal, frontier-orchestration, index brainOverride) une par commit.
Vérif : par appelant, relecture + test d'intégration à transport mocké (l'injection `ask?`/`PostFn` le permet sans réseau).
Commits : `feat(brain): façade brain() unique adossée aux moteurs consolidés` + N × `refactor(brain): route <appelant> via brain()`

## Volume
8-12 commits · 3-4 fichiers créés (llm-endpoint, llm-transport, [llm-retry], brain) · ~8 fichiers cœur modifiés · eleve.ts perd le plus de lignes.

## 3 points de risque maximal
1. **Divergence des résolveurs d'endpoint** (LLM_OPENAI_* présent côté engine, absent côté eleve) → parade : résolveur sur-ensemble par famille (T1) + oracle T0.
2. **claudeQuery/payloads non couverts offline** → parade : faux serveur + mock query() + relecture ; préserver `subscriptionEnv()` sous peine de basculer l'abonnement Claude vers crédits API payants.
3. **PostFn 30+ appelants indirects** → parade : figer la signature comme invariant, ne toucher que l'implémentation, valider test-eleve-runtime + test agentique mocké avant commit.

## Gate à chaque tranche
`cd server && npx tsc --noEmit` (0) + `npm run test:offline` (vert hors 3 broken) + les tests spécifiques listés par tranche.
