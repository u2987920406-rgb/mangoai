# Recherche web — nuit du 2026-07-03 (compilée en règles exploitables)

Chaque point est reformulé en **contrainte injectable** dans les prompts/templates de Mango. Zéro dépendance réseau au runtime.

## Design 2026 (tendances award-winning)

1. **Typographie protagoniste** : oversized headlines, kinetic type (texte qui bouge/réagit), variable fonts pour transitions de graisse fluides. Règle : chaque page a UN moment typographique mémorable (un titre 8-14vw, pas 3 titres moyens).
2. **Palettes** : fini le contraste agressif 2022-2023 → palettes « dopamine » intentionnelles (orange blazing + violet profond) OU douceur soft intentionnelle. Règle : 1 accent saturé max sur base neutre, ancré au sujet.
3. **Motion = compétence de base, plus une option** : scroll-triggered animations, transitions de page, hover states, scrollytelling. Règle : au moins 3 micro-interactions réelles par app (hover avec transform, entrée en scroll, feedback de clic).
4. **Dimension** : les sites « ne sont plus plats » — images flottantes, couches, transitions cinématiques, broken grids. Règle : au moins un élément qui casse la grille.

## Prompt engineering pour UI (validé par la pratique)

5. **« modern/clean » = zéro information** pour un LLM. Règle : bannir les adjectifs vagues des prompts, imposer des attributs précis (« editorial layout, serif display, asymmetric grid »).
6. **Un fichier design-system unique en markdown** (composants + usage) que le LLM lit sans naviguer — petit, dans le contexte. → C'est exactement le rôle des manifests de templates.
7. **Références visuelles > descriptions** (80 % de qualité en plus). → Mango a déjà vois_ecran ; les templates doivent embarquer une description visuelle très concrète.
8. **Une seule version de chaque composant** ; le LLM consomme l'existant au lieu de régénérer. → Les templates fournissent les composants canoniques.

## Landing pages qui convertissent

9. Hero = headline < 44 caractères + sous-titre + UN CTA + visuel fort. Décision visiteur en 3 secondes.
10. Split-screen hero (texte/visuel équilibrés), navigation minimale, hiérarchie claire, whitespace stratégique.
11. Trust signals près du haut (logos, stats d'avis, témoignages).

## Game feel / juice (canvas)

12. Screen shake : 0,1-0,3 s, direction aléatoire subtile, easing en sortie.
13. Particules sur chaque impact/récompense. Squash & stretch sur les entités.
14. Tweening : easing exponentiel pour l'abrupt, quadratique pour le doux. « Animate everything a little » : boutons qui pulsent, texte qui tremble sur erreur, bounce sur succès.
15. Référence canonique : « Juice it or Lose it » (Jonasson/Purho).

## Dashboards dark-mode

16. Base **true grey, jamais noir pur** ; élévation par décalages subtils de fond (cartes sans bordures + tokens d'élévation).
17. **UN accent saturé**, tout le reste en gris neutres — la retenue fait le premium.
18. Palette de dataviz DÉDIÉE au sombre (séries désaturées douces, gridlines à 3-8 % au-dessus de la base, labels d'axes muets). Jamais inverser une palette claire (résultat néon illisible).
19. Typo : semi-bold/medium (jamais thin sur fond sombre), pas d'italique.
20. Pattern roi : **progressive disclosure** — LA métrique « tout va bien ? » d'abord, drill-down ensuite.

## Sources
- [Figma — Web Design Trends 2026](https://www.figma.com/resource-library/web-design-trends/) · [Envato — kinetic type, broken grids](https://elements.envato.com/learn/web-design-trends) · [TopCSSGallery — award galleries 2026](https://www.topcssgallery.com/blog/web-design-trends-dominating-award-galleries/)
- [Sam Pierce Lolla — Tips for LLM UI](https://sampiercelolla.com/tips-for-getting-llms-to-write-good-ui-code/) · [UX Collective — Dear LLM, design system](https://uxdesign.cc/dear-llm-heres-how-my-design-system-works-b59fb9a342b7)
- [Perfect Afternoon — Hero 2026](https://www.perfectafternoon.com/2025/hero-section-design/) · [Landingi — 25 best practices](https://landingi.com/landing-page/41-best-practices/) · [Landy — Hero examples](https://www.landy-ai.com/blog/hero-section-design)
- [GameJuice — Juice it or Lose it](https://gamejuice.co.uk/resources/juice-it-or-lose-it) · [GameAnalytics — squeezing juice](https://www.gameanalytics.com/blog/squeezing-more-juice-out-of-your-game-design)
- [AYDesign — dark dashboards 2026](https://www.aydesign.ai/blog/dark-mode-dashboard-design-patterns-2026) · [Qodequay — dark mode data-heavy](https://www.qodequay.com/dark-mode-dashboards) · [925studios — SaaS dashboards](https://www.925studios.co/blog/saas-dashboard-design-examples-2026)
