# Audits de la nuit 2026-07-03 — carte complète des failles (3 agents parallèles)

> Les 5 failles au meilleur ratio impact/coût ont été corrigées cette nuit (voir `plan-nuit-2026-07-03-level-up.md`). **Ce fichier archive TOUT le reste** — chaque ligne non cochée est un chantier candidat. Règle de Raf : aucune limite ne se perd.

## A. Pipeline de génération (qualité d'exécution)

| # | Faille | Corrigée cette nuit ? | Modèle optimal | Effort |
|---|--------|----------------------|----------------|--------|
| A1 | Blocs de prompt citant des outils que l'Élève n'a pas (WebSearch, mcp__vision__*) → ancrage visuel sauté en silence | ✅ (alias d'outils) | — | — |
| A2 | Goût jamais bloquant (observe permanent) + axiomes goût droppés (cap 0) | ✅ (cap 1500 + plancher 50) | — | — |
| A3 | Relances Gardien à contexte périmé (user construit une fois) | ✅ (rebuild + rappel fichiers) | — | — |
| A4 | Vérification visuelle = UNE capture 1280×800 de l'accueil au repos | ✅ partiel (`chemin`+`page_entiere` sur vois_ecran ; le GARDIEN, lui, ne capture toujours QUE l'accueil) | ⚖️ | S |
| A5 | Juge d'intention KO → 100/100 silencieux ; critique KO → goût+WCAG sautés sans distinction | ❌ (note "(juge KO)" existe mais indiscernable dans les logs) | ⚡ | XS |
| A6 | `runClosureParcours` = 1 étape (charger l'accueil) — pas de vrai parcours dérivé du plan | ✅ partiel (gate ON + saut loggé ; dériver 2-3 étapes du plan reste à faire) | ⚖️ | S |
| A7 | Troncature des résultats d'outils SANS marqueur (12 000 car) → réécritures amputées invisibles | ❌ | ⚡ | XS |
| A8 | Budgets courts : 24 itér./run, 2 relances Gardien | ✅ (36 + 3 en .env ; budget PAR MODE reste à coder) | ⚡ | XS |
| A9 | Placeholders vivants indétectés | ✅ (garde déterministe) | — | — |

## B. Couche design

| # | Faille | Corrigée cette nuit ? | Modèle optimal | Effort |
|---|--------|----------------------|----------------|--------|
| B1 | Goût physiquement absent du juge design (cap 0) + jamais bloquant | ✅ | — | — |
| B2 | Zéro règle typographique concrète (Inter partout) | ✅ (DESIGN_CRAFT_RULES) | — | — |
| B3 | Pas d'ancrage chromatique au SUJET (seulement moodboard des leaders) | ✅ (règle d'ancrage + alias sharingan_image→chercher_image) | — | — |
| B4 | `.design-system.md` / `.preferences.md` / `.layouts/` : magasins VIDES depuis leur création (RULES injectées à chaque tour pour rien) | ❌ — seeder depuis la galerie + sauvegarde auto post-succès | ⚖️ | M |
| B5 | Motion : règles chiffrées seulement en esthetique interne | ✅ (DESIGN_CRAFT_RULES en elite/mvp/nocturne) | — | — |
| B6 | Axiomes design noyés (cap 3000 dominé par BUILD-xx ; les grands axiomes UX vivaient hors de portée de l'Élève) | ✅ partiel (DESIGN_AXIOMS_RULES statique ; `.axioms.design.md` partitionné + cap dédié reste à faire) | ⚖️ | S |
| B7 | Images : requêtes Pexels naïves (sac de mots), aucune direction artistique (pas d'overlay de marque, pas d'harmonie photo↔palette) | ❌ | ⚖️ | S |
| B8 | Starters techniques anti-axiomes (vitrine = bleu Tailwind générique, émojis) ; `templateForType` ne mappe que 4 templates sur 23 (jeu→null alors que phaser/pixi existent) | ❌ — refondre en squelettes neutres à tokens + mapper jeu/slides | ⚖️ | M |
| B9 | Lentilles de critique subjectives sans rubrique ; design-metrics n'a que contraste+hors-palette | ❌ — ajouter 4-5 mesures statiques (nb familles de polices, échelle typo présente, couleurs littérales, transitions présentes) | ⚖️ | S |
| B10 | Prompt esthetique (design-coach applyFixes) ordonne encore mcp__vision__snapshot à l'Élève | ✅ (l'alias du contrat couvre le cas) | — | — |

## C. Robustesse infra (nuits autonomes)

| # | Faille | Corrigée cette nuit ? | Modèle optimal | Effort |
|---|--------|----------------------|----------------|--------|
| C1 | `askClaude`/`claudeWebResearch` (llm-engine.ts) SANS timeout — le chemin du juge nocturne par défaut | ❌ — Promise.race + q.interrupt() | ⚖️ | S |
| C2 | `runAgent` sans garde-fou de durée MURALE (maxTurns borne les tours, pas le temps) ; batch nocturne sans deadline globale | ❌ | ⚖️ | S |
| C3 | Boucle nocturne HORS verrou `agentBusy` → collision d'état global (currentQuery écrasé, vision d'un autre projet) | ❌ | 🧠 | M |
| C4 | Juge esthétique nocturne screenshote le MAUVAIS projet (getPreviewUrl du dernier tour de chat), échec avalé → boucle RLHF polluée | ❌ — startPreview(dir) explicite dans buildOne | ⚖️ | S |
| C5 | Vite orphelins : `stopThis` fire-and-forget sans vérif de mort ; AUCUN handler SIGINT/exit (pool + Playwright fuient au kill) — racine du problème port 3000/5174 | ❌ | ⚖️ | S |
| C6 | `nocturnal.json` : read-modify-write avec copie mémoire gardée toute la nuit → reviews/suppressions concurrentes écrasées | ❌ — recharger avant chaque save | ⚡ | XS |
| C7 | Fetchs Élève sans timeout → deadlock agentBusy | ✅ | — | — |
| C8 | `runNpmInstall` : timeout/échec résout comme un SUCCÈS | ❌ | ⚡ | XS |
| C9 | Course sur `getBrowser()` (deux Chromium, le premier fuit) | ❌ — mémoïser la promesse de launch | ⚡ | XS |
| C10 | Écritures JSON non atomiques restantes (cron-scheduler, brains, multi-project, prompt-evolution, project-plan, perfect-plan, qa-temporal, run-mango-nuit) + `.axioms.md` en RMW concurrent | ❌ — basculer sur atomicWriteFileSync + sérialiser les appends d'axiomes | ⚡ | S |

## Leçon transverse des 3 audits
Le diagnostic racine se recoupe : **le savoir design du projet n'atteignait pas le modèle qui génère** (caps à 0, modes observe permanents, magasins vides, axiomes dans la mémoire du Maître, outils mal nommés dans les prompts). La moitié des failles étaient des défauts de CÂBLAGE, pas du code manquant — auditer la config runtime (env, caps, gates) vaut autant qu'auditer le code.
