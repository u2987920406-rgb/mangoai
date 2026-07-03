# Audit complet MangoOS — préparation de la refonte 2.0

**Date** : 2026-07-02 · **Demandeur** : Raf · **Méthode** : 3 audits parallèles (backend/noyau agentique · UI/UX · docs/limites/vision) sur l'état du repo au commit `e57386c` (branche `forge-auto-evolution`).

**Décisions de cadrage (Raf)** :
- Livrable = audit **+ feuille de route 2.0 priorisée** ; orientation = **refactor progressif** (le produit reste utilisable pendant la refonte).
- **Re-cadrage produit (2026-07-02)** : la 2.0 est une **refonte globale** — rationalisation du catalogue (supprimer apps inutiles et doublons), **refonte visuelle très pro** façon desktops ChatGPT/Gemini/Cursor, « juste ce qu'il faut » de paramètres, sections nettes, fluidité au poil.
- **Paradigme UI 2.0** : **hybride sidebar fixe + panneau principal** ; les fenêtres flottantes survivent uniquement pour les outils secondaires (aperçu, artefacts, aide) — le WindowManager est conservé mais rétrogradé.
- **Invariants moteur re-confirmés** : MangoOS tourne **seul via GLM 5.2** (Ollama Cloud), Claude ≈ 5 % en supervision/escalade seulement ; **MangoQA collabore en fantôme** (jamais bloquant). La refonte UI ne touche pas au moteur ; elle doit au contraire rendre la souveraineté **visible et mesurable** (taux d'escalade + coût GLM tracé, L7).

---

## 1. Synthèse exécutive

**Le moteur est mature ; l'interface est le vrai chantier de la 2.0.**

- Le **backend agentique** (407 fichiers .ts) a une colonne vertébrale remarquable — kernel modulaire, injection de dépendances partout, fail-open, zéro cycle d'imports, cœur très testé — mais souffre d'une dette d'**organisation** : un module-dieu (`index.ts`, 98 imports), ~140 variables d'env sans config centrale, ~170 fichiers test/run mélangés au noyau, des singletons mono-instance. **Verdict : consolider, pas réécrire.**
- L'**UI** (83 fichiers, ~18 600 lignes JSX) a d'excellents acquis UX (bureau-OS à fenêtres, dock hover-reveal, thème, toasts) mais **aucune fondation d'ingénierie** : pas de design system (50+ variantes de boutons inline), pas d'état global (427 `useState`, 0 Context), 176 `fetch()` directs, accessibilité quasi nulle, desktop-only, zéro TypeScript. **Verdict : refonte progressive sérieuse — c'est ici que « très très qualitatif et ergonomique » se joue.**
- Le projet a une **conscience de soi exceptionnelle** : 72 limites tracées dans `limites.md` (~20 ouvertes), un wiki d'architecture, 7 chantiers majeurs déjà livrés et testés mais **gatés OFF** en attente de l'OBS (#164 Stratège, #168 auto-évolution, #172-175, #165). La 2.0 côté moteur = **libération orchestrée de ces chantiers** + rangement des fondations.

---

## 2. Qualités à préserver (les invariants de la 2.0)

Ces éléments sont la valeur du système. Toute décision 2.0 doit les laisser intacts ou les renforcer.

### 2.1 Backend / noyau

| Invariant | Preuve |
|---|---|
| **Injection de dépendances** — 50+ interfaces `*Deps`, modules purs testables sans réseau | `eleve-runtime.ts` (transport injecté), `test-relay.ts` teste la boucle Maître/Élève entière hors ligne |
| **Kernel 5 piliers** — Brain adapter, bus d'événements, Blackboard persistant, MCP registry, traces | `kernel.ts` (157 l., 2 imports), `kernel-blackboard-sqlite.ts` (SQLite natif `node:sqlite`, zéro dépendance native, verrous FIFO, WAL) |
| **Fail-open systématique** — un instrument qui plante n'est jamais bloquant | hooks (timeout dur + fail-open absolu), MangoQA optionnel, `loadHooks` ne lève jamais |
| **Gates env** — chaque capacité risquée naît OFF, s'allume une par une avec preuve | `ELEVE_HOOKS`, `CRON_AGENTIC`, `ELEVE_DELEGATE_AGENTIC`, `SELF_EVOLVE`… |
| **Zéro cycle d'imports** — deps injectées plutôt que couplage (ex. `specialist-agentic.ts`) | audit backend : aucun cycle détecté sur les modules cœur |
| **Orchestration Maître/Élève** — escalade bornée + distillation d'axiomes (clapet anti-retour) | `eleve.ts` + `stratege-learn.ts` + `axioms.ts` |
| **Politiques scellées à la forge** — un agent forgé ne négocie jamais ses outils à l'exécution | `applyToolPolicy` / `assignBrain` / `assignMode` (#175) |
| **Disjoncteurs déterministes, zéro LLM** | `cron-breaker.ts` (fenêtre glissante), disjoncteur MangoQA (5 réflexes bornés) |

### 2.2 UI

| Invariant | Preuve |
|---|---|
| **Surfaces homogènes** (règle du contrat de flux) — re-cadrage : le fenêtré n'est plus l'unique paradigme (cf. §4.1), mais le `WindowManager` reste un actif pour les outils secondaires | `WindowManager.jsx` (12 fenêtres lazy), refonte nav P0→P4 complète |
| **Composants bien factorisés** | `PanelShell` (~10 réutilisations), `Toast` (170 usages), `ConfirmDelete` (popover + Échap), `Window` (drag+resize), `Dropdown` |
| **Thème clair/sombre** — tokens CSS variables, anti-flash, localStorage | `theme.js` + `index.css` (palette sémantique ok/warn/err) |
| **Dock hover-reveal** — discret, non intrusif | `Sidebar.jsx:79-176` |
| **Code-splitting des fenêtres** — 32 `lazy()` / 31 `Suspense` | `WindowManager.jsx`, `App.jsx` |
| **Autocomplétion `/skills` au composer** | `Chat.jsx` (#174) |

### 2.3 Méthode de travail (le méta-actif)

- **`limites.md`** : registre des limites honnêtes avec faisabilité (🟢/🟡/🔴) — aucune limite ne se perd.
- **Wiki Obsidian** (`wiki/`) : couche de synthèse interconnectée au-dessus des sources immuables.
- **Preuves live** exigées avant de déclarer un chantier fini (pas seulement des tests verts).
- **MangoQA fantôme** : auditeur externe indépendant, jamais bloquant, jamais modificateur.
- **Principes de `fondation.md`** : local-first · LLM-agnostique · auto-apprenant · extensible par agents · souverain ; le noyau (contrat `<mangoos>`, assemblage du prompt, escalade, validation, orchestration) n'est **jamais délégué** au modèle.

---

## 3. Dette & lacunes

Format : **constat chiffré → impact → remède**.

### 3.1 Backend

**B1 — `index.ts` module-dieu.** 1292 lignes, **98 imports**, ~28 routes Express définies inline, aucune couche routes/services.
→ Impact : tout changement passe par le même fichier, testabilité HTTP nulle, conflits permanents.
→ Remède : extraire en modules `src/http/<domaine>-routes.ts` (`registerChatRoutes(app, deps)`…), `index.ts` ne fait plus que composer. Pattern déjà présent dans le repo (54 fichiers `*-routes.ts` existent — généraliser).

**B2 — Configuration éparpillée.** ~**140 variables d'env** lues au fil de l'eau (`process.env.X ?? défaut` dans chaque module) ; `DATA_DIR`/`WORKSPACE_DIR` redéfinis différemment dans au moins 5 fichiers (`kernel-curation-effect.ts`, `design-review.ts`, `multi-project.ts`, `nocturnal.ts`, `auto-ablation.ts`).
→ Impact : impossible de savoir ce qui est configurable ; la reprise cross-machine du 2026-07-02 a montré que l'état des gates est invisible ; chemins fragiles.
→ Remède : `config.ts` central (env → objet typé, défauts documentés, dump `GET /api/config` pour l'onglet Réglages) + module unique `paths.ts` pour DATA_DIR/WORKSPACE_DIR.

**B3 — Noyau et jetable mélangés.** ~**170 fichiers `test-*.ts` / `run-*.ts` à la racine de `src/`** (sur 407) — tests légitimes, runners de contenu (`run-toeic-*.ts`), scripts one-shot.
→ Impact : le noyau paraît 2× plus gros qu'il n'est ; on ne sait pas ce qui est vivant.
→ Remède : déplacer vers `server/tests/` et `server/scripts/` ; `src/` = noyau seulement.

**B4 — Singletons mono-instance.** `getBlackboard()`, bus, tracer, MCP registry = état module-global.
→ Impact : pas de multi-instance, deux builds simultanés du même projet impossibles, une partie de l'état meurt au redémarrage (jobs nocturnes non persistés).
→ Remède 2.0 (pragmatique, pas Redis d'emblée) : garder les singletons mais **derrière l'interface Store déjà prévue** (SqliteStore existe) ; persister la file nocturne ; documenter la contrainte mono-instance comme choix assumé local-first.

**B5 — Persistance hétérogène.** JSON files (gaps, procédures, notes) + SQLite (blackboard, pdf-store) + fichiers projet ; 263 `JSON.stringify`/133 `JSON.parse` ; pas de versionnement de schéma.
→ Impact : migrations manuelles, corruption partielle possible, relectures complètes.
→ Remède : converger progressivement les stores machine vers SQLite (le Blackboard montre la voie) ; à minima un en-tête `version:` dans chaque JSON.

**B6 — Robustesse d'exécution.** I/O synchrone omniprésent (201 `readFileSync`/214 `writeFileSync`) ; ~10 `.catch(() => {})` qui avalent les diagnostics ; timeouts non universels sur les `spawn`.
→ Impact : blocages du thread sous charge, erreurs invisibles, process enfants zombies potentiels.
→ Remède : logger central minimal (même `console.warn` étiqueté) à la place des catch vides ; timeout par défaut dans un wrapper `spawnSafe` unique ; l'async des I/O peut attendre (mono-utilisateur).

**B7 — Sécurité à auditer.** 751 `path.join/resolve` sans validation systématique du confinement `workspace/` côté routes (`req.body.project` → `projectDir()`) ; 39 accès dynamiques `process.env[x]`.
→ Impact : path traversal potentiel depuis l'API locale (surface réduite — serveur local — mais le LAN est exposé : `192.168.1.117:3000`).
→ Remède : audit dédié des ~28 routes ; générAliser le pattern anti-traversal déjà présent dans `skills.ts` (`isValidSlug`) ; `path.resolve(...).startsWith(WORKSPACE_DIR)` en garde unique réutilisée.

**B8 — Tests : très bon cœur, périphérie nue.** Cœur agentique excellent (eleve-runtime 100+, relay complet hors-ligne, kernel-*, axioms) ; **non testés** : routes HTTP, vision, nocturnal, bridge MangoQA. Pas de CI, pas de mesure de couverture. Framework maison (assert/passed/failed via tsx) — léger et suffisant.
→ Remède : garder le framework maison ; ajouter un `npm run test:all` + un smoke test HTTP (backend éphémère port 3999, pattern déjà utilisé pour la preuve #174) ; CI GitHub Actions simple (tsc + tests) — le repo est déjà sur GitHub.

### 3.2 UI

**U1 — Monolithes.** `Knowledge.jsx` 1676 l. (~80 useState, 5 modales inline), `Chat.jsx` 1500 l. (100+ états), `Home.jsx` 978 l. = **22 % du code UI en 3 fichiers**.
→ Impact : re-renders massifs, régressions faciles, personne ne peut raisonner dessus.
→ Remède : découpage en sous-composants ≤ ~200 l. (ChatMessages/ChatInput/SkillAutocomplete ; KnowledgeEditor/LensPanel/ComponentLibrary ; HomeChat/ProjectGenerator).

**U2 — Pas de design system.** Tokens **couleur** propres, mais : pas de composant `Button` (~50 variantes inline), ni `Input` (10+), ni `Badge`/`Chip` (15-20+ variantes) ; tailles de texte en dur (`text-[11..13px]`, 180+ occurrences) ; 347 occurrences `rounded+border` ; `Home.jsx` réinvente Dropdown (ModeDropdown/TemplateDropdown) alors que `Dropdown.jsx` existe.
→ Impact : incohérences visuelles inévitables, chaque écran « refait son style », coût de toute évolution graphique.
→ Remède : `ui/src/design/` — Button (variantes primary/secondary/ghost/danger × tailles), Input/Textarea, Badge, Chip, Modal (avec focus trap) + tokens typo/espacement. C'est **le** levier n°1 du « très qualitatif » : chaque écran migré devient automatiquement cohérent.

**U3 — Pas d'état global ni de client API.** 427 `useState`, 0 Context/Zustand, App.jsx passe ~25 props ; **176 `fetch()` directs**, zéro client centralisé (erreurs/loading/retry dupliqués partout, pas de cache).
→ Impact : prop drilling, gestion d'erreur incohérente (parfois toast, parfois rien), impossible d'introduire un cache ou un état partagé propre.
→ Remède : `api.js` (wrapper fetch : base URL, erreurs → toast, retry léger, JSON typé) — gain immédiat sur 176 sites ; état global **léger** (2-3 Context ciblés : projet courant, toasts, réglages — ou Zustand si ça grossit).

**U4 — Accessibilité : niveau WCAG F.** ~18 attributs `aria-*` sur 18 600 lignes ; pas de focus trap dans les modales ; dropdowns sans clavier ; pas de rôles.
→ Impact : inutilisable au clavier ; en contradiction avec le Gardien qui juge la **sortie** des apps générées sur WCAG — l'outil ne s'applique pas à lui-même son propre standard.
→ Remède : bâtir l'a11y **dans** les composants du design system (un seul Modal accessible = toutes les modales accessibles) ; Radix UI possible mais du maison suffit pour dropdown/modal/tooltip.

**U5 — Desktop-only.** Quasi aucun breakpoint `sm:/md:/lg:` ; dock 64 px et fenêtres flottantes non pensés mobile ; textes 11 px.
→ Impact : inutilisable sur téléphone/tablette (le LAN mobile est pourtant déjà exposé pour `/taste/review`).
→ Remède 2.0 : responsive **de base** (breakpoints sur Home/Chat/Réglages, fenêtres → plein écran sous `md:`) ; un vrai mode mobile est un chantier ultérieur.

**U6 — Zéro TypeScript côté UI.** 100 % JSX, pas de PropTypes, réponses API non validées.
→ Impact : les erreurs `data.x.y undefined` n'apparaissent qu'à l'exécution.
→ Remède (aligné « refactor progressif ») : TS **par îlots** — `design/` et `api.js` naissent en `.tsx/.ts`, les écrans migrent quand on les découpe (U1). Pas de big-bang.

**U7 — Divers UX.** États vides quasi absents ; pas d'error boundary global ; i18n inexistante (français en dur ; fonction `t(fr,en)` sous-utilisée — 5 usages).
→ Remède : composant `EmptyState` dans le design system ; un `ErrorBoundary` racine + par fenêtre ; i18n = **non-objectif 2.0** (produit personnel francophone) sauf décision contraire.

### 3.3 Lacunes fonctionnelles (limites ouvertes de `limites.md`)

72 limites tracées, ~20 ouvertes 🟡, 2 bloquées externes 🔴. Les plus structurantes pour la 2.0, par thème :

| Thème | Limites | Substance |
|---|---|---|
| **Jugement/goût** | L19, L69, L1, L34 | Juge d'intention faillible (et aveugle après escalade Maître — résumé placeholder) ; juge design VL bruité (78→68 sur le même écran). Remède : moyenner N passes + prioriser les checks déterministes (WCAG) ; câbler le vrai résumé post-Maître (L69, 🟢). |
| **Boucle agentique** | L35, L38, L56, L73 | Sur-exploration malgré plan-ancre ; cold-load Stratège ~45 s (prewarm à faire comme L22) ; preuves live de la reprise auto et des subagents en attente d'un blocage naturel (post-OBS). |
| **Documents** | L4, L5, L6 | PDF scannés sans couche texte (piste : renderPdfPage→VL, 🟢) ; Office hérité .doc/.xls/.ppt (🟢 lib curée) ; .xlsx fin (fusions/formules). |
| **Web** | L2, L43, L11, L14 | Recherche sans clé captcha-bloquée (Tavily = contournement) ; pas de téléchargement binaire (piste : `telecharger_fichier` scellé, 🟢) ; crawler naïf sur les liens ; vision limitée à la page d'accueil. |
| **Économie** | L7 | Coût GLM cloud non tracé (compté $0) — fausse la métrique de souveraineté. 🟢 : lire les tokens des réponses OpenAI-compat et tarifer. |
| **UI** | L64, L72 | Code-split TOEIC Quest ; preuve navigateur du composer `/slug`. |
| **Bloquées externes** 🔴 | L23, L60 | GLM-vision indisponible sur Ollama ; GPU 24 Go pour la vidéo. À ne PAS planifier — surveiller. |

### 3.4 Tensions vision ↔ réalité (à trancher en 2.0)

1. **Souveraineté locale vs capacité réelle** : la vision (`fondation.md`) vise un exécutant local ; mesuré : un 12B local ne tient pas une boucle de codage (écrit 1-2 outils puis abandonne). La 2.0 doit assumer explicitement : **vision/embeddings locaux ✅, génération = cloud** en transition, et l'OBS mesure le taux d'escalade réel. L7 (coût GLM tracé) devient indispensable pour que la métrique de souveraineté soit honnête.
2. **Disjoncteur « zéro LLM » vs goût subjectif** : séparation actée (dur déterministe = bloquant ; goût LLM = non-bloquant, observe-only). À graver comme principe 2.0.
3. **Hooks génériques vs gardes riches** : le contrat allow/deny/ask ne capture pas le verdict riche du Gardien — compromis V1 assumé (gardes natives + points d'ancrage extensibles). Ne pas re-tenter la migration littérale (L71).
4. **Auto-évolution** : la forge crée de la **connaissance** (agents conçus), l'**exécution** reste dépendante du cloud. Gain partiel, à mesurer en OBS avant d'élargir.

---

## 4. Refonte produit (re-cadrage Raf, 2026-07-02)

### 4.1 Paradigme cible : hybride sidebar + panneau principal

```
┌──────────┬────────────────────────────┐
│ 🥭 Mango │  Panneau principal         │
│          │                            │
│ ▸ Créer  │   Chat / App Builder /     │
│ ▸ Agents │   app active — plein       │
│ ▸ Savoir │   cadre, fluide            │
│ ▸ Design │                            │
│          │      ┌──────────┐          │
│ ⚙ Régl.  │      │ fenêtre  │          │
│          │      │ outil 2nd│          │
└──────────┴──────┴──────────┴──────────┘
```

- **Sidebar fixe** de sections (remplace le trio dock hover + Launcher + écrans) — façon Cursor/ChatGPT.
- **Panneau principal** : une seule surface de contenu, plein cadre.
- **Fenêtres flottantes** conservées pour les outils secondaires seulement : aperçu, artefacts, aide, éditeur visuel. Le `WindowManager` (qui marche bien) n'est pas jeté, il est rétrogradé.
- **Ce qui disparaît** : le Launcher-grille comme navigation primaire, la dispersion écrans-pleins/fenêtres.

### 4.2 Inventaire mesuré du catalogue actuel

- **Launcher** : 13 apps (App Builder, OS d'apps, Image Creator, Music Creator, Agent Factory, Super Agent, Ideation, Multi-Projet, Notes & RAG, Doc, Prompt Lab, Design Review, Variantes de goût) + 3 outils (Artefacts, Aide, Éditeur visuel).
- **Réglages** : 15 panneaux en 5 sections (Intelligence ×4, Compte ×1, Automatisation ×3, Diagnostics Kernel ×4, Veille & outils ×3).
- **Rail workspace** : ~11 outils projet (Mémoire, Revue, Versions, Backend, GitHub, Perfect Plan, Export, Mode Client, Réflexion, MangoQA, Miroir).

Soit **~42 surfaces** pour un produit mono-utilisateur — c'est la source du sentiment de fouillis.

### 4.3 Phase B0 — Rationalisation : table garder / fusionner / supprimer

**Règle** : chaque ligne est une PROPOSITION — validation de Raf ligne par ligne avant toute suppression effective. Rien n'est effacé sans accord ; le code d'une app supprimée part dans un commit dédié (réversible).

| Surface actuelle | Proposition | Devient |
|---|---|---|
| App Builder | ✅ Garder | Cœur — section **Créer** |
| Multi-Projet + OS d'apps (suite) | 🔀 Fusionner | **« Projets »** (onglets : gros projet Kanban / suite d'apps) — section Créer |
| Image Creator · Music Creator | ✅ Garder | Section **Créer** |
| Agent Factory + Super Agent | 🔀 Fusionner | **« Agents »** (une seule forge, deux modes) — section **Agents** |
| Atelier de Mango + Lacunes à combler | 🔀 Fusionner | **« Auto-évolution »** — section Agents |
| Atelier des cerveaux + Cerveaux | 🔀 Fusionner | **« Cerveaux »** (un seul écran, mode avancé repliable) — section Agents |
| Notes & RAG | ✅ Garder | Section **Savoir** |
| Doc | ❓ Évaluer | Fusion possible dans Notes & RAG (générateur = un bouton) — section Savoir |
| Ideation + Prompt Lab | 🔀 Fusionner | **« Studio d'idées »** — section Savoir |
| Design Review + Variantes de goût + Éditeur visuel | 🔀 Fusionner | **« Design Studio »** (revue · goût · édition) — section **Design** |
| Radar IA + Veille IA | 🔀 Fusionner | **« Veille »** — Réglages |
| Métriques + Traces + Dashboard d'évolution | 🔀 Fusionner | **« Observatoire »** (onglets) — Réglages, avec le **compteur de souveraineté GLM/Claude en tête** |
| Auto-Ablation · Tokeniseur | ❓ Évaluer | Candidats à la rétrogradation (sous-onglet Observatoire / suppression si inutilisés) |
| Facturation · Cron · Hooks · Review nocturne | ✅ Garder | Réglages (Compte / Automatisation) |
| Artefacts · Aide · Éditeur visuel | ✅ Garder | Fenêtres flottantes secondaires |
| Rail workspace (11 outils) | 🧹 Trier | Regrouper : Mémoire/Revue/Versions (Projet) · Backend/GitHub/Export (Livraison) · le reste en menu « ⋯ » |

Résultat cible : **~42 surfaces → ~20**, rangées en **4 sections + Réglages** : **Créer** (App Builder · Projets · Image · Music) · **Agents** (Agents · Auto-évolution · Cerveaux) · **Savoir** (Notes & RAG · Studio d'idées · Doc?) · **Design** (Design Studio) · **⚙ Réglages** compactés (Compte · Automatisation · Observatoire · Veille).

## 5. Feuille de route 2.0 priorisée

Refactor progressif : le produit reste vivant à chaque phase ; chaque phase a une preuve de sortie. Les phases A et B sont indépendantes (parallélisables). Efforts en jours-sessions (ordre de grandeur).

### Phase A — Fondations backend (≈ 4-6 j) — peut démarrer pendant l'OBS (rangement sans changement de comportement)
1. `config.ts` central (env → objet typé + défauts documentés) + `paths.ts` unique (DATA_DIR/WORKSPACE_DIR). *Preuve : `GET /api/config` liste tout ; grep `process.env` ≈ 0 hors config.ts.*
2. Extraction des routes d'`index.ts` en modules `http/` ; `index.ts` < 200 lignes de composition. *Preuve : tsc vert + smoke test HTTP.*
3. Rangement `server/tests/` + `server/scripts/` (mise à jour des chemins npm). *Preuve : `npm run test:all` vert.*
4. Audit sécurité des routes : garde anti-traversal unique + validation des entrées. *Preuve : test dédié path-traversal rouge→vert.*

### Phase B0 — Rationalisation du catalogue (≈ 2-3 j + arbitrages Raf)
1. Valider la table §4.3 ligne par ligne avec Raf (garder / fusionner / supprimer).
2. Exécuter les fusions simples d'abord (Radar+Veille, Atelier des cerveaux+Cerveaux) — chaque fusion = un commit réversible, vérif Sharingan.
3. Marquer les « ❓ Évaluer » d'un compteur d'usage léger pour trancher sur données.
*Preuve : Launcher/Réglages passent de ~42 à ~20 surfaces sans perte de capacité.*

### Phase B1 — Direction artistique + maquette du shell (≈ 3-4 j)
1. Benchmark visuel ChatGPT/Gemini/Cursor (densité, typo, espacement, hiérarchie, transitions).
2. Maquette du shell 2.0 (sidebar sections + panneau principal) directement en React sur les tokens existants ; itération au **Sharingan** (capture → lecture → correction) jusqu'au « très pro ».
3. Décider la DA : typo, échelle d'espacement, rayons, élévation, animations (durées/courbes standardisées).
*Preuve : shell navigable en parallèle de l'UI actuelle (route `/v2` ou gate), validé visuellement par Raf.*

### Phase B2 — Design system au service de la DA (≈ 3-4 j)
1. `ui/src/design/` en TypeScript : Button, Input/Textarea, Badge, Chip, Modal (focus trap + aria), EmptyState, tokens typo/espacement — stylés selon la DA de B1.
2. `api.ts` client central (erreurs → toast, retry léger). *Preuve : 0 nouveau `fetch()` direct ; 20-30 sites migrés en pilote.*
3. État global léger : Context projet-courant + réglages (ou Zustand). *Preuve : App.jsx passe < 10 props.*
4. Vitrine des composants (page « Design ») pour vérifier la cohérence d'un coup d'œil.

### Phase C — Shell 2.0 + migration écran par écran (≈ 7-9 j)
1. Brancher le shell B1 : sidebar 4 sections + Réglages ; le Launcher-grille et le dock hover deviennent secondaires puis disparaissent.
2. Migrer chaque app rationalisée (B0) dans le panneau principal, en la découpant au passage : `Chat.jsx` → ChatMessages / ChatInput / SkillAutocomplete / ModelSelector ; `Knowledge.jsx` → KnowledgeEditor / LensPanel / ComponentLibrary ; `Home.jsx` → HomeChat / ProjectGenerator (Dropdown réinventés supprimés).
3. Migration mécanique des écrans restants vers Button/Input/Badge (~50 variantes → 1 composant).
*Preuve : build vert + vérif Sharingan écran migré vs maquette + aucune régression de flux (contrat de flux #1-4) ; l'ancienne UI reste accessible jusqu'à parité.*

### Phase D — Fluidité & qualité d'usage (≈ 4-6 j)
1. Fluidité : transitions standardisées (sidebar, panneau, fenêtres), raccourcis clavier globaux (palette de commandes ⌘K — le pattern Cursor), focus visibles.
2. A11y transversale : navigation clavier des dropdowns/sections, rôles, aria. *Preuve : parcours 100 % clavier Home→projet→build ; axe-core sans erreur critique.*
3. ErrorBoundary racine + par panneau ; états vides sur les listes principales.
4. Responsive de base (sidebar repliable, panneau fluide < `md:`). *Preuve : Sharingan en 390×844.*
5. Corrections fonctionnelles 🟢 courtes : L69 (résumé post-Maître réel), **L7 (coût GLM tracé — rend la souveraineté mesurable, affiché dans l'Observatoire)**, L38 (prewarm Stratège), L64 (code-split TOEIC).

### Phase E — Libération des chantiers gatés (rythmée par l'OBS, ≈ continu)
1. L'OBS en cours tranche les priorités (classes de blocage, taux d'escalade, stabilité RAM watcher).
2. Allumage un par un avec preuve live : Gate 2 `CRON_AGENTIC` → Gate 3 `ELEVE_DELEGATE_AGENTIC` → `SELF_EVOLVE_AUTO` (sous disjoncteur) ; preuves L56/L71/L72/L73 au passage.
3. #164 Stratège P1-P2 (cœur diagnostic+apprentissage) puis #165 (souveraineté MangoQA).
4. Documents/web 🟢 (L4, L5, L43) en incréments indépendants, chacun = un outil scellé + tests.

**Total indicatif hors Phase E : ~23-32 jours-sessions.** Ordre recommandé : **B0 (arbitrages) et A en parallèle** — la rationalisation ne demande pas les fondations ; puis **B1 → B2** (la DA commande le design system, pas l'inverse) ; **C** écran par écran (Chat d'abord — le plus utilisé) ; **D** en continu dès que le shell existe.

---

## 6. Risques & garde-fous

| Risque | Garde-fou |
|---|---|
| **Refonte qui casse le vivant** (l'OBS tourne, les sessions auto committent) | Phases A/B = rangement à comportement constant, vérifié par les tests existants ; jamais de refonte ET d'allumage de gate dans la même session ; zéro git sans permission (règle absolue existante) |
| **Compounding des gates** (#164+#168+#172-175 interagissent) | Un gate par session, preuve live avant le suivant (discipline déjà en place) |
| **Big-bang TypeScript** | TS par îlots seulement (design/, api.ts, nouveaux sous-composants) — jamais de conversion de masse |
| **Design system qui dérive** (nouveau composant ≠ styles existants) | Construire depuis les tokens `index.css` EXISTANTS ; vérif Sharingan systématique écran migré vs écran d'origine |
| **Capacité des modèles locaux surestimée** (horizon souveraineté) | L7 (coût tracé) + métrique d'escalade OBS = décision sur données, pas sur la vision |
| **Perte des acquis pendant le découpage des monolithes** | Un monolithe à la fois, parcours utilisateur re-testé (Sharingan + parcours clavier), jamais deux écrans en parallèle |
| **Sur-scope** (i18n, mobile complet, Redis multi-instance) | Déclarés **non-objectifs 2.0** dans cet audit ; à re-décider explicitement si besoin |

---

## 7. Ce que la 2.0 ne touche PAS

- Le noyau `eleve.ts`/`eleve-runtime.ts`/kernel (testé, pur, injectable) — on le range (A3), on ne le réécrit pas. **La souveraineté GLM (~95 %) / Claude (~5 % escalade) et MangoQA fantôme sont des invariants absolus** — la refonte les rend visibles (Observatoire), jamais négociables.
- Les composants UX réussis (WindowManager — rétrogradé aux outils secondaires mais conservé —, thème, toasts, PanelShell).
- La méthode : limites.md, wiki, preuves live, gates progressifs, MangoQA fantôme.
- Les principes de `fondation.md` — ils sont le cahier des charges permanent de toute refonte.

---

*Sources : exploration backend (407 fichiers server/src), exploration UI (83 fichiers ui/src), synthèse documentaire (limites.md L1-L73, fondation.md, wiki/, statut.md). Chiffres mesurés sur le working tree du 2026-07-02, commit `e57386c`.*
