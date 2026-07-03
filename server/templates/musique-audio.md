---
domaine: musique-audio
détection: [musique, music, audio, son, sound, synthé, synth, synthétiseur, visualiseur, visualizer, drum, drum machine, boîte à rythme, beat, séquenceur, sequencer, piano, theremin, accords, chords, oscillateur]
---
# Expérience audio / musique

## Angle avant tout
Décide UN parti pris AVANT de coder, en commentaire en tête d'App :
- **Instrument-objet** : l'app imite un hardware désirable (pads en relief, potards rotatifs, sérigraphie, LED) — le plaisir du matériel, version écran.
- **Synesthésie** : chaque son a une identité visuelle propre (une note = une couleur + une forme + un mouvement) ; l'écran EST la partition vivante.
- **Cathédrale sombre** : fond noir profond, le son sculpte la lumière (glow, ondes, spectre) — minimalisme où seul l'audio décide de ce qui s'affiche.
Interdit : la rangée de boutons gris qui font « bip » sans aucun retour visuel — un instrument muet aux yeux.

## Squelette
1. **Écran d'activation OBLIGATOIRE** : les navigateurs bloquent l'audio sans geste utilisateur → grand bouton d'entrée stylé (« Entrer dans le studio ») qui crée l'`AudioContext` (ou `resume()`) DANS le handler de clic. Cet écran pose le décor (titre géant, parti pris annoncé).
2. **Surface de jeu** (~70 % du viewport) : pads / clavier / grille de séquenceur — zones de frappe ≥ 56px, jouables au clic ET au clavier (touches affichées) ET au tactile.
3. **Zone visuelle réactive** : visualiseur branché sur `AnalyserNode` (waveform ou FFT) — jamais une animation décorative fake qui ignore le son réel.
4. **Contrôles** (~15-20 %) : tempo (BPM), volume master, 2-3 paramètres de timbre (type d'onde, filtre, decay) avec sliders/potards stylés. Un preset de démo qui joue quelque chose de bien immédiatement.
5. Pour un séquenceur : grille 16 pas × 4-6 instruments, colonne courante surlignée qui balaie, boucle propre via un scheduler.

## Design
- **Typo** : mono pour BPM/valeurs (`'JetBrains Mono', ui-monospace, monospace`), display impactante pour titre et labels (`'Space Grotesk', system-ui`), graisses 600+ — jamais thin sur fond sombre.
- **Palette** : fond true grey très sombre (#111-#16, jamais noir pur), 1 accent saturé « dopamine » ancré au genre musical (techno → cyan électrique ; lo-fi → ambre chaud ; acid → vert-jaune) réservé à ce qui SONNE. Le reste en gris neutres — la retenue fait le premium.
- **Micro-interactions (chaque son a un jumeau visuel, même instant)** :
  1. Frappe de pad : `scale(0.94)` immédiat + flash de l'accent, retour élastique 150 ms — synchronisé à l'attaque du son.
  2. Pas actif du séquenceur : quand la tête de lecture le déclenche, pop `scale(1.15)` + glow 120 ms.
  3. Potard/slider : rotation ou glisse suivie d'une valeur qui pulse ; le timbre change EN TEMPS RÉEL pendant le drag (pas au relâchement).
  4. Visualiseur : amplitude → taille/intensité, fréquence → position/teinte ; 60 fps via rAF.
- `prefers-reduced-motion` : garder les feedbacks d'état (frappe, pas actif) en changements de couleur sans scale ; offrir un toggle visualiseur.

## Composants canoniques
- `useAudioEngine` : un seul `AudioContext` partagé ; graphe = source (oscillateurs/bruit) → gain (enveloppe) → filtre → `AnalyserNode` → destination.
- Percussions générées : kick = oscillateur sine avec pitch qui chute (150→50 Hz, 0.15 s) ; snare = bruit blanc filtré + enveloppe courte ; hihat = bruit passe-haut très court. JAMAIS de fichiers audio externes.
- `Scheduler` : lookahead (`setInterval` 25 ms qui programme les notes à `ctx.currentTime + t`) — jamais de `setTimeout` par pas, ça dérive.
- `Pad` / `StepCell` : état visuel (`idle | armed | playing`), gros hit-target, touche clavier associée.
- `Visualizer` : canvas + `getByteTimeDomainData` / `getByteFrequencyData`.

## Pièges (AVOID)
- **Autoplay bloqué** : créer l'AudioContext hors d'un geste utilisateur = silence total et console rouge. L'écran d'activation n'est pas optionnel.
- Clics et pops : couper un son en mettant gain à 0 instantanément fait claquer → toujours `linearRampToValueAtTime` / `exponentialRampToValueAtTime` (attack ~5 ms, release ≥ 30 ms).
- Séquenceur qui dérive : timing basé sur `setTimeout`/`setInterval` seul = décalage audible en 30 s. Scheduler avec lookahead obligatoire.
- Visualiseur décoratif fake : une sinusoïde animée qui ignore l'audio réel se voit immédiatement — brancher l'AnalyserNode ou rien.
- Fuite de nœuds : recréer des oscillateurs sans les `stop()` → saturation et lag après 2 min de jeu. Tester 2 min de frappe continue (teste_parcours).

## Données/Images
- ZÉRO image externe, ZÉRO fichier audio : tout son est synthétisé (WebAudio), tout visuel est CSS/SVG/canvas.
- Simuler : un pattern de démo pré-rempli (le séquenceur arrive avec un beat qui groove), noms de presets évocateurs (« Nuit magnétique », « Boom bap 92 »), gammes en dur (pentatonique = toujours juste pour un instrument libre).
