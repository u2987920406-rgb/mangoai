---
type: entité
tags: [auto-evolution, forge, lacunes, stratege, mangoqa, semi-auto]
statut: tranche-1-livrée
sources: ["#168"]
maj: 2026-06-29
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
- **Câblage `eleve.ts`** : au blocage `plateau-iterations`, si aucun agent ne couvre → `recordUncoveredGap`. Gate **`SELF_EVOLVE` défaut OFF** (zéro régression).
- **`self-evolution-routes.ts`** : `GET /api/gaps` · `POST /api/gaps/:id/forge` (validation→forge) · `POST /api/gaps/:id/dismiss`.

## État

**Tranche 1 livrée et PROUVÉE LIVE** (forgeron Opus réel, registres temp, réels intacts) : blocage « synchro temps réel websocket » non couvert par les 10 agents → lacune `proposed` → validation → Opus forge « **Chef d'orchestre temps réel** » (cible rédigée seul : présence/frappe/état partagé ; cerveau auto-assigné `glm-5.2:cloud`) → lacune comblée. `tsc` 0 · **test-self-evolution 14/14** · test-agent-forge 25/25 · non-régr. eleve-runtime 49 / specialist 18+14 / brain-dispatch 38.

**Reste (tranches 2-3, après [[audit-souverainete|observation OBS]])** — voir [[limites]] **L56** : UI « Lacunes à combler » dans l'Atelier · **forge auto-armée sous Disjoncteur [[mangoqa]]** (plafond forges/run + garde-coût Opus) · **reprise auto** de la tâche · déclencheur élargi (tout blocage, pas que `plateau-iterations`).

## Le principe à graver

> Un système qui se forge des agents tout seul **DOIT** avoir un frein déterministe. Tranche 1 = le frein est la validation humaine ; tranche 2 = le frein devient le Disjoncteur MangoQA. Le moteur ne s'arme jamais sans le frein.

## Liens
[[le-stratege]] · [[transmission-competences]] · [[atelier-cerveaux]] · [[mangoqa]] · [[capacites-mango]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#168` (statut.md « Dernière mise à jour » ay + journal historique.md) · modules `self-evolution.ts` / `self-evolution-routes.ts` / `agent-forge.ts` (`forgeForGap`) / `eleve.ts` (détection au blocage) · [[limites]] L56.
