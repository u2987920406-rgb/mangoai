---
type: entite
tags: [multi-agents, cerveaux, orchestration, atelier]
statut: fait-validé-live
sources: [statut #150, historique 2026-06-24, docs/plan-106-brain-dispatch.md, docs/plan-pilier-C-liquidite-cerveau.md, historique 2026-07-03]
maj: 2026-07-03
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

## État d'implémentation (2026-06-24)

**✅ FAIT — 9 étapes codées, socle testé, routage réel validé LIVE.**

- **Socle (couches 2-3-4)** : `brain-registry.ts` (registre + validation + fallback `DEFAULT_REGISTRY`, chemin testable `BRAIN_REGISTRY_FILE`), `agent-contract.ts` (contrat `<<<MANGO>>>` + `parseAgentResponse` 4 niveaux + `sanitizeExternal` + `withAgentTimeout` + `PipelineSession` immuable + `estimatePipelineCost`), `brain-dispatch.ts` (`dispatch`/`dispatchParallel` + rate limiter par provider + retry expo ; **ne throw jamais**).
- **Câblage (couches 1-5-6)** : `llm-engine.ts` (`baseUrl`/`apiKeyEnv`), `orchestrator.ts` (5 lenses → `agentId`), `patrol.ts` (5 patrouilleurs → `agentId`). Routage **opt-in `BRAIN_DISPATCH=on`** (défaut OFF → comportement actuel exact, réversible, zéro régression).
- **Routes (7) + UI (8)** : `brain-dispatch-routes.ts` (`GET/PUT /api/brain-registry`, `POST /api/brain-dispatch/estimate`) ; panneau « Cerveaux par agent » dans `Knowledge.jsx` (`BrainRegistryPanel`).
- **Vérif** : `tsc` 0 · build UI vert · `test-brain-dispatch` 33/33 · orchestrator/patrol non régressés · routes prouvées live (estimate codeur+orchestrateur/500k = $15, warning).
- **Sharingan (2026-06-24)** : panneau « Cerveaux par agent » snappé via Playwright (Home → App Builder → projet → rail Mémoire). Rendu conforme (cartes par agent, badges cloud/local, selects provider + champs model/baseUrl/apiKeyEnv/timeoutMs + checkbox localOnly, badge #150). Interaction validée : changer un provider bascule le badge cloud↔local en réactif et active le bouton « Sauvegarder » (violet accent) ; zéro erreur console ; aucun PUT involontaire (registre disque intact).
- **Validation LIVE du routage réel (2026-06-24)** : `BRAIN_DISPATCH=on` prouvé avec de **vrais appels `gemma4:12b` en local** (gratuit), **10/10 assertions**. (1) `dispatch('codeur')` → appel Ollama réel (26,8 s), `status=ok`, contrat Mango parsé par le parseur 4 niveaux sur sortie de vrai modèle. (2) `orchestrator.diagnose` route bien via `dispatch(architecte→ollama)` quand le flag est ON, et **retombe sur `deps.ask`** quand il est OFF (gate opt-in prouvée des deux côtés). (3) `patrol.runPatroller` route via `dispatch(optimiseur→ollama)`. (4) Garde de souveraineté : agent `localOnly` + cerveau cloud → `status=error` sans aucune sortie réseau. Méthode : registre temporaire (`BRAIN_REGISTRY_FILE`) repointant `architecte`/`auditeur` sur Ollama pour éprouver le routage gated sans dépenser de tokens cloud.
- **Reste** : rien pour le socle — #150 est clos. Suites possibles (hors #150) : pipeline multi-agents de bout en bout (`dispatchParallel` en production), cerveaux cloud réels (Zhipu/DeepSeek) en charge. Git en attente du feu vert de Raf.

## L'Élève EST l'agent `codeur` — un seul annuaire (#162, 2026-06-25)

Le registre comptait **11 agents** depuis [[gardien-cloture]] #161 (ajout du `juge`). Mais MangoOS traînait **deux annuaires de cerveaux séparés** : (1) l'**Élève** (les « mains » qui codent en Construire/Discuter), routé par le `.env` (`ELEVE_MODEL=glm-5.2:cloud`, provider openai → Ollama Cloud) via `globalFallback()` dans `brain-runtime.ts` ; (2) ce registre, dont l'agent `codeur` = `gemma4:12b` **sans lien** avec l'Élève réel. Constat de Raf : « le codeur, c'est GLM 5.2, pas Gemma » + « expose l'Élève dans l'[[atelier-cerveaux]] ».

**Fusion (#162)** : l'agent **`codeur` devient la source de vérité unique de l'Élève**. `globalFallback()` lit désormais `getBrain("codeur")` (lecture **à chaud** → un édit dans l'Atelier prend effet sans redémarrage ; `.env` = repli profond), et `DEFAULT_REGISTRY.codeur` + le JSON disque = `{provider:"openai", model:"glm-5.2:cloud"}`. Les **secrets** (endpoint `ELEVE_API_URL` + clé `ELEVE_API_KEY`) restent dans `.env` ; le registre ne porte que provider+modèle ([[limites]] L27). Conséquence : éditer la carte `codeur` (badge « Élève · les mains ») dans l'[[atelier-cerveaux]] **pilote l'Élève réel**. Note coût : `codeur` étant maintenant `openai`, `estimatePipelineCost` le tarife (`openai/* = 2 $/Mtok`) au lieu de $0 — plus honnête (cf. [[audit-general]] L7).

## Pilier C « liquidité de cerveau » — les portes de l'avenir (fondations 2026-07-03)

Chantier « Fondations harnais dernière génération » : le jour où un cerveau performant arrive (local ou cloud), le brancher = **éditer le registre**, pas coder. Conçu par Fable 5 (`docs/plan-pilier-C-liquidite-cerveau.md`), qui a constaté que dispatch propageait DÉJÀ `baseUrl`/`apiKeyEnv` → C1 = boucher 4 trous, pas construire. Tout gaté défaut OFF (catalogue `flags.ts`), byte-identique gate off prouvé par tests.

- **C1 — cerveau en une ligne** : `baseUrl`/`apiKeyEnv` du registre threadés au runtime Élève (`openAiEndpoint`) PUIS à tous les providers HTTP d'`askLLM` — `resolveOllamaBaseUrl` (ollama), `resolvePresetEndpoint` (deepseek/mistral/groq), `resolveLitellmEndpoint` (litellm) : fonctions pures, `apiKeyEnv` = un NOM de variable résolu au dernier moment, fail-open si absente. Résout [[limites|L27]].
- **C2 — fallback automatique** : `BrainConfig.fallback[]` (chaîne ordonnée ≤2, double verrou flag `BRAIN_FALLBACK` + champ) dans dispatch — `runOnce` distingue échec RETRYABLE (timeout/transport) d'un parsing raté ; garde `localOnly` re-passée par cible ; `AgentResult.brainUsed` trace le repli ; $0 abonnement préservé par construction. + repli one-shot du Kernel `complete()` (`BRAIN_FALLBACK_PROVIDER`/`MODEL`, re-throw de l'erreur ORIGINALE si le repli échoue — contrat préservé).
- **C3 — ensemble/vote** : `brain-ensemble.ts` pur — `deliberate(agentId, members, {majority|judge})`, membres = closures injectées (découplé du transport), majorité sur clé catégorielle (`keyFn`/`minAgree`) ou arbitre final (≥2 avis), jamais de crash (pas de consensus → dégradé = l'appelant garde son repli). Gate `BRAIN_ENSEMBLE`. **Non câblé** au juge pour l'instant (freeform+numérique — point de câble identifié : `eleve-judge.ts:167`).
- **C4 — interrupteur souveraineté** : profils `data/brain-profiles/full-local.json` (13 rôles → Ollama local, localOnly) / `cloud-actuel.json`, `apply-brain-profile.ts` (backup + avertissement L51), `BRAIN_PROFILE=<nom>` et rideau de fer `BRAIN_LOCAL_ONLY` (force localOnly sur TOUS les rôles). Souveraineté = 3 gestes, zéro code, quand [[limites|L51]] tombe.

Vérif de clôture : 9 suites du domaine = **273 checks verts** (llm-engine 62 · kernel 56 · ensemble 11 · fallback 18 · dispatch 38 · brains 30 · brain-runtime 24 · endpoints 19 · profile 15).

## Cache du registre (D7, 2026-09-28)

L'audit du 2026-09-28 (constat **B10**) a relevé que `getBrain()` refaisait `existsSync` + `readFileSync` + `JSON.parse` **à chaque appel** — 75 sites d'appel dans 49 fichiers, dont des chemins chauds (`llm-engine`, `kernel`, `eleve/provider`, `capabilities`) sollicités à chaque itération d'une boucle qui peut en compter des centaines.

`loadBrainRegistry()` cache désormais le contenu **parsé**, invalidé sur `mtimeMs` + taille du fichier (un `statSync` remplace la lecture complète). Trois précautions préservent la sémantique **à l'identique** :

1. c'est le registre **avant** `applyLocalOnly` qui est caché — le rideau de fer `BRAIN_LOCAL_ONLY` est ré-appliqué à chaque appel, donc un changement d'env en cours de process reste pris en compte ;
2. chaque appel renvoie une **copie** (des appelants mutent le résultat avant `saveBrainRegistry`) ;
3. `saveBrainRegistry` **invalide explicitement** — ne pas dépendre de la granularité d'horloge du système de fichiers (~15 ms sous Windows) pour voir sa propre écriture.

La propriété qui compte est préservée et **testée** : l'édition à chaud dans [[atelier-cerveaux|l'Atelier]] reste prise en compte sans redémarrage (`test-brain-registry-cache.ts`, 13/13 — dont « 12 lectures → 1 seule lecture disque » et « mtime neuf → valeur relue »). Diagnostic : `brainRegistryCacheStats()`.

## Liens

- [[atelier-cerveaux]] — l'UI #162 qui pilote ce registre (un modèle par agent) ; `codeur` y EST l'Élève.
- [[compteur-jetons]] — la mesure (D1) qui doit trancher « quel cerveau sur quel rôle » autrement qu'à l'opinion.
- [[phase-e-multicerveaux]] — l'idée fondatrice (#135) dont Brain-Dispatch est la réalisation aboutie.
- [[brains]] — registre `.brains` de fiches cerveau mesurées (Phase E) ; Brain-Dispatch généralise ce registre à 10 agents nommés.
- [[examen-cerveau]] — #148, le scan qui mesure un cerveau inconnu → alimente le placement dans le registre.
- [[kernel]] — #108 Brain Adapter (LiteLLM), socle du « cerveau remplaçable ».
- [[eleve-local]] — la boucle Élève agentique #146 (Phase E) sur laquelle Brain-Dispatch s'appuie.

## Sources

- [[statut]] — idée **#150** (✅ FAIT — 9/9 codées + validé LIVE).
- [[historique]] — journal du 2026-06-24 (session atelier — vision LLM + Brain-Dispatch).
- `docs/plan-106-brain-dispatch.md` — plan détaillé 6 couches + 9 étapes d'implémentation.
