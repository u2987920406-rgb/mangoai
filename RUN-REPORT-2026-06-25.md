# Run de validation grandeur nature — 2026-06-25

> **But** : faire coopérer pour la première fois les ~11 briques récentes (#149→#162) sur de vrais builds de bout en bout, mesurer, et en sortir des limites/axiomes. Diagnostic destiné à trancher la suite (fiabiliser le Gardien #161 vs étendre la mémoire d'artefacts L3).

## Dispositif
- **Backend frais** (anti-orphelin :3000), `BLACKBOARD_DB=./data/blackboard.sqlite`, **`ELEVE_CLOSURE_GATE=on`** (Gardien #161), **`ELEVE_VISION=on`** (vois_ecran #151), Pexels présent. `BRAIN_DISPATCH` laissé OFF (périmètre = boucle Élève, pas le routage des 11 sous-agents).
- **Élève = `codeur` = `glm-5.2:cloud`** (la bascule #162) — première validation grandeur nature du cœur rebranché.
- **2 apps** générées via `POST /api/chat` (`model:"eleve"`) : `mango-carnet` (MVP→Élite, profondeur) puis `mango-courses` (MVP, réutilisation). Briefs conçus pour **forcer un déclencheur par brique**.

## ★ Matrice de couverture des briques (toutes ont tiré)
| Brique | # | A tiré ? | Preuve |
|---|---|---|---|
| planifier | 160 | ✅ | **1er appel de CHAQUE build** (plan 5 étapes) |
| chercher_image | 153 | ✅ | vraies photos Pexels (carnet : risotto, saumon, bourguignon…) |
| teste_parcours | 155 | ✅ | parcours joués (accueil, détail, planifier, courses) |
| vois_ecran | 151 | ✅ | auto-vérif visuelle (carnet ×3, élite ×5, courses ×1) |
| lire_document | 157/158 | ✅ | lit `.assets/recettes-mamie.md` (×4 en Élite) |
| extraire_site | 159 | ✅ | `marmiton.org` — extraction ambiance + **vision VL** |
| chercher_web | 154 | ✅ | « date-fns documentation npm » avant d'utiliser la lib |
| chercher_artefact | 156 | ✅ | app2 cherche la palette Mango `#f5a623/#fff4e6/#8b5e3c` |
| delegate (sous-agent) | 146 | ✅ | 1 délégation en Élite |
| Gardien de clôture | 161 | ✅ | a jugé **chaque** build (intention+goût+QA) — voir Constat 1 |
| Moteur de Goût (critiqueScreen) | 149/152 | ✅ | volet goût du Gardien (mais cassé — Constat 1) |

**Conclusion couverture** : les ~11 briques coopèrent réellement dans un build complet. Les compétences transmises **se composent** (ex. planifier → lire_document → extraire_site → write → check_build → teste_parcours → vois_ecran).

## ★ Constat 1 (CRITIQUE) — Le Gardien #161 a un **faux-négatif systématique sur le goût**
Sur les **3 builds**, le Gardien a rendu : **intention 95-100/100 ✓** mais **goût bloqué à EXACTEMENT 50/100 ✗**, a renvoyé corriger 2× (sans jamais bouger le score), puis a cédé en **INCOMPLET**.
- **Cause-racine trouvée** : `design-coach.ts:94` → `overall = any ? clampScore(...) : 50`. Quand la critique du VL `qwen3-vl` **n'émet pas de ligne `GLOBAL: <n>` parsable**, `parseCritique` retombe sur **50 par défaut**. 50 < seuil 70 → le Gardien boucle, mais **aucune correction ne peut satisfaire un défaut de parsing**.
- **Preuve que c'est un bug, pas une vraie note** : (a) le score est *exactement* 50 trois fois (une vraie note VL varierait) ; (b) l'intention, elle, varie (100/100/95) → le juge tourne ; (c) **les 2 apps buildent vert ET sont visiblement réussies** (snaps : hero soigné, vraies photos, palette chaleureuse, layout Apple) — manifestement ≠ 50/100.
- **Gravité** : élevée. Le Gardien **dégrade activement chaque clôture** (faux INCOMPLET) et **gaspille 2 boucles de correction** par build. C'est pire que du bruit (L19) : c'est un échec de parsing déterministe.
- **Fix** : (1) si la critique n'a pas de `GLOBAL:` parsable → **sauter le volet goût** (comme un aperçu KO), ne jamais défausser sur un 50 qui échoue ; (2) durcir le prompt VL pour imposer la ligne `GLOBAL: <0-100>` + 1 reprise si absente ; (3) ne garder la relance que si le score **progresse** (anti-thrash, déjà noté pour #152).
- → **Désigne la piste #2 (fiabiliser le Gardien) comme prioritaire**, avec le lieu de correction exact.

## ★ Constat 2 (MOYEN) — La réutilisation est **réelle mais invisible à la métrique**
`mango-courses` a **réutilisé l'identité Mango** : `chercher_artefact` a ramené la palette chaude, et le rendu reprend logo/fond crème/accent orange/esthétique de `mango-carnet` (snaps à l'appui). **Pourtant `GET /api/reuse` → `reuseRatePct = 0 %`**.
- **Cause** : `kernel-reuse-metrics.ts` ne détecte la réutilisation que via (a) lectures de chemins `.components/`/`.skills/`/`.procedures/` ou (b) recouvrement de palette sur les événements `design.produced`. **L'usage de l'outil `chercher_artefact` n'est pas instrumenté.** La fonctionnalité marche ; la mesure est aveugle.
- **Gravité** : moyenne (angle mort de mesure, pas une régression fonctionnelle).
- **Fix** : émettre un `artifact.reuse` quand `chercher_artefact` renvoie un artefact effectivement utilisé (ou compter l'overlap palette produite ↔ palette retournée). → informe la **piste #3 (L3)**.

## ✅ Constat 3 — La bascule `codeur=GLM` (#162) tient de bout en bout
3 builds complets, **2 apps qui buildent vert** (`vite build` OK) et **rendent bien** (Sharingan lu). Le flux principal (Construire MVP/Élite, runRelay, moteur agentique, tous les outils) fonctionne avec l'Élève résolu depuis le registre `codeur`. **Aucune régression du cœur.**

## ✅ Constat 4 — Souveraineté totale
`GET /api/traces` : **`totalCostUsd = 0`** (Claude), **0 erreur**, 29 spans. Tout le run (3 builds, ~11 briques, œil qwen3-vl local + juge/goût qwen cloud + Élève GLM cloud) a tourné **sans une seule escalade Claude**. Coût pour Raf = forfait Ollama Cloud (≈ $0 marginal). C'est la souveraineté visée, prouvée à l'échelle d'un vrai run.

## Axiomes observés
- **AXIOME-GATE-01** : *un gate de clôture doit SAUTER un volet dont la mesure a échoué (parsing/capture), jamais défausser sur un score qui échoue* — sinon il boucle inutilement (Constat 1).
- **AXIOME-MESURE-01** : *une capacité non instrumentée est invisible — toute brique « utile » (réutilisation, vision…) doit émettre un signal mesurable*, sinon on ne peut ni la prouver ni l'améliorer (Constat 2).
- (Le système a aussi auto-distillé **AXIOME-UX-08** pendant le run : « audit manuel avant relances supplémentaires ».)

## Recommandation de priorité
**Piste #2 (fiabiliser le Gardien #161) D'ABORD** — c'est le seul constat où une brique **se trompe activement** et dégrade chaque build (faux INCOMPLET + 2 boucles gaspillées). Le fix est petit et localisé (`design-coach.ts:94` + prompt VL + anti-thrash). Ensuite **piste #3** (instrumenter la réutilisation, Constat 2) qui rejoint l'extension L3. La piste « run » est faite : elle a livré ses limites et tranché.

## Limites honnêtes inscrites
- **L28** — Gardien : volet goût défausse sur 50 quand le VL n'émet pas `GLOBAL:` parsable (faux-négatif systématique). → `limites.md`.
- **L29** — Réutilisation via `chercher_artefact` non instrumentée → `reuseRatePct` aveugle. → `limites.md`.
- Rappel : driver du run comptait les outils via les events `status` (pas `tool`) — sans incidence (matrice extraite des journaux).

## Artefacts du run (non committés — `workspace/` gitignoré)
`workspace/mango-carnet/` (MVP+Élite, build vert) · `workspace/mango-courses/` (MVP, build vert, identité Mango réutilisée) · journaux d'outils par build (scratchpad).
