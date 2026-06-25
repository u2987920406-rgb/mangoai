---
type: entite
tags: [design, vision, critique, ui-ux, souverain, boucle]
statut: livré-prouvé-live
sources: [statut #152, historique 2026-06-25]
maj: 2026-06-26
---

# L'Œil-Coach

> Le vrai **saut UI/UX** (#152) : pas « plus d'images » (ça pousse au générique), mais un **œil plus fort qui PILOTE l'itération**. Il critique le rendu sur **plusieurs lentilles**, produit des **correctifs concrets**, fait **GLM les appliquer** ($0), puis **re-regarde** — en boucle bornée jusqu'à un **seuil de qualité**. Conçu avec Raf le 2026-06-25, livré et prouvé live.

## Rôle

Combler le trou entre **noter** et **corriger**. [[moteur-gout]] (juge-pixels #66) donne UN score mono-axe ; [[sharingan-vision-eleve]] (`vois_ecran` #151) une critique prose ; l'Œil Design #111 (MangoQA) mesure le WCAG/tokens — mais rien ne **combinait** une critique multi-dimensions actionnable avec une **boucle d'auto-correction**. L'Œil-Coach est la réponse de Mango au « le Sharingan + les recherches web ne suffisent pas toujours » : le levier n'est pas externe (images génériques), il est **interne** — un directeur artistique qui regarde, juge sur 7 axes, et pilote la correction.

## Détails clés

- **7 lentilles** : hiérarchie · espacement & rythme · échelle typographique · harmonie chromatique · alignement · densité & respiration · cohérence. Chacune notée 0-100 + **l'écart le plus important → un correctif CONCRET** (quoi changer précisément). Le contraste/a11y est traité **objectivement** et injecté.
- **Deux sources fusionnées** : le **goût appris** (`buildJudgeContext` = axiomes VISION/UIUX `[validé-utilisateur]` + `.design-system.md`) ET des **mesures OBJECTIVES** déterministes (`design-metrics.ts` : contraste WCAG + hors-palette — réimplémentation locale de l'Œil Design #111, ≈100 l. pures, pour garder la boucle synchrone sans couplage cross-repo). Le prompt est **EXIGEANT** : 85+ réservé au vraiment soigné, pas au générique.
- **La boucle** (`runDesignCoach`) : round 0 = critique « avant » ; tant que `overall < seuil(85) && round < max(3)` → `prioritizedFixes` (les pires lentilles d'abord) → `coachPrompt` → **`runRelay`** (GLM édite, $0) → re-critique → stream. **Anti-thrash** : stop si le score ne progresse pas d'un tour. **Non-jugeable (2026-06-26, L28)** : si le tout 1er regard n'a pas de score *fiable* (`scored:false` — VL hors-format), la boucle rend la main immédiatement (raison `non-jugeable`) au lieu de piloter une boucle d'édition sur un faux 50. Renvoie `{before, after, rounds, history, reason}`.
- **Pur & testable** : `parseCritique`/`prioritizedFixes`/la boucle sont testés avec aperçu/capture/cerveau/édition **injectés** (`test-design-coach` **29**, `test-design-metrics` 28).
- **Surface** : bouton **« Coach design »** (icône œil) sur le projet ouvert (`Chat.jsx`) → `POST /api/design-coach/:project` (SSE) → cartes par lentille + correctifs + **avant→après** dans le chat. Verrou par projet (la boucle édite).
- **Prouvé live** : critique de `mango-cafe-ts` → **72/100**, 7 lentilles + correctifs précis (espacement 60 « CTA trop collés → gap », harmonie 65 « outline fade → bg-white/10 », densité 70, cohérence 75…) ; boucle 1 tour = GLM édite les bons fichiers (`Accueil.tsx`, `Root.tsx`), `check_build`, s'auto-vérifie via `vois_ecran`, l'anti-thrash s'arrête proprement.
- **Limite identifiée (au run)** : le juge VL à **un seul échantillon est bruité** (`avant 78 → après 68` sur un tour = variance du modèle, pas une vraie régression). Le **mécanisme** est prouvé de bout en bout ; la **monotonie numérique** du score ne l'est pas. **v1.1** : moyenner le juge (multi-échantillons / passes par lentille) + **ne garder l'édit que s'il fait progresser** (revert sinon — les édits sont versionnés). La valeur SOLIDE = la **critique actionnable** ; la **convergence** se durcira.
- **Parsing durci (2026-06-26, L28)** : `parseCritique` distingue désormais un score **fiable** (`GLOBAL:` ou lentilles) d'un **repli** (prose hors-format) via le flag **`scored`** — fini le faux 50 qui plombait le [[gardien-cloture]]. `critiqueScreen` fait **1 reprise** avec rappel de format strict avant de renoncer. Voir [[gardien-cloture]] pour le détail (le Gardien réutilise `critiqueScreen`).

## Liens

- [[moteur-gout]] — le juge-pixels #66 que l'Œil-Coach généralise (mono-axe → multi-lentilles + boucle).
- [[sharingan-vision-eleve]] — `dispatch('vision')` → `qwen3.5:cloud` (le cerveau qui regarde) + `vois_ecran` (l'auto-vérif de GLM pendant la correction).
- [[eleve-local]] — `runRelay` : GLM applique les correctifs à $0.
- [[vision]] — `capturePreview` (le rendu critiqué).
- [[memoire-expertise]] — axiomes VISION/UIUX + `.design-system.md` injectés comme « goût appris ».

## Sources

- [[statut]] — idée **#152** (✅ FAIT — prouvé live).
- [[historique]] — journal du 2026-06-25.
