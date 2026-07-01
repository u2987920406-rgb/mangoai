# Plan #173 — « Loop » : le cron parle enfin à la vraie boucle agentique

> Le plus petit des 4 chantiers — presque un bugfix architectural plutôt qu'une nouveauté. `cron-scheduler.ts` existe, tourne, a même une UI (`CronManager.jsx`), mais `executeTask` appelle `getBrain().complete(systemPrompt, task.prompt, {...})` — une complétion texte SEULE, sans outils. Une tâche planifiée aujourd'hui ne peut ni lire un fichier, ni en écrire un, ni lancer un build. Elle peut juste... répondre.

---

## 1. Le verdict honnête

**Oui, et c'est presque gratuit — un seul remplacement de fonction transforme une fonctionnalité décorative en fonctionnalité utile.**

### Pourquoi c'est bénéfique
1. **Le gap est absurdement simple à combler.** L'infra existe des deux côtés — `runRelay`/`askEleveAgentic` d'un côté, `CronTask`/`CronManager.jsx` de l'autre. Il manque juste le fil entre les deux.
2. **Ça rejoint enfin les scripts nocturnes déjà puissants.** `run-mango-nuit.ts`/`run-tonight.ts`/`nocturnal.ts` font déjà des runs autonomes complets — mais en CLI, hors UI, présumément lancés par une tâche planifiée Windows externe à toi. Le cron in-app pourrait devenir la même chose, pilotable depuis Réglages, sans sortir de MangoOS.

### Le risque réel — et il est sérieux
**Un cron qui a de vrais outils est un cron qui peut écrire n'importe quoi, sans personne pour relire le diff en direct.** Le chat normal a TOI en face de chaque tour. Un cron tourne seul, la nuit. Le jour où `executeTask` appelle `runRelay` au lieu de `complete`, chaque tâche planifiée active devient un mini-agent autonome sans supervision immédiate — c'est exactement le pattern que MangoQA (le disjoncteur `cost-guard`, les killswitches) a été construit pour border ailleurs. On ne réinvente pas un garde-fou : on branche le cron sur les disjoncteurs qui existent déjà.

### Condition non négociable
**(A) Aucune tâche cron n'accède au vrai agentique tant que le disjoncteur de coût/tentatives n'est pas branché dessus.** Les phases 0 et 1 de ce plan sont donc dans l'ordre inverse de ce qu'on ferait naturellement (le swap avant le garde-fou) — ici c'est l'inverse : le garde-fou vient AVANT que le swap soit activé par défaut.

---

## 2. La vision en une phrase

> `/loop` côté Mango : une tâche planifiée qui écrit vraiment du code, bornée par le même disjoncteur que l'auto-évolution, avec un rythme que Mango peut lui-même ajuster selon ce qu'il trouve.

---

## 3. Architecture

**Aujourd'hui** (`cron-scheduler.ts`) :
```ts
async function executeTask(task: CronTask): Promise<string> {
  const systemPrompt = `Tu es MangoOS, un agent autonome. Le projet cible est "${task.projectName}"...`
  const result = await getBrain().complete(systemPrompt, task.prompt, { provider: ..., maxTokens: 500 })
  return result || '(résultat vide)'
}
```

**Cible** :
```ts
async function executeTask(task: CronTask): Promise<string> {
  if (!CRON_AGENTIC_ON) return legacyExecuteTask(task) // repli inchangé, gate off

  if (!cronBreaker.canRun(task)) return '(disjoncteur : plafond atteint, tâche suspendue)'

  const result = await runRelay(task.projectName, task.prompt, { mode: task.mode ?? 'mvp' })
  cronBreaker.record(task, result)
  return summarizeForCronLog(result) // diff-friendly, pas juste du texte libre
}
```

Le disjoncteur (`cronBreaker`) réutilise le PATRON déjà écrit pour l'auto-évolution (`self-evolution-autoforge.ts` → `canAutoForge`/`recordAutoForge` : plafond de tentatives + garde-coût en USD + comptabilité immuable) plutôt que d'inventer un nouveau mécanisme. Même config-shape, nouvelle instance.

---

## 4. Phases

| # | Phase | Livrable clé | Prouve quoi | Modèle optimal | Effort |
|---|---|---|---|---|---|
| **0** | **Disjoncteur cron** | `cron-breaker.ts` — même patron que `self-evolution-autoforge.ts` (plafond tâches/heure, garde-coût USD, comptabilité). PUR, testé seul, pas encore branché. | le garde-fou existe et est testable AVANT d'ouvrir le vrai agentique | ⚖️ Sonnet 4.6 | S |
| **1** | **Swap `executeTask`** | `runRelay` remplace `getBrain().complete()`, gaté `CRON_AGENTIC=off` par défaut (comportement actuel = repli si off). Le disjoncteur de la phase 0 est une condition d'entrée obligatoire quand `on`. | une tâche planifiée peut écrire un vrai fichier, borné | 🧠 Opus 4.8 | M |
| **2** | **Intervalle auto-choisi** | `CronTask` gagne `nextRunHint?: number` — après un run, Mango propose son prochain délai selon ce qu'il a trouvé (rien à faire → délai long ; en cours → court), mirroir du `/loop` dynamique de CC. `shouldRun` en tient compte si présent. | le rythme s'adapte, pas juste hourly/daily/weekly fixes | ⚖️ Sonnet 4.6 | S |
| **3** | **UI : voir le diff, pas juste le texte** | `CronManager.jsx` affiche le dernier diff produit (fichiers touchés) au lieu du seul `lastResult` texte libre — et un bouton pour DÉSACTIVER une tâche directement depuis l'alerte si le résultat est louche. | tu peux auditer ce qu'un cron a fait sans aller lire `historique.md` | ⚖️ Sonnet 4.6 | S |

---

## 5. Garde-fous
- `CRON_AGENTIC` off par défaut — le comportement actuel (complétion texte) reste le repli tant que le disjoncteur n'a pas prouvé sa fiabilité.
- Le disjoncteur est une condition D'ENTRÉE, pas une vérification a posteriori — une tâche qui dépasse son plafond est REFUSÉE avant de lancer `runRelay`, pas arrêtée en cours de route.
- Chaque run cron passe par le Gardien (`runClosureGate`, hérité gratuitement puisqu'on appelle `runRelay` tel quel) — pas de chemin "cron" qui contourne la clôture normale.

## 6. Définition de « réussi »
1. Une tâche cron peut écrire un fichier réel dans le projet cible et le prouver (diff visible).
2. Le disjoncteur refuse effectivement une tâche qui dépasse son plafond — testé en forçant le plafond bas.
3. `CRON_AGENTIC=off` reproduit exactement le comportement actuel (non-régression).
4. Tu peux voir, sans ouvrir de terminal, ce qu'une tâche planifiée a modifié cette nuit.

## 7. Risques résiduels & honnêteté
- Ce plan ne fusionne PAS les scripts `run-mango-nuit.ts`/`nocturnal.ts` avec `cron-scheduler.ts` — ce sont deux systèmes qui font des choses proches à des échelles différentes (un run nocturne complet vs. une tâche planifiée ciblée). Les unifier est une question légitime mais hors scope ici ; à trancher séparément une fois ce plan-ci prouvé.
- `mode: task.mode ?? 'mvp'` suppose qu'on ajoute un champ `mode` au `CronTask` — petit changement de schéma, à migrer (tâches existantes sans le champ → défaut `mvp`, le plus économe).

## 8. Modèle / Effort global
⚖️ **Sonnet 4.6** suffit pour l'essentiel (mécanique, patron du disjoncteur déjà écrit ailleurs) — seule la phase 1 (le swap lui-même, qui touche à la manière dont un processus SANS supervision directe peut déclencher `runRelay`) mérite 🧠 **Opus 4.8** pour la revue. **Effort global : S/M.**
