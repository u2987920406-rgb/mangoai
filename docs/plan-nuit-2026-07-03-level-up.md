# Plan de nuit 2026-07-03 — Level-up « OS frontière »

**Mission de Raf (00:26, autonome jusqu'à 3h00)** : 5 failles corrigées · 5 compétences de rupture (exécution + UI/design) · ~20 templates/frameworks locaux par domaine · 5-6 apps/sites/simulateurs/jeux qui font rêver.

## Procédure (demandée explicitement)

### 1. Comment je scanne Mango
- **3 agents parallèles en lecture** : (a) pipeline de génération (scenario.ts, eleve.ts, prompts, Gardien, vision) — failles de qualité d'exécution ; (b) rendu des apps générées + design system injecté — failles UI/design ; (c) robustesse infra (erreurs avalées, gates, boucles, budgets) — failles de fiabilité.
- Croisement avec `limites.md` (registre des limites honnêtes) et les axiomes UX/AVOID déjà appris (mémoire persistante) : une faille déjà nommée mais jamais corrigée compte double.

### 2. Comment je trouve les failles
- Critère unique : **la règle absolue de Raf — qualité EN SITUATION RÉELLE**. Une faille = tout ce qui fait qu'une app générée est en-dessous du top (pas un bug théorique). Sources : scan statique + traces des dernières runs + verdicts du Gardien/MangoQA + axiomes AVOID (les échecs notés 1/5 pointent les racines).
- Sélection : je garde les 5 failles au **meilleur ratio impact-rendu-réel / coût de correction cette nuit**.

### 3. Comment je cherche sur Internet
- WebSearch ciblé : tendances design 2026 (typographie, palettes, motion), techniques de prompt pour génération d'UI de haut niveau, patterns de templates/starter-kits éprouvés (shadcn/ui, Tailwind v4, micro-frameworks canvas/jeux), références visuelles par domaine (landing SaaS, portfolio, dashboard, jeu arcade…).
- Chaque trouvaille n'entre dans Mango que **compilée en règle/contrainte** (prompt, template, checklist) — jamais en dépendance réseau au runtime.

### 4. Comment j'améliore et je crée le level-up
- **Failles** → correctifs code/prompt directs, `tsc` + build + tests verts après chacun.
- **Compétences** → transmises à l'Élève (règles de scénario, outils, templates), pas codées à sa place — conformément à la directive transmission.
- **Templates** → bibliothèque locale `server/templates/` (~20 dossiers par domaine : manifest + squelette + règles design propres au domaine), branchée dans l'assemblage du prompt (détection du domaine → injection du template).
- **Preuve finale** → 5-6 générations réelles en mode Élite, Gardien actif (`ELEVE_CLOSURE_GATE=on`), vraies images Pexels, `teste_parcours` ; vérification visuelle Playwright de chaque app avant de la déclarer réussie.
- **Clôture** → statut.md + historique.md + wiki (+ limites.md si limite honnête). **Zéro git sans ordre explicite de Raf** (la permission « automatique » de ce soir couvre le travail, pas les commits).

## Fenêtre temporelle
- 00:30-00:50 — scan (agents) + recherche web en parallèle
- 00:50-01:30 — 5 failles corrigées
- 01:30-02:10 — 5 compétences + 20 templates (les templates SONT le véhicule principal des compétences design)
- 02:10-03:00 — générations (lancées en parallèle, backend frais anti-orphelin) + vérifs visuelles + clôture

## Résultats (rempli au fil de la nuit)

### Failles — 5/5 corrigées ✅ (tsc propre, eleve-gate 49/0, non-régressions vertes)
1. **Prompt trompeur** — table d'ALIAS D'OUTILS dans `AGENTIC_TOOL_CONTRACT` (les règles moodboard/Sharingan/cadrage citaient WebSearch/mcp__vision__* que l'Élève n'a pas → phase d'identité visuelle sautée en silence).
2. **Relances aveugles** — `buildEleveUser` reconstruit à chaque relance du Gardien + rappel « déjà écrit ce run » dans le nudge.
3. **Gardien édenté sur le goût** — `GATE_TASTE_AXIOMS_CHARS` 0→1500 (le VL du gate est qwen3.5:cloud) + plancher `ELEVE_GATE_TASTE_FLOOR=50` bloquant même en observe (« ÉCHEC GROSSIER »).
4. **Deadlock nocturne** — `AbortSignal.timeout` (180 s) sur les 4 fetchs Élève, timeout = retry transitoire (plus jamais d'agentBusy gelé pour la nuit).
5. **Placeholders vivants** — garde déterministe `scanFilesForPlaceholders` dans le Gardien (9 domaines picsum/loremflickr/…, raison IMAGES, opt-out env).
Bonus config : `ELEVE_GATE_PARCOURS=on` (+ saut loggé « NON vérifié ⚠ », plus silencieux) · `ELEVE_AGENTIC_MAX_ITER=36` · `ELEVE_GATE_RELANCE_MAX=3`.

### Compétences — 5/5 livrées ✅
1-3. Bloc **`DESIGN_CRAFT_RULES`** (elite/mvp/nocturne/esthetique) : typographie par registre émotionnel (pairings nommés, échelle clamp, un moment typographique par page) · palette ANCRÉE au sujet (ancre citée, true greys, un accent) · motion minimum chiffré (3 micro-interactions, stagger, reduced-motion).
4. Bloc **`DESIGN_AXIOMS_RULES`** : les axiomes UX 10-34 / AVOID 25-39 transcrits — ils n'atteignaient JAMAIS le modèle qui génère (ils vivaient dans la mémoire de session du Maître).
5. **Vision multi-pages** : `vois_ecran(chemin, page_entiere)` + `capturePreview(url, {fullPage})` — pages internes et bas de page enfin visibles (motif UIUX-11).

### Templates — 20/20 écrits + branchés ✅ (test-template-library 21/0)
2 gold standards main (landing-saas, jeu-arcade) + 18 par 3 agents parallèles. `template-library.ts` (détection mots-clés FR/EN désaccentués, frontière de mots, seuil 2) → bloc `domainTemplate` d'`assembleSystemPrompt`, alimenté aux 2 sites (Maître agent.ts + Élève index.ts).

### Apps (100 % GLM-5.2, élite, Gardien on — en cours au fil de la nuit)
| # | Projet | Domaine ciblé | Statut |
|---|--------|---------------|--------|
| 1 | neon-drift | jeu-arcade | ✅ FINI 02:32 (22 min, 19 itér., 1 tentative, $0) — Gardien : intention 100/100, goût 74/100, teste_parcours ✓ ; **vérif visuelle indépendante ✅** (écran titre synthwave : titre glitch géant, grille perspective, vaisseau glow — capture `scratchpad/neon-drift-viewport.png`) ; seul écart : un 404 bénin (favicon) |
| 2 | abysse-vivante | simulateur | ✅ FINI 02:39 (6,5 min, 23 itér., $0) — Gardien : intention 100/100, goût 79/100, teste_parcours ✓ ; **vérif visuelle ✅ zéro erreur console** (océan vivant : boids lumineux, méduses, prédateur au trait, 227 créatures @ 56 FPS, presets « Nuit calme/Marée noire/Veille bioluminescente », curseur attirer/disperser — capture `scratchpad/abysse-viewport.png`) |
| 3 | mission-ares | dashboard | ✅ FINI 03:13 (34 min, dont attente cloud ; 8 itér. finales, $0) — Gardien : intention 100/100, goût 74/100, teste_parcours ✓ ; **vérif visuelle ✅** (progressive disclosure exemplaire : indice santé 98 % + badge RAS en premier, télémétrie sparklines, 4 membres d'équipage nommés aux bpm différenciés, true grey premium — capture `scratchpad/ares-viewport.png`) ; 404 bénin (favicon) |
| 4 | maison-onyx | dark-luxe | ✅ FINI 03:28 (15 min, 9 itér., $0) — Gardien : intention 100/100, **goût 85/100 (meilleur de la nuit)**, teste_parcours ✓ ; **vérif visuelle ✅** (hero serif racé « ONYX N°1 », fumée d'encens réelle, or champagne < 5 %, tagline mystère « Cent vingt-huit exemplaires. Aucune seconde chance. » ; au scroll réel : matières ASSAM + « La Pyramide » interactive — captures `onyx-viewport/onyx-scroll.png`) ; note : la capture fullPage seule montre des zones noires (reveals IntersectionObserver non déclenchés) — artefact de capture, pas un manque |
| 5 | lumen-synesthesie | musique-audio | ✅ FINI 03:40 (12 min, 4 itér., $0) — Gardien : intention 100/100, goût 75/100, teste_parcours ✓ ; **vérif visuelle ✅ zéro erreur console** (écran d'activation élégant « Entrer dans la lumière » + « un geste est nécessaire pour le son · casque recommandé » — le piège n°1 du domaine évité —, titre dégradé métallique sur halos violet/vert — capture `scratchpad/lumen-viewport.png`) |
| 6 | festival-aurora | evenement | ✅ FINI 04:28 (45+ min, la seule ESCALADE de la nuit : GLM a buté → le Maître Claude a corrigé, $8.15, +1 axiome appris) — goût 79→75/100, teste_parcours ✓, build vert, version 88d844a ; marquée INCOMPLET par le Gardien mais **la cause est le bug connu L69** (le juge d'intention après le Maître reçoit le résumé placeholder « résolu par le Maître » → 0/100 forcé), PAS le rendu ; **vérif visuelle ✅** (hero dégradé violet géant, vraies aurores boréales sur neige lapone, countdown vivant correct 252 j → 12-14 mars 2027, Levi Laponie, CTA vert aurore — capture `docs/nuit-2026-07-03/aurora-viewport.png`) |

**Bilan génération : 6/6 apps livrées et vérifiées visuellement.** 5/6 résolues par GLM-5.2 SEUL à 0 $ (goûts 74-85/100, teste_parcours vert partout) ; 1 escalade légitime vers le Maître (aurora, $8.15 — le filet a fonctionné comme conçu). Toutes les captures : `docs/nuit-2026-07-03/`. La nuit valide EN RÉEL : les templates de domaine (chaque app suit son manifest — écran d'activation audio, presets nommés du simulateur, progressive disclosure du dashboard, métal <5 % du dark-luxe, game juice de l'arcade), le moment typographique par page, les palettes ancrées, les vraies images Pexels, et le fix « relances non-aveugles ». Constat honnête : le bug L69 (intention 0/100 après Maître) reste le premier irritant du chemin d'escalade — déjà au registre des limites.
