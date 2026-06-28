---
type: entité
tags: [eleve, gate, qa, gout, intention, boucle-agentique]
statut: livré
sources: ["#161"]
maj: 2026-06-28
---

# Gardien-clôture (gate goût/QA/intention)

Filet de **clôture** dans la boucle de l'Élève : avant que GLM ait le droit de `finish`, il vérifie **intention** (la bonne tâche ?), **goût** et **QA** — et le renvoie corriger sinon, au même titre que le build. #161.

## Rôle

Le seul filet IMPOSÉ dans la boucle agentique (`runRelay`→`buildAgentic`) était le **build** (`inspectProject` : « ça compile »). Le goût ([[moteur-gout]] #149, [[oeil-coach]] #152) et la QA WCAG (#111) restaient **en orbite** (boutons), `vois_ecran`/`teste_parcours`/[[planifier-avant-agir]] étaient **opt-in**, et l'**adéquation intention↔livré n'était vérifiée nulle part**. Le Gardien transforme ces vérifs en **gate de clôture** automatique → GLM ne « finit » que si c'est la bonne tâche, au bon goût, lisible.

**Décisions (Raf)** : les **3 vérifs** · **convergent / non-bloquant** (relance bornée puis cède avec drapeau `incomplete`, jamais un mur — fidèle à l'invariant #111 `blocking:false`) · **juge souverain DISTINCT de l'exécutant** (pas d'auto-jugement).

## Détails clés

| Volet | Brique | Détail |
|---|---|---|
| **Intention** | `eleve-judge.ts` `judgeIntention` | Compare la DEMANDE au livré (résumé du finish + extraits des fichiers écrits, confinés + `sanitizeExternal`) via le cerveau **`juge`** (qwen3.5:cloud, souverain $0, ≠ exécutant GLM). `IntentVerdict{couverture, manques[]}`. KO → verdict NEUTRE (100), ne bloque jamais à tort. |
| **Goût + QA** | `eleve-gate.ts` → `critiqueScreen` #152 | UN regard : `critiqueScreen` renvoie le score de goût (multi-lentilles, ancré sur le **goût appris** via `buildJudgeContext` #149) ET les mesures **WCAG/charte** (`measureDesign` #111, déjà incluses). |
| **Structure** (2026-06-28) | `layout-balance.ts` `findUncentered` (PUR) | 4ᵉ volet **déterministe** (comme la QA WCAG, pas le VL bruité) : scanne les fichiers écrits et repère tout conteneur à largeur max (`max-w-*` / `max-width` fixe) **sans centrage** (`mx-auto`/`margin:auto`) = contenu collé à gauche. Ignore les petits `max-w`, l'asymétrie voulue (`ml`/`mr-auto`) et les blocs auto-positionnés. `balanceOk`+`balance[]` au verdict ; opt-out `ELEVE_GATE_BALANCE`. Répond au biais « collé à gauche ». **Aussi câblée TOUJOURS ACTIVE dans la boucle de build** (`eleve.ts`, sur build-vert+finish, $0/sans cloud) — donc le filet anti-« collé à gauche » tourne par défaut **sans** l'opt-in du Gardien (L54 ✅). |
| **Orchestration** | `eleve-gate.ts` `runClosureGate` | Agrège → `raisons[]` (manques + correctifs priorisés + écarts WCAG + blocs non centrés). `buildGateNudge` (préfixe le plan #160), `evaluateGate` (décision pure ; la structure est un signal FIABLE → relance comme l'intention/WCAG, hors anti-thrash goût). |

**⚠ Anti-récursion (capital)** : le Gardien appelle `critiqueScreen` (critique en **lecture**), JAMAIS `runDesignCoach` (qui rappellerait `runRelay`). La **correction est faite par la boucle `runRelay` existante** (nudge/relances). Le Gardien critique, le moteur corrige.

**Branchement** : `eleve.ts`, moteur agentique, avant le succès ; gaté **`ELEVE_CLOSURE_GATE=on`** (défaut OFF), compteur `gateRelances` **séparé** du budget anti-blocage, seuils par env (`ELEVE_GATE_INTENT_MIN`/`TASTE_MIN`/`WCAG_MAX_FAILS`/`RELANCE_MAX`). Aperçu KO (tâche non-UI) → volet goût/QA sauté, intention seule.

## Fiabilisation (piste #2, 2026-06-26 — L28 ✅)

Le [[run-validation|run grandeur nature]] du 2026-06-25 a révélé un **faux-négatif systématique sur le goût** : le Gardien cédait INCOMPLET sur 3/3 apps vertes et réussies parce que `parseCritique` **défaussait sur 50** quand le VL `qwen3-vl` rendait une critique hors-format (sans `GLOBAL: <n>`). 50 < seuil 70 → faux échec **déterministe** (pire que le bruit L19), 2 relances qui ne réparaient qu'un défaut de *parsing*. Corrigé en 3 volets (**AXIOME-GATE-01** : *un gate doit SAUTER un volet dont la mesure a échoué, jamais défausser sur un score qui échoue*) :

1. **Flag `scored`** (`DesignCritique`) — un score n'est *fiable* que s'il vient d'un `GLOBAL:` ou de lentilles. Repli (prose) → `scored:false`. `runClosureGate` **saute alors le volet goût** (comme un aperçu KO) mais **garde la QA WCAG** (`measureDesign`, objective, indépendante du VL). Plus jamais de faux 50 jugé.
2. **Reprise VL** — `critiqueScreen` refait **1 appel** avec un rappel de format strict (`GLOBAL: <0-100>` obligatoire) si la 1ʳᵉ réponse n'est pas scorée ; échec → reste `scored:false` (jamais de note fabriquée).
3. **Anti-thrash** — `evaluateGate(prevGout)` cède (laisse-passer) si le goût est le **seul** levier qui bloque ET qu'il **n'a pas progressé** depuis la correction précédente ; `eleve.ts` mémorise `prevGateGout`. `runDesignCoach` rend la main (`non-jugeable`) si le 1er regard n'est pas scoré.

`GateVerdict` expose désormais `intentOk`/`tasteScored`/`tasteOk`/`wcagOk`. Tests : design-coach **29** · eleve-gate **27** · design-metrics 28, `tsc` vert, aucun fichier UI touché.

## Garde de CADRE (piste #2 du juge d'intention, 2026-06-28 — L40 ✅)
Le juge d'intention notait **100/100 alors que le CADRE livré ne correspond pas** (cas réel `jeu-de-petanques` : user voulait Unity/3D/natif Android, livré = React/2D/web). La cause AMONT était déjà traitée (conscience des limites, cf. [[capacites-mango]]) ; restait à durcir le juge. **`applyScopeGuard(verdict, task)`** (eleve-judge.ts) — PUR : lance `detectOutOfScope(task)` ([[capacites-mango]]) ; si une famille hors périmètre est demandée (Unity, natif iOS/Android, Flutter, desktop natif), **plafonne `couverture` à `SCOPE_MISMATCH_CAP` (40)** (jamais à la hausse) + préfixe un manque « cadre hors périmètre », **quoi que dise le juge LLM**. Appliqué à TOUS les chemins de `judgeIntention`, **y compris le verdict NEUTRE** → **atout : détecte le mismatch SANS réseau, donc même juge cloud indisponible**. Opt-out `JUDGE_SCOPE_GUARD=off`. Reste convergent/non-bloquant. `test-eleve-judge 25/25` (+11).

## État

**Livré et prouvé live** (#161). LIVE (`runRelay`, vrai GLM + juge qwen + critiqueScreen, $0, seuil goût forcé 99) : GLM finit → `🛡 intention 100/100, goût 76/100 ✗` → GLM **applique les correctifs du Gardien sur 2 fichiers** → re-critique 71 ✗ → laisse passer + `incomplete`. Tests : judge 12 · gate **27** · brain-dispatch 35 (11 agents). **Fiabilisé 2026-06-26 (L28 ✅, piste #2)** — voir la section ci-dessus.

**Limites** : L19 (juge LLM faillible — bruit du VL, cf. [[oeil-coach]] ; atténué par non-bloquant + l'anti-thrash de la piste #2) · L20 (goût/QA exige un rendu → sauté pour le backend) · L21 (juge sur résumé+fichiers, pas un vrai `git diff`) · **L28 ✅ Résolu** (faux 50 du volet goût) · **L40 ✅ Résolu** (mismatch de cadre détecté par `applyScopeGuard`, même sans cloud).

## Liens
[[oeil-coach]] · [[moteur-gout]] · [[planifier-avant-agir]] · [[transmission-competences]] · [[brains]] · [[mangoqa]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#161` (statut.md tableau + journal historique.md) · modules `eleve-judge.ts` / `eleve-gate.ts` / `brain-registry.*` / `eleve.ts`.
