# Plan #193 — Section « Code » (débogage/construction frontière sur projets locaux externes)

## 1. Contexte & contraintes

### 1.1 Ce que Raf demande

Discussion du 2026-07-21 (session de priorisation multi-points) : Raf veut un MangoOS avec deux usages distincts.

- **Accueil/chat léger** : discuter, faire des recherches, chatter — comme n'importe quel harnais frontière (claude.ai) — avec un modèle RAPIDE, bon raisonnement, tool-calling simple, PAS besoin d'un modèle frontière.
- **Section Code séparée** : débogage de code, projets façon « AppBuilder », très poussé, agentique, avec des modèles FRONTIÈRE. Il veut pouvoir choisir des projets LOCAUX depuis cette section, **sans surcharger l'architecture actuelle basée sur `workspace/`** (fichiers spécifiques dédiés, pas mélangés).

### 1.2 Faits durs trouvés en exploration (pas des suppositions)

- **`runAgent`** (`server/src/agent/agent.ts`) prend un `projectDir` brut, sans lien structurel avec `WORKSPACE_DIR` — le SDK Claude Agent (`query({cwd: projectDir, ...})`) est déjà agnostique du workspace. Le couplage à `workspace/` était entièrement dans la couche ROUTE (`chat-route.ts` résout `dir` via `projectDir(projectName)`), pas dans le moteur agentique lui-même. `preview.ts::startPreview(projectDir)` est pareillement générique. C'est ce qui rend un chantier « Code sur dossier externe » faisable sans toucher `projects.ts`.
- **`ALLOWED_MODELS = ["sonnet","opus","haiku"]`** (`agent.ts`) est déjà le pool de modèles Claude frontière (abonnement Claude Code, SDK réel) — orthogonal au chemin `useEleve`/`codeur` (souverain local/cloud, GLM).
- **`Chat.jsx` n'est pas purement prop-driven** : il fait lui-même `fetch("/api/history/:name")`, `fetch("/api/upload/:name")`, `/api/design-coach/:name`, `/api/wireframe-fork/:name`. Ces routes résolvent via `projectDir(name)` (workspace). Pour un projet externe, sans branche dédiée, `/api/history/:name` répondrait `{messages:[]}` (fail-open, pas de crash) mais **sans persistance** — accroc réel, traité (§3, étape 4), pas ignoré.
- **`runAgent` appelle TOUJOURS `assembleSystemPrompt(...)`** en interne (aucun override natif) — ce prompt injecte des blocs de personnalité MangoOS (goût/axiomes/design-system/identité de marque) pensés pour construire DANS `workspace/`. Hors-sujet pour déboguer un dépôt externe quelconque. Fallait un point d'extension — n'existait pas avant ce chantier (§2, D2 précise le fix).
- **Numéro de plan** : `docs/plan-182-intention-dispatch.md` était le dernier `plan-N` roadmap ; `statut.md` référence jusqu'à `#192`. `#193` était libre.

### 1.3 Contrainte non négociable

Ne JAMAIS surcharger `workspace/`/`projects.ts` — un projet externe est un objet SÉPARÉ, listé/ouvert par son propre registre, jamais mélangé aux projets générés par MangoOS.

## 2. Décisions d'architecture

### D1 — Nouveau pane frontière-only, PAS une évolution de BuilderPane

**Décision.** `ui/src/v2/CodePane.jsx`, nouveau groupe de nav top-level `code` (au même rang que `creer`/`agents`/`savoir`/`design` — PAS niché sous Accueil, pour matérialiser la séparation d'usage voulue). Réutilise `Chat.jsx`/`Preview.jsx` tels quels (aucune duplication de moteur de chat), mais sans `WorkspaceTools` (versions git/dosage de style/Perfect Plan — sémantique « goût de build web » hors-sujet ici) ni `ProjectSwitcher` du Builder (workspace) — un nouveau composant dédié liste les projets EXTERNES.

**Alternative rejetée : étendre `BuilderPane.jsx` avec un mode « externe ».** `BuilderPane` est câblé projet-workspace de bout en bout (`ProjectSwitcher`, `useVersions`, `/api/perfect-plan/:name`, `/api/deploy/:name`, suppression de projet). Un `if (external)` dispersé sur ~15 endroits aurait été plus risqué et moins lisible qu'un pane dédié, et aurait violé l'exigence explicite de Raf.

### D2 — Routage frontière verrouillé côté serveur, nouveau rôle `codeur_frontiere`

**Décision.** Nouveau rôle brain-registry `codeur_frontiere` (`server/src/brain/brain-registry.ts`, défaut `{provider:"claude", model:"opus", timeoutMs:120_000}`). Une route dédiée `POST /api/code-chat` (`server/src/routes/code-route.ts`) résout le modèle CÔTÉ SERVEUR via `getBrain("codeur_frontiere").model`, validé contre `ALLOWED_MODELS` (repli `"opus"` si invalide) — **ignore tout modèle envoyé par le client**. Côté UI, `CodePane` ne monte pas `useChatActionModels` (jamais de menu modèle, jamais de repli « eleve »).

Complément trouvé en implémentant (pas prévu dans l'exploration initiale) : `runAgent` n'exposait AUCUN moyen d'injecter un prompt système custom — il appelle toujours `assembleSystemPrompt(...)`. Ajouté un paramètre optionnel `systemPromptOverride?: string` en fin de signature (`agent.ts`) : présent → tous les blocs de contexte « goût » (notes/constellations/template/procédures/perfect-plan/artefacts/composants/skills) sont SAUTÉS ENTIÈREMENT (pas juste ignorés — zéro I/O inutile), et `systemPrompt.append` devient ce texte au lieu du résultat d'`assembleSystemPrompt`. Additif, défaut `undefined` = comportement byte-identique pour tous les appelants existants (Builder, nocturne, etc.).

**Pourquoi PAS `resolveBinding`/`dispatch`.** Ces fonctions sont l'infrastructure du chemin Élève SOUVERAIN (`useEleve` dans `chat-route.ts`) — sémantiquement l'inverse de « frontière ». Elles ne sont même pas dans le chemin d'exécution de la section Code (qui appelle `runAgent` directement, jamais `runRelay`/`chatEleve`).

**Alternative rejetée : réutiliser le rôle `codeur` existant.** `codeur` EST par définition l'Élève souverain (commentaire `brain-registry.ts`, « les mains qui codent »), partagé avec l'Accueil-eleve-discuss. Le réaffecter romprait sa sémantique actuelle pour 2 autres call-sites.

### D3 — Registre `external-projects.json` séparé, `workspace/`/`projects.ts` intacts

**Décision.** Nouveau fichier `server/src/external-projects.ts` : registre `{id, label, path, mode, addedAt}[]` persisté dans `server/data/external-projects.json` (écriture atomique, patron `perimeter.ts`). `addExternalProject()` appelle `addGrantToFile(path, mode)` (`perimeter.ts`, inchangé) au même geste — un ajout de projet externe crée TOUJOURS son coffre, dans le MÊME registre que « Réglages → Coffres » (traçabilité unique). `projects.ts`/`WORKSPACE_DIR`/`listProjects()` ne sont touchés nulle part.

**Alternative rejetée : généraliser `projectDir()`/`listProjects()` à une racine variable.** Touche `versions.ts`, `preview.ts`, `deploy.ts` — exactement ce que Raf a demandé d'éviter.

### D4 — Limite assumée : pas de confinement `DESKTOP_PERIMETER` du SDK Claude en phase 1

**Décision.** L'exécution agentique (`runAgent`) pointe `projectDir` directement sur `externalProject.path` — SANS passer par `confinePath`/`DESKTOP_PERIMETER`. Ce gate protège aujourd'hui les outils MangoOS internes (`executor.ts`, `eleve-*-tools.ts`), pas les tools natifs du SDK Claude Agent (Read/Write/Edit/Bash, scopés uniquement par `cwd`+`permissionMode`). C'est le MÊME niveau de confiance que le Builder aujourd'hui sur un projet workspace — pas une régression, pas non plus une amélioration de sûreté. Confinement réel = Phase 2 (nécessiterait un point d'extension côté SDK Claude Agent, à investiguer).

## 3. Plan d'implémentation (livré 2026-07-21)

- [x] **Étape 1** — Gate `CODE_SECTION` (`flags.ts`, défaut off) + rôle `codeur_frontiere` (`brain-registry.ts`) + les 2 profils (`full-local.json`/`cloud-actuel.json`) mis à jour pour rester valides (16 rôles).
- [x] **Étape 2** — `external-projects.ts` (registre + pont coffre) + `external-projects-routes.ts` (`GET/POST/DELETE`) + `test-external-projects.ts` (21/21). Vérifié en réel : `POST /api/external-projects` crée l'entrée dans `external-projects.json` **ET** `desktop-grants.json` au même geste.
- [x] **Étape 3** — `code-route.ts` (`POST /api/code-chat`, SSE) + `systemPromptOverride` ajouté à `runAgent` (`agent.ts`). Vérifié en réel : 2 tours réels via `curl -N`, l'agent lit un fichier du dossier EXTERNE (pas workspace), modèle Claude réel utilisé (`contextWindow:1000000`, coût facturé), **continuité de session prouvée** (2e tour se souvient du 1er).
- [x] **Étape 4** — Branches additives `ext:` sur `GET /api/history/:name` (`project-io-routes.ts`) et `POST /api/upload/:name` (`preview-routes.ts`), redirigées vers `externalHistoryDir(id)` (jamais dans le dépôt de l'utilisateur). Bug réel trouvé en vérif live : `atomicWriteFileSync` ne crée pas le dossier parent — corrigé (`mkdirSync` avant le premier `appendHistory`).
- [x] **Étape 5** — `ExternalProjectPicker.jsx` (calqué sur `Coffres.jsx`), `CodePane.jsx`, `Chat.jsx` (+prop `apiPath`, défaut `/api/chat` = inchangé), `ShellV2.jsx` (nav + routage). `tsc --noEmit` propre, `npm run build` propre (2158 modules).
- [x] **Étape 6** — ce document.

## 4. Risques & limites honnêtes

- Le SDK Claude Agent sur dossier externe n'est **pas** confiné par `DESKTOP_PERIMETER` (D4) — même niveau de confiance que le Builder sur workspace aujourd'hui.
- Pas de garde budget-$/MangoQA sur ce nouveau chemin (`emitPhaseComplete` non appelé) — Phase 2.
- Attachments (upload) redirigés vers `external-history/<id>/.assets/` fonctionnent au niveau route, mais `design-coach`/`wireframe-fork` (autres routes appelées par `Chat.jsx`) ne sont PAS branchés pour `ext:` — non testé, probablement un no-op silencieux plutôt qu'un crash (à vérifier si l'usage réel les sollicite).
- Une seule racine par tour (pas de multi-projet simultané) — `agent-lock.ts` est PARTAGÉ avec le Builder : un tour Code et un tour Builder ne peuvent jamais tourner en même temps (comportement voulu, pas une limitation oubliée).
- Vérification UI : `tsc`/`vite build` propres et le module se sert sans erreur en dev, mais **aucun clic réel dans un navigateur n'a été fait** (session terminal, pas de GUI) — la confirmation visuelle (rendu correct, navigation fluide) reste à faire par Raf.
- Gate `CODE_SECTION` laissé tel qu'il était avant ce chantier (OFF) après vérification — Raf doit l'activer explicitement (`server/.env`) pour utiliser la section.

## 5. Phase 2 — explicitement HORS de ce lot

- Preview live pour un projet externe de type web (`preview.ts::startPreview` déjà générique — brancher un bouton avec confirmation explicite avant tout `npm install` sur un dossier externe).
- Confinement réel du SDK Claude Agent sur le périmètre externe (`DESKTOP_PERIMETER` + un mécanisme de garde par outil, à investiguer côté API `@anthropic-ai/claude-agent-sdk`).
- Sélecteur de modèle frontière dans l'UI Code (opus/sonnet) — pour l'instant verrouillé côté serveur uniquement.
- Rattachement MangoQA/budget-$ au tour Code.
- Picker de dossier natif (dépend de la coque Tauri de `docs/plan-180-interface-autonome.md`) — MVP = coller un chemin, comme `Coffres.jsx` le fait déjà en fallback navigateur.
- `design-coach`/`wireframe-fork` opérationnels pour un projet externe.
- Historique de conversation Code visible dans l'écran « Conversation » partagé de l'Accueil (aujourd'hui scope Accueil uniquement).
