---
type: meta
tags: [wiki, log]
maj: 2026-06-20
---

# Journal du wiki

Append-only. Une ligne par opération (ingest / query / lint / maintenance). Préfixe constant `## [date] type | titre` → parseable (`grep "^## \[" log.md | tail -5`).

## [2026-06-20] init | Création du wiki MangoOS
Slice initial du *vault* Obsidian : squelette ([[_schema]], [[index]], [[log]]) + 5 pages-entités phares synthétisées depuis [[statut]]/[[memory]]/[[historique]] : [[kernel]], [[blackboard]], [[mangoqa]], [[boucle-curation]], [[eleve-local]]. Sources brutes laissées intactes.

## [2026-06-20] note | Mode Éditeur visuel — essayé puis ABANDONNÉ
Un mode éditeur (resize / espacement / typo à la souris dans l'aperçu) a été ajouté puis **entièrement retiré** à la demande de Raf : restauration git des 6 fichiers de code + `statut.md`/`historique.md`, aucun commit. **On conserve le clic→sélection existant**, qui convient. La page [[vision]] ne mentionne plus l'éditeur.

## [2026-06-20] ingest | Complétion des 6 entités d'architecture
Ajout de [[coque-souple]], [[coque-rigide]], [[memoire-expertise]], [[vision]], [[boucle-nocturne]], [[deploiement]], synthétisées depuis [[memory]] + [[statut]]. Le wiki couvre désormais **toute l'architecture** : 11 pages-entités, plus aucun lien en pointillé sur l'ossature. Prochain jalon : pointeur de maintenance dans `CLAUDE.md` (étape 2) + gabarit wiki perso (étape 3).

## [2026-06-20] ingest | Bureau OS #136 — Phase 1.5 Home + Sidebar redesign
Home néon glassmorphism + Sidebar globale 4 icônes + panneau Outils Wrench + ProjectsWindow. Build vert 9.67s. [[bureau-os]] mis à jour.

## [2026-06-20] ingest | Bureau OS #136 — Phase 1 Window Manager
Nouvelle page [[bureau-os]] : bureau iconique + fenêtres superposables (Phase 1 livrée). 5 fichiers modifiés, `useWindowManager.js` / `Window.jsx` / `WindowManager.jsx` créés, drag/resize natifs, chrome macOS. Phases 2 (Image Creator FLUX) et 3 (Music Creator AudioCraft) documentées en roadmap. [[index]] mis à jour (12 pages-entités).

## [2026-06-21] ingest | Audit de flux + P0 navigation + finition cockpit (palette iOS, style P3)
Audit complet de la navigation (3 explorations) → cockpit incohérent : création d'app **cassée**, écran fantôme `"chat"`, 30 outils entassés, doublons. Nouvelle page [[flux]] (architecture cible 4 plans + **contrat de flux** = futur cerveau de l'Auditeur). **P0 livré** : « Nouveau projet » dans App Builder → workspace+preview ; `"chat"` supprimé ; `slugify` factorisé. Côté cockpit : hamburger cascade, historique conversations, markdown (`remark-gfm`), **style P3 « dégradé linéaire minimaliste »**, **palette iOS** en tokens `@theme`, voile + contraste adouci, rail sidebar visible. Nouvelle idée **#137 Auditeur de Flux** (conseil, dimension [[mangoqa]], étagé, après refonte nav). [[bureau-os]] mis à jour. Build vert 9.72s.

## [2026-06-21] ingest | #137 Auditeur de Flux — Tier 0 déterministe livré (4ᵉ visage MangoQA)
Nouveau visage de [[mangoqa]] dans le repo fantôme `D:\IA\MangoQA` : `src/flux-eye/` (graph/eye/runner), calqué sur design-eye. Reconstruit le **graphe de nav** (auto-découverte de la variable d'état, fenêtres, routes — heuristiques littérales conservatrices, gère `?.` et la convention prop `on`+Setter) et applique le **contrat de flux** ([[flux]], 5 règles). **Mesuré (dur)** = cible fenêtre/route sans handler (R3) ; **convergence (questions)** = inatteignabilité (R1/R5), fantôme d'état (R3 doux), doublons (R2). `blocking:false`, fail-open. Câblé dans `handleSignal`, CLI `run-flux-eye.ts`, surfacé au chat MangoOS (`mangoqa.ts buildFluxMessage`). Tests 29/29 + mangoqa 17/17 ; tsc verts. **Validé sur le cockpit** : 0 faux positif dur après itération (corrigés : `.type ===`→`win.type`, `?.`, `onSetScreen`), détecte les ~8 routes d'écran mortes de P2/P4. Reste Tier 1 (LLM cost-aware). [[mangoqa]]/[[flux]] mis à jour. Zéro git.

## [2026-06-21] ingest | Concepts #138/#139 — composer la production (OS d'apps · gros projet)
Nouvelle page [[composer-os]] suite à un échange stratégique avec Raf (« compiler les mini-apps en un OS ? un site de 20 pages, comment ? »). Exploration (2 agents) → apps générées = projets Vite indépendants, frameworks hétérogènes (React+Vue), SPA sans router, seul lien = [[blackboard]]. **Verdict** : 2 problèmes distincts, foncteur commun « socle/contrat d'abord, incréments bornés ensuite ». **#138 OS d'apps (Office)** : rejet du compilateur de code (enfer micro-frontend), retenu = shell+contrat (= [[bureau-os]]) avec colonne de données partagée ; l'agent « compose à la génération », pas « fusionne après ». **#139 Gros projet unique** (site/jeu) : socle-d'abord (Perfect Plan→squelette+router+données) puis page/stage par incrément + **Kanban**. Décision Raf : **valider le concept**, ne rien construire ; séquencement #137 → #139 → #138. Consigné `statut.md`/`historique.md`/[[index]]. Zéro git.

## [2026-06-21] ingest | Refonte nav P4 — apps « bureau » en fenêtres (refonte P0→P4 COMPLÈTE)
Les 7 dernières apps écran-plein (Ideation, Notes&RAG, Doc, Prompt Lab, Design Review, Multi-Projet, Super Agent) passent en **fenêtres flottantes**. `WindowManager.jsx` : 7 `lazy` + 7 cas `WindowContent` (onBack→`onClose`, extras via `win.props` : `onStartCoding`/`onToast`/`projectName`) ; tuiles Launcher → `onOpenApp`. `App.jsx` : `openAppWindow(id)` (switch→`openWindow` avec tailles/props), routes `screen` + lazy retirés. 4 composants `min-h-screen`→`h-full` (+ scroll interne) — sans risque (ouverts qu'en fenêtre ; `Window` donne une zone `flex-1 overflow-hidden`). Exploration préalable : **zéro couplage** (aucun tutoriel ne cible ces écrans, pas de deep-link). **Toute app = une fenêtre** → surfaces homogènes (flux #4). Build vert 9.83s, vérif Sharingan (Ideation, Prompt Lab 2-col, Super Agent). **Refonte navigation P0→P4 complète** ; prochain = Auditeur de Flux #137. [[flux]]/[[bureau-os]] mis à jour.

## [2026-06-21] ingest | Refonte nav P3 — dock épuré + Launcher (FIN de la refonte)
Sidebar transformée en **dock épuré** (App Builder · Image · Music · Launcher · Réglages · Tutoriels · Thème) : fini le panneau « Outils » fourre-tout de 30 items. Nouveau **Launcher** (`type:"launcher"` dans `WindowManager.jsx`) = grille de toutes les apps & outils (sections Apps/Outils). Artefacts/Aide deviennent des fenêtres (`artifacts`/`guide`). Les **3 boutons flottants** workspace (Miroir/Versions/MangoQA) **supprimés** (doublons du rail projet P1). Hamburger Home « Tools »→« Toutes les apps ». `Sidebar.jsx` réécrit (180→~190 l. mais sans ToolBtn/panneaux), `App.jsx` allégé (`openLauncher`/`openProjectsWindow`, état `sidebarTools` retiré). Règle de flux #2 (doublons) + #4. Build vert 9.76s, vérif Sharingan (dock, Launcher, workspace épuré). **Refonte nav P0→P3 complète.** [[flux]]/[[bureau-os]] mis à jour.

## [2026-06-21] ingest | Refonte nav P2 — écran Réglages unique (master-detail)
Les 10 outils système/diagnostic (Billing, Cron, Review nocturne, Métriques, Traces, Dashboard, Auto-Ablation, Radar, Veille, Tokeniseur) éparpillés dans 3 sections du panneau Outils sont rangés sous **un** écran **Réglages** (`Reglages.jsx`) : sous-nav gauche groupée (Compte / Automatisation / Diagnostics Kernel / Veille & outils) + composant **monté tel quel** (lazy) à droite. `Metrics`/`Traces` (sans en-tête) enveloppés d'un `PaneHeader`. Sidebar globale : items retirés de Analyse/Contenu/Système → **une** entrée « Réglages » (gear). `NEUTRAL` masque le groupe Diagnostics. Contrat de flux #1+#2. Build vert 9.88s, vérif Sharingan (Facturation, Tokeniseur, Métriques). [[flux]]/[[bureau-os]] mis à jour.

## [2026-06-21] ingest | Refonte nav P1 — outils projet → rail workspace (VS Code)
Les ~11 outils projet (Mémoire, Revue, Versions, Backend, GitHub, Perfect Plan + actions Export/Mode Client/Réflexion/MangoQA/Miroir) quittent le panneau Outils global et atterrissent dans un **rail contextuel** à gauche du workspace (`WorkspaceTools.jsx`, façon barre d'activité VS Code) avec panneaux qui s'ouvrent à droite du rail. **Composants réutilisés tels quels** (`Knowledge`/`BuildReview`/`VersionsPanel`/`BackendPanel`/`GithubPanel`/`PerfectPlanPanel`) ; `PanelShell` factorisé (`PanelShell.jsx`, partagé Sidebar↔rail). Sidebar globale allégée (Analyse/Créer/Contenu/Système). Contrat de flux règle #4 (surfaces homogènes) honorée. Build vert 9.95s, vérif Sharingan OK (rail + panneau Mémoire). [[flux]] et [[bureau-os]] mis à jour.

## [2026-06-20] ingest | Bureau OS #136 — Finition Home conversationnel + Sidebar droite + titre signature
Home devient un **chat type claude.ai** (idle→conversation, bulles, barre fixe en bas) branché sur le nouvel endpoint `/api/home-chat` (via `askLLM`→abonnement, $0), séparé de l'App Builder. **Sidebar passée à droite** en hover-reveal (`fixed`, hotzone 8px). Logo image abandonné → **titre signature** « Mango**OS** » (dégradés jaune/orange/rouge + tige bois & feuille SVG sortant de la mangue « OS »). Fix `llm-engine` `maxTurns 1→5`. Vérif **Sharingan** (capture Playwright `localhost:5173` → lecture image → itération) adoptée pour le visuel. UI build vert 9.87s, server tsc vert. [[bureau-os]] mis à jour.
