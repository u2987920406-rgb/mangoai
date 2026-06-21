---
type: entite
tags: [architecture, eleve, ollama, apprentissage, boucle]
statut: actif
sources: [memory, statut, historique]
maj: 2026-06-20
---

# Élève local & boucle d'apprentissage

> Le 4ᵉ cerveau de MangoOS : un modèle **local à coût zéro** (Gemma 4 12B via Ollama) qui traite la routine, avec **escalade vers Claude** sur échec objectif. Livré au **Jalon D** (2026-06-13). Rend MangoOS model-agnostic.

## Rôle

Faire tourner les tours de génération à $0 quand c'est possible, Claude restant l'escalade + le **scribe d'axiomes**. L'Élève répond dans le contrat `<mangoos>` (voir [[coque-rigide]]), MangoOS exécute et juge objectivement (`vite build`), escalade après N échecs.

## Détails clés

- **Modèle** : `gemma4:12b` via Ollama (`http://localhost:11434`). Qwen entièrement retiré le 2026-06-17. `OLLAMA_MODELS` redirigé sur `D:\ollama\models` (C: presque plein). Démarrer : `ollama serve` (séparé du backend). 1er appel ~60 s (chargement VRAM), suivants ~5 s.
- **Boucle de relais** (`eleve.ts` → `runRelay`) : prompt d'entrée STRICT obligatoire (sinon l'Élève dérape), `executeContract` applique, `inspectProject` juge sur **signaux objectifs** (`build-failed`/`timeout`/`no-deps`…), escalade Claude qui corrige + écrit un axiome. Cerveaux `askEleve`/`escalate` **injectables** (`defaultRelayDeps`) → testable sans réseau.
- **Branchement chat** : 4ᵉ cerveau `model === "eleve"` (sélecteur UI) → `/api/chat` route vers `runRelay` (sinon `runAgent`/Claude inchangé). Métriques `resolvedBy`/`attempts`/`projectType`.
- **Élève turbo** (`ELEVE_PROVIDER`) : défaut `ollama` ($0) ; option `openai` (endpoint compatible, ex. DeepSeek/Together) — ⚠ payant et **non capté dans les métriques**, code/prompts partent chez un tiers.
- **Discipline d'ablation** : après chaque axiome de code né d'une escalade, `npx tsx src/audit-scan.ts --ablate` (suite AVEC vs SANS le dernier axiome) → si l'axiome dégrade l'Élève, l'amender/retirer. Verdict sur le **rendement réel** (`audit-verify.ts`), pas la compilation seule.

## Liens

Écrit/utilise les axiomes de [[memoire-expertise]] · s'appuie sur [[coque-rigide]] (contrat + executor + inspection) · carburant de [[boucle-nocturne]] (génère expérience + axiomes la nuit) · cerveau alternatif au flux Claude de [[coque-souple]].

## Sources

[[memory]] (Jalon D, boucle de relais, Élève turbo, ablation) · [[statut]] · [[historique]].
