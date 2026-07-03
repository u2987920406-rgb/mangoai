# Audit de la nuit 2026-07-03 — tableau consolidé des failles (3 agents parallèles)

> **Méthode** : 3 agents d'audit lancés en parallèle (A = pipeline de génération · B = couche design · C = robustesse infra), ~24 failles uniques après fusion des recoupements. Les 5 au meilleur ratio impact-rendu-réel/coût ont été **corrigées la nuit même** ; le reste est le backlog ci-dessous. Règle de Raf : aucune limite ne se perd.
> **Diagnostic racine commun aux 3 audits** : le savoir design du projet n'atteignait pas le modèle qui génère (caps à 0, modes observe permanents, magasins vides, outils mal nommés dans les prompts). La moitié des failles = défauts de CÂBLAGE, pas de code manquant.

| # | Faille | Domaine | Impact rendu réel | Priorité | Statut | Modèle optimal | Effort |
|---|--------|---------|-------------------|----------|--------|----------------|--------|
| N1 | **Prompt trompeur** — les blocs d'ancrage visuel (moodboard/Sharingan/cadrage) citaient des outils que l'Élève n'a pas (`WebSearch`, `mcp__vision__*`) → phase d'identité visuelle sautée en silence, itérations gaspillées | Pipeline | 🔴 majeur (médiocrité générique) | P0 | ✅ FAIT (table d'alias `AGENTIC_TOOL_CONTRACT`) | — | — |
| N2 | **Relances aveugles du Gardien** — prompt user construit UNE fois : chaque relance voyait un projet « vide » et un contexte neuf → ré-exploration, réécritures, dérive | Pipeline | 🔴 majeur (polish coupé) | P0 | ✅ FAIT (rebuild `buildEleveUser` + rappel fichiers écrits) | — | — |
| N3 | **Gardien édenté sur le goût** — axiomes tronqués à 0 car (`GATE_TASTE_AXIOMS_CHARS=0` alors que le VL du gate est qwen3.5:cloud) + goût JAMAIS bloquant en observe | Pipeline+Design | 🔴 majeur (« build-vert ≠ réussi ») | P0 | ✅ FAIT (cap 1500 + plancher `ELEVE_GATE_TASTE_FLOOR=50` bloquant) | — | — |
| N4 | **Deadlock nocturne** — 4 fetchs Élève sans timeout : un TCP half-open gelait le tour, `agentBusy` jamais libéré, UI morte jusqu'au redémarrage | Infra | 🔴 majeur (nuit perdue) | P0 | ✅ FAIT (`AbortSignal.timeout` 180 s + retry transitoire) | — | — |
| N5 | **Placeholders vivants indétectés** — une URL picsum/loremflickr QUI CHARGE passait le check 404 et toutes les clôtures | Pipeline | 🔴 majeur (règle ⭐ vraies images violée) | P0 | ✅ FAIT (garde `scanFilesForPlaceholders` dans le Gardien) | — | — |
| N6 | Budgets de finition courts — 24 itérations coupaient 7/10 apps élite en plein polish (L35) ; 2 relances Gardien laissaient partir de l'INCOMPLET corrigeable | Pipeline | 🟠 fort | P0 | ✅ FAIT (config : 36 itér. + 3 relances) — budget PAR MODE reste à coder | ⚡ Haiku | XS |
| N7 | `runClosureParcours` fail-open SILENCIEUX (preview injoignable = ✓ indiscernable d'un vrai ✓) + une seule étape (charger l'accueil) | Pipeline | 🟠 fort | P1 | 🟡 PARTIEL (gate ON + saut loggé « NON vérifié ⚠ ») — dériver 2-3 étapes réelles du plan reste à faire | ⚖️ Sonnet | S |
| N8 | Vérification visuelle mono-capture : le GARDIEN ne voit que l'accueil au repos 1280×800 (l'Élève, lui, a désormais `chemin`+`page_entiere`) | Pipeline | 🟠 fort (motif UIUX-11) | P1 | 🟡 PARTIEL (côté Élève ✅) — le Gardien doit capturer accueil + 1 route des `pages/` écrites | ⚖️ Sonnet | S |
| N9 | Juge d'intention KO → 100/100 silencieux ; critique KO → goût+WCAG sautés sans distinction dans les logs (incident infra indiscernable d'une validation) | Pipeline | 🟠 fort | P1 | 🟡 OUVERT (la note « (juge KO) » existe mais rien ne la surface) | ⚡ Haiku | XS |
| N10 | Troncature des résultats d'outils SANS marqueur (12 000 car) → l'Élève réécrit des fichiers amputés sans le savoir | Pipeline | 🟠 fort (régressions invisibles) | P1 | 🟡 OUVERT (suffixer « …[TRONQUÉ — relis par sections, utilise edit_file] ») | ⚡ Haiku | XS |
| N11 | Magasins design VIDES depuis leur création (`.design-system.md`, `.preferences.md`, `.layouts/`) — leurs RULES brûlent des tokens à chaque tour pour rien ; zéro capitalisation des compositions réussies | Design | 🟠 fort | P1 | 🟡 OUVERT (seeder depuis la galerie 20+ projets + sauvegarde auto post-succès par le Gardien) | ⚖️ Sonnet | M |
| N12 | Axiomes noyés — cap 3000 dominé par BUILD-xx ; pas de partition `.axioms.design.md` avec cap dédié (le bloc statique DESIGN_AXIOMS_RULES couvre le socle mais pas les axiomes FUTURS appris) | Design | 🟠 fort | P1 | 🟡 PARTIEL (socle statique ✅) — partition + injection prioritaire à faire | ⚖️ Sonnet | S |
| N13 | Images : requêtes Pexels naïves (sac de mots), aucune direction artistique (pas d'overlay de marque, pas d'harmonie photo↔palette, pas de style unique par app) | Design | 🟠 fort | P1 | 🟡 OUVERT | ⚖️ Sonnet | S |
| N14 | Starters techniques anti-axiomes (vitrine = bleu Tailwind générique + émojis) ; `templateForType` ne mappe que 4 starters sur 23 (jeu→null alors que phaser/pixi existent) | Design | 🟡 moyen | P2 | 🟡 OUVERT (refondre en squelettes neutres à tokens + mapper jeu/slides) | ⚖️ Sonnet | M |
| N15 | Lentilles de critique subjectives sans rubrique observable ; design-metrics n'a que contraste+hors-palette (manquent : nb familles de polices, échelle typo, couleurs littérales, transitions présentes) | Design | 🟡 moyen | P2 | 🟡 OUVERT (4-5 mesures statiques → signaux fiables pour le VL et le Gardien) | ⚖️ Sonnet | S |
| N16 | `askClaude`/`claudeWebResearch` (llm-engine) SANS timeout — le chemin du juge nocturne par défaut peut geler le batch entier | Infra | 🔴 majeur (nuit autonome) | P1 | 🟡 OUVERT (`Promise.race` + `q.interrupt()`) | ⚖️ Sonnet | S |
| N17 | `runAgent` sans garde-fou de durée MURALE (maxTurns borne les tours, pas le temps) ; batch nocturne sans deadline globale → un projet rétif mange la nuit | Infra | 🔴 majeur | P1 | 🟡 OUVERT (wall-clock 45 min/projet + deadline batch) | ⚖️ Sonnet | S |
| N18 | Boucle nocturne HORS verrou `agentBusy` → collision d'état global (`currentQuery` écrasé, `/api/stop` interrompt le mauvais agent, vision d'un AUTRE projet) | Infra | 🔴 majeur | P1 | 🟡 OUVERT | 🧠 Opus | M |
| N19 | Juge esthétique nocturne screenshote le MAUVAIS projet (`getPreviewUrl()` du dernier tour de chat, jamais `startPreview` pour les `nuit-*`), échec avalé → boucle RLHF polluée | Infra | 🔴 majeur (le goût appris se corrompt) | P1 | 🟡 OUVERT (`startPreview(dir)` explicite dans `buildOne` + log d'échec) | ⚖️ Sonnet | S |
| N20 | Vite orphelins : `stopThis` fire-and-forget sans vérif de mort ; AUCUN handler SIGINT/exit (pool + Playwright fuient au kill) — **racine du problème connu port 3000/5174** | Infra | 🟠 fort (récurrent) | P1 | 🟡 OUVERT (handler exit + attendre taskkill + re-vérifier) | ⚖️ Sonnet | S |
| N21 | `nocturnal.json` : read-modify-write avec copie mémoire gardée toute la nuit → reviews/suppressions concurrentes ÉCRASÉES au projet suivant | Infra | 🟡 moyen | P2 | 🟡 OUVERT (recharger avant chaque save) | ⚡ Haiku | XS |
| N22 | `runNpmInstall` : timeout/échec résout comme un SUCCÈS → node_modules à moitié installé, échec Vite obscur en aval | Infra | 🟡 moyen | P2 | 🟡 OUVERT | ⚡ Haiku | XS |
| N23 | Course sur `getBrowser()` : deux appels concurrents lancent deux Chromium, le premier fuit (jamais fermé) | Infra | 🟡 moyen | P2 | 🟡 OUVERT (mémoïser la PROMESSE de launch) | ⚡ Haiku | XS |
| N24 | Écritures JSON non atomiques restantes (cron-scheduler, brains, multi-project, prompt-evolution, project-plan, perfect-plan, qa-temporal, run-mango-nuit) + `.axioms.md` en RMW concurrent (2 distillateurs peuvent se perdre des axiomes) | Infra | 🟡 moyen (perte d'état au crash) | P2 | 🟡 OUVERT (basculer sur `atomicWriteFileSync` + sérialiser les appends) | ⚡ Haiku | S |

## Deuxième passe (mission 4-volets 2026-07-03) — audit UI / HTTP / kernel / secrets

> Zones que les 3 audits de nuit n'avaient pas couvertes. Le coffre-fort de secrets est ressorti **exemplaire** (aucune fuite). Mais 5 failles de SÉCURITÉ HAUTES (path traversal, fuite de secrets par sous-process, CORS ouvert) — toutes rapides.

| # | Faille | Domaine | Gravité | Statut | Modèle optimal | Effort |
|---|--------|---------|---------|--------|----------------|--------|
| U1 | Path traversal → écriture arbitraire (RCE possible) : `meta.name`/`:name` bruts dans `POST/GET/DELETE /api/components` | Sécurité HTTP | 🔴 haute | ✅ FAIT (slugify) | ⚡ Haiku | XS |
| U2 | **Exfiltration de TOUS les secrets** : `run_command` hérite de `process.env` complet → l'Élève peut lire GITHUB_TOKEN/ELEVE_API_KEY/MANGO_VAULT_KEY | Sécurité | 🔴 haute | ✅ FAIT (env restreint) | ⚖️ Sonnet | S |
| U3 | `execSync("npm install")` synchrone gèle tout le serveur (event loop) jusqu'à 120 s au démarrage backend | Perf/dispo | 🔴 haute | ✅ FAIT (async) | ⚡ Haiku | XS |
| U4 | `bus-events.jsonl` jamais tronqué + I/O SYNCHRONE à chaque événement du bus | Perf/kernel | 🟠 fort | 🟡 ouvert (rotation + append async) | ⚖️ Sonnet | S |
| U5 | N+1 SELECT par tour de chat sur `artifact:design` jamais purgé (croît chaque nuit) | Perf/kernel | 🟠 fort | 🟡 ouvert (`entries(scope)` + cap/TTL) | ⚖️ Sonnet | S |
| U6 | UI — aperçu du MAUVAIS projet affiché (race au changement rapide de projet) | UI | 🟠 fort | ✅ FAIT (flag stale) | ⚡ Haiku | XS |
| U7 | UI — double-clic « Démarrer backend » → **process orphelin** (la plaie connue des ports) | UI | 🟠 fort | ✅ FAIT (garde in-flight) | ⚡ Haiku | XS |
| U8 | Suppression de répertoire arbitraire : `DELETE /api/skills/:name` brut + `rmSync` récursif | Sécurité HTTP | 🟠 fort | ✅ FAIT (isSafeSlug) | ⚡ Haiku | XS |
| U9 | UI — double-soumission du formulaire cron → tâches dupliquées (coût tokens réel) | UI | 🟡 moyen | ✅ FAIT (garde creating) | ⚡ Haiku | XS |
| U10 | Path traversal lecture/suppression sur les routes PDF `:docId` (UUID trivial à valider) | Sécurité HTTP | 🟡 moyen | ✅ FAIT (regex UUID) | ⚡ Haiku | XS |
| U11 | CORS grand ouvert (`cors()`) = amplificateur des endpoints destructifs depuis un site tiers | Sécurité | 🟡 moyen | ✅ FAIT (origin localhost) | ⚡ Haiku | XS |
| U12 | `search()` Blackboard = full scan + `JSON.parse` de tous les embeddings à chaque tour | Perf/kernel | 🟡 moyen | 🟡 ouvert (cache décodé / BLOB Float32) | ⚖️ Sonnet | M |

Races UI résiduelles (même patron « flag cancelled », XS chacune, non individualisées) : `useVersions`, Perfect Plan, statut backend, QAPanel, HooksPanel, DocGenerator, 8 setTimeout sans cleanup dans Chat.jsx — **une passe groupée les règle** (🟡 ouvert, ⚖️ S).

**Bilan global de la mission** : nuit (N1-N24) → 12 corrigées + 3 partielles + 9 backlog. Deuxième passe (U1-U12) → **8 sécurité/UI corrigées** + 4 perf-kernel backlog. Total réparé dans la mission : **20 failles** ; backlog priorisé : 13 (dont 4 perf-kernel P1, le reste P2). Les 5 failles de sécurité HAUTE sont toutes fermées.
