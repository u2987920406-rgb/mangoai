---
type: concept
tags: [ui, ux, fenêtres, bureau, sidebar, window-manager, home, glassmorphism]
statut: phase-2-finition-livree · audit-flux · P0-nav-livré
sources: [statut#136, historique#session-2026-06-20-bureau-os, historique#session-2026-06-21]
maj: 2026-06-21
---

# bureau-os

MangoOS UI redesignée en bureau iconique avec fenêtres flottantes superposables — cohérent avec la vision `fondation.md` : « agents = applications, skills = drivers ».

## Rôle

Rendre l'interface cohérente avec la métaphore OS de MangoOS : chaque application (App Builder, Agent Factory, Image Creator, Music Creator) s'ouvre dans une **fenêtre flottante draggable et redimensionnable**, plutôt que de remplacer l'écran principal.

## Détails clés

### Architecture (Phase 1)

| Fichier | Rôle |
|---|---|
| `ui/src/hooks/useWindowManager.js` | État `windows[]`, helpers open/close/focus/move/resize |
| `ui/src/components/Window.jsx` | Coquille `position:fixed`, drag natif, resize coin, chrome macOS |
| `ui/src/components/WindowManager.jsx` | Stack de fenêtres, routing par `type`, lazy AgentFactory |
| `ui/src/App.jsx` | Intégration hook, `globalChrome` accueille `<WindowManager>` |
| `ui/src/components/Sidebar.jsx` | Boutons → `openWindow()`, icônes FLUX + AudioCraft ajoutées |

### Comportements clés

- **Dédup par type** : ouvrir une app déjà ouverte la ramène au premier plan (`allowMultiple: false` par défaut)
- **Cascade** : chaque nouvelle fenêtre décalée de `(prev.length % 6) * 28px`
- **Z-index dynamique** : clic → `focusWindow` → z-index maximal + 1
- **Drag natif** : `document.addEventListener('mousemove'/'mouseup')`, zéro lib externe
- **Clamp** : `x ∈ [0, innerWidth-120]`, `y ∈ [0, innerHeight-40]`
- **MIN** : 400×280 px enforced au resize

### Phase 1.5 — Home redesign + Sidebar globale

| Fichier | Changement |
|---|---|
| `ui/src/index.css` | +2 keyframes : `neon-pulse` (glow texte accent), `orb-drift` (orbes de fond) |
| `ui/src/components/Home.jsx` | Réécriture : logo MangoOS néon animé, 3 orbs glassmorphism, chat window avec badge Claude Sonnet 4.6 + bouton Wispr Flow + délai 650ms au lancement |
| `ui/src/components/Sidebar.jsx` | Réécriture : 4 icônes primaires (FolderOpen/ImageIcon/Music2/GraduationCap), panneau Outils (Wrench) avec 5 sections, toggle thème pill, panneaux workspace existants préservés |
| `ui/src/components/WindowManager.jsx` | +`ProjectsWindow` auto-contenu (fetch `/api/projects`, search, ConfirmDelete) |
| `ui/src/App.jsx` | Layout global `flex h-screen` : Sidebar toujours présente (home + workspace + panels), suppression des 18 boutons flottants de l'accueil, `onOpenProjects` thread `openProject`/`handleDeleteProject` vers la fenêtre Projects |

**UX** : `mode="home"` → section Projet du panneau Outils masquée ; `mode="workspace"` → toutes sections visibles.

### Finition — Home conversationnel + Sidebar droite + titre signature

| Fichier | Changement |
|---|---|
| `ui/src/components/Home.jsx` | Chat type claude.ai : **mode idle** (centré, textarea + dropdowns) bascule en **mode conversation** (bulles user/assistant, barre fixe en bas) au 1er message. Logo image retiré → **titre signature** SVG : « Mango » violet, « O » jaune→orange, « S » orange→rouge + **tige bois courbe & feuille verte** sortant du sommet de la mangue « OS ». Hamburger déplacé en haut-**gauche** |
| `ui/src/components/Sidebar.jsx` | Passée à **droite** en `fixed right-0`, **hover-reveal** (état `expanded`, hotzone 8px, `translate-x-full`↔`translate-x-0`), tooltips et panneaux secondaires inversés vers la gauche |
| `server/src/index.ts` | Endpoint **`/api/home-chat`** : conversation directe (messages[] + model) via `askLLM`, mapping `sonnet/opus/haiku`→IDs Anthropic. Séparé de `/api/chat` (App Builder) |
| `server/src/llm-engine.ts` | `askClaude` : `maxTurns 1→5` — le preset `claude_code` épuisait le tour unique (« Reached maximum number of turns ») |

**Vérification visuelle (Sharingan)** : capture Playwright de la page rendue (`localhost:5173`) → lecture de l'image → itération. Méthode adoptée pour tout travail visuel (cf. mémoire `feedback-verif-visuelle-avant-done`).

### Types de fenêtres

| type | Contenu | Statut |
|---|---|---|
| `projects` | `<ProjectsWindow>` — liste + création (App Builder) | ✅ P0 |
| `launcher` | `<LauncherWindow>` — grille de toutes les apps | ✅ P3 |
| `agent-factory` | `<AgentFactory>` (lazy) | ✅ Phase 1 |
| `artifacts` · `guide` | `<Artifacts>` · `<Guide>` (lazy) | ✅ P3 |
| `ideation` · `notes` · `docs` · `promptlab` · `design` · `multi` · `superagent` | apps « bureau » (lazy) — ex-écrans pleins | ✅ P4 |
| `image-creator` | ComingSoon FLUX (placeholder) | Phase 2 |
| `music-creator` | ComingSoon AudioCraft (placeholder) | Phase 3 |

### Phase 2 — Image Creator (FLUX)
Requiert `REPLICATE_API_TOKEN` dans `server/.env`. Backend : `server/src/image-creator.ts` + routes. Frontend : `ui/src/components/ImageCreator.jsx`.

### Phase 3 — Music Creator (AudioCraft)
Même clé Replicate. Backend : `server/src/music-creator.ts`. Frontend : `ui/src/components/MusicCreator.jsx`.

### Audit de flux + P0 navigation (2026-06-21)
La finition du chat avait **cassé la création d'app** (Home 100% conversationnelle). Audit complet → voir **[[flux]]** (architecture cible 4 plans + contrat de cohérence). **P0 livré** : « Nouveau projet » dans App Builder (`NewProjectForm` → `openProject` → workspace+preview), écran fantôme `"chat"` supprimé, `slugify` factorisé (`ui/src/slugify.js`). **P1 livré** : outils projet → **rail contextuel VS Code** dans le workspace (`WorkspaceTools.jsx`, `PanelShell.jsx` partagé) ; Sidebar globale allégée (Analyse/Créer/Contenu/Système). **P2 livré** : écran **Réglages** unique (`Reglages.jsx`, master-detail) regroupant les 10 outils système/diagnostic ; Sidebar globale → une entrée « Réglages ». **P3 livré** : Sidebar = **dock épuré** (App Builder · Image · Music · Launcher · Réglages · Tutoriels · Thème) + **Launcher** (fenêtre grille de toutes les apps, `WindowManager.jsx`) ; Artefacts/Aide en fenêtres ; **3 boutons flottants workspace supprimés** (doublons du rail P1). **P4 livré** : les 7 dernières apps « bureau » (Ideation · Notes&RAG · Doc · Prompt Lab · Design Review · Multi-Projet · Super Agent) passent d'écrans pleins à **fenêtres** (`openAppWindow` + 7 cas `WindowManager`) → **toute app = une fenêtre**. **Refonte navigation P0→P4 COMPLÈTE** ; chantier suivant : l'**Auditeur de Flux #137**. Style cockpit passé en **palette iOS** (tokens `--color-sys-*`) + texte **P3 « dégradé linéaire minimaliste »**.

### Correctif UX création de projet (2026-06-27)
Le formulaire « Nouveau projet » de l'App Builder était une **description auto-envoyée comme prompt** → créer **lançait un build** par surprise (Raf « je me suis fait avoir »). Découplé : `NewProjectForm` est désormais un **champ NOM seul** + bouton **« Créer & ouvrir l'atelier »** → `onOpen(name, {})` **sans prompt** → atelier composer **VIDE**, où l'on choisit délibérément Construire / Discuter / Planifier. Le démarrage « depuis une idée » (`openProject({prompt})`) reste réservé à l'**Accueil** et à **Ideation**. Garde `ready` sur le nom tapé (le slug retombe sur « mon-projet » via le fallback `slugify`). NewProjectForm.test 5/5, suite UI 57/57, build vert. **Nommer ≠ construire** : créer un projet est un acte neutre, la construction est un choix explicite dans l'atelier.

### Sélecteur de projet dans le Workspace (2026-06-27)
Le nom du projet actif dans l'en-tête (`Header.jsx`) est désormais un **`ProjectSwitcher`** : menu déroulant avec **recherche collante** + **liste scrollable** de tous les projets → bascule en 1 clic via `openProject(name)` **sans repasser par l'accueil** (demande de Raf). Actif épinglé/coché, ouverture rafraîchit la liste (`refreshProjects`). C'est le pendant « navigation rapide » du dock/Launcher : on circule entre projets sans quitter l'atelier. ProjectSwitcher.test 7/7.

## Liens

- [[flux]] — l'architecture de navigation et son contrat de cohérence (audit + refonte en cours)
- [[kernel]] — les applications futures (Image Creator, Music Creator) s'intègreront au Bus comme agents spécialisés
- [[eleve-local]] — l'Agent Factory (Visage existant) s'ouvre dans une fenêtre bureau-os
- [[mangoqa]] — audit des phases 2 et 3 via les 3 visages ; futur **Auditeur de Flux #137** = sa nouvelle dimension
- [[boucle-curation]] — les artefacts générés par FLUX/AudioCraft pourraient alimenter le Blackboard

## Sources

- `statut.md` idée #136
- `historique.md` session 2026-06-20 Bureau OS
- `fondation.md` §III « Les agents spécialisés sont les applications »
