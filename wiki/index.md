---
type: meta
tags: [wiki, index]
maj: 2026-07-19
---

# Index du wiki MangoOS

Catalogue de toutes les pages. Voir [[_schema]] pour les conventions, [[log]] pour la chronologie.

## Vue d'ensemble

**MangoOS** = agent personnel local-first style Lovable : on décrit une app web dans un chat, l'IA génère le code React/Vite (ou Svelte/Vue), aperçu live à côté. Backend Node+Express (`server/`, port 3000), front builder React+Vite (`ui/`, port 5173). Voir [[idee]].

## Pages-entités (architecture)

| Page | En une ligne | Statut |
|---|---|---|
| [[kernel]] | Infrastructure 5 piliers (Brain, Bus, Blackboard, MCP, Tracing) — #108 | ✅ écrite |
| [[blackboard]] | Mémoire d'artefacts cross-projet, SQLite-vec persistant — #115→#117 | ✅ écrite |
| [[mangoqa]] | Audit autonome « fantôme » à 3 visages (Disjoncteur / Observateur / Œil) | ✅ écrite |
| [[boucle-curation]] | Mesurer → réinjecter → prouver → orienter la réutilisation — #117→#130 | ✅ écrite |
| [[eleve-local]] | Boucle d'apprentissage : Élève Gemma 4 local ($0) + escalade Claude — Jalon D | ✅ écrite |
| [[examen-cerveau]] | « Révélateur de cerveau » : scan d'audit d'entrée d'un modèle inconnu → verdict de placement — #148 | ✅ écrite |
| [[phase-e-multicerveaux]] | Multi-cerveaux par intention : le bon cerveau par tâche, mesuré + souverain (cloud↔local) — #135/#146 Phase E | ✅ écrite |
| [[brains]] | Registre `.brains` : fiches cerveau mesurées + routage intention→cerveau + « MangoOS avertit » — Phase E | ✅ écrite |
| [[brain-dispatch]] | Système multi-agents à cerveaux interchangeables : 10 agents nommés + registre éditable + contrat universel — #150 ✅ fait, validé live | ✅ écrite |
| [[atelier-cerveaux]] | UI Réglages : un modèle par agent + parcourir/télécharger les modèles Ollama locaux + garde de capacités (l'œil exige `vision`) + scanner #148 — #162, prouvé live · **+ forgeron Opus & cerveaux dédiés par agent forgé (2026-06-29)** | ✅ écrite |
| [[auto-evolution]] | La boucle qui rend Mango auto-évolutif : un blocage non couvert → lacune notée (`open-gaps.json`) → forgeron crée l'agent ciblé après validation de Raf (semi-auto) — #168 tranche 1 ✅ prouvée live | ✅ écrite |
| [[sharingan-vision-eleve]] | L'œil de GLM : outil `vois_ecran` (rendu→image→VL cloud→critique) pour qu'il VOIE ses écrans et s'auto-corrige — #151 ✅ fait, prouvé live | ✅ écrite |
| [[sharingan-extraction]] | `extraire_site` : naviguer + voir + comprendre + reformuler un site en dossier structuré, le persister (artefact réutilisable) et l'illustrer (Pexels) — #159 COMPLET 5/5, prouvé live | ✅ écrite |
| [[planifier-avant-agir]] | `planifier` : l'Élève pose un PLAN d'étapes avant de coder, rappelé quand il dérive (plan-ancre) — #160, prouvé live | ✅ écrite |
| [[gardien-cloture]] | Gate de clôture goût/QA/intention dans la boucle : GLM ne finit que si c'est la bonne tâche, au bon goût, lisible (convergent, non-bloquant) — #161, prouvé live · **+ clôture APRÈS le Maître (Gardien + teste_parcours + MangoQA) & reboucle du Maître sur RED — prouvé live 2026-07-01** | ✅ écrite |
| [[hooks]] | Gardes déclaratives (événement + matcher + handler) exécutées par un dispatcher générique : ajouter une garde = une entrée de config, plus un fichier .ts — PreToolUse/PostToolUse/PreFinish/OnBlock/OnEscalate/OnGapRecorded, gaté ELEVE_HOOKS off — #172, livré 2026-07-01 | ✅ écrite |
| [[loop]] | Cron agentique : le cron in-app appelle la vraie boucle `runRelay` (écrit du code, seul) borné par un disjoncteur à fenêtre glissante + rythme adaptatif + journal diff-friendly, gaté CRON_AGENTIC off — #173, livré 2026-07-02 | ✅ écrite |
| [[skills]] | Skills à invocation directe : taper `/slug args` au composer expanse le SKILL.md (substitution `$ARGUMENTS` / positionnels / nommés) en tour utilisateur ; `disable-model-invocation` retire une skill du prompt passif de l'Élève sans lui ôter l'invocation directe — #174, livré 2026-07-02, prouvé HTTP réel | ✅ écrite |
| [[subagents]] | Spécialistes forgés EXÉCUTANTS : un agent en mode "action" reçoit sa propre boucle agentique (`runSpecialistAgentic`) avec des outils SCELLÉS à la forge (`toolPolicy` allowlist/denylist via `assignMode`), budget réduit ; gaté `ELEVE_DELEGATE_AGENTIC` off — #175, livré 2026-07-02, preuve live (agent écrit un fichier, scellage tenu) | ✅ écrite |
| [[le-stratege]] | Raisonnement de déblocage : quand l'exécutant bloque, Mango DIAGNOSTIQUE la cause puis CHOISIT le remède et APPREND, tranche l'ambigu (cerveau frugal) et monte le cerveau de l'exécutant + mesure la souveraineté — #164 ✅ COMPLET (Phases 0-4) | ✅ écrite |
| [[grand-chantier]] | Orchestrateur qui enchaîne TOUT SEUL les incréments d'un gros projet A-Z (squelette → incrément → Gardien+tests → suivant), checkpoint resumable + budget + quarantaine — Phase 2, cœur prouvé 27/27, gaté OFF | ✅ écrite |
| [[domaines-unity]] | Abstraction de domaine (Web défaut vs Unity) qui sort le pipeline du tout-Vite + compétence Unity/C# (build headless, tests EditMode, template) — Phase 3a, gaté OFF, build live à prouver | ✅ écrite |
| [[mcp-externe]] | Loader de serveurs MCP externes (stdio) qui publie leurs outils à l'Élève — Blender/GIMP/Inkscape ; client JSON-RPC maison + JSON Schema→Zod + sorties neutralisées — Phase 3b, gaté OFF | ✅ écrite |
| [[auto-amelioration]] | Mango améliore son PROPRE code : copie isolée (git worktree) + diff relu + garde-fou par réversibilité — barreau 1 (lecture + copie isolée) livré & prouvé live, l'expérience GLM-dans-le-worktree reste | 🚧 en cours |
| [[oeil-coach]] | Critique design MULTI-LENTILLES + boucle « critique → GLM corrige → re-regarde » jusqu'à un seuil — #152 ✅ fait, prouvé live (limite juge VL bruité notée) | ✅ écrite |
| [[transmission-competences]] | Mission : Claude APPREND son savoir-faire à Mango — tout trou bouché à la main → outil de l'Élève. Transmis : vois_ecran #151, chercher_image #153, chercher_web/lire_page #154, teste_parcours #155, chercher_artefact #156, lire_document #157 (+Office #158), extraire_site #159 (→ [[sharingan-extraction]]), planifier #160 (→ [[planifier-avant-agir]]) | ✅ écrite |
| [[moteur-gout]] | Capter le goût UI/UX de Raf par préférence multi-variantes (K skins GLM → 1 tap → axiome de goût) — #149, v1.5 livrée | ✅ écrite |
| [[templates-domaines]] | Bibliothèque locale de 20 manifests de domaine (angle + squelette + typo/palette/motion + pièges AVOID) injectés au prompt quand la demande matche (`template-library.ts`, détection mots-clés FR/EN, seuil anti-faux-positifs) — nuit 2026-07-03 | ✅ écrite |
| [[toeic-quest]] | Formation TOEIC 1 an (800+) construite via MangoOS : moteur Claude, **~290 questions écrites par GLM**, cohérence d'images jugée par le VL — conversations H/F, carte de parcours Duolingo, 7 parties officielles — 2026-06-30 | ✅ écrite |
| [[audit-souverainete]] | Recensement des défauts-Claude en 3 niveaux + interrupteurs de repli local (`<FEATURE>_PROVIDER`) — Phase E | ✅ écrite |
| [[coque-souple]] | Assemblage du prompt par blocs/scénario, modes MVP/Élite/Finition — jalon A | ✅ écrite |
| [[coque-rigide]] | Contrat d'E/S `<mangoos>`, `executor.ts`, `inspection.ts` — jalon C/D | ✅ écrite |
| [[memoire-expertise]] | 4 magasins (mémoire projet, profil, skills, axiomes), boucle Hermes | ✅ écrite |
| [[vision]] | Entrées visuelles : native, Figma REST, clone/scrape web, clic→source, édition | ✅ écrite |
| [[boucle-nocturne]] | `train-loop.ts` / `nocturnal.ts`, génération autonome de nuit — idée 32 | ✅ écrite |
| [[deploiement]] | GitHub #16, Supabase #17, Cloudflare/Vercel/Netlify #18 | ✅ écrite |
| [[bureau-os]] | Bureau iconique + fenêtres superposables — #136 (Window Manager, chat, palette iOS) | ✅ écrite |
| [[flux]] | Architecture de navigation + contrat de cohérence — audit 2026-06-21, refonte P0→P4 complète | ✅ écrite |
| [[composer-os]] | Assembler la production : suite d'apps (#138, type Office) ou gros projet unique (#139, socle+Kanban) — **2 spines livrées & prouvées e2e** | ✅ écrite |
| [[pre-requis-gros-projet]] | Briques externes (TypeScript · router fichier · LSP-MCP · tree-sitter · sqlite-vec) pour les gros projets #139 | ✅ écrite |
| [[dette-technique]] | Les 4 points fragiles de l'archi (App.jsx god-component · nav stringly-typed · regex flux · tests UI) à renforcer — #140 | ✅ écrite |
| [[vault-projet]] | Vault Obsidian auto-cartographié par gros projet (carte vivante navigable agent+humain) — #141 | ✅ écrite |
| [[command-center]] | Mango Command Center — poste de pilotage perso des idées/chantiers, Kanban local-first (prototype du #139) — #144 | ✅ écrite |
| [[cartographie-projet]] | Modèle « photogrammétrie → indexation IA » : EXIF/AST + keypoints/embeddings + recalage/vault — à sortir à la Phase 2 de #139 | ✅ écrite |
| [[agents-specialises]] | Constellation UX/UI · Layout · PDF — spécialistes Gemma locaux, `ModelProfile`, relay paramétrable — #145 | ✅ écrite |
| [[audit-general]] | Super audit rétrospectif + empirique : évolution, validé vs manquant, 3 écarts honnêtes (souveraineté minoritaire · coût cloud non tracé · promesses de périphérie) — 2026-06 | ✅ écrite |
| [[audit-2-0]] | Audit complet préparant la refonte 2.0 : moteur mature à consolider, UI = vrai chantier (design system, état, monolithes, a11y) — feuille de route A→E, rapport `docs/audit-mango-2.0.md` — 2026-07-02 | ✅ écrite |
| [[intention-dispatch]] | La capacité suit le BESOIN de la tâche, pas la POSTURE : registre unifié gardé par capacité + conscience temporelle + cache sémantique + dry-run + A/B — #182, 7 étapes, 6 gates éprouvés ENSEMBLE (45/45) | ✅ écrite |
| [[stratege-global]] | Stratège GLOBAL proactif cross-projet ET cross-session : agrège 8 capteurs (dont l'Observateur-Conseil lu, jamais recalculé), persiste, PUSH un briefing conseil, questionne la demande de Raf — #176, 6 étapes + preuve bornée É7 (10 gates ensemble, aucune interaction cassée) | ✅ écrite |
| [[interface-bureau-autonome]] | MangoOS = vraie app de bureau (coque Tauri + sidecar Node supervisé) + périmètre d'action élargi CONTRÔLÉ : coffres consentis, le pouvoir suit le pilote (interactif large / autonome restreint sous précondition dure), scheduler borné partageant le budget-$ dur, MangoQA supervisé avec canal d'alerte natif — #180 COMPLET (É1-É7) | ✅ écrite |
| [[formation-adaptative]] | Mango fabrique une FORMATION personnalisée sur n'importe quel sujet : curriculum+banque d'items, boucle RAPIDE client (FSRS+repli Leitner) et boucle LENTE serveur (le Tuteur, remédiation ciblée sur faiblesse persistante) — #181 COMPLET (6/6 étapes), Tuteur réel prouvé bout-en-bout (vrai GLM, vrai Blackboard) | ✅ écrite |

## Veille externe

| Page | En une ligne | Statut |
|---|---|---|
| [[veille-sakana-fugu]] | Sakana Fugu : orchestration multi-agents commerciale (TRINITY/Conductor, ICLR 2026) — la thèse MangoOS poussée à l'échelle, mais propriétaire/opaque ↔ comparatif + 3 idées à reprendre | ✅ écrite |
| [[trinity]] | TRINITY (Sakana, ICLR 2026) : coordinateur LLM minuscule (~0,6 B) qui réassigne Thinker/Worker/Verifier tour par tour, optimisé par ÉVOLUTION (sep-CMA-ES) — valide la frugalité du cerveau Stratège #164 | ✅ écrite |
| [[conductor]] | Conductor (Sakana, ICLR 2026) : coordinateur 7 B entraîné par RL qui écrit un workflow en langage naturel (qui·quoi·contexte) + récursion test-time — horizon d'expressivité du Stratège #164 | ✅ écrite |
| [[speculation-agentique]] | Speculative decoding (DeepSpec) transposé aux ACTIONS : le frugal drafte une séquence, on accepte le préfixe valide (worktree isolé, verify = build réel de l'app), on escalade à la divergence — **prouvé END-TO-END sur une vraie app** (71 tests, zéro GPU) ; résidu = DeepSpec littéral cloud-GPU — #171 | ✅ écrite |
| [[harnais]] | Le « Harnais » (Flavien Chevret) : l'armature autour d'un LLM interchangeable (skills/scripts/templates/secrets/boucles) = la thèse MangoOS formalisée ↔ comparatif + 2 trous à combler : templates infra back #169 · coffre-fort de secrets #170 | ✅ écrite |
| [[atlas-harnais-2027]] | Atlas (`harnais-2027`) : repo perso de Raf, cortex cognitif souverain 100% Ollama, "NayaOS"="MangoOS" dans son code — audit 12/20→plan 17/20 (2026-07-19), 2 vrais bugs MangoQA trouvés en vérif live pendant l'audit | ✅ écrite |

## Pistes de pages futures

- Une page par **app construite via MangoOS** (ex. MangoCartes #97) si tu veux suivre tes propres projets.
- [[idee]] et [[design]] mériteraient une page de synthèse si elles grossissent.

## Sources brutes (immuables)

[[statut]] · [[historique]] · [[fondation]] · [[memory]] · [[plan]] · [[changelog]] · [[idee]] · [[limites]] (registre des limites honnêtes → pistes de résolution)
