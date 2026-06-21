---
type: concept
tags: [navigation, ux, ia, flux, audit, cohérence, app-builder]
statut: refonte-complète · P0→P4-livrés · prochain=auditeur-flux-#137
sources: [statut#136, statut#137, historique#session-2026-06-21]
maj: 2026-06-21
---

# flux

L'**architecture de navigation** de MangoOS et son **contrat de cohérence**. Né de l'audit de flux du 2026-06-21, déclenché par un bug : la refonte du chat d'accueil avait cassé la création d'app.

## Principe directeur

> La navigation fait le **pont entre ce que l'app sait faire (technique) et ce que l'utilisateur veut faire (humain)**, avec le chemin **le plus fluide et logique** possible. Chaque écran/outil a **une** place évidente et **une** façon de l'atteindre.

## Architecture cible — 4 plans

| Plan | Rôle | Surface |
|---|---|---|
| **Bureau (Home)** | Point d'entrée humain : chat avec Mango | Écran `home` |
| **Apps** | Ce qu'on veut *faire* (App Builder, Image, Music, Agent Factory, Ideation, Notes, Doc, Veille, Prompt Lab, Design Review, Multi, Super Agent) | **Fenêtres** + un **Launcher** |
| **Réglages / Système** | La technique rangée (Billing, Cron, Nocturne, Métriques, Traces, Ablation, Radar, Dashboard, Tokeniseur) | **Un** espace à sous-sections |
| **Workspace** | Travailler dans un projet : Chat + Preview **+** outils projet (Mémoire, Versions, Perfect Plan, Backend, GitHub, Revue, Export, Mode Client, Réflexion, MangoQA, Miroir) | Panneau **contextuel** (façon VS Code) |

**Sidebar = dock épuré** (App Builder · Image · Music · Launcher · Réglages · Tutoriels · Thème), plus le déversoir de 30 items.

## Contrat de flux (les règles — désormais le cerveau de l'[[mangoqa]] Auditeur #137, Tier 0 livré)

1. **Zéro écran orphelin** — tout écran a au moins un point d'entrée ET une sortie réelle.
2. **Une entrée par fonction** — pas de doublons d'accès (anti-pattern : Versions/Miroir accessibles par 2 chemins).
3. **Pas d'écran fantôme** — aucune cible de navigation (`setScreen(x)`) sans rendu correspondant (anti-pattern corrigé : `"chat"`).
4. **Surfaces homogènes** — une même *catégorie* de chose = une même surface (app→fenêtre, réglage→sous-section, outil projet→panneau workspace). Pas de mélange écran-plein/fenêtre/panneau pour des choses semblables.
5. **Tout chemin humain atteignable** — l'intention utilisateur clé (créer une app, voir la preview) a un chemin évident et court depuis le Bureau.

## État

- **Audit fait** (3 explorations : création projet · table `screen` · sidebar/Outils).
- **P0 livré** : création d'app restaurée dans App Builder (`NewProjectForm` → `openProject` → workspace+preview) ; écran fantôme `"chat"` supprimé ; `slugify` factorisé (`ui/src/slugify.js`).
- **P1 livré** : outils projet sortis du panneau Outils global → **rail contextuel façon VS Code** dans le workspace (`ui/src/components/WorkspaceTools.jsx`). Composants réutilisés tels quels (`Knowledge`, `BuildReview`, `VersionsPanel`, `BackendPanel`, `GithubPanel`, `PerfectPlanPanel`) ; `PanelShell` factorisé en module partagé. Sidebar globale ne garde que Analyse/Créer/Contenu/Système. Règle de flux #4 (surfaces homogènes) appliquée : outil projet = panneau workspace.
- **P2 livré** : écran **Réglages** unique (`ui/src/components/Reglages.jsx`), master-detail (sous-nav gauche groupée Compte / Automatisation / Diagnostics Kernel / Veille & outils → composant monté à droite). 10 outils système rangés (Billing · Cron · Review nocturne · Métriques · Traces · Dashboard · Auto-Ablation · Radar · Veille · Tokeniseur) — composants montés tels quels (lazy), `Metrics`/`Traces` (sans en-tête) enveloppés d'un `PaneHeader`. Sidebar globale : items système retirés de Analyse/Contenu/Système, remplacés par **une** entrée « Réglages ». Règle de flux #1 (un toit pour la technique) + #2 (une entrée par fonction).
- **P3 livré** : Sidebar devient un **dock épuré** (App Builder · Image · Music · Launcher · Réglages · Tutoriels · Thème — fini le déversoir de 30 items). Nouveau **Launcher** (fenêtre `type:"launcher"` dans `WindowManager.jsx`) = grille de **toutes** les apps & outils (sections Apps / Outils). Artefacts & Aide deviennent des fenêtres (`type:"artifacts"`/`"guide"`). Les **3 boutons flottants** workspace (Miroir/Versions/MangoQA) **supprimés** — doublons du rail projet P1. Hamburger Home : « Tools » → « Toutes les apps » (ouvre le Launcher). Règle de flux #2 (doublons éliminés) + #4.
- **P4 livré** : les 7 dernières apps « bureau » (Ideation · Notes&RAG · Doc · Prompt Lab · Design Review · Multi-Projet · Super Agent) passent d'**écrans pleins** à **fenêtres flottantes** (`WindowManager.jsx` : 7 lazy + 7 cas ; `App.jsx` : `openAppWindow(id)`, routes `screen` retirées). Tuiles du Launcher → `onOpenApp`. 4 composants `min-h-screen`→`h-full` + scroll interne (sans risque, ouverts qu'en fenêtre). **Toute app = une fenêtre** : surfaces enfin homogènes (règle de flux #4). `versions`/`controleur` restent des écrans (contexte projet, à dessein).
- **Refonte navigation P0→P4 COMPLÈTE.** Le contrat de flux est honoré sur les 4 plans.
- **Moteur d'extraction migré vers tree-sitter** (2026-06-21, #140-#3) : `flux-eye/graph.ts` (`buildGraph`) n'extrait plus le graphe de nav par **regex** mais par un **vrai AST** (web-tree-sitter 0.24 WASM + `tree-sitter-wasms`, grammaire TSX) pour les fichiers JS/TS/JSX/TSX ; repli regex **byte-identique** pour `.vue/.svelte/.html` et les structures top-level cassées. Pré-chargé via `initFluxParser()` au point d'entrée → `buildGraph` **reste synchrone** (contrat `NavGraph` intact). Gain concret : un `setX(...)` en **commentaire/string** n'est plus un faux fantôme (l'AST distingue code et texte ; la regex non).
- **Résolution de constantes** (2026-06-21, #140-#3 — la killer feature que seul l'AST permet) : le détecteur résout désormais les **membres de constantes** en plus des littéraux. Une **table des symboles** (`collectConstants`) scanne les `const X = Object.freeze({ KEY: "v" })` du projet → `WINDOWS.SUITE → "suite"`, `SCREENS.HOME → "home"` ; `resolve()` remplace `stringValue()` partout (rendus écran/fenêtre, cibles `setX`/`openWindow`, init `useState`). Conséquence : depuis l'adoption `WINDOWS.*`/`SCREENS.*` (#140-#2), la nav s'écrit `win.type === WINDOWS.SUITE` — l'auditeur **voit enfin** ces rendus et cibles. La regex ne pourra **jamais** faire ça (elle ignore la sémantique des symboles). Deux corrections de **fidélité** ont accompagné la bascule, attrapées sur le cockpit réel : (1) un `&`/`<` brut dans du **texte JSX** (valide en React) flague tout le fichier `hasError` — on ne replie plus sur le regex que si la **structure top-level** est cassée (`topLevelBroken`, enfant direct de la racine en erreur), pas pour une scorie profonde ; (2) les ouvreurs sont souvent des appels de **méthode** `a.onOpenWindow?.({type: WINDOWS.X})` — on résout le nom de callee (identifiant **ou** propriété de membre, `calleeName`), parité retrouvée avec le regex. **Résultat mesuré sur le cockpit : 12 faux fantômes durs → 0** ; ne restent que des questions de convergence **souples** légitimes (`metrics` monté via Réglages, `workspace` couvert par fallback, `image-creator`/`music-creator` accessibles depuis 3+ endroits = R2). **42/42 tests** (33 hérités + 6 constantes + 3 robustesse), `tsc` vert.
- **#137 Auditeur de Flux — Tier 0 LIVRÉ** (2026-06-21) : ces 5 règles sont **réifiées en code** dans le 4ᵉ visage de MangoQA (`D:\IA\MangoQA/src/flux-eye/`). Déterministe, zéro LLM. **Mesuré (dur)** : R3 sur surfaces sans fallback (fenêtre/route). **Convergence (questions)** : R1/R5 (inatteignabilité — incertaine statiquement), R3 doux (cible d'état sans rendu dédié), R2 (doublons). Reconstruit le graphe de nav (auto-découverte de la variable d'état). Validé sur le cockpit : 0 faux positif dur, détecte les routes mortes de P2/P4. **Tier 1 livré** : audit **LLM conseil, cost-aware** (`flux-eye/deep.ts`, gaté par `shouldRunDeep`) qui juge **R4 (surfaces homogènes)** + cohérence sémantique — ce que le déterministe ne peut pas (validé en réel : a trouvé l'hétérogénéité `metrics`). Détail → [[composer-os]] (même muscle) et [[mangoqa]].

## Liens

- [[bureau-os]] — la métaphore OS que ce flux rend cohérente
- [[mangoqa]] — l'Auditeur de Flux (#137) **est** désormais sa 4ᵉ dimension (Tier 0) ; ce contrat = ses règles
- [[kernel]] — le Brain Adaptateur (#135) : l'Auditeur est le filet qui le rend viable avec des modèles faibles
- [[composer-os]] — #138/#139 dépendent de ce QA de cohérence

## Sources
- `statut.md` #136 (Bureau OS), #137 (Auditeur de Flux)
- `historique.md` session 2026-06-21
