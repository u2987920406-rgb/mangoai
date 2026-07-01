---
type: entité
tags: [cron, loop, autonomie, disjoncteur, boucle-agentique]
statut: livré
sources: ["#173"]
maj: 2026-07-02
---

# Loop (cron agentique)

Le cron in-app appelle enfin la **vraie boucle agentique** (`runRelay`) au lieu d'une complétion texte : une tâche planifiée peut **écrire du code**, seule — bornée par un disjoncteur (mêmes garde-fous que l'auto-évolution). #173.

## Rôle

`cron-scheduler.ts` existait (+ UI `CronManager.jsx`) mais `executeTask` ne faisait qu'un `getBrain().complete()` (texte seul, maxTokens 500) : décoratif. #173 branche le cron sur `runRelay` — donc le pouvoir d'agir, la nuit, sans supervision directe. Le risque (un cron qui écrit n'importe quoi seul) est bordé par un **disjoncteur** en condition d'entrée, pas un nouveau mécanisme : même patron que [[auto-evolution]] (`self-evolution-autoforge`). Gaté **`CRON_AGENTIC=off`** (défaut → repli texte, zéro régression).

## Détails clés

| Pièce | Module | Détail |
|---|---|---|
| **Disjoncteur** | `cron-breaker.ts` (PUR) | `canRunCron` : **fenêtre glissante d'1 h** — refuse si gate off, plafond `CRON_MAX_RUNS_PER_HOUR` (déf. 4) atteint, ou garde-coût `CRON_BUDGET_USD_PER_HOUR` (déf. $1) dépassé ; `recordCronRun` (coût réel, purge > 1 h). `now` injecté → testable. |
| **Swap** | `cron-scheduler.ts` `executeTask` | `CRON_AGENTIC=on` → `runRelay(prompt, projectDir, {maitreModel:'sonnet'})` ; disjoncteur = condition D'ENTRÉE (refus AVANT le run). Repli `legacyExecuteTask` (texte) si off. Le Gardien #161 est hérité de runRelay (pas de chemin cron qui le contourne). |
| **Rythme adaptatif** | `computeNextRunHint` + `CronTask.nextRunHint` | INCOMPLET → 15 min · fait → 1 h · échec → backoff 6 h. `shouldRun` respecte le hint (prime sur hourly/daily/weekly). |
| **Diff-friendly + UI** | `extractTouchedFiles` · `CronManager.jsx` | Le résumé liste les fichiers touchés (write/edit) ; l'UI affiche « prochain ~X » et garde le toggle `enabled` pour couper une tâche louche. |

## État

**Livré, gaté `CRON_AGENTIC=off`, prouvé par tests** (#173, 2026-07-02) : Phases **0** (disjoncteur — 20 tests : config/plafond/garde-coût/fenêtre glissante + rythme + diff) · **1** (swap + repli) · **2** (nextRunHint) · **3** (diff + UI). tsc propre · build UI vert. **Reste** : preuve live (gate ON sur une vraie tâche planifiée) après OBS — même posture que #168/#171.

## Limite / périmètre

Le champ `mode` sur `CronTask` n'est pas ajouté (runRelay a son défaut). Les scripts nocturnes autonomes (`run-mango-nuit`/`nocturnal`, CLI) ne sont **pas fusionnés** avec le cron in-app — deux systèmes proches à des échelles différentes, à unifier séparément si le besoin apparaît.

## Liens
[[gardien-cloture]] · [[auto-evolution]] · [[le-stratege]] · [[hooks]] · [[statut]] · [[historique]]

## Sources
`#173` (plan `docs/plan-173-loop.md` · statut.md · historique.md) · modules `cron-breaker.ts` / `cron-scheduler.ts` · UI `CronManager.jsx`.
