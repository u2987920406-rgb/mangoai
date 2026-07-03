---
domaine: simulateur
détection: [simulateur, simulation, sandbox, physique, physics, écosystème, ecosystem, particules, particles, gravité, gravity, foule, boids, flocking, fluide, fourmis, vie, life, automate, cellular, pendule, orbite, orbit]
---
# Simulateur / sandbox

## Angle avant tout
Ici le plaisir est de REGARDER un système vivre et de le perturber. Décide UN parti pris AVANT de coder, en commentaire en tête d'App :
- **Observatoire scientifique** : esthétique instrument de mesure — fond encre, tracés fins lumineux, annotations discrètes (compteurs, vecteurs optionnels), le beau par la précision.
- **Aquarium vivant** : les entités ont une personnalité visuelle (tailles variées, couleurs d'individus, traînées organiques) ; on s'attache à ce qu'on regarde.
- **Peinture générative** : la simulation laisse une trace (canvas jamais totalement effacé, `fillRect` alpha 0.05-0.1 par frame) — le temps devient une œuvre.
Interdit : des points blancs sur fond noir avec trois sliders HTML natifs bruts — le look « démo de cours de physique ».

## Squelette
1. **Canvas plein cadre** (~75-80 % de la largeur, toute la hauteur) : LA vedette. Resize handler obligatoire, `devicePixelRatio` géré pour la netteté.
2. **Panneau de contrôle** (~20-25 %, latéral ou flottant translucide) : 3-6 paramètres MAX, chacun avec slider stylé + valeur affichée + effet immédiat. Boutons play/pause, reset, et 2-3 **presets nommés évocateurs** (« Essaim calme », « Tempête », « Danse orbitale »).
3. **Boucle** : `requestAnimationFrame` avec delta-time (`(now - last) / 16.67`), physique dans `update(dt)`, rendu séparé. Clamp du dt (max 3) pour survivre aux onglets en arrière-plan.
4. **Interaction directe au canvas** : cliquer/glisser DOIT faire quelque chose (attirer, repousser, semer des entités) — un sandbox qu'on ne peut pas toucher n'est pas un sandbox.
5. **Compteurs vivants** : population, énergie, FPS discret — intégrés au parti pris, pas un div blanc par-dessus.

## Design
- **Typo** : mono technique pour valeurs et compteurs (`'JetBrains Mono', ui-monospace, monospace`), display sobre pour le titre (`'Space Grotesk', system-ui`). Valeurs en `tabular-nums`.
- **Palette** : ancrée au système simulé (écosystème → verts/terre sur fond nuit ; gravité/orbites → bleu profond + or des corps ; fluide → dégradé de densité froid→chaud). Fond sombre presque toujours gagnant (le glow additif `globalCompositeOperation: "lighter"` y devient magnifique). 1 accent réservé à l'interaction utilisateur.
- **Micro-interactions** :
  1. Slider custom : track fin, thumb qui `scale(1.25)` au grab, la valeur numérique pulse brièvement à chaque changement (100 ms).
  2. Clic canvas : onde/ripple au point d'impact (cercle qui grandit et fade en 400 ms) — l'utilisateur voit que le monde l'a senti.
  3. Play/pause : icône morphée + le canvas ralentit en 300 ms (easing) au lieu de figer net.
  4. Preset appliqué : les sliders glissent vers leurs nouvelles valeurs (transition 250 ms), pas de saut sec.
- `prefers-reduced-motion` : la simulation reste (c'est le contenu), mais couper ripples décoratifs, pulses UI, et proposer le pause accessible.

## Composants canoniques
- `SimCanvas` : ref + boucle rAF, update(dt)/render séparés, resize + devicePixelRatio.
- `ControlPanel` : fond translucide (`backdrop-filter: blur`), sliders custom (input range restylé track+thumb), presets.
- `EntityPool` : array préallouée ou filter des mortes ; viser 200-2000 entités fluides, pas 50.
- `TrailLayer` : fade progressif (rect alpha faible) OU second canvas offscreen pour les traînées.
- `StatsBar` : compteurs interpolés (les nombres comptent, ne sautent pas).

## Pièges (AVOID)
- **Simulation qui explose** : sans clamp des vitesses/forces et sans dt borné, tout diverge après 30 s (NaN, entités éjectées). Tester 60 s sans toucher avec teste_parcours.
- Physique liée au framerate : sans delta-time, la sim tourne 2× plus vite à 120 Hz — piège classique.
- Sliders sans effet perceptible : chaque paramètre exposé doit changer VISIBLEMENT le comportement en < 2 s, sinon le retirer.
- Trop de paramètres : 12 sliders = personne ne joue ; 4 bons paramètres + presets = tout le monde joue (axiome 31, accumulation).
- Écran vide au chargement : la sim démarre PEUPLÉE et en mouvement — jamais « cliquez pour ajouter des particules » sur fond vide.

## Données/Images
- ZÉRO image externe : entités en formes canvas (arcs, paths, glow, traînées) — plus beau et plus cohérent.
- Simuler des conditions initiales riches : distributions non uniformes (grappes, spirales), variété de tailles/masses — l'uniformité tue l'organique.
- Presets = jeux de paramètres en dur, nommés avec goût ; c'est la seule « donnée » du domaine.
