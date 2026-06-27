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

## L'échelle de sûreté (rappel)
| Barreau | Ouvert | Garde-fou |
|---|---|---|
| 1 ✅ | lecture du code + copie isolée | notification |
| 2 ✅ | écriture **en diff relu** (worktree), sans run/réseau | revue de Raf avant fusion |
| 3 | `run_command` **allowlist** (tsc/build) dans le worktree | allowlist (patron `add_dependency`) |
| destructif/sortant | delete, push, hors-repo, réseau | **permission obligatoire** |

## Liens
[[le-stratege]] (métrique de souveraineté P4) · [[capacites-mango]] (conscience des limites) · [[souverainete-progressive]] · [[eleve-local]] · [[brain-dispatch]] · [[limites]] · [[statut]] · [[historique]]

## Sources
Décision Raf 2026-06-27 (discussion de cadrage + AskUserQuestion) · module `mango-self.ts` / `test-mango-self.ts` · `statut.md` (y) · `historique.md` (y) · `limites.md` (L41).
