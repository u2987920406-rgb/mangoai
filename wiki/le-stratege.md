---
type: entite
tags: [stratege, raisonnement, deblocage, manager, souverainete, eleve]
statut: en-cours
sources: ["#164"]
maj: 2026-06-26
---

# Le Stratège (#164) — le raisonnement de déblocage de Mango

Donner à **Mango le manager** la capacité de **raisonner face à un blocage** de son exécutant (l'[[eleve-local|Élève]]) : diagnostiquer *pourquoi* ça bloque, **choisir** activement un remède (se documenter, ressortir une procédure passée, installer une dépendance, reformuler/décomposer, changer de cerveau, réparer une ressource), puis **apprendre** du déblocage réussi. **On n'améliore pas le cerveau** (poids figés) — on rend **Mango** plus malin comme manager.

## Rôle

Tous les blocages de la session du 2026-06-26 ont été réglés par un **réflexe codé à la main** (L17 sur-exploration, L30 image cassée). Ça ne passe pas à l'échelle : chaque imprévu neuf = Claude qui revient coder. Le Stratège vise un Mango qui **se débloque seul** → le vrai pas vers la **souveraineté**, en faisant enfin **coopérer** des briques déjà là mais isolées : [[transmission-competences|chercher_web #154]], **procédures #75**, [[brain-dispatch]] #150, add_dependency #146, delegate, axiomes.

## Les 3 conditions non négociables (sinon ça se retourne contre nous)
- **(A) Déterministe d'abord** — diagnostic en code pur sur signaux observables ; cerveau seulement sur les cas ambigus, en **sortie contrainte**. Tue le bruit LLM (cf. L19).
- **(B) Borné & souverain** — budget de déblocage, **cerveau local `gemma4:12b`** ($0 réel, pas de cloud payant ; l'Élève GLM/qwen tourne sur Ollama Cloud ≈ 20 €/mois), jamais de boucle. Banc d'essai du **tout-local quantizé** visé par Raf.
- **(C) Ferme la boucle** — un remède qui marche → **procédure #75 réutilisée**. C'est ce qui fait que Mango *acquiert* du raisonnement (≠ empiler des réflexes). **Sans (C), on s'arrête.**

## Architecture
Point d'intégration : dans `eleve.ts`, là où le remède était une **séquence FIXE** (`nudge → relance → escalade`), Le Stratège **choisit** : SYMPTÔMES → MÉMOIRE (déjà vu ?) → DIAGNOSTIC (déterministe) → STRATÉGIE → ACTION → APPREND.

### Catalogue de blocages (dérivé du réel)
`missing-dependency` · `knowledge-gap` · `wrong-tool` · `flaky-resource` · `wandering` · `plateau-iterations` · `ambiguous` (+ `none`). Chaque classe est née d'un blocage réellement rencontré.

## État — Phase 0/4 livrée (observe-only)
`stratege-signals.ts` : `BlockerSymptoms` (signaux déjà captés par eleve.ts) + `diagnose()` **PUR déterministe** (extrait même le module manquant) + `formatDiagnosis` (« 🧠 Stratège pense à voix haute »). Branché **OBSERVE-ONLY** dans la boucle (gaté `ELEVE_STRATEGE`, défaut OFF → **n'agit pas**). **test-stratege-signals 23** : le classifieur nomme correctement tous nos blocages réels (react-router manquant, recharts knowledge-gap, tide/dressing wandering, terroir image morte, plateau, mauvais outil). `tsc` 0.

**Reste** : Phase 1 (routeur déterministe top-3 → remède CHOISI) · **Phase 2 (boucle d'apprentissage procédures #75 — la condition C)** · Phase 3 (cerveau Stratège local gemma4:12b, cas ambigus) · Phase 4 (swap de cerveau + métrique de souveraineté = taux d'escalade Claude qui BAISSE projet après projet).

## Liens
[[eleve-local]] · [[brain-dispatch]] · [[planifier-avant-agir]] (L17) · [[transmission-competences]] · [[gardien-cloture]] · [[boucle-curation]] · [[limites]] · [[statut]] · [[historique]]

## Sources
`#164` (plan `docs/plan-164-le-stratege.md` ; statut.md + historique.md) · module `stratege-signals.ts` / branchement `eleve.ts`.
