---
domaine: dataviz-explorer
détection: [dataviz, data viz, visualisation, visualization, explorateur, explorer, carte interactive, interactive map, timeline, chronologie, frise, comparateur, comparator, comparaison, comparison, données, data, dataset, atlas, infographie, infographic, scrollytelling]
---
# Explorateur de données

## Angle avant tout
Décide UN angle non-évident AVANT d'écrire du code, et écris-le en commentaire en tête d'App :
- **Une question, pas un dataset** : l'app s'ouvre sur une question en typo géante (« Où vit-on le plus vieux ? ») et les données y répondent progressivement — l'exploration libre n'arrive qu'après la réponse guidée.
- **Le scrollytelling** : le scroll pilote la visualisation (la carte zoome, la timeline avance, les barres se réordonnent) avec des paliers narratifs annotés ; l'utilisateur lit une histoire que les données racontent.
- **Le duel** : tout est construit sur la comparaison A/B (deux pays, deux époques, deux équipes) — écran scindé, sélecteurs symétriques, chaque métrique désigne le vainqueur.
Interdit : « des filtres à gauche, un graphique à droite, débrouillez-vous » — un explorateur sans angle est un fichier Excel avec du CSS.

## Squelette
1. **Accroche** (60-80vh) : la question ou le sujet en display géant + 1 chiffre-choc + invitation à explorer (« ↓ Explorer 48 pays »).
2. **Visualisation maîtresse** (60-70vh, le cœur) : UNE forme dominante — carte choroplèthe SVG, timeline horizontale, scatter, ou barres réordonnables. Elle occupe l'écran, les contrôles ne la grignotent pas.
3. **Barre de filtrage** (au-dessus ou flottante, 56-72px) : 2-4 contrôles MAX — période en slider, catégorie en segmented control, recherche d'entité. Chaque filtre ré-anime la visualisation, jamais de rechargement sec.
4. **Panneau détail** : clic sur une entité (pays, année, point) → panneau latéral avec fiche complète : valeurs, mini-graphe, rang, écart à la moyenne.
5. **Faits saillants** (3 cards en clôture) : les 3 découvertes les plus surprenantes du dataset, rédigées (« La Corée a gagné 12 ans d'espérance de vie en 30 ans »).

## Design
- **Typo** : display éditorial pour la question (`'Fraunces', 'Playfair Display', Georgia, serif` — registre data-journalisme) + interface neutre (`'Inter', system-ui`) + valeurs en `'JetBrains Mono', monospace` ou tabular-nums. Question : `clamp(2.2rem, 6vw, 5rem)`. Annotations sur graphiques : 12-13px, jamais sous 11px.
- **Palette** : le SUJET dicte l'échelle de couleurs :
  - Climat/température : divergent bleu→rouge ; démographie/densité : séquentiel monochrome ; sport/politique : couleurs d'équipes ou de partis.
  - Fond clair ivoire `#faf8f4` (registre print) OU sombre true grey `#141417` — dans les deux cas : séries douces désaturées, gridlines à 3-8 % au-dessus du fond.
  - UNE seule couleur « highlight » saturée, réservée à l'entité sélectionnée/survolée.
- **Motion** (minimum 3, concrètes) :
  - Transitions de données : les formes INTERPOLENT entre deux états de filtre (position, hauteur, couleur — 500-700ms `cubic-bezier(0.4, 0, 0.2, 1)`) — on doit VOIR le changement.
  - Hover d'entité : stroke accent + `scale(1.03)`, les autres entités tombent à opacity 0.35, tooltip riche qui suit le curseur (offset 12px, apparition 120ms).
  - Entrée en scroll : barres/points poussent depuis leur baseline (scaleY 0→1, transform-origin bottom, stagger 25ms).
  - Slider de période : la visualisation suit le doigt en continu, pas au relâchement.
  - Respecter `prefers-reduced-motion` : états finaux directs, tooltips conservés.

## Composants canoniques
- `VizCanvas` : SVG maison à viewBox responsive — pas de lib externe ; échelles calculées à la main (`(v - min) / (max - min) * height`).
- `FilterBar` : slider avec valeur affichée en direct, segmented control, bouton reset discret.
- `Tooltip` : `position: fixed` suivant le curseur — nom + valeur + rang + delta vs moyenne, fond élevé.
- `DetailPanel` : slide-in droit 320-400px (translateX 100 %→0, 300ms), fermeture croix + clic extérieur + touche Échap.
- `AnnotatedHighlight` : étiquette + trait pointant un point remarquable de la visualisation — le geste data-journalisme qui change tout.
- `LegendRow` : légende cliquable (toggle de série), pastille + label, série désactivée à opacity 0.3.

## Pièges (AVOID)
- Le graphique muet : sans annotations ni faits saillants rédigés, l'utilisateur ne sait pas quoi regarder — annoter au minimum 2 points remarquables.
- Filtrer = re-render sec : si les barres disparaissent/réapparaissent au lieu d'interpoler, l'exploration perd toute continuité perceptive.
- Données en `Math.random()` uniforme : elles ne racontent RIEN — injecter tendances, outliers et corrélations voulus, sinon les faits saillants sont des mensonges visibles.
- Trop de dimensions d'un coup : une visualisation = une question ; croiser 4 variables dans un seul graphe = illisible, découper en vues successives.
- Axes malhonnêtes ou absents : baseline non-zéro sur des barres, pas d'unités, pas de source — la crédibilité data exige les conventions.

## Données/Images
- ZÉRO image externe : tout en SVG maison. Pour une carte : grille de cellules, cartogramme en carrés, ou silhouettes très simplifiées — plutôt qu'un GeoJSON précis introuvable hors-ligne.
- Simuler :
  - Dataset nommé et sourcé fictivement (« Source : Observatoire Européen des Mobilités, 2025 »).
  - 20-60 entités aux noms RÉELS quand c'est sûr (pays, villes, années) avec valeurs plausibles en ordre de grandeur.
  - Construire les données AVEC leur histoire : une entité qui explose, un déclin lent, un cluster — ce sont eux qui nourrissent les 3 faits saillants.
  - Unités et formats FR (`Intl.NumberFormat('fr-FR')`), années cohérentes avec la période du slider.
