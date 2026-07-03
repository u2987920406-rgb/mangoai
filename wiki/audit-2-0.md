---
type: entité
tags: [audit, refonte, dette-technique, ui, backend]
statut: livré
sources: ["docs/audit-mango-2.0.md"]
maj: 2026-07-02
---

# Audit 2.0 (préparation refonte)

Audit complet de MangoOS (2026-07-02, 3 explorations parallèles : backend · UI · docs/limites) demandé par Raf pour préparer une **refonte 2.0** avec un UI/UX « très très qualitatif et ergonomique ». Rapport complet : `docs/audit-mango-2.0.md`.

## Verdict

**Le moteur est mature (consolider, pas réécrire) ; l'interface est le vrai chantier.** Le backend a une colonne vertébrale remarquable (injection `*Deps`, [[kernel]] 5 piliers, fail-open, gates, zéro cycle) mais une dette d'ORGANISATION (index.ts 98 imports · ~140 env vars · ~170 test/run mélangés au noyau · singletons mono-instance). L'UI a d'excellents acquis UX ([[bureau-os]], dock, thème, toasts) mais AUCUNE fondation d'ingénierie : pas de design system (~50 variantes de Button inline), 427 useState / 0 Context, 176 fetch() directs, a11y WCAG F, desktop-only, zéro TypeScript.

## Re-cadrage produit (Raf, 2026-07-02, même jour)

Raf confirme les invariants moteur (**GLM 5.2 souverain ~95 %, Claude ~5 % d'escalade, [[mangoqa]] fantôme**) et élargit la 2.0 en **refonte globale** : rationaliser le catalogue (supprimer doublons/inutiles) + refonte visuelle **très pro** façon ChatGPT/Gemini/Cursor. **Paradigme acté (AskUserQuestion)** : hybride **sidebar fixe + panneau principal**, fenêtres flottantes rétrogradées aux outils secondaires (le WindowManager survit). Inventaire mesuré : **~42 surfaces** (13 apps + 3 outils Launcher · 15 panneaux Réglages · ~11 outils rail) → cible **~20** en 4 sections + Réglages (Créer · Agents · Savoir · Design). Fusions proposées (validation Raf ligne par ligne, §4.3 du rapport) : Agent Factory+Super Agent → Agents · Design Review+Goût+Éditeur → Design Studio · Radar+Veille → Veille · Métriques+Traces+Dashboard → Observatoire (avec compteur de souveraineté en tête) · Multi-Projet+OS d'apps → Projets · Ideation+Prompt Lab → Studio d'idées.

## Détails clés

- **Invariants 2.0** (à ne pas toucher) : noyau eleve/kernel, souveraineté GLM/escalade Claude bornée, [[mangoqa]] fantôme, méthode ([[limites]], wiki, preuves live, gates), principes de [[fondation-principes]].
- **Feuille de route** (refactor progressif, produit vivant) : **A** fondations backend (config.ts central, extraction routes http/, rangement tests/scripts, audit sécurité) ≈ 4-6 j · **B0** rationalisation du catalogue (~42→~20 surfaces) ≈ 2-3 j · **B1** DA + maquette du shell (benchmark ChatGPT/Gemini/Cursor, itération Sharingan) ≈ 3-4 j · **B2** design system TS au service de la DA + api.ts + état léger ≈ 3-4 j · **C** shell 2.0 + migration écran par écran avec découpage des monolithes (Chat 1500 l., Knowledge 1676 l., Home 978 l. = 22 % du code UI) ≈ 7-9 j · **D** fluidité (transitions, palette ⌘K, a11y, états vides, responsive base + L69/**L7 souveraineté mesurable**/L38/L64) ≈ 4-6 j · **E** libération des chantiers gatés rythmée par l'OBS (#164, #168, #172-175, #165). Total hors E ≈ 23-32 j.
- **Non-objectifs 2.0 déclarés** : i18n, mode mobile complet, multi-instance/Redis, conversion TypeScript de masse.

## Parité V1→V2 (audit 2026-07-02, PC maison)

Audit de la branche V2 `forge-auto-evolution` vs base V1 `e57386c` (`git diff` + 2 agents). **Verdict : V2 = surensemble STRICT de la V1.** Côté structure : **0 fichier supprimé, 0 renommé** ; moteur quasi additif (**3 fichiers, +118/−5**). Tous les outils/skills « charme » présents ET câblés, fichiers binairement identiques à V1 : Sharingan (`vois_ecran`/`lire_image`), web (`chercher_web`/`requete_web`), snapshot QA (`teste_parcours`), crawl (`extraire_site`/[[site-vision]]), invisibles `vision-diff`/`vision-prewarm` ; registre de skills diff VIDE. Les retraits « volontaires » de Raf sont des **retraits d'EXPOSITION** (rail dégraissé via filtre `show()`), pas de code. Divergence `master` (session auto) = doc+gitignore seulement ; le Gardien toujours-actif ([[gardien-cloture]], `ELEVE_CLOSURE_GATE=on`) vit dans le `.env` partagé → présent en V2. **Rebranché le même jour** dans `ShellV2.jsx` (en `Modal` du design system) : les 3 outils flottants secondaires §4.3 qui manquaient — **Artefacts**, **Aide**, **détail [[mangoqa]]** (ex-« Contrôleur »). Le 4ᵉ, l'« Éditeur visuel », n'a **aucun composant** dans le repo → [[limites|L76]] (à décider : construire vs assumer retiré). Reste avant d'officialiser la V2 (merge→master, opération à part) : finir la parité + Phases A/C/D.

## Limite honnête

Chiffres mesurés par exploration (greps), pas par outillage de couverture — ordres de grandeur fiables, pas des métriques contractuelles. Les tensions vision↔réel (souveraineté locale vs capacité 12B) restent à trancher sur les données de l'OBS. L'« Éditeur visuel » promis au libellé de Design Studio n'existe pas encore ([[limites|L76]]).

## Liens
[[dette-technique]] · [[audit-general]] · [[flux]] · [[bureau-os]] · [[kernel]] · [[limites]] · [[statut]]

## Sources
`docs/audit-mango-2.0.md` (rapport complet) · explorations 2026-07-02 sur commit `e57386c`.
