# Revue Fable 5 des fondations — 2026-07-03 (pré-#181)

Revue d'architecture EN LECTURE SEULE du delta fondations (~26 fichiers, commits `c511d8a`→`cf71d54`) par un agent Fable 5, AVANT que #181 (générateur de formation — runs longs, tous gates allumés) ne consomme ces fondations. Mandat en 3 questions : défauts sur run long · interactions de gates · simplifications.

## Verdict d'ensemble

La revue a **payé** : 3 🔴 dont un qui rendait la reprise inter-session **inopérante précisément dans sa config nominale** (ELEVE_ETAT + ELEVE_RESUME ensemble), invisible des ~800 assertions unitaires parce que chaque gate n'était testé qu'isolément. Confirmations saines : apiKeyEnv (nom seulement), $0 abonnement, contrats dispatch/complete opposés intacts, SqliteStore « exemplaire », discipline de gate « excellente ».

## Corrigé (avec tests de preuve)

| Sév. | Défaut | Correctif | Preuve |
|---|---|---|---|
| 🔴 1 | La garde « même tâche » du snapshot comparait `messages[1]`, or ELEVE_ETAT y splice l'état de travail → reprise MORTE quand les 2 gates sont allumés | `LoopSnapshot v2` : champ `user` dédié + garde `snap.user === user` ; à la restauration, `stateMsgIndex=1` si l'état est déjà en index 1 (jamais empilé) | gates-combinés [1]/[2] |
| 🔴 2 | `referencesPromptSection` : seule injection system SANS cap | cap 1500 car. + 20 entrées + marqueur `[... N non montrées]` ; sous le cap = byte-identique | test-references 39 ✓ |
| 🔴 3 | Migration SQLite : backup échoué → `up()` tournait quand même | échec du backup → chaîne de migrations REPORTÉE (warn), schéma courant conservé (runtime déjà fail-open) | blackboard-sqlite 32 ✓ |
| 🟠 1 | Budget B0.1 câblé nulle part en prod | `AgenticRunCtx.loopBudget` → `buildAgentic.budget`, alimenté par `ELEVE_BUDGET_PROMPT_CHARS`/`ELEVE_BUDGET_TOOL_CALLS` (absent = inerte) | eleve-runtime 61 ✓ |
| 🟠 2 | Sous-agents délégués écrasaient/supprimaient le snapshot du parent (même projectDir) | `AgenticOptions.snapshots:false` pour depth>0 — seul le parent snapshotte | gates-combinés [4] |
| 🟠 3 | Sorties terminales (stuck/plafond/budget) laissaient un snapshot empoisonné (TTL 2 h) | `clearRunSnapshot()` sur TOUTE sortie terminale — la reprise est pour les crashs | gates-combinés [5] |
| 🟠 4 | Snapshot non borné : `toolTrace` ET `messages[].tool_calls` portaient les contenus COMPLETS des write_file (123 Ko mesurés / 12 écritures), re-sérialisés à chaque itération | `snapshotTrace` + `snapshotMessages` : write_file/edit_file réduits au `path` (reste parseable pour changedFilesFromTrace), autres args tronqués à 300 → **8,8 Ko** mesurés | gates-combinés [6] |
| 🟠 5 | Reprise incohérente : plan perdu (Map in-process) + état « aucun fichier écrit » face à un transcript qui montre l'inverse | nudge de reprise invite à re-poser le plan + `workingState.fichiersEcrits` réconcilié depuis la trace restaurée | gates-combinés [2]/[3] |
| 🟠 6 | Rideau de fer `BRAIN_LOCAL_ONLY` ignoré par le fallback Kernel (sortie cloud possible) | repli non-ollama refusé (warn) sous le flag ; warn non-bloquant si le principal n'est pas ollama | test-kernel 63 ✓ |
| 🟠 9 | Gate `MEMORY_MANIFEST` mort (aucun appelant) | `ensureManifest()` câblé au boot (fail-open, self-gaté) | memory-manifest 16 ✓ |

Le défaut du 🟠 4 sur `messages[].tool_calls` a été **découvert par le test d'interaction lui-même** (pas par la revue) — la boucle revue→test a rapporté un défaut de plus que prévu.

## Nouveau test : `test-fondations-gates-combines.ts` (22 ✓)

Les 8 scénarios recommandés par Fable : reprise réelle ETAT+RESUME (échouait avant 🔴 1) · unicité du message d'état · invite à re-poser le plan · isolation des snapshots parent/sous-agent · purge sur sortie terminale · snapshot borné (8,8 Ko pour 120 Ko écrits) · REFLEXION+ETAT+RESUME ensemble (protocole sain, borné) · **OFF combiné = byte-identique** (gates absents VS off explicites).

## Backlog (assumé, non corrigé aujourd'hui)

| Sév. | Item | Piste | Modèle optimal | Effort |
|---|---|---|---|---|
| 🟠 7 | Effet cliquet `localOnly` : GET→PUT UI persiste les localOnly forcés par le flag ; `applyProfile` efface les localOnly posés à la main | dé-appliquer le forçage avant PUT / merge des localOnly au applyProfile | ⚖️ Sonnet | S |
| 🟠 8 | AXIOMS_DRIFT : jusqu'à 200 embeddings séquentiels par append (concurrence Ollama) | cacher les embeddings (Blackboard) ou fenêtre réduite | ⚖️ Sonnet | S |
| 🟠 10 | `tsc` non vert : 5 erreurs préexistantes `_prove-demo.ts`/`_prove-assets.ts` | corriger les handlers KernelToolResult (async) | ⚡ Haiku | XS |
| 🟡 | 3 `getBrain` homonymes + 2 `BrainConfig` différents (kernel vs registry) | renommer `getKernelBrain`/`getAgentBrain`/`getBrainCard` | ⚖️ Sonnet | S |
| 🟡 | `atomicAppendFile` async + `serialByPath` : zéro appelant (dead code) | supprimer ou documenter « réservé multi-写 » | ⚡ Haiku | XS |
| 🟡 | `loadBrainRegistry` relit disque+parse à CHAQUE dispatch | memoïser par mtime | ⚡ Haiku | XS |
| 🟡 | `flagsSnapshot()` sans consommateur (route /debug promise) | câbler une route diag ou retirer | ⚡ Haiku | XS |
| 🟡 | `BLACKBOARD_TTL` : prune livré, job nocturne absent | câbler au nocturne | ⚖️ Sonnet | S |
| 🟡 | `embedOllama` : OLLAMA_URL figé au chargement (incohérent avec resolveOllamaBaseUrl) | même résolution paresseuse | ⚡ Haiku | XS |
| 🟡 | 3ᵉ `cosine` dupliqué (axioms-drift) | unifier dans un util partagé | ⚡ Haiku | XS |
| 🟡 | `formatPlanReminder` non plafonné (titres d'étapes du modèle) | cap doux (rôle tool = compactable, pas critique) | ⚡ Haiku | XS |

## Vérification finale

tsc propre (hors `_prove-*`) · **26 suites vertes ≈ 730 assertions** (dont les 22 neuves du test d'interaction) · comportement gate off byte-identique re-prouvé combiné.
