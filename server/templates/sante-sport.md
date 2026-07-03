---
domaine: sante-sport
détection: [fitness, sport, entraînement, entrainement, workout, training, course, running, musculation, gym, nutrition, calories, méditation, meditation, yoga, bien-être, wellness, sommeil, sleep, santé, health, habitudes, habits, respiration]
---
# Santé / fitness / méditation

## Angle avant tout
PREMIÈRE DÉCISION : le registre. Sport = ÉNERGIE (contrastes forts, typo condensed, motion nerveuse). Méditation/sommeil = CALME (espaces amples, tons sourds, motion lente et respirante). Les deux registres sont OPPOSÉS — choisis selon le sujet, écris le choix en commentaire en tête d'App. Puis UN angle non-évident :
- **Le corps comme tableau de bord** : les données s'affichent sur/autour d'une silhouette ou d'une métaphore organique (cœur qui bat au rythme réel du BPM, poumons qui gonflent pendant la respiration) — pas des cards de stats posées en grille.
- **La séance comme récit** : l'écran d'entraînement se vit comme une progression dramatique (échauffement → effort → pic → récupération), le design s'intensifie puis s'apaise avec les phases.
- **Une seule métrique reine** : tout l'écran s'organise autour d'UN chiffre géant (streak, minutes de calme, km) — progressive disclosure : les détails n'apparaissent qu'en dessous, au scroll ou au tap.
Interdit : le dashboard générique « 4 stat-cards + 1 graphique + 1 liste » qui serait identique pour de la muscu et de la méditation.

## Squelette
1. **Écran principal** (100vh) : salutation contextuelle (« Bonjour Léa » + état du jour), LA métrique reine en très grande typo (30-40 % de l'écran), anneau(x) de progression animé(s) autour ou à côté, UN CTA d'action (« Démarrer la séance » / « Méditer 10 min »).
2. **Anneaux de progression** : 1 à 3 anneaux SVG concentriques (activité/objectif/streak), remplissage animé à l'arrivée, valeur au centre.
3. **Aujourd'hui** : la séance/session du jour en card héroïque (nom, durée, difficulté ou ambiance) + 2-3 suggestions secondaires plus petites.
4. **Historique** : 7 derniers jours en mini-barres ou points (pas un gros chart), la semaine se lit d'un coup d'œil ; streak mis en valeur.
5. **Écran séance actif** (si l'app le permet) : timer central géant, phase courante, progression de la séance, bouton pause — plein écran, zéro distraction. Méditation : cercle qui respire (scale 1→1.15 sur 4s, expire sur 6s) comme guide.
6. **Détail/stats** : accessible en second niveau seulement — jamais tout sur l'écran d'accueil (progressive disclosure).

## Design
- **Typo** — le pairing suit le registre :
  - Sport : display condensed puissante (« Archivo Black » ou « Oswald », fallback `Impact, system-ui`) pour chiffres et titres + « Inter » (fallback `system-ui`) en corps.
  - Méditation : géométrique douce basse-graisse (« Quicksand » ou « Outfit », fallback `system-ui`), JAMAIS de black/condensed.
  - Dans les deux cas : chiffres en `font-variant-numeric: tabular-nums`, métrique reine en `clamp(4rem, 15vw, 9rem)`.
- **Palette** — découle du registre, pas d'un goût par défaut :
  - Sport : fond sombre true grey (#121417, jamais noir pur), UN accent dopamine (orange blazing, vert lime ou rouge cardio) réservé à la progression et aux CTA, textes en semi-bold (jamais thin sur sombre).
  - Méditation : tons sourds désaturés (sauge, lavande grisée, sable, bleu nuit doux), contrastes bas mais AA, zéro couleur saturée.
- **Motion** (3 minimum) :
  - Anneaux qui se remplissent à l'arrivée : `stroke-dashoffset` animé sur 1-1.4s, ease-out, léger overshoot en fin (le dernier % rebondit).
  - Métrique reine qui compte de 0 à sa valeur (~1s, ease-out).
  - Sport : validation de séance = pulse de l'accent (scale 1→1.08→1, 350ms) + micro-confetti ou flash radial. Méditation : cercle respirant en boucle (4s inspire / 6s expire, ease-in-out), transitions à 600-900ms partout.
  - Hover cards : translateY -3px + ombre (200ms).
  - Respecter `prefers-reduced-motion` : anneaux et compteurs à leur valeur finale, cercle respirant remplacé par un guide textuel (« Inspire… Expire… »).

## Composants canoniques
- `AnneauProgression` : SVG `circle` avec `stroke-dasharray`/`dashoffset`, `stroke-linecap: round`, épaisseur 8-14px, piste en 8-12 % d'opacité de l'accent.
- `MetriqueReine` : chiffre géant tabulaire + unité petite + label en petites capitales.
- `CardSeance` : nom, durée, tag d'intensité/ambiance, visuel ou dégradé du registre, CTA intégré.
- `Semaine` : 7 colonnes L-D, hauteur = valeur du jour, aujourd'hui en accent, jours vides visibles (honnêteté du streak).
- `TimerSeance` / `CercleRespirant` : selon le registre, plein écran, une seule interaction visible.
- `BadgeStreak` : flamme ou lune + compteur de jours, pop (scale 0→1.15→1) quand le streak s'incrémente.

## Pièges (AVOID)
- Registre mélangé : une app de méditation avec des rouges énergiques et des animations nerveuses (ou une app de muscu pastel et molle) = échec d'ancrage total (axiome 25).
- Tout montrer d'un coup : 12 métriques sur l'écran d'accueil = aucune ne compte. LA question « ça va aujourd'hui ? » d'abord, drill-down ensuite.
- Anneaux décoratifs : un anneau non relié à une donnée lisible (valeur + objectif au centre ou à côté) n'est qu'un donut vide.
- Données de robot : progression parfaitement linéaire, 100 % tous les jours — simuler des données HUMAINES (jours ratés, variations, plateau puis progrès).
- Culpabilisation visuelle : les jours manqués en rouge agressif — les montrer neutres ; l'accent célèbre, il ne punit pas.

## Données/Images
- Pexels : sport → « athlete training gym dark », « runner sunrise silhouette », « crossfit chalk hands » ; méditation → « meditation lake calm morning », « yoga mat minimal light », « fog forest soft light ». Peu d'images (1-3) : ces apps vivent par leurs données et leur motion, pas par la photo.
- Simuler : prénom d'utilisateur, 7-30 jours d'historique réaliste (valeurs variables, 1-2 jours vides), streak crédible (3-14 jours), séances nommées avec durées réelles (« HIIT jambes — 24 min », « Scan corporel — 12 min »), objectifs atteignables (10 000 pas, 20 min de calme), BPM/calories dans les plages humaines.
