---
domaine: jeu-puzzle
détection: [puzzle, réflexion, 2048, memory, mémoire, sokoban, mots, word, casse-tête, grille, grid, match, tiles, tuiles, logique, sliding, taquin, sudoku, minesweeper, démineur]
---
# Jeu de réflexion / puzzle

## Angle avant tout
Décide UN parti pris sensoriel AVANT de coder, écris-le en commentaire en tête d'App :
- **Matière tactile** : les tuiles ont un poids (ombre portée qui grandit au drag, léger tilt 2-3° pendant le déplacement, retombée avec rebond) — le puzzle comme objet physique.
- **Zen lumineux** : fond sombre profond, tuiles qui émettent une lueur douce, fusion = pulse de lumière ; le calme comme récompense.
- **Éditorial ludique** : le puzzle traité comme une page de magazine (grande typo serif pour le score, grille sur papier texturé, numéros en chiffres élégants).
Interdit : la grille de divs gris à coins carrés avec des chiffres en Arial — le look « exercice de tutoriel ».

## Squelette
1. **Écran titre** (plein écran) : nom du jeu en typo géante (`clamp(3rem, 10vw, 7rem)`), règle du jeu en 1 phrase, bouton « Jouer » qui pulse, meilleur score (localStorage).
2. **Plateau** : centré, ~60-70 % de la hauteur du viewport, cellules avec `gap` généreux (8-12px), `border-radius` cohérent avec le parti pris. HUD au-dessus : score animé + bouton undo + recommencer.
3. **Boucle de coup** : input (clavier fléché ET swipe tactile ET clic) → animation du coup (120-180 ms) → résolution (fusion/match) → mise à jour score. Bloquer les inputs pendant l'animation.
4. **Victoire / défaite** : overlay dédié avec transition (fondu + scale du plateau à 0.95), score final qui compte en montant, confetti sobre ou pulse, rejouer en 1 clic.

## Design
- **Typo** : display géométrique pour titre et score (`'Space Grotesk', system-ui` ou `'Fraunces', Georgia, serif` si angle éditorial), chiffres des tuiles en `font-variant-numeric: tabular-nums`, graisse 600+.
- **Palette** : ancrée au thème du puzzle (mots → encre/papier crème ; nombres → progression chromatique où la valeur haute = couleur chaude méritée ; memory → ce que montrent les cartes). 1 accent réservé au coup réussi. Jamais l'arc-en-ciel de couleurs primaires par tuile.
- **Micro-interactions (le cœur du genre — chaque coup DOIT être senti)** :
  1. Déplacement de tuile : `transform: translate` avec easing `cubic-bezier(0.2, 0.8, 0.2, 1)`, 140 ms — jamais de téléportation.
  2. Fusion/match : la tuile résultante fait un pop `scale(1) → 1.18 → 1` en 180 ms + flash bref de l'accent.
  3. Coup invalide : shake horizontal du plateau (±4px, 200 ms) — l'échec aussi a un feedback.
  4. Score : interpolation visible (compte en montant sur 300 ms) + `+N` flottant qui monte et disparaît.
- `prefers-reduced-motion` : réduire les transitions à des fondus 80 ms, supprimer shake et confetti.

## Composants canoniques
- `Board` : CSS Grid ; les tuiles en `position: absolute` translatées (pas re-render de grille) pour animer les déplacements.
- `Tile` : valeur + état (`idle | moving | merging | new`) ; apparition en `scale(0) → 1` 150 ms.
- `Hud` : score (interpolé), meilleur score, boutons undo/restart avec icônes.
- `useUndo` : pile d'états (plateau + score) plafonnée à ~20 ; undo = pop + re-render animé.
- `EndOverlay` : victoire/défaite, `backdrop-filter: blur`, score compté, bouton rejouer focus par défaut.

## Pièges (AVOID)
- **Un coup sans feedback visuel** = échec du genre : si une tuile change d'état sans animation, le plaisir disparaît (axiome 33 : fonctionnel technique ≠ ressenti).
- État corrompu après spam d'inputs : verrouiller les inputs pendant la résolution, tester en martelant les flèches (teste_parcours : jouer 10 coups vite, undo, rejouer).
- Undo cassé ou absent : c'est un standard du genre ; l'oublier frustre, le coder à moitié (score non restauré) est pire.
- Partie ingagnable non détectée : détecter « plus aucun coup possible » et le dire (overlay), sinon le joueur clique dans le vide.
- Grille non responsive : le plateau doit tenir en portrait mobile (`min(90vw, 60vh)` de côté), tuiles lisibles au doigt (≥ 48px).

## Données/Images
- ZÉRO image externe : tuiles, icônes et effets en CSS/SVG inline — plus cohérent avec le parti pris.
- Jeux de mots : embarquer une liste de mots FR en dur (50-200 mots courants), jamais d'API dictionnaire.
- Memory thématique : paires en emoji ou SVG dessinés, pas de photos Pexels sur des cartes de 60px.
