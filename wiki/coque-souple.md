---
type: entite
tags: [architecture, prompt, scenario, modes]
statut: actif
sources: [memory, statut]
maj: 2026-06-20
---

# Coque Souple (assemblage du prompt)

> Le system prompt n'est pas une concaténation en dur : il est **assemblé par blocs nommés selon un scénario** (= mode). Livré au **jalon A** de la Phase Ultime. C'est le point où l'on branche toute nouvelle capacité.

## Rôle

Rendre les capacités de l'agent **composables** : ajouter/retirer un mode ou une fonction = modifier des données (`SCENARIOS`/`BLOCKS`), pas le flux de `runAgent`. Tout changement de prompt doit rester **à comportement constant** sauf intention explicite.

## Détails clés

- `server/src/scenario.ts` → `assembleSystemPrompt(ctx)` assemble les blocs. Les constantes de prompt (`SYSTEM_APPEND`, `MODE_RULES`, `ANALYTIC_RULES`, `VISION_*`, `SUPABASE_RULES`, `TESTS_RULES`, `FINITION_RULES`, `PLAN_RULES`, `MOODBOARD_RULES`, `BLUEPRINTS_RULES`, `FIGMA_RULES`) y vivent. `agent.ts` appelle juste `assembleSystemPrompt`.
- **Couture des axiomes** : `selectAxioms()` (`axioms.ts`) = point d'injection. v2 (Jalon D) : sans contexte → registre complet (Claude inchangé) ; avec contexte `{task, max}` → axiomes pertinents plafonnés (pour l'[[eleve-local]]). Détail registre → [[memoire-expertise]].
- **Trois modes orthogonaux au modèle** (`ALLOWED_MODES`) :
  - **MVP** (idée 12) — rapide/économe : pas de plan, pas de web.
  - **Élite** — arsenal complet : `analytic` (rituel analytique + thinking adaptatif), Mango Plan + moodboard, tests Vitest, vision complète, WebSearch/WebFetch.
  - **Finition** (🛡️) — phase de consolidation, **pas de construction** : Feature Freeze, délégation OBLIGATOIRE au sous-agent `qa`, durcissement (a11y, validation, `rel=noopener`), auto-backlog dans `.memory.md`.
- Le **gating** par mode est verrouillé par `test-scenario.ts` (présent en Élite / absent en MVP).

## Liens

Branche les capacités de [[vision]], [[memoire-expertise]] (axiomes) · cohabite avec [[coque-rigide]] (qui, elle, exécute la sortie) · le mode pilote aussi le flux [[eleve-local]] vs Claude.

## Sources

[[memory]] (Coque Souple jalon A, modes MVP/Élite/Finition) · [[statut]] · [[historique]].
