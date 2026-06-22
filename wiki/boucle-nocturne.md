---
type: entite
tags: [architecture, nocturne, entrainement, cli]
statut: actif
sources: [memory, statut]
maj: 2026-06-22
---

# Boucle nocturne

> Génération autonome **pendant que l'utilisateur dort** : MangoOS crée des projets en boucle pour accumuler de l'expérience et des axiomes, à coût quasi nul. CLI dédié (idée 32), **jamais importé en prod**.

## Rôle

« Entraîner » MangoOS = remplir la **courbe d'apprentissage** (`.metrics.jsonl`) + générer des **axiomes** via escalade. Ça ne ré-entraîne **aucun modèle** — c'est de l'accumulation d'expérience et de mémoire d'expertise.

## Détails clés

- **`train-loop.ts`** — CLI autonome (comme `audit-scan.ts`, jamais en prod). Cerveau = [[eleve-local]] local ($0) via `runRelay` ; Claude seulement en **escalade plafonnée** (`--max-escalations`, défaut 6 → coût de nuit borné ; 0 = pur $0 sans axiome). L'escalade écrit déjà un axiome → carburant direct de [[memoire-expertise]].
- **Diversité** : `composeTask(kind, domain, style)` (pur, testé) — 5 types × 30 domaines × 24 styles = **3600 combos** ; `generateUniquePrompts(n)` dédoublonne. Arrêt : `--minutes` (défaut 480) ou `--count`.
- **Nettoyage disque** : chaque projet supprimé après mesure, garde `--keep` réussites (défaut 5) — sinon saturation (~200 Mo/projet). Journal `workspace/.train.jsonl`. `--dry-run N` = aperçu.
- Lancer : `cd server && npx tsx src/train-loop.ts --minutes 480 --max-escalations 6 --keep 5` (préreq : `ollama serve`).
- **`nocturnal.ts`** (orchestrateur de lot nocturne) : applique la **directive de curation** de [[boucle-curation]] au prompt de génération initial, et `ensureBuildPasses` répare `build-failed`/`backend-failed` + pose les deps backend une seule fois.
- **Cycle d'apprentissage 3 phases (#106)** — distinct du `train-loop` (qui jette les apps) : `run-tonight.ts` (Gemma génère N apps + escalade Claude → **axiomes incrémentaux** réinjectés aux apps suivantes du même run) → `run-finish.ts` (Claude **FINIT** chaque app, archive Gemma dans `.gemma-snapshots/`) → `run-learn.ts`+`reverse-learn.ts` (Gemma distille une **procédure** du diff Gemma→Claude + validation boucle fermée). **Source unique des apps** : `tonight-specs.ts` (12 apps + charte Mango, dérivés `FINISH_SPECS`/`LEARN_TASKS`, `TONIGHT_LIMIT` pour dry-run). **Orchestrateur** : `run-night.ts` (`--budget` → garde-budget `FINISH_BUDGET_USD` qui borne le coût Claude de la Phase 1 et s'arrête proprement entre projets ; `--limit` dry-run). Lancer : `npx tsx src/run-night.ts --budget 20`.

## Liens

Cerveau = [[eleve-local]] · répare via le jugement de [[coque-rigide]] · alimente [[memoire-expertise]] (axiomes) et est orientée par [[boucle-curation]] · garde-fou par le Disjoncteur de [[mangoqa]] (circuit nocturne).

## Sources

[[memory]] (boucle d'entraînement nocturne, idée 32) · [[statut]] (bugs d'intégration backend du run, `nocturnal.ts`).
