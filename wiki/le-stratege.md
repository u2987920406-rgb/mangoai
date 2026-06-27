---
type: entite
tags: [stratege, raisonnement, deblocage, manager, souverainete, eleve]
statut: complet
sources: ["#164"]
maj: 2026-06-27
---

# Le Stratège (#164) — le raisonnement de déblocage de Mango

Donner à **Mango le manager** la capacité de **raisonner face à un blocage** de son exécutant (l'[[eleve-local|Élève]]) : diagnostiquer *pourquoi* ça bloque, **choisir** activement un remède (se documenter, ressortir une procédure passée, installer une dépendance, reformuler/décomposer, changer de cerveau, réparer une ressource), puis **apprendre** du déblocage réussi. **On n'améliore pas le cerveau** (poids figés) — on rend **Mango** plus malin comme manager.

## Rôle

Tous les blocages de la session du 2026-06-26 ont été réglés par un **réflexe codé à la main** (L17 sur-exploration, L30 image cassée). Ça ne passe pas à l'échelle : chaque imprévu neuf = Claude qui revient coder. Le Stratège vise un Mango qui **se débloque seul** → le vrai pas vers la **souveraineté**, en faisant enfin **coopérer** des briques déjà là mais isolées : [[transmission-competences|chercher_web #154]], **procédures #75**, [[brain-dispatch]] #150, add_dependency #146, delegate, axiomes.

## Les 3 conditions non négociables (sinon ça se retourne contre nous)
- **(A) Déterministe d'abord** — diagnostic en code pur sur signaux observables ; cerveau seulement sur les cas ambigus, en **sortie contrainte**. Tue le bruit LLM (cf. L19).
- **(B) Borné, frugal d'abord — mais la RÉSOLUTION prime** (refinement Raf) — « borné » = pas de boucle infinie, **PAS** « coincé sur le moins cher ». **Échelle d'escalade** automatique : **déterministe $0 → `gemma4:12b` local $0 → cloud supérieur** (`glm-5.2:cloud`…, marginal €) **→ Claude opt-in**. On essaie le moins cher d'abord et on **monte d'un cran si ça ne résout pas** (mieux vaut 2 centimes de cloud qu'un blocage). Les barreaux cloud-Ollama s'insèrent **avant** Claude → **moins de dépendance à Claude**. Tier supérieur configurable (Atelier #162). Horizon : tout-local quantizé sur le hardware de Raf.
- **(C) Ferme la boucle** — un remède qui marche → **procédure #75 réutilisée**. C'est ce qui fait que Mango *acquiert* du raisonnement (≠ empiler des réflexes). **Sans (C), on s'arrête.**

## Architecture
Point d'intégration : dans `eleve.ts`, là où le remède était une **séquence FIXE** (`nudge → relance → escalade`), Le Stratège **choisit** : SYMPTÔMES → MÉMOIRE (déjà vu ?) → DIAGNOSTIC (déterministe) → STRATÉGIE → ACTION → APPREND.

### Catalogue de blocages (dérivé du réel)
`missing-dependency` · `knowledge-gap` · `wrong-tool` · `flaky-resource` · `wandering` · `plateau-iterations` · `ambiguous` (+ `none`). Chaque classe est née d'un blocage réellement rencontré.

## État — ✅ COMPLET (Phases 0·1·2·3·4 livrées)
- **P0 ✅ (observe-only)** — `stratege-signals.ts` : `BlockerSymptoms` (signaux déjà captés) + `diagnose()` **PUR déterministe** (extrait même le module manquant) + `formatDiagnosis`. Gaté `ELEVE_STRATEGE` (défaut OFF). **test-stratege-signals 23**.
- **P1 ✅ (routeur déterministe)** — `stratege.ts` `route(diagnosis, state)` (PUR, borné par `StrategeState` : budget + pas deux fois le même remède) → remède CHOISI : missing-dependency → **installe la lib + relance** · knowledge-gap → nudge web · wandering → ré-ancre le plan · plateau → décompose (delegate). Câblé aux 2 points de blocage d'`eleve.ts`. **Prouvé live** (vrai npm) : `import gsap` casse → install gsap → build vert. **test-stratege 19**.
- **P2 ✅ (apprentissage — condition C)** — `stratege-learn.ts` : un remède RÉUSSI → **procédure #75** (slug stable par classe = idempotent, embed) + **rappelée** sémantiquement au prochain blocage du même type. Gaté `ELEVE_STRATEGE_LEARN`. **Prouvé live** (embed réel) : `gsap` distillé → rappelé pour `three`, ignoré pour une autre classe. **Le compounding tourne.** **test-stratege-learn 11**.
- **P3 ✅ (cerveau cas ambigus + échelle d'escalade)** — `stratege-brain.ts` : sur `blocker === "ambiguous"`, `reclassifyAmbiguous()` consulte un cerveau en **SORTIE CONTRAINTE** (choisit UNE classe d'un catalogue FERMÉ ; hors-catalogue/« inconnu » → reste ambigu, repli sûr). **Échelle d'escalade BORNÉE** : barreau 1 agent **`stratege` = `gemma4:12b` LOCAL $0** (registre) → si non tranché ET `STRATEGE_BRAIN_ESCALATE=on` → barreau 2 cloud supérieur configurable (`STRATEGE_ESCALATE_AGENT`), **2 appels max, aucune boucle**. Parseur pur, dispatch injectable, ne lève jamais. Câblé via `strategeDiagnoseRefined()`, gaté **`ELEVE_STRATEGE_BRAIN`** (off/observe/on). **Leçon TRINITY** (voir [[veille-sakana-fugu]]) : un petit cerveau local suffit à *classer* (il ne résout rien). **Prouvé live** (`gemma4:12b` local, $0) : ambigu « ReferenceError, prop inexistante dans cette version de la lib de charts » → reclassé **`knowledge-gap`** (raisonnement juste) → remède `chercher_web`. **test-stratege-brain 31** · brain-dispatch 37 (12 agents). Limite [[limites|L38]] (cold-load ~45 s, atténué timeout 90 s).

- **P4 ✅ (escalade exécutant + métrique souveraineté)** — `stratege-escalate.ts` : sur **`brain-inadequate`** (un blocage RÉCIDIVE après que son remède a déjà été tenté → `isBrainInadequate` = classe dans `strategeState.tried`), on **MONTE le cerveau de l'Élève d'un cran** au lieu d'abandonner. `executorLadder` (barreau 0 courant → barreau 1 cloud supérieur **configurable** `STRATEGE_EXEC_ESCALATE_MODEL`/`_PROVIDER`) + `nextExecutorRung` (**borné : null au sommet, jamais de descente, aucune boucle**). Câblé `eleve.ts` (`tryBrainEscalation` **swap `runCtx.post`**), gaté **`ELEVE_BRAIN_ESCALATE`** (off ; sans supérieur configuré → comportement inchangé). **Claude n'est PAS un barreau** (filet séparé `ELEVE_ESCALATE_ON_BLOCK`) → barreaux cloud-Ollama AVANT lui = moins de dépendance à Claude. **Métrique de souveraineté** `sovereignty-metrics.ts` (PUR sur `.metrics.jsonl`, **rien réinventé**) : `sovereigntyReport` (taux d'escalade Claude `resolvedBy==="maitre"` par projet + global) + `sovereigntyTrend` (récent vs précédent, `improving`/`sampleSufficient`) ; endpoint **`GET /api/sovereignty`**. **Prouvé live** sur **1778 tours réels** : 🏴 16% Élève / 77% Claude (passif ancien) **mais projets récents 0% Claude**. **test-stratege-escalate 19 · test-sovereignty-metrics 16.** Limite [[limites|L39]] (swap prouvé unitaire, pas encore bout-en-bout live).

**#164 est COMPLET.** Le manager de Mango : diagnostique (P0) → route un remède (P1) → apprend (P2) → tranche l'ambigu avec un cerveau frugal (P3) → monte le cerveau de son exécutant et **mesure sa dépendance à Claude** (P4). Objectif de fond mesurable : le **taux d'escalade Claude doit baisser projet après projet**.

## Pistes issues de la veille Sakana ([[trinity]] / [[conductor]])
Le Stratège est complet ; ces pistes sont les **prochaines marches d'expressivité**, validées par la recherche externe (détail + correspondance dans `docs/plan-164` § « Pistes issues de la veille Sakana »). Aucune n'est urgente (cap [[souverainete-progressive]] : observer d'abord).
- **CMA-ES sur `diagnose()`** ([[trinity]], condition A) : optimiser les **seuils/poids** du diagnostic par **évolution sans gradient** (sep-CMA-ES) sur l'historique des runs — souverain, déterministe-compatible, **avant** tout RL.
- **Rôle « Penseur » distinct** ([[conductor]]) : un cerveau qui pose le plan **avant** que l'Élève code, séparé de [[planifier-avant-agir]] (aujourd'hui dilué). Complète la triade Thinker/Worker/Verifier (Exécutant + Vérificateur existent déjà).
- **Contexte visible par agent** ([[conductor]]) : borner le **contexte injecté** au worker dans `eleve.ts` (qui·quoi·contexte) → moins de bruit/tokens/dérive (anti-L17).
- **Triade réassignable** ([[trinity]]) : rendre Penseur/Exécutant/Vérificateur **interchangeables sous la main du Stratège**, pas figés en modules.
- **Récursion → persistance** ([[conductor]]) : « se relire, repérer l'échec, corriger » au test-time — Mango le **persiste** déjà en procédure #75 (avantage souverain à pousser).

## Liens
[[eleve-local]] · [[brain-dispatch]] · [[planifier-avant-agir]] (L17) · [[transmission-competences]] · [[gardien-cloture]] · [[veille-sakana-fugu]] · [[trinity]] (leçon frugalité) · [[conductor]] (horizon RL) · [[boucle-curation]] · [[limites]] · [[statut]] · [[historique]]

## Sources
`#164` (plan `docs/plan-164-le-stratege.md` ; statut.md + historique.md) · module `stratege-signals.ts` / branchement `eleve.ts`.
