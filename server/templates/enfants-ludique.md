---
domaine: enfants-ludique
détection: [enfant, enfants, kids, children, éducatif, educatif, educational, apprendre à lire, alphabet, comptine, histoire interactive, interactive story, conte, coloriage, maternelle, preschool, ludique, jeu pour enfants, ans]
---
# Univers enfants (jeu éducatif, histoire interactive)

## Angle avant tout
Décide UN angle non-évident AVANT de coder, écris-le en commentaire en tête d'App :
- **Le compagnon vivant** : UNE mascotte (dessinée en SVG/CSS, pas une image) qui réagit à TOUT — elle cligne des yeux à l'idle, saute quand on réussit, penche la tête quand on se trompe. Elle porte l'app entière.
- **Le monde qui se construit** : chaque réussite ajoute un élément visible à un décor persistant (un arbre pousse, une maison gagne une fenêtre, une fusée s'assemble) — la progression EST le paysage.
- **L'objet-théâtre** : toute l'interface est un objet unique qu'on manipule (un livre dont on tourne les pages, un coffre à jouets qu'on ouvre, un train dont chaque wagon est une activité).
Interdit : l'arc-en-ciel criard par défaut — 7 couleurs saturées à 100 % + Comic Sans + clipart. Joyeux ≠ criard.

## Squelette
1. **Écran d'accueil** (100vh) : la mascotte ou l'objet-théâtre au centre (40-50 % de l'écran), titre court et rond, UN gros bouton « Jouer » (min 96px de haut) qui invite. Zéro texte superflu : un enfant de 4 ans ne lit pas.
2. **Choix d'activité** (si plusieurs) : 3-4 grosses cards maximum par écran, chacune = une illustration + un mot, jamais de liste.
3. **Écran d'activité** : UNE consigne à la fois (audio simulé par bulle + icône haut-parleur), zone d'interaction énorme au centre, réponses en gros boutons (min 72px, espacés de 16px+ pour les petits doigts).
4. **Feedback de réussite** (EXAGÉRÉ, c'est la règle) : plein écran — confettis/étoiles en pluie, la mascotte danse, son de victoire (WebAudio, oscillateurs joyeux), message court (« Bravo ! »). Durée 1.5-2s puis suite automatique.
5. **Feedback d'erreur** (DOUX, jamais punitif) : léger wiggle de la mauvaise réponse, la mascotte encourage (« Presque ! »), la bonne réponse finit par pulser en indice. Jamais de rouge agressif, jamais de son négatif.
6. **Progression** : étoiles/fruits collectés visibles en permanence (3-5 par activité), écran de fin de session avec le décor construit ou la récolte.

## Design
- **Typo** : ronde et généreuse — « Baloo 2 » ou « Fredoka » (fallback `'Comic Sans MS', system-ui` — seul domaine où ce fallback est légitime) pour TOUT, y compris le corps.
  - Tailles énormes : consignes 1.5-2rem, boutons 1.4rem+, titre `clamp(2.5rem, 9vw, 5rem)`.
  - Jamais de light/thin, jamais de capitales longues (les enfants déchiffrent lettre à lettre).
- **Palette** : joyeuse SANS être criarde — 3-4 couleurs à saturation MOYENNE (70-85 %, pas 100 %) sur fond crème ou ciel très pâle (#fff8ec, #eef6ff).
  - Ancrée à l'univers choisi : océan → corail/turquoise/sable ; forêt → vert prairie/champignon/miel ; espace → nuit douce/étoile/fusée orange.
  - Ombres colorées douces (pas de noir), radius 20-32px PARTOUT — aucun angle vif dans toute l'app.
- **Motion** (3 minimum, généreuse par nature) :
  - Boutons « jelly » : au tap, scale 0.92 puis retour élastique avec overshoot (scale 1.06→1, ~400ms, `cubic-bezier(0.34, 1.56, 0.64, 1)`).
  - Mascotte idle : respiration (scale 1→1.03, cycle 2s) + clignement d'yeux toutes les 3-5s (scaleY des paupières, 150ms).
  - Réussite : 15-25 confettis SVG (translateY + rotate aléatoires, 1.2s, fade) + la mascotte saute (translateY -20px, squash & stretch).
  - Erreur : wiggle doux (rotate ±4°, 3 oscillations, 350ms).
  - Respecter `prefers-reduced-motion` : feedback par changement de couleur + grosse coche/étoile statique, mascotte fixe.

## Composants canoniques
- `Mascotte` : SVG maison (formes simples : cercles, arcs), 3 états minimum (idle / joie / encouragement) pilotés par une prop.
- `GrosBouton` : min 72-96px de haut, radius 24px+, ombre portée colorée décalée (effet « posé »), état pressé visible.
- `BulleConsigne` : bulle arrondie + icône haut-parleur cliquable (rejoue la consigne — texte affiché + son WebAudio court).
- `PluieConfettis` : spawn de 15-25 formes (étoiles, ronds) aux couleurs de la palette, physique simple (chute + rotation).
- `BarreEtoiles` : les étoiles gagnées se remplissent une à une avec un « pop » (scale 0→1.2→1).
- `EcranFinSession` : le décor construit ou la récolte, la mascotte fière, bouton « Encore ! » géant.

## Pièges (AVOID)
- Criard : saturation 100 % partout + toutes les teintes = fatigue et laideur ; la joie vient des formes rondes et du mouvement, pas de l'agression chromatique.
- Interface d'adulte rétrécie : texte de consigne long, petits boutons, navigation à menus = inutilisable à 4-7 ans. Tout doit se comprendre SANS lire.
- Échec punitif : croix rouge, buzzer, score qui baisse = l'enfant ferme l'app. L'erreur est une étape, le design doit le dire.
- Feedback timide : une réussite qui n'affiche qu'un petit « correct ! » vert = raté. À cet âge, le feedback DOIT être disproportionné (plein écran, danse, confettis).
- Mascotte statique : une mascotte qui ne réagit pas aux actions est pire que pas de mascotte — si elle existe, elle VIT (idle + réactions).
- Contenu éducatif faux : vérifier les réponses (3+4=7, « B » comme « bateau ») — une erreur pédagogique est inacceptable dans ce domaine.

## Données/Images
- ZÉRO photo Pexels pour les éléments de jeu : tout en SVG/CSS dessinés (mascotte, objets, décor) — plus cohérent, plus doux, contrôle total du style. Pexels acceptable UNIQUEMENT pour un éventuel écran parents (« kid playing tablet parent »).
- Sons : WebAudio généré — arpège majeur montant (réussite), note douce descendante (erreur, jamais dissonante), petit « pop » (tap).
- Simuler : 4-8 questions/pages d'histoire RÉELLES et vérifiées (additions justes, lettres correctes, histoire avec début/milieu/fin), prénoms d'enfants dans les exemples, progression sauvegardée en localStorage.
