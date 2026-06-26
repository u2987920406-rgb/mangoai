---
type: entité
tags: [eleve, transmission, plan, boucle-agentique]
statut: livré
sources: ["#160"]
maj: 2026-06-26
---

# Planifier-avant-agir (`planifier`)

Outil + réflexe transmis à l'Élève (GLM) : **poser un PLAN d'étapes ordonnées AVANT de coder** une tâche non triviale, puis l'exécuter étape par étape — le plan étant **rappelé** quand l'Élève dérive. #160.

## Rôle

GLM construit **linéairement, sans vue d'ensemble** : il plonge dans read/write sans poser d'étapes, d'où oublis de morceaux, **sur-exploration stérile** et tâtonnement (constat LIVE : 19 lectures/recherches sans rien structurer). Claude, lui, établit un todo ordonné d'abord. On lui transmet ce réflexe — dernière compétence de la feuille de route [[transmission-competences]] (après vois_ecran #151, chercher_image #153, chercher_web #154, teste_parcours #155, chercher_artefact #156, lire_document #157/#158, extraire_site #159).

**Décision de cadrage (Raf)** : *« Outil + plan-ancre »* — l'outil pose le plan ET le plan est rappelé activement (≠ clause décorative, ≠ plan bloquant trop intrusif).

## Détails clés

Trois pièces, deps injectables, ne lève jamais :

| Pièce | Fichier | Rôle |
|---|---|---|
| **État du plan** | `eleve-plan.ts` | Store **éphémère** par projet, **in-process** (PAS le [[blackboard]], réservé au durable cross-projet) : `setPlan`/`getPlan`/`clearPlan` + formateurs PURS `formatPlan` (étapes numérotées + consigne) / `formatPlanReminder` (rappel compact) + `buildRelanceNudge` (préfixe le rappel du plan au nudge) |
| **L'outil** | `eleve-planifier-tools.ts` | `planifier({titre, etapes[2..12]})` — valide, numérote, mémorise. Enregistré dans `buildEleveActionTools` (gate `ELEVE_PLANIFIER=off`), conservé même pour cerveau faible |
| **La clause + l'ancre** | `eleve.ts` | Clause **⚠ PLANIFIE D'ABORD** en tête du `AGENTIC_TOOL_CONTRACT` (planifier = 1er appel d'une tâche multi-étapes) ; `clearPlan` au démarrage du moteur ; le **nudge d'auto-relance** rappelle SON plan via `buildRelanceNudge` |

**Le plan-ancre** : c'est ce qui rend le plan **actif, pas décoratif**. Quand l'Élève sur-explore ou plafonne (gardes anti-blocage de `buildAgentic` → auto-relance dans `eleve.ts`), au lieu d'un « arrête de lire, AGIS » générique, on lui **remet son propre plan sous les yeux** + « reprends les étapes non faites ». Réutilise la machinerie anti-blocage déjà là (cf. [[transmission-competences]] / boucle de l'Élève).

**L'ancre EN COURS de boucle (L17 ✅ 2026-06-26)** : l'ancre ne jouait qu'à l'auto-relance (frontière de `buildAgentic`). Or sur les **gros projets**, l'Élève dérive EN PLEIN run (re-lecture/re-planification) sans franchir cette frontière → 3/5 gros projets bloqués. Désormais les **gardes anti-sur-exploration de `buildAgentic` elles-mêmes** préfixent le rappel du plan (`AgenticOptions.planReminder`, closure câblée depuis `eleve.ts`), et si des fichiers sont **déjà écrits** (`hasWritten`), poussent explicitement à **`finish`** (« ne re-lis pas, ne re-planifie pas »). Prouvé live : le brief TIDE qui se bloquait 2× atteint `finish` proprement (21 it).

## État

**Livré et prouvé live** (#160). LIVE (`askEleveAgentic`, vrai GLM, contrat réel, $0) : sur « ajoute une page Réservation (formulaire + validation + récap + confirmation + nav) », GLM appelle **`planifier` EN PREMIER** (plan 5 étapes) puis exécute dans l'ordre (write/edit router+nav, check_build, **teste_parcours #155**, corrige) — composition de compétences transmises. Tests : eleve-plan 17 · eleve-planifier-tools 15 · eleve-action-tools 44 (17 outils, 16 gated).

**Limites** : ~~L17 (rappel du plan seulement aux auto-relances)~~ **✅ Résolu 2026-06-26** (ancre injectée dans les gardes en cours de boucle + cue finish si déjà écrit ; test-eleve-runtime 42, prouvé live TIDE) · L18 (pas de suivi d'étapes coché en v1 → rappel du plan entier ; piste : outil `etape_faite(n)`).

## Liens
[[transmission-competences]] · [[teste_parcours]] · [[sharingan-extraction]] · [[oeil-coach]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#160` (statut.md tableau + journal historique.md) · modules `eleve-plan.ts` / `eleve-planifier-tools.ts` / `eleve-action-tools.ts` / `eleve.ts`.
