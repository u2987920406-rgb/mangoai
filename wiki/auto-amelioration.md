---
type: entite
tags: [auto-amelioration, souverainete, eleve, securite, git, self]
statut: en-cours
sources: ["décision Raf 2026-06-27"]
maj: 2026-06-27
---

# Auto-amélioration de Mango — Mango améliore son PROPRE code

Le pas vers un Mango qui **évolue lui-même** : lire et améliorer le code de MangoOS, au lieu que Claude le fasse à sa place. Né de la demande de Mango (GLM) lui-même de recevoir des « mains » (lire/écrire/exécuter/réseau). Cadré par une **discussion de sûreté** (2026-06-27) qui a tranché *quoi* ouvrir et *avec quel garde-fou*.

## Les décisions de cadrage (Raf, 2026-06-27)
- **Périmètre (B)** : Mango améliore son **propre code** (pas un assistant sur toute la machine = option C, écartée pour l'instant).
- **Relecture de diffs** : le livrable est un `git diff` que Raf relit ; rien n'est fusionné/poussé automatiquement.
- **Copie isolée** : Mango travaille dans un **git worktree** sur une branche dédiée — jamais le repo vivant ni le process en cours (un process ne peut pas se réécrire à chaud sans se casser).
- **Méthode = EXPÉRIENCE** : plutôt que trancher en théorie « peut-il s'auto-améliorer ? », on **mesure** — lecture de son code → petit chantier borné → diff → Raf relit (cap [[souverainete-progressive]] « observer avant d'élargir »).

## Pourquoi le garde-fou « notification, pas permission » est écarté
Le pitch de Mango proposait `deleteFile`/`execCommand`/`httpRequest` non confinés, avec simple notification. Dangers réels : `rm` fire-and-forget **irréversible** · `httpRequest` libre + `.env` (clés cloud) = **fuite de secrets** · `chercher_web` + `execCommand` = **injection→RCE**. Règle retenue : garde-fou **selon la réversibilité** — notification pour le lecture/allowlisté, **permission obligatoire** pour le destructif/sortant (comme Claude Code). Point méta : c'est **GLM** qui a écrit ce pitch — le même qui jouait l'expert Unity ([[capacites-mango]]) ; ne pas prendre son auto-évaluation de sûreté au mot.

## « Mango peut-il s'auto-améliorer, ou Claude mieux ? » (la ligne qui se déplace)
Aujourd'hui, sur son **cœur** (cross-cutting, `eleve.ts` ~1300 lignes d'invariants, tier 🧠 Opus), **non, pas seul** — GLM plafonne (vu live sur `plateau-iterations`, jeu de rôle Unity). Mais la bonne image n'est pas « Mango vs Claude » : c'est une **ligne de partage mobile** — Mango fait les marches basses bornées (lire/résumer, petit diff, test, suivre un patron), Claude/le frontière fait l'architectural ; et la ligne **bouge** avec l'échafaudage ([[le-stratege]], procédures #75) + des locaux quantizés. C'est exactement ce que **chiffre la métrique de souveraineté** ([[le-stratege]] P4 : escalade Claude qui baisse). Mango SEUL en boucle non supervisée le **dégraderait** ; le **diff relu + copie isolée** est le mécanisme qui le laisse grimper **sans s'autodétruire**.

## État — barreau 1 livré : la copie isolée (`mango-self.ts`)
Gaté `MANGO_SELF`. `createSelfWorktree(repoRoot, slug)` → git worktree + branche `mango/self-<slug>` depuis HEAD (base HORS repo, `MANGO_SELF_WORKTREE_BASE`) · `selfDiff(wt)` → stage `-A` dans le worktree puis `git diff --cached` (+`--stat`) = le patch relisable · `removeSelfWorktree(wt, {deleteBranch?})` → rend la copie, GARDE la branche par défaut · `sanitizeSelfSlug` pur. Git **injectable** (tests sans dépôt) ; **aucune fonction push/merge** (fusion accidentelle impossible) ; ne lève jamais. Lecture confinée = `resolveInside` (déjà testé) sur le worktree.

**Prouvé live** (vrai git, **zéro jeton GLM**, **zéro changement sur le code vivant**) : copie isolée du repo → contient `server/src/eleve.ts` → edit → `git diff` relisable → **repo vivant intact** → worktree+branche retirés = **réversible**. `test-mango-self 25` · tsc 0 · UI build vert.

## Barreau 2 ✅ livré & PROUVÉ LIVE — l'Élève améliore son propre code
`runSelfExperiment(repoRoot, task)` (`mango-self.ts`) : `createSelfWorktree` → l'Élève agentique travaille DANS le worktree → `selfDiff` → rend le patch ; ne fusionne/pousse JAMAIS, worktree conservé pour relecture. **Sûreté** : `buildSelfRegistry(worktree)` réduit les outils à l'allowlist `read_file`/`list_files`/`search_code`/`write_file`/`edit_file`/`finish` — **`allowRun:false` (zéro `run_command`)** + **pas d'outils réseau** (`chercher_web`/`extraire_site` filtrés → exfiltration `.env` impossible) ; écritures confinées (`resolveInside`). `SELF_SYSTEM` cadre le travail. Agent injectable (tests).

**Prouvé live** (vrai GLM, chantier borné « ajoute `sovereigntyByType()` à `sovereignty-metrics.ts` + son test ») : GLM lit les 2 fichiers → écrit la fonction (réutilise `eleveTurns`/`rate`, fallback `(inconnu)`, tri récent→ancien) + une section de test pertinente. **Vérifié dans le worktree** (jonction `node_modules`) : **`tsc` vert + test 22/22**. **Repo vivant INTACT** (0 trace dans le fichier vivant ; diff dans `D:\IA\.mango-self\` / branche `mango/self-*`). `test-mango-self 36`. **Réponse mesurée** : sur un chantier borné bien spécifié, Mango améliore son propre code seul, ça compile + passe les tests — premier point concret de la « ligne de partage ».

## Barreau 3 ✅ — l'auto-vérification SANS RCE (`check_types`)
Mango vérifie que son code compile, seul, avant de finir. **Décision de sûreté clé** : PAS de `run_command` générique — autoriser `npx tsx src/test-X.ts` exécuterait du **code arbitraire que l'Élève vient d'écrire** (RCE). À la place, un outil **`check_types` à ZÉRO argument** = `tsc --noEmit` uniquement (type-check, n'exécute aucun code, aucune injection). `buildSelfRegistry(wt, {checks})` l'ajoute ; `linkNodeModules`/`unlinkNodeModules` jointe `node_modules` le temps du run ; `SELF_SYSTEM_CHECKS` rappelle de l'appeler. **L'exécution des tests reste EXTERNE** (Claude/Raf) jusqu'à un vrai bac à sable (barreau 4).

**Prouvé live** (vrai GLM, chantier « ajoute `topClaudeProjects` + test ») : trace `… write_file → check_types → finish` — **GLM appelle `check_types` lui-même**, tsc vert ; vérif indépendante Claude : test 28/28 ; repo vivant intact. `test-mango-self 41`.

## Barreau 4 ✅ — exécuter les tests dans un VRAI bac à sable
Pas de Docker sur la machine → le bon outil = le **modèle de permissions de Node** (`--permission`, Node 25 : bloque l'écriture FS hors zone, le `child_process`, les addons natifs). Node ne résout pas `.js`→`.ts` au runtime → chaîne : **esbuild bundle** le test (CONFIANCE : transforme, n'exécute pas) → **`node --permission`** exécute le bundle (FS confiné au temp). `runTestSandboxed(worktree, testRel)` + outil **`run_tests({file})`** + `buildSelfRegistry(wt,{sandboxTests})` + `SELF_SYSTEM_TESTS` + `runSelfExperiment({allowTests})`.

**Prouvé — sécurité** (test unitaire réel) : test sain → ok ; test piégé (`fs.rmSync` hors zone + `execSync`) → **bloqué ERR_ACCESS_DENIED**, garde-fou intact. **Prouvé live — boucle complète** (vrai GLM, « ajoute `sovereigntyClaudeShare` + test ») : trace `write_file → check_types → run_tests → finish` — **GLM écrit, type-checke ET exécute son test en bac à sable, seul** ; vérif indépendante Claude tsc 0 + test 31/31 ; repo vivant intact. `test-mango-self 48`. **Résidu honnête** ([[limites|L42]]) : le modèle de permissions de Node ne gate pas le réseau (mais rien de secret n'est lisible hors temp → exfiltration nulle ; un gate réseau = un conteneur). Détail : 1ᵉʳ run, GLM a épuisé son plafond d'itérations (12) avant de vérifier et l'a dit franchement → fix override `maxIterations` (28 pour l'auto-amélioration).

## 🏁 L'échelle de sûreté — COMPLÈTE (4/4)
| Barreau | Ouvert | Garde-fou |
|---|---|---|
| 1 ✅ | lecture du code + copie isolée | notification |
| 2 ✅ | écriture **en diff relu** (worktree), sans run/réseau | revue de Raf avant fusion |
| 3 ✅ | **auto-vérification** `check_types` (= `tsc --noEmit`, zéro arg, pas de RCE) | type-check seul ; **pas** d'exécution de code |
| 4 ✅ | exécuter les TESTS (`run_tests`) | **bac à sable** Node `--permission` (FS confiné, pas de spawn/natif) |
| destructif/sortant | delete, push, hors-repo, réseau | **permission obligatoire** |

**Bilan** : sur un chantier borné, Mango **lit, écrit, type-checke et teste son propre code, seul**, sur copie isolée ; Raf relit/fusionne. 3 fonctions déjà écrites par Mango pour MangoOS.

## Garde ANTI-SPIRALE — pour que la boucle atteigne l'écriture (2026-06-28)
Faille révélée par un run réel ([[limites|L49]]) : sur un fichier moyen, l'Élève GLM enchaîne `read_file`/`search_code` sans jamais écrire et **épuise son budget avant d'agir** (39 explorations stériles, diff vide) — classe [[limites|L35]] mais fatale. La boucle compte les *itérations*, pas les appels (une itération empile N `search_code`). Décision de Raf : **« fixer la boucle d'abord »** (scaffolding — Mango ne peut pas réparer sa boucle d'écriture sans écrire). Remède (`eleve-antispiral.ts`, opt-in `opts.antiSpiral`, gate `SELF_ANTISPIRAL`, branché **uniquement** sur `runSelfExperiment`) : (1) **nudge** après N explorations consécutives (« passe à l'action », ton escaladé) ; (2) **cap** : au-delà de M explorations on **retire `read_file`/`list_files`/`search_code`** de la liste offerte au modèle → il ne peut plus qu'écrire/vérifier/conclure ; (3) **anti-doublon** : un appel d'exploration identique → « tu l'as déjà, agis » sans ré-exécuter. `test-eleve-antispiral 30/30`. **Prouvé live** : re-run → `read×3 → search×11 → [CAP] → edit×5 + write×2 + check_types + run_tests×2`. La boucle atteint enfin l'action.

## L42 RÉSOLU — par Mango lui-même (le 1ᵉʳ vrai correctif de sûreté auto-écrit)
Une fois la boucle réparée, le re-run a produit un **vrai diff** : GLM a comblé le résidu réseau du bac à sable ([[limites|L42]]). Solution (dans la copie isolée) : bundle de test passé en **`.cjs`** + un **`runner.cjs`** qui patche `Module.prototype.require` (bloque `net`/`tls`/`http`/`https`/`http2`/`dgram`/`dns` + variantes `node:`) et neutralise `globalThis.fetch` **avant** de charger le bundle ; `node --permission` tourne sur le runner. **Prouvé live** : `fetch` ET `require('net')` lèvent « réseau interdit dans le bac à sable », `ok:true` ; non-régression `test-mango-self 61/61`. Relu via le **rituel diff** (tableau par fichier) : la garde marchait, seul le test de GLM avait un bug d'accent (`reseau`≠`réseau`) → corrigé (1 ligne) puis fusionné. **Le bac à sable est désormais clos côté réseau aussi.**

## Industrialisation — l'« Atelier de Mango » (UI)
Un panneau **Réglages › Intelligence › Atelier de Mango** (`AtelierMango.jsx`) pour lancer un chantier depuis l'UI (ce qui était orchestré en CLI). Backend `self-routes.ts` : `POST /api/self/run` (SSE — copie isolée → l'Élève travaille `check_types`+`run_tests` → stream live → diff) · `POST /api/self/merge` (`mergeSelfFiles` : écrit les fichiers au repo vivant + newline, AUCUN git = à committer ensuite ; garde anti-évasion `isInsidePath`) · `POST /api/self/discard`. UI : champ tâche → **Lancer** → log live + **diff coloré** + badges type-check/tests → **Fusionner / Jeter**. `test-mango-self 55` (mergeSelfFiles + gardes). **Honnêteté** : le bouton n'augmente pas l'intelligence de Mango — il rend l'accès ergonomique à une capacité supervisée déjà prouvée ; s'active au prochain redémarrage backend.

## Liens
[[le-stratege]] (métrique de souveraineté P4) · [[capacites-mango]] (conscience des limites) · [[souverainete-progressive]] · [[eleve-local]] · [[brain-dispatch]] · [[limites]] · [[statut]] · [[historique]]

## Sources
Décision Raf 2026-06-27 (discussion de cadrage + AskUserQuestion) · module `mango-self.ts` / `test-mango-self.ts` · `statut.md` (y) · `historique.md` (y) · `limites.md` (L41).
