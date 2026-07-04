---
type: entite
tags: [intention, dispatch, capacites, temporel, cache, dry-run, ab-test, orchestration]
statut: fait-teste-interaction
sources: [docs/plan-182-intention-dispatch.md, statut 2026-07-04, historique 2026-07-04]
maj: 2026-07-04
---

# Intention-Dispatch (#182)

> **La disponibilité d'une capacité (vision, web, recherche) suit le BESOIN de la tâche, pas la POSTURE de l'UI ni le cerveau choisi.** Cinq volets clipsés sur deux joints existants (assemblage du registre d'outils + frontière d'appel LLM) : intention>posture, conscience temporelle, cache sémantique, dry-run, A/B structuré — chantier #182, 7 étapes livrées et éprouvées ENSEMBLE.

## Rôle

Corriger le défaut structurel senti par Raf : la sélection d'outils était **posture-first** (deux registres divergents `buildEleveActionTools`/`buildEleveDiscussTools`), si bien que `vois_ecran`/Sharingan n'existait qu'en Construire — l'Élève ne pouvait pas « regarder » un rendu en Discuter. #182 sépare **deux axes orthogonaux** : la POSTURE ne gouverne QUE le plafond de mutation (sûreté), l'INTENTION gouverne les capacités de lecture. Cinq volets s'y greffent, tous en réutilisant un rail existant (5 assemblages / 2 créations minces).

## Détails clés

- **É1 — registre unifié gardé par capacité** (`eleve-tool-capabilities.ts`) : chaque outil déclare `capability`+`mutation` ; `policyFromCaps(ceiling, requiredCaps)` traduit en `ToolPolicy` #175 appliquée par `applyToolPolicy`. Les deux presets Discuter/Construire deviennent deux policies au-dessus d'UN registre. Non-régression byte-identique prouvée (chemin CHAUD : tous les tours Élève).
- **É2 — intention→capacités** (`intent-capabilities.ts`) : `requiredCapabilities(task, ctx)` à trois étages — sur-provisionnement read-safe (toujours) + signal déterministe pour les lourdes (URL→read-web, « regarde »→vision, pièce jointe→lire_document, « génère une image »→media-gen) + routeur LLM en repli d'ambiguïté seulement (gate `INTENT_ROUTER_LLM` OFF, `dispatch("routeur")` via [[brain-dispatch]]). Branché sur `/api/chat` + `/api/home-chat` (un seul joint).
- **É3 — conscience temporelle** (`temporal-context.ts`) : `temporalContext()` injecte une ligne date/heure/fuseau EN TÊTE du system à chaque tour, en 3 points (`assembleSystemPrompt`, `sys` de home-chat, contrat de [[brain-dispatch]]). Gate `TEMPORAL_AWARENESS` **défaut ON** (rare exception à « off = byte-identique », demande explicite de Raf).
- **É4 — cache sémantique** (`llm-cache.ts`) : `cachedComplete` réservé aux appels PURS/idempotents — hash exact O(1) puis cosinus `safeEmbed` (seuil 0.97) sur le scope [[blackboard]] `llm-cache:<role>`, clé namespacée `providerModel`+`promptVersion`. Fail-open (Ollama down → exact seul). Gate `LLM_SEMANTIC_CACHE` OFF.
- **É5 — cerveaux non-Élève à l'Accueil** (`frontier-orchestration.ts`) : fin du repli muet `askLLM`. OFF → ligne de divulgation honnête ; ON (gate `FRONTIER_TOOLS_ANY_BRAIN`) → l'Élève OUTILLE (read-only) et remet ses artefacts — encadrés par `sanitizeExternal` (donnée non fiable) — au cerveau choisi qui RAISONNE, via `dispatch`.
- **É6 — dry-run** (`dry-run.ts`) : généralise le worktree jetable #167/#171 en mode simulation — plan mutant exécuté contre un git worktree, type-check + [[gardien-cloture]] joués sur le build simulé, DIFF+verdict, `apply()` différé. Gate `DRY_RUN` OFF. Interface `SimulatableAction` déclarée ; seule `FileCodeAction` existe en V1 (actions externes non simulables → [[limites|L81]]).
- **É7 — A/B structuré** (`ab-harness.ts`) : `abCompare(taskSet, A, B)` via `dispatch`, noté par le juge d'intention #161, run versionné `data/ab-runs.json`, gagnant → **proposition `promote` PENDING** dans #76 (jamais auto-appliquée). Cache namespacé par variante (§4.8). Gate `AB_HARNESS` OFF.

## Test d'interaction des 6 gates (É8, §4.7-4.8)

Le 🔴1 des revues Fable est né d'une supposition « deux gates cohabitent sans friction ». É8 la CHERCHE activement : `test-fondations-gates-combines.ts` étendu — les 6 gates de #182 (`TEMPORAL_AWARENESS`+`INTENT_ROUTER_LLM`+`LLM_SEMANTIC_CACHE`+`DRY_RUN`+`FRONTIER_TOOLS_ANY_BRAIN`+`AB_HARNESS`) tous ON ensemble, **45/45 verts** (22 hérités + 23 neufs). Joints les plus fragiles vérifiés, **aucune interaction cassée trouvée** :

- **Cache × dry-run** : découplés — le dry-run touche git/fs, le cache touche le [[blackboard]] ; la clé de cache ne contient AUCUNE racine → un worktree ne pollue pas le cache, ni l'inverse.
- **Cache × A/B** : namespacing par variante (`base::variantKey`) tient même avec un embed constant (collision sémantique forcée) et sous les 6 gates — 2 appels modèle, pas de masquage.
- **Frontier × temporal** : la ligne temporelle est côté SYSTEM, l'artefact externe encadré côté USER — pas de collision ; l'injection hostile reste confinée entre `<<<UNTRUSTED_INPUT>>>`.
- **Dry-run × registre** : le worktree respecte le MÊME plafond de capacités que le projet réel (mêmes outils quelle que soit la racine ; read-only interdit tout mutant).

Preuve bout-en-bout (`test-e2e-intention-dispatch.ts`, 10/10) : depuis l'Accueil en Discuter, « regarde {url} et dis-moi ce que tu vois, et donne-moi la date » → l'Élève reçoit vision+web (le trou comblé) ET le prompt porte la date réelle.

## Liens

- [[brain-dispatch]] — le rail `dispatch` (#150) réutilisé par É2 (routeur), É5 (orchestration), É7 (A/B) ; c'est là que la conscience temporelle É3 est injectée dans le contrat ; le fallback Pilier C (C2) garantit le repli du routeur.
- [[gardien-cloture]] — #161, joué sur le build SIMULÉ du dry-run (É6) avant d'autoriser `apply()` ; son juge d'intention note l'A/B (É7).
- [[blackboard]] — scope `llm-cache:<role>` du cache sémantique (É4), cosinus brute-force `safeEmbed`.
- [[sharingan-vision-eleve]] — `vois_ecran`, la capacité `vision` enfin offrable en Discuter grâce à É1/É2.
- [[speculation-agentique]] — #171, le worktree jetable dont É6 est la généralisation « mode simulation ».
- [[limites|L79-L82]] — les 4 limites honnêtes du chantier (heuristique imparfaite · faux hit sémantique · dry-run fichier/code seul · juge A/B bruité).

## Sources

- `docs/plan-182-intention-dispatch.md` — plan complet (7 décisions D1-D7, 8 étapes, format corpus Fable).
- [[statut]] / [[historique]] — livraison #182 du 2026-07-04.
