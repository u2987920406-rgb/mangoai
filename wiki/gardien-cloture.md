---
type: entité
tags: [eleve, gate, qa, gout, intention, boucle-agentique]
statut: livré
sources: ["#161", "nuit 2026-07-03", "#190 (2026-07-19)"]
maj: 2026-07-19
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
| **Images** (2026-07-19) | `eleve-gate-images.ts`, gate `ELEVE_GATE_IMAGES` (opt-in) | Répond à L114 (pertinence sémantique image↔contexte) + L116 (images tronquées/mal cadrées) — item #190. Capture l'écran final et demande un verdict VL CIBLÉ, prompt court fermé sur 2 lignes (`CADRAGE:`/`CONTEXTE:` OK/PROBLEME) — pas la critique de goût multi-lentilles (leçon L34 : un petit VL répond vide si le prompt est trop long avec une image). Fail-open : capture indisponible ou réponse illisible → volet neutre. |
| **Constantes** (2026-07-19) | `eleve-gate-constants.ts`, gate `ELEVE_GATE_CONSTANTS` (opt-in) | Répond à L117 (constante physique fausse, ex. vitesse orbitale de Saturne dans `systeme-solaire`) — item #190. Portée délibérément étroite et 100% souveraine ($0, zéro réseau/LLM) : table curée des vitesses orbitales planétaires (IAU/NASA), extraction par heuristique texte dans le code généré, tolérance 20%. Non applicable si aucune constante planétaire détectée → neutre. |
| **Biais de position** (2026-07-19) | étage `checkBiaisPosition` dans le volet PÉDAGO existant (`eleve-gate-pedago.ts`) | Répond à L115 (quiz généré avec la bonne réponse toujours à la même position, ex. "a" sur `toeic-quest`) — item #190. Flag une position dominante >50% sur ≥5 QCM d'un module. |

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

## Clôture APRÈS le Maître + reboucle (chantier « les 3 correctifs dans le cœur », 2026-07-01)

Le Gardien (et les autres garde-fous) ne s'armaient QUE dans la boucle de l'Élève : dès que l'Élève **escaladait au Maître** (Claude), `finalizeEscalation` renvoyait le build vert **sans repasser** intention/goût/QA, ni `teste_parcours`, ni MangoQA → les garde-fous étaient **court-circuités par l'escalade** (le trou exact signalé par Raf : « pourquoi pas d'auto-vérif / auto-correction / MangoQA / juge après ? »). Corrigé — **3 correctifs + une reboucle, dans le cœur** (`eleve.ts`), gatés OFF (zéro régression) :

1. **Gardien après le Maître** — après résolution par le Maître, `runClosureGate` (intention + goût + QA) re-tourne (`ELEVE_CLOSURE_GATE=on`).
2. **`teste_parcours` de clôture** (`runClosureParcours`) — ouvre la preview et vérifie qu'**aucune erreur console** n'apparaît, **côté Élève ET côté Maître** (`ELEVE_GATE_PARCOURS=on`). Fail-open (preview injoignable → pas d'erreur inventée).
3. **MangoQA de clôture** (`runClosureMangoQA`) — si le watcher MangoQA tourne (sentinelle [[mangoqa]]), émet le signal de phase et attend le verdict ; un **RED devient un critère de re-correction** (timeout paramétrable `MANGOQA_CLOSURE_TIMEOUT`, défaut 60 s). Fail-open.
4. **Le Maître RE-CORRIGE sur RED** — `finalizeEscalation` devient une **boucle bornée** (`ELEVE_GATE_RELANCE_MAX`, défaut 2) : clôture RED → le Maître ré-escalade avec le feedback précis (« Le livrable compile mais ne passe pas la clôture qualité : … ») au lieu de juste signaler ; gates tous OFF → `issues` vide → 1 escalade → retour (comportement historique).

**Prouvé LIVE 2026-07-01** (100 % via MangoOS, `ELEVE_GATE_PARCOURS=on` + MangoQA actif, sans intervention dans la boucle) : GLM `fetch failed` → `⤴ ESCALADE MAÎTRE` → build vert ($1.75) → `🛡 Gardien (après Maître) intention 0/goût 65 ✗` + `🧭 teste_parcours ✓` + `🥭 MangoQA RED ✗` → `↻ Clôture RED → le Maître RE-CORRIGE (1/1)` → 2ᵉ build vert ($1.47) → clôture encore RED → **livré INCOMPLET assumé** (coût borné $3.22). Tests : eleve-runtime 49 · eleve-gate 40 · eleve-parcours-tools 20. **Limites honnêtes révélées** : `intention 0/100` après le Maître (le juge reçoit un résumé placeholder `"résolu par le Maître"`) → [[limites|L69]] ; OOM du watcher MangoQA (disjoncteur qui re-logge les états périmés) → [[limites|L70]].

## Le Gardien retrouve ses dents (nuit 2026-07-03)

Trois durcissements issus de l'audit de nuit (« build-vert ≠ réussi », règle ⭐⭐⭐) :

1. **Goût réarmé** — (a) `GATE_TASTE_AXIOMS_CHARS` passé de 0 → **1500** en .env : le goût appris était entièrement DROPPÉ du prompt du VL (le cap 0 datait du VL local 8b, or le rôle vision du brain-registry est **qwen3.5:cloud**) ; (b) **plancher même en observe** : `ELEVE_GATE_TASTE_FLOOR` (déf. 50) — un score FIABLE sous le plancher bloque désormais (raison « ÉCHEC GROSSIER »), l'observe ne couvre plus les échecs grossiers. Anti-thrash L28 préservé.
2. **Garde « vraies images »** (5ᵉ volet déterministe) — `scanFilesForPlaceholders` (même mécanique que la garde d'équilibre) : une URL de placeholder aléatoire QUI CHARGE (picsum, loremflickr, via.placeholder, unsplash.it, placekitten, placehold.co, dummyimage…) passait le check 404 et toutes les clôtures. Détectée dans les fichiers écrits → raison IMAGES + consigne `chercher_image` ; `placeholdersOk`/`placeholders[]` au verdict, opt-out `ELEVE_GATE_PLACEHOLDERS=off`, signal FIABLE dans `evaluateGate`.
3. **Parcours de clôture non-silencieux** — `ELEVE_GATE_PARCOURS=on` en .env, et le fail-open de `runClosureParcours` expose `skipped` : un saut (preview injoignable) est LOGGÉ « sauté (…) — NON vérifié ⚠ » au lieu d'être indiscernable d'un vrai ✓.

Et côté boucle : les **relances du Gardien ne sont plus aveugles** — `buildEleveUser` est reconstruit à chaque relance (la liste des fichiers datait d'AVANT la 1ʳᵉ tentative) + le nudge rappelle les fichiers déjà écrits (`changedFilesFromTrace`) ; budget `ELEVE_GATE_RELANCE_MAX=3`. Tests : eleve-gate **49/0** (dont plancher observe + placeholders + opt-outs).

## État

**Livré et prouvé live** (#161). LIVE (`runRelay`, vrai GLM + juge qwen + critiqueScreen, $0, seuil goût forcé 99) : GLM finit → `🛡 intention 100/100, goût 76/100 ✗` → GLM **applique les correctifs du Gardien sur 2 fichiers** → re-critique 71 ✗ → laisse passer + `incomplete`. Tests : judge 12 · gate **27** · brain-dispatch 35 (11 agents). **Fiabilisé 2026-06-26 (L28 ✅, piste #2)** — voir la section ci-dessus.

**Limites** : L19 (juge LLM faillible — bruit du VL, cf. [[oeil-coach]] ; atténué par non-bloquant + l'anti-thrash de la piste #2) · L20 (goût/QA exige un rendu → sauté pour le backend) · L21 (juge sur résumé+fichiers, pas un vrai `git diff`) · **L28 ✅ Résolu** (faux 50 du volet goût) · **L40 ✅ Résolu** (mismatch de cadre détecté par `applyScopeGuard`, même sans cloud) · **L69** (intention aveugle après le Maître — résumé placeholder) · **L70** (OOM du watcher MangoQA sur états périmés).

## Liens
[[oeil-coach]] · [[moteur-gout]] · [[planifier-avant-agir]] · [[transmission-competences]] · [[brains]] · [[mangoqa]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#161` (statut.md tableau + journal historique.md) · modules `eleve-judge.ts` / `eleve-gate.ts` / `brain-registry.*` / `eleve.ts`.
