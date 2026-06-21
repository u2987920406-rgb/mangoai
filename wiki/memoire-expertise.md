---
type: entite
tags: [architecture, memoire, apprentissage, hermes]
statut: actif
sources: [memory, statut]
maj: 2026-06-20
---

# Mémoire d'expertise

> Les magasins de connaissance persistants qui font que MangoOS apprend d'un projet à l'autre. Architecture transposée de **Hermes**. Tout vit dans `workspace/` (git-ignoré, hors zip, survit au rollback).

## Rôle

Accumuler faits, préférences, savoir-faire et principes, et les **réinjecter** au system prompt. C'est la mémoire « prose/how-to » du projet — distincte du [[blackboard]] (mémoire d'artefacts visuels) et complémentaire de [[boucle-curation]].

## Détails clés — les 4 magasins

1. **Mémoire projet** — `workspace/<projet>/.memory.md` : faits du projet (design, conventions) ; snapshot gelé injecté à chaque tour (`memory.ts`).
2. **Profil utilisateur** — `workspace/.user-profile.md` : préférences inter-projets (ton, typo).
3. **Skills** — `workspace/.skills/<nom-classe>/SKILL.md` : savoir-faire réutilisable, **divulgation progressive** (métadonnées au prompt, lecture à la demande, `skills.ts`).
4. **Axiomes** (Knowledge Flywheel, idée 10) — `workspace/.axioms.md` : registre d'**axiomes universels** (règle abstraite indépendante du langage), plafonné 3000 car. Format `AXIOME-[CAT]-[NN] (maturité: candidat|confirmé · vu: date)`. Injecté comme **défaut écrasable**. ⚠ haiku tend à sur-promouvoir en « confirmé ».

## Qui écrit ?

La **revue en arrière-plan** (`review.ts`) : agent **haiku silencieux**, fire-and-forget après chaque tour livré sans erreur, outils Read/Write/Edit, verrou anti-empilement. L'agent principal ne cure PAS (sauf demande explicite, ou auto-backlog du mode Finition). **Chemins ABSOLUS obligatoires** (un haiku écrivait parfois un skill à la racine du repo).

**Couche universelle** (multi-user Phase 1) : `workspace/.axioms-universal.md` (A11Y, responsive, perf, sécurité, tokens CSS) injecté AVANT le `.axioms.md` personnel.

Panneau **🧠 Mémoire** dans le header (`GET /api/knowledge/:name`). Compression de contexte par `compaction.ts` (déclenche le `/compact` du SDK > 70 % de fenêtre).

## Liens

Les axiomes sont sélectionnés par la couture `selectAxioms()` de [[coque-souple]] · écrits via l'escalade de [[eleve-local]] · audités par la discipline d'ablation.

## Sources

[[memory]] (boucle d'apprentissage Hermes, Knowledge Flywheel, compression) · [[statut]] idée 10.
