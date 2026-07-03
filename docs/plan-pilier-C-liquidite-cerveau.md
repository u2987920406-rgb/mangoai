# Pilier C — Liquidité de cerveau (plan d'implémentation, conçu par Fable 5, 2026-07-03)

> But de Raf : « ouvrir les portes de l'avenir » — SANS acheter de hardware maintenant, rendre le CERVEAU rebranchable/remplaçable en UNE ligne le jour où un modèle performant devient accessible (local OU cloud).
>
> **Constat clé qui simplifie tout** : le chemin `dispatch()` propage DÉJÀ `baseUrl`/`apiKeyEnv` (`brain-dispatch.ts:133-134`) et `askLLM` les honore DÉJÀ pour le provider `openai` (`llm-engine.ts:269-274`). Le chantier 1 = boucher 4 trous (ollama, presets, litellm, chemin Élève `elevePost`/`globalFallback`), pas créer.

## Chantier 1 — Threader baseUrl/apiKeyEnv jusqu'au runtime (résout L27)
**Gate = présence du champ** (pas de flag env : convention déjà en vigueur pour dispatch #150 ; champ absent → code strictement identique).
- **C1-P0 [S]** : `brain-runtime.ts` propage `baseUrl?`/`apiKeyEnv?` dans `RuntimeFallback`/`EleveBinding` (globalFallback L41, resolveBinding L56 — aujourd'hui jetés) ; `eleve.ts` : `openAiEndpoint(provider, endpoint?)` (L128), threader dans `elevePost`/`postEleveCompletions`/`askEleveOpenAI`/`chatEleve` + sites d'appel (runCtx L1283, resolveDelegateCtx L1257, auto-relance L1479, model-scan L286) ; `brains.ts` : champs sur `BrainCard`. Sécurité : threader le NOM (apiKeyEnv), résoudre `process.env[...]` au dernier moment. Test `test-brain-endpoints.ts` (BRAIN_REGISTRY_FILE temp) : gate off = endpoint résolu identique ; gate on = vise le fake endpoint + Bearer de la clé ; clé jamais dans le JSON.
- **C1-P1 [S]** : boucher `ollama` (baseUrl), presets deepseek/mistral/groq (apiKeyEnv/baseURL prime), `litellm` (baseUrl) dans askLLM + côté Élève openAiEndpoint. Test : étendre test-llm-engine.
- **C1-P2 [S]** : UI Atelier expose les 2 champs (coerceConfig les accepte déjà).

## Chantier 2 — Fallback automatique inter-providers
**Gate `BRAIN_FALLBACK` (flags.ts) + champ `fallback` (double verrou).**
- **C2-P0 [M]** : `BrainConfig.fallback?: Array<{provider, model?, baseUrl?, apiKeyEnv?, timeoutMs?}>` (chaîne ordonnée ≤2, validée par coerceConfig). Point d'insertion : `brain-dispatch.ts` étape 7 (L138-155), DANS le try/catch existant (contrat « ne throw jamais » préservé, dégradé = sortie ultime). Re-passer le garde `localOnly` (L114) sur chaque cible de repli + acquireSlot. Déclencheurs : timeout + erreur transport (PAS échec de parsing). `AgentResult.brainUsed?` optionnel + log `[brain-fallback] juge: ollama→claude`. Test `test-brain-fallback.ts` (ask+sleep injectés).
- **C2-P1 [S]** : repli du Kernel `complete()` (kernel.ts:38 TODO) sous même flag, RE-THROW l'erreur originale si le repli échoue (contrat préservé).
- **C2-P2 [M]** : boucle Élève — repli AU LANCEMENT seulement (jamais en cours de boucle : historique tool_calls non portable entre modèles).

## Chantier 3 — Ensemble / vote (mécanisme posé, défaut off)
**Gate `BRAIN_ENSEMBLE` + champ `ensemble` (double verrou).**
- **C3-P0 [M]** : nouveau `brain-ensemble.ts` pur, `ensemble?: {members[≤3], aggregator: "majority"|"judge", minAgree?}`. `deliberate()` via dispatchParallel + agrégation (majorité sur clé catégorielle, ou juge final anonymisé A/B/C). `dispatchMaybeEnsemble()` = seule fonction que les call-sites touchent. Câblage P0 : le SEUL rôle `juge` (eleve-judge.ts). Coût borné ≤3 appels/clôture.
- **Rôles éligibles (tranché)** : juge (P0), stratege (P1), auditeur (P2). JAMAIS codeur/boucle agentique ni orchestrateur.

## Chantier 4 — Profil « full-local prêt » (l'interrupteur, pas l'activation)
- **C4-P0 [S]** : `brain-profiles/full-local.json` (13 rôles → ollama local, localOnly:true) + `cloud-actuel.json` (snapshot retour) ; `apply-brain-profile.ts` (`npm run brain:profile -- full-local`, backup + écriture atomique, hot-reload immédiat, warning L51 si aucune BrainCard agentic mesurée).
- **C4-P1 [XS]** : `BRAIN_PROFILE` en env (loadBrainRegistry charge `brain-profiles/<nom>.json`) — littéralement une ligne. + `BRAIN_LOCAL_ONLY` (flags.ts) force localOnly partout (le garde existant fait le travail) = « rideau de fer » souveraineté.
- **C4-P2 [XS]** : page wiki « le jour où L51 tombe » : model-scan #148 → verdict agentic → brain:profile full-local → BRAIN_LOCAL_ONLY=on. Trois gestes, zéro code.

## Séquencement recommandé
1. **C1-P0** (Élève lit le registre — débloque « une ligne » immédiatement, base du reste)
2. **C4-P0 + C4-P1** (profils + BRAIN_PROFILE + BRAIN_LOCAL_ONLY — quasi gratuit après C1-P0, forte valeur « l'interrupteur existe »)
3. **C2-P0** (fallback dispatch — plus gros gain de robustesse)
4. C1-P1 (ollama/presets/litellm) puis C2-P1 (kernel)
5. **C3-P0** (ensemble juge — mécanisme d'avenir, aucune urgence)

## Décisions délicates tranchées
1. Fallback dans **`dispatch()`, PAS `askLLM`** (askLLM = routage bas niveau « lève, l'appelant décide » ; dispatch connaît le rôle + localOnly + rate-limiter + ne throw jamais).
2. `fallback` = TABLEAU ordonné (≤2) de mini-BrainConfigs, pas de chaînes imbriquées.
3. **Garantie $0 abonnement Claude** : repli VERS claude passe par `subscriptionEnv()` (purge ANTHROPIC_API_KEY, $0 par construction) ; repli DEPUIS claude vers payant seulement si EXPLICITEMENT déclaré (DEFAULT_REGISTRY sans fallback) ; localOnly s'applique aussi aux cibles.
4. Gate C1 = présence du champ (pas de flag) ; C2/C3 (changent le comportement d'échec) = double verrou flag+champ.
5. Vote : juge d'abord, jamais la boucle agentique.
6. Pas de repli de cerveau EN COURS de boucle (tool_calls non portables).
7. Secrets : apiKeyEnv reste une référence opaque, résolue au point d'appel uniquement.

## Risques / pièges
- Double timeout (withAgentTimeout + abort askOpenAI) : plafonner le timeout de la cible de repli au restant.
- Deux normalisateurs d'URL (eleve.ts:110 et llm-engine.ts:207) : garder les deux tolérants base-ou-endpoint-complet.
- `ELEVE_API_URL` capturé au chargement du module : passer par le paramètre injecté, pas relire l'env.
- Fallback + rate-limiter : acquireSlot sur le provider de repli.
- Ensemble mode judge : anonymiser A/B/C ; interdire `juge` comme membre de son propre ensemble.
- Profil full-local + mur L51 : risque HUMAIN (activer trop tôt) → warning croisé avec BrainCards #148.

## Fichiers clés
`eleve.ts` (openAiEndpoint L128, elevePost L613, runCtx L1283) · `brain-runtime.ts` (globalFallback L41, resolveBinding L56) · `brain-dispatch.ts` (étape 7 L138-155, garde localOnly L114) · `brain-registry.ts` (BrainConfig L13, coerceConfig L84, loadBrainRegistry L112) · `llm-engine.ts` (askLLM L248-276, subscriptionEnv L100).
