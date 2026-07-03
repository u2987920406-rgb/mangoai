---
domaine: education
détection: [quiz, flashcards, cartes mémoire, cours, lesson, apprendre, learn, learning, éducation, education, révision, révisions, exercices, vocabulaire, vocabulary, trivia, examen, test de connaissances, tutoriel interactif]
---
# Apprentissage / quiz / cours interactif

## Angle avant tout
Décide UN angle non-évident AVANT de coder, en commentaire en tête d'App :
- **Ascension** : la session est un voyage visuel (sentier, étages, constellation qui se dessine) — chaque bonne réponse fait physiquement avancer, l'écran de fin montre le chemin parcouru.
- **Jeu télévisé** : dramaturgie assumée (grande question centrée, suspense avant révélation 400 ms, score mis en scène, ambiance plateau) — l'adrénaline du buzzer.
- **Carnet du savant** : l'app comme un beau manuel annoté (serif éditorial, encre sur papier, schémas SVG, la bonne réponse « surlignée au marqueur ») — le savoir comme objet désirable.
Interdit : la question en haut + 4 boutons gris + « Suivant » — le formulaire administratif déguisé en quiz.

## Squelette
1. **Écran d'accueil** : titre du sujet en typo géante, promesse (« 10 questions, 3 minutes »), meilleur score (localStorage), bouton « Commencer » qui pulse.
2. **Barre de progression TOUJOURS visible** : segments par question (pas juste une ligne), remplissage animé (300 ms) — savoir où on en est est un besoin, pas un bonus.
3. **Écran de question** (un à la fois, jamais une liste) : question en grand (~30 % haut), 2-4 réponses en cartes généreuses (≥ 56px de haut, toute la largeur mobile), navigables au clavier (1-4).
4. **Séquence de feedback** (le cœur) : choix → verrouillage → révélation animée → explication en 1-2 phrases (on APPREND de l'erreur) → transition auto vers la suivante après 1,5-2,5 s ou clic.
5. **Flashcards** : carte centrale flip 3D (`rotateY 180°`, 400 ms, `perspective: 1000px`), boutons « Je savais / À revoir », pile restante visible.
6. **Écran de fin CÉLÉBRÉ** : score compté en montant (800 ms), verdict personnalisé selon la tranche (pas juste « 7/10 »), détail des erreurs revisitables, confetti si > 80 %, rejouer en 1 clic.

## Design
- **Typo** : questions en display lisible et chaleureux (`'Fraunces', Georgia, serif` ou `'Space Grotesk', system-ui` selon l'angle), réponses en `'Inter', system-ui` 16-18px. La question mérite `clamp(1.4rem, 3.5vw, 2.2rem)`.
- **Palette** : ancrée au SUJET enseigné (astronomie → nuit + or ; langue italienne → chaleur méditerranéenne ; code → terminal), PAS au concept générique « école ». Vert-juste et rouge-faux harmonisés à la palette (vert sauge / corail plutôt que #0f0 / #f00).
- **Micro-interactions** :
  1. Réponse juste : la carte pulse `scale(1 → 1.04 → 1)` 250 ms + coche SVG qui se dessine (stroke-dashoffset 300 ms) + la progression avance.
  2. Réponse fausse : shake horizontal ±5px 250 ms sur la carte choisie, PUIS la bonne réponse s'illumine doucement (fade 300 ms) — corriger sans humilier.
  3. Transition entre questions : sortie slide-left + fade (250 ms), entrée décalée 100 ms — jamais de remplacement sec du texte.
  4. Streak de bonnes réponses : badge ×3, ×5 qui pop (`scale(0 → 1.2 → 1)`, 300 ms).
- `prefers-reduced-motion` : feedback par couleur + icône instantanés, pas de shake/confetti/flip (fondu simple pour les flashcards).

## Composants canoniques
- `ProgressBar` : segments (à venir / courant / juste / faux) — elle raconte la partie entière d'un coup d'œil.
- `AnswerCard` : états `idle | selected | correct | wrong | disabled` ; tout se verrouille dès le choix.
- `FlipCard` : conteneur perspective + faces `backface-visibility: hidden`.
- `ScoreScreen` : compteur interpolé, verdict par tranche, liste des erreurs avec explications.
- `useQuizState` : machine `question → locked → revealed → next`, index, score, streak, historique des réponses.

## Pièges (AVOID)
- **Double-clic qui compte deux fois** : sans verrouillage immédiat au premier choix, le score se corrompt — piège n°1 du genre. Tester en cliquant frénétiquement (teste_parcours).
- Feedback faux sans pédagogie : « Incorrect » sec sans montrer la bonne réponse ni pourquoi = l'app n'enseigne rien, elle note.
- Contenu bâclé : 10 questions génériques Wikipédia sans angle < 8 questions spécifiques, précises, avec explications écrites avec soin — le contenu EST le produit.
- Fin sans cérémonie : arriver au bout et voir « Score : 7 » sur fond blanc trahit tout l'effort fourni (axiome 33).
- Ordre figé : mélanger questions ET position des réponses à chaque partie, sinon la deuxième partie est du par-cœur de positions.

## Données/Images
- Contenu embarqué en dur : 8-15 questions/cartes RÉDIGÉES avec soin (question précise, 4 distracteurs plausibles, explication 1-2 phrases) — c'est là que se joue la qualité.
- Pexels : uniquement si le sujet est visuel (géographie → paysages du lieu, art → contexte d'atelier) ; chercher le sujet PRÉCIS de la question (« colosseum rome », pas « education »). Sinon ZÉRO image et typo forte.
- Persister en localStorage : meilleur score, cartes « à revoir » (les flashcards ratées reviennent en premier).
