---
type: entité
tags: [auto-evolution, forge, lacunes, stratege, mangoqa, semi-auto]
statut: tranche-3-livrée
sources: ["#168"]
maj: 2026-07-01
---

# La Boucle d'auto-évolution (#168)

La marche qui fait passer Mango de **« outillé »** à **« auto-évolutif »** : quand il se bloque pendant un build et qu'**aucun [[transmission-competences|agent forgé]] ne couvre le blocage**, il l'inscrit comme **lacune ouverte**, la **propose** à Raf, et — après validation — **[[atelier-cerveaux|le forgeron Opus]] crée l'agent pile adapté au manque**. Vision de Raf : *« la super-AGI sera en grande partie composée comme ça »* — un système qui **fabrique ses propres outils** au lieu d'avoir tous ses outils figés à l'avance.

## Pourquoi (l'état d'avant)

Les briques existaient mais la boucle automatique n'était **pas fermée** (vérifié dans le code) : `limites.md` écrit à la main, `forgeAgents` déclenché manuellement (CLI/route), délégation gated sur le seul `plateau-iterations`. Trois coutures humaines entre « Mango bute » et « Mango se dote de quoi passer ».

## Le flux (tranche 1, SEMI-AUTO)

```
[Mango code une app] ─ blocage (Stratège #164) ─► un agent forgé COUVRE ?  ── OUI → délègue (déjà réel)
                                                          │ NON (lacune nouvelle)
                                              ① recordUncoveredGap → open-gaps.json (proposed)
                                              ② Raf VALIDE (POST /api/gaps/:id/forge)
                                              ③ forgeForGap → forgeron Opus + assignBrain → agent ciblé
                                              ④ markGap forged ; agent dispo pour la suite
```

## Décisions (Raf, 2026-06-29, AskUserQuestion)

- **Autonomie = SEMI-AUTO** : Mango **propose**, Raf **valide d'un clic**, le forgeron **exécute**. Aucun agent créé sans validation (posture [[mangoqa|MangoQA]] Observateur : propose, n'applique pas).
- **Store MACHINE séparé** : `data/open-gaps.json` (Mango y écrit/dédoublonne) — `limites.md` reste le **registre curé à la main** (propre, lisible).

## Modules

- **`self-evolution.ts`** (PUR, robuste, ne lève jamais) : `coversGap` (recouvrement de tokens blocage↔agent, seuil souple) · `recordUncoveredGap` (inscrit une lacune **non couverte**, dédup par signature + compteur `hits`) · store atomique (`loadGaps`/`saveGaps`, plafond 200) · `listOpenGaps`/`markGap`/`getGap`.
- **`forgeForGap(gap)`** (`agent-forge.ts`) : forge **un agent ciblé** sur la lacune — contexte de la tâche bloquée injecté, forgeron Opus + `assignBrain` (cerveau adapté), persistance.
- **Câblage `eleve.ts`** : **juste après le diagnostic**, si le blocage est un « mur de capacité » (`GAP_WORTHY_BLOCKERS`, désormais **pilotable par `SELF_EVOLVE_BLOCKERS`** — défaut plateau-iterations/wandering/knowledge-gap/wrong-tool/**repetitive-failure**), **non transitoire** (`isTransientBlocker` écarte les `fetch failed`) et qu'aucun agent ne couvre → `recordUncoveredGap` (dédup une fois par type/build). Gate **`SELF_EVOLVE` défaut OFF** (zéro régression). *(Élargi le 2026-06-29 az ; tranche 3 : pilotable + filtre transitoire + reprise auto.)*
- **`self-evolution-routes.ts`** : `GET /api/gaps` · `POST /api/gaps/:id/forge` (validation→forge) · `POST /api/gaps/:id/dismiss`.

## État

**Tranche 1 livrée et PROUVÉE LIVE** (forgeron Opus réel, registres temp, réels intacts) : blocage « synchro temps réel websocket » non couvert par les 10 agents → lacune `proposed` → validation → Opus forge « **Chef d'orchestre temps réel** » (cible rédigée seul : présence/frappe/état partagé ; cerveau auto-assigné `glm-5.2:cloud`) → lacune comblée. `tsc` 0 · **test-self-evolution 15/15** · test-agent-forge 25/25 · non-régr. eleve-runtime 49 / specialist 18+14 / brain-dispatch 38.

**Essai live sur de vrais projets (2026-06-29 az)** — a débusqué 2 bugs invisibles aux tests unitaires, corrigés : (1) **trigger trop étroit** (n'écoutait que `plateau-iterations`, le build a bloqué sur `wandering`) → hook **élargi** ; (2) **`coversGap` faux positif** (la TÂCHE faisait croire à une couverture) → couverture jugée sur le **blocage seul**. **Caveat de signal** : le cloud GLM gratuit a des `fetch failed` transitoires → faux `plateau-iterations` (à filtrer en tranche 2). C'est la propriété-clé : *la boucle s'améliore en étant utilisée et observée*.

**Tranche 2 livrée (2026-07-01) — le « frein avant moteur »** : la forge peut s'armer SANS clic, sous un **disjoncteur déterministe**. `self-evolution-autoforge.ts` (PUR, gaté `SELF_EVOLVE_AUTO` off) : `canAutoForge(config, state, est)` refuse si gate off · **plafond de forges/run** (`SELF_EVOLVE_MAX_FORGES`, déf. 1) · **garde-coût Opus** (`SELF_EVOLVE_OPUS_BUDGET_USD`, déf. 0.50) ; `recordAutoForge` comptabilise. Câblé dans `eleve.ts` au hook #168 : lacune non couverte + disjoncteur OK → `forgeForGap` s'arme seul (`forging`→`forged`) ; sinon reste `proposed` (validation humaine). **UI « Lacunes à combler »** (`AutoEvolution.jsx`, Réglages › Intelligence) : liste des lacunes + Forger/Rejeter + bandeau d'état du disjoncteur, via `GET /api/gaps` + `GET /api/gaps/config`. **21 tests** (disjoncteur) · eleve-runtime 49/0 (gate off = zéro régression) · build UI vert.

**Tranche 3 livrée (2026-07-01) — la boucle se ferme dans le même run.** Quatre volets, tous **gatés OFF par défaut** (zéro régression). **V1 — reprise auto DANS le même run** (`eleve.ts`) : après une forge réussie, au lieu d'attendre « le prochain blocage », on **consulte le spécialiste fraîchement forgé** (`consultSpecialist` le retrouve — il est persisté) et on **relance** (`buildDelegateNudge`+`continue`). Anti-boucle garanti : budget de relances + plafond forges/run (1) + `seenGapBlockers` (pas de 2ᵉ forge du même type) → re-blocage = escalade Claude normale. **V2 — filtre transitoire** (`isTransientBlocker`, `self-evolution-autoforge.ts`) : jamais de forge/relance sur un `fetch failed`/`ECONNRESET` du GLM cloud gratuit (le caveat de la tranche 1 est traité). **V3 — trigger PILOTABLE** : `resolveGapBlockers` lit `SELF_EVOLVE_BLOCKERS` (CSV, défaut = 5 classes) → élargir/restreindre sans recompiler. **V4 — nouvelle classe de diagnostic `repetitive-failure`** (`stratege-signals.ts`/`stratege.ts`/`stratege-brain.ts`) : réécriture en boucle (write+edit ≥ 5) sur build cassé, nommée AVANT le repli `ambiguous` → remède nudge « change d'approche », cerveau local, gap-worthy par défaut. **111 tests** (stratege-signals 28 · stratege 20 · stratege-brain 32 · self-evolution-autoforge 31) · build UI vert · `tsc` propre (hors `_prove-*`).

**Reste (après observation OBS)** — voir [[limites]] **L56** : la reprise auto est **codée + briques prouvées**, mais **pas encore prouvée end-to-end live** (exige backend + vrai blocage + `SELF_EVOLVE_AUTO=on`+`ELEVE_DELEGATE=on` — la « verify self-bound » de #171) ; le seuil `repetitive-failure` (5) est fixé a priori, **à calibrer pendant l'OBS** ; l'ajout de VRAIES nouvelles classes de mur (design-gap/perf-gap) reste un chantier du diagnostic à part.

## Le principe à graver

> Un système qui se forge des agents tout seul **DOIT** avoir un frein déterministe. Tranche 1 = le frein est la validation humaine ; **tranche 2 = le frein devient le disjoncteur** (plafond de forges/run + garde-coût Opus, `self-evolution-autoforge.ts`). Le moteur ne s'arme jamais sans le frein — gate OFF par défaut.

## Liens
[[le-stratege]] · [[transmission-competences]] · [[atelier-cerveaux]] · [[mangoqa]] · [[capacites-mango]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#168` (statut.md « Dernière mise à jour » ay + journal historique.md) · modules `self-evolution.ts` / `self-evolution-routes.ts` / `agent-forge.ts` (`forgeForGap`) / `eleve.ts` (détection au blocage) · [[limites]] L56.
