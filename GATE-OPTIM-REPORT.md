# GATE-OPTIM-REPORT — armement ou suppression des capacités dormantes (2026-09-30)

Rapport écrit au fil de l'eau. Entrée : `audit-dormant-2026-09-30.md`. Lignes = numéros de l'audit.

| # | élément | décision | mécanisme | fichier:ligne | preuve que ça marche |
|---|---|---|---|---|---|
| 31 | Budget-$ dur de la nuit (`NOCTURNAL_BUDGET_HARD` + `NOCTURNAL_GLOBAL_BUDGET_USD`) | ARMÉ | démarrage (défaut dans le code : gate ON, plafond fini 20 $ ; `.env` est gitignoré donc non fiable comme source) | server/src/flags.ts (NOCTURNAL_BUDGET_HARD), server/src/nocturnal-budget.ts (`DEFAULT_NIGHT_BUDGET_USD`, `globalBudgetCapUsd`, `nightBudgetGate`) | `src/tests/test-nocturnal-budget-default.ts` : gate ON par défaut, plafond ∈ {absent,"",0,-3,abc}→20, dépassement→arrêt ; tests budget/perimeter/scheduler existants verts |
| 31b | 6 scripts de génération sans garde-budget (run-6-souv-d, run-3-complex-apps, run-souv-d-polish, run-showcase, fleet-20-apps) | ARMÉ | garde à la frontière d'itération (`nightBudgetGate`/`nightBudgetSpend`), même ledger `data/global-budget.json` | server/scripts/*.ts | `tsc --noEmit` 0 erreur |
| 3 (partiel) | armement périmètre = stopAuthority ∧ budgetHard ∧ qaBus | budgetHard fait ; les 2 autres : voir chantiers 2-3 | | | |
