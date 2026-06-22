---
type: entite
tags: [architecture, eleve, ollama, apprentissage, boucle]
statut: actif
sources: [memory, statut, historique]
maj: 2026-06-22
---

# Élève & boucle d'apprentissage

> Le 4ᵉ cerveau de MangoOS : le modèle qui traite la routine, avec **escalade vers Claude** sur échec objectif. Livré au **Jalon D** (2026-06-13). Rend MangoOS model-agnostic. **Élève actif depuis 2026-06-22 : GLM-5.2 via Ollama Cloud** (gros modèle hébergé, clé API) ; l'Élève **local** Gemma 4 12B ($0, Ollama) reste le **repli commenté** dans `.env`.

## Rôle

Faire tourner les tours de génération à $0 quand c'est possible, Claude restant l'escalade + le **scribe d'axiomes**. L'Élève répond dans le contrat `<mangoos>` (voir [[coque-rigide]]), MangoOS exécute et juge objectivement (`vite build`), escalade après N échecs.

## Détails clés

- **Modèle actif** : `glm-5.2:cloud` via **Ollama Cloud** (provider `openai`, endpoint OpenAI-compat `https://ollama.com/v1`, clé API Bearer) depuis 2026-06-22. **Repli local** : `gemma4:12b` via Ollama (`http://localhost:11434`, `ollama serve`, 1er appel ~60 s) — décommenter `ELEVE_MODEL=gemma4:12b` + retirer les 3 lignes provider dans `.env`. Qwen entièrement retiré le 2026-06-17.
- **Profils par famille** (`models/`) : `resolveProfile(model)` route sur la partition du modèle (system prompt + axiomes + caps + routage d'escalade). `gemma.ts` = WRITE-ONLY (petit modèle qui rate le find/replace) ; **`glm.ts` (2026-06-22)** = WRITE **+ EDIT** + caps généreuses `{axiomCap:10, fileBudget:24000, fileMax:6000, maxAttempts:3}`, axiomes `.axioms.md`/`.axioms.glm.md` ; `uxui.ts`/`layout.ts` = spécialistes #145 ; `generic.ts` = repli non-régression. Un modèle non reconnu → GENERIC.
- **Boucle de relais** (`eleve.ts` → `runRelay`) : prompt d'entrée STRICT obligatoire (sinon l'Élève dérape), `executeContract` applique, `inspectProject` juge sur **signaux objectifs** (`build-failed`/`timeout`/`no-deps`…), escalade Claude qui corrige + écrit un axiome. Cerveaux `askEleve`/`escalate` **injectables** (`defaultRelayDeps`) → testable sans réseau.
- **Branchement chat** : 4ᵉ cerveau `model === "eleve"` (sélecteur UI) → `/api/chat` route vers `runRelay` (sinon `runAgent`/Claude inchangé). Métriques `resolvedBy`/`attempts`/`projectType`.
- **L'Élève sait aussi DISCUTER & PLANIFIER (2026-06-22)** : `runRelay` est un moteur de **build** → pour que « rester sur l'Élève » vaille aux 3 actions de la chatbox (Construire/Planifier/Discuter), une branche `if (model==="eleve" && mode==="discuss")` court-circuite le build et appelle **`chatEleve`** (`eleve.ts`, enveloppe `askEleveDispatch`) : réponse **texte, zéro build**, posture `DISCUSS_RULES` (`assembleSystemPrompt`) + fil récent (`loadHistory`) repassé en contexte (l'Élève n'a pas de session SDK comme Claude). Construire = build (runRelay) ; Planifier & Discuter = conversationnel. **Limite** : le build Élève reste **stateless** (ne lit pas l'historique) → un plan « Discuté » n'informe pas automatiquement un build GLM ultérieur.
- **Sélecteur de modèle PAR BOUTON (UI, `Chat.jsx`)** : chaque action (Construire/Planifier/Discuter) a son modèle configurable (GLM-5.2/Sonnet/Opus/Haiku) via un menu déroulant, **mémorisé** (localStorage `mangoos.actionModels`), **défaut GLM-5.2 partout**. Fini la bascule Claude en dur. Le planificateur est détecté par l'**action active**, plus par `model==="opus"`.
- **Élève turbo** (`ELEVE_PROVIDER`) : `ollama` (local $0) ou `openai` (endpoint OpenAI-compat — Ollama Cloud, DeepSeek, Together…). `askEleveOpenAI` fait un POST `completionsUrl(ELEVE_API_URL)` + `Authorization: Bearer ELEVE_API_KEY`, **même contrat d'E/S** que la version Ollama → boucle de relais inchangée. **C'est la voie de l'Élève GLM-5.2 cloud actuel.** ⚠ Provider **global** (affecte aussi les agents spécialisés uxui/layout) ; ⚠ tour `openai` **compté coût 0** dans les métriques/traces → coût cloud réel non tracé (futur chantier, cf. [[traces]]/#134) ; code/prompts partent chez le tiers (Ollama Cloud ici).
- **Discipline d'ablation** : après chaque axiome de code né d'une escalade, `npx tsx src/audit-scan.ts --ablate` (suite AVEC vs SANS le dernier axiome) → si l'axiome dégrade l'Élève, l'amender/retirer. Verdict sur le **rendement réel** (`audit-verify.ts`), pas la compilation seule.

- **Souveraineté de la boucle (2026-06-22)** : principe gravé par Raf — **en mode GLM/Élève, toute la boucle est GLM + Mango, jamais Claude**. Concrètement : (1) génération = GLM (runRelay / chatEleve) ; (2) chat d'accueil = GLM (`home-chat` route `eleve`→`chatEleve`) ; (3) **feedback 👍/👎 = traité PAR GLM** — `processFeedback(..., ask?)` accepte un cerveau d'extraction injectable, `feedback-routes.ts` passe `chatEleve` quand `model==="eleve"` (sinon `FEEDBACK_PROVIDER`/Claude). L'axiome appris va dans le `.axioms.md` global (cerveau de Mango). Claude ne reste que le **filet d'escalade** du builder. Un pouce sur une réponse GLM apprend à GLM/Mango, pas à Claude.

## Liens

Écrit/utilise les axiomes de [[memoire-expertise]] · s'appuie sur [[coque-rigide]] (contrat + executor + inspection) · carburant de [[boucle-nocturne]] (génère expérience + axiomes la nuit) · cerveau alternatif au flux Claude de [[coque-souple]].

## Sources

[[memory]] (Jalon D, boucle de relais, Élève turbo, ablation) · [[statut]] · [[historique]].
