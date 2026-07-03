---
domaine: jeu-arcade
détection: [jeu, game, arcade, shooter, runner, breakout, snake, asteroids, platformer, plateforme, canvas, espace, vaisseau, score]
---
# Jeu canvas arcade

## Angle avant tout
Décide UN parti pris sensoriel AVANT de coder, écris-le en commentaire en tête d'App :
- **Néon nocturne** : fond quasi-noir, glow additif (`ctx.globalCompositeOperation = "lighter"`), traînées.
- **Papier découpé** : formes plates aux couleurs franches, ombres portées dures, rotation légère.
- **Rétro-CRT** : palette 4-8 couleurs, scanlines subtiles, police pixel pour le HUD.
Interdit : le canvas gris avec des rectangles de couleurs primaires par défaut.

## Squelette
1. **Écran titre** : titre du jeu en très grande typo stylée + « appuie pour jouer » qui pulse + meilleur score (localStorage).
2. **Boucle de jeu** : `requestAnimationFrame` avec delta-time (`(now - last) / 16.67`) — JAMAIS de vitesse dépendante du framerate.
3. **HUD** : score en haut, vies/énergie, style intégré au parti pris (pas un div blanc par-dessus).
4. **Game over** : transition dédiée (ralenti ou explosion), score final, meilleur score, rejouer immédiat (touche + bouton).
5. Contrôles : clavier ET souris/tactile quand c'est possible.

## Design
- **Game juice OBLIGATOIRE** (c'est ce qui sépare un jeu correct d'un jeu délicieux) :
  - Screen shake sur les impacts : 0,1-0,3 s, offset aléatoire décroissant (`shake *= 0.9` par frame).
  - Particules sur CHAQUE événement (destruction, collecte, saut) : 8-20 particules, vie courte, fade + shrink.
  - Squash & stretch sur les entités (scale 1.2/0.8 à l'impact, retour élastique).
  - Tweening : easing exponentiel pour l'abrupt, quadratique pour le doux. Le score qui monte compte visiblement (interpolation), ne saute pas.
  - Hit-pause de 2-4 frames sur les gros impacts.
- **Typo HUD** : une display forte (pixel ou geometric), taille généreuse, jamais Arial par défaut.
- **Palette** : 1 fond + 2-3 couleurs d'entités + 1 accent réservé aux récompenses/danger. Cohérente avec le parti pris.

## Composants canoniques
- `GameLoop` : update(dt) / render séparés ; état machine `title | playing | gameover`.
- `ParticleSystem` : pool simple (array, filter des mortes), spawn(x, y, count, palette).
- `ScreenShake` : offset appliqué au ctx.translate global.
- `Hud` : rendu canvas (fillText stylé) ou DOM superposé stylé selon le parti pris.

## Pièges (AVOID)
- Le jeu injouable : TESTE le gameplay avec teste_parcours (démarrer, jouer 5 s, perdre, rejouer). Un jeu qui crashe à la 2ᵉ partie = échec total.
- Difficulté plate : la difficulté doit monter (vitesse, spawn rate) sinon ennui en 20 secondes.
- Collision au pixel près frustrante : hitbox légèrement plus petites que le visuel pour le joueur, plus grandes pour les bonus.
- Canvas non responsive : adapter au viewport (`window.innerWidth/Height`, resize handler).

## Données/Images
- ZÉRO image externe pour les sprites : tout en formes canvas dessinées (arcs, paths, glow) — c'est plus beau et plus cohérent.
- Sons : facultatif ; si présent, WebAudio généré (oscillateurs), jamais de fichiers externes.
