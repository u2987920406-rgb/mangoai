---
domaine: evenement
détection: [événement, evenement, event, concert, festival, conférence, conference, mariage, wedding, soirée, party, meetup, gala, tournoi, lancement d'événement, line-up, lineup, billetterie, tickets, countdown]
---
# Événement (concert, festival, conférence, mariage)

## Angle avant tout
Décide UN angle non-évident AVANT de coder, écris-le en commentaire en tête d'App. Le design doit incarner l'ÉNERGIE de l'événement (rave ≠ mariage ≠ conf tech) :
- **Le teaser de film** : la page se déroule comme une bande-annonce — date géante d'abord, révélations progressives (lieu, têtes d'affiche, programme) au scroll, tension croissante.
- **Le billet comme héros** : toute la page est construite autour d'un billet/pass stylisé (perforations, code-barres, hologramme CSS) qu'on « obtient » à la fin.
- **L'affiche vivante** : une affiche de concert/festival plein écran dont les éléments typographiques bougent (kinetic type : titres qui glissent, se superposent, réagissent au scroll) — la page EST l'affiche.
Interdit : le hero générique « photo de foule + titre + bouton billets » identique pour un mariage et une rave.

## Squelette
1. **Hero** (100vh) : nom de l'événement en typo protagoniste (10-14vw, LE moment typographique), date + lieu en contrepoint discret, countdown vivant intégré (pas un widget collé), UN CTA (« Billets », « RSVP », « S'inscrire »).
2. **Le pitch** : 2-3 phrases max qui vendent l'expérience, grande typo (1.5-2rem), pas un paragraphe corporate.
3. **Line-up / programme / intervenants** (~40 % de la page) : c'est le CŒUR. Têtes d'affiche en énorme (broken grid : tailles décroissantes, chevauchements), puis grille horaire par jour/scène avec onglets. Pour un mariage : le déroulé de la journée en timeline verticale.
4. **Le lieu** : une image forte pleine largeur + infos pratiques (adresse, accès) en surimpression ou à côté.
5. **Billets/RSVP** : 2-3 tiers max (early bird barré, standard, VIP), le tier recommandé mis en avant. Mariage : formulaire RSVP à 2 champs.
6. **FAQ courte** (4-5 questions accordéon) + footer avec rappel date/lieu.

## Design
- **Typo** — le pairing suit le TYPE d'événement :
  - Festival/concert : display condensed impactante (« Archivo Black » ou « Anton », fallback `Impact, system-ui`) + corps « Inter ».
  - Conférence : grotesque contemporaine (« Space Grotesk », fallback `system-ui`) partout, graisses contrastées.
  - Mariage : serif délicate (« Cormorant Garamond », fallback `Georgia, serif`) + petites capitales espacées.
  - Countdown : chiffres tabulaires (`font-variant-numeric: tabular-nums`) pour éviter le tressautement.
- **Palette** : ancrée au REGISTRE ÉMOTIONNEL — festival électro : fond nuit + 1 accent dopamine (orange blazing ou violet électrique) ; conf tech : neutres froids + 1 accent précis ; mariage : crème/sauge/terracotta doux, zéro saturation agressive. Toujours 1 accent max sur base cohérente.
- **Motion** (3 minimum) :
  - Countdown vivant : chaque chiffre bascule au changement de seconde (translateY + opacity, 300ms ease-out) — il TICTAQUE visiblement.
  - Noms du line-up en entrée staggerée au scroll : translateY 30px + opacity, 90ms de décalage entre noms.
  - Hover des têtes d'affiche : scale 1.03 + l'accent envahit le fond du nom (200ms).
  - CTA billets qui pulse doucement (scale 1→1.02, cycle 2s) — UNIQUEMENT le CTA principal.
  - Respecter `prefers-reduced-motion` : countdown mis à jour sans animation, entrées sans translation.

## Composants canoniques
- `Countdown` : J/H/M/S calculés depuis une date cible RÉELLE dans le futur (à ~3-8 semaines d'aujourd'hui), labels discrets sous les chiffres, intégré au style du hero.
- `LineUp` : hiérarchie à 3 niveaux de taille (têtes d'affiche 4-6rem / seconds 2rem / découvertes 1.2rem en ligne serrée).
- `Programme` : onglets par jour, lignes horaire + scène + artiste, heure en tabular-nums.
- `TicketCard` : tier, prix, 3 inclusions max, early bird avec prix barré ; le recommandé avec bordure accent + badge.
- `TimelineJournee` (mariage) : verticale, points reliés, heure + moment + lieu.
- `BandeauInfos` : rappel date + lieu + CTA en bandeau sticky discret qui apparaît après le hero.
- `FaqAccordeon` : question en semi-bold, réponse en 2-3 lignes, chevron qui pivote (200ms).

## Pièges (AVOID)
- Registre unique plaqué : appliquer une esthétique rave à un mariage (ou l'inverse) = échec d'ancrage identitaire (axiome 25). Identifier le TYPE d'événement d'abord.
- Countdown mort : un compte à rebours vers une date passée, figé, ou qui affiche « NaN » = crédibilité zéro. Tester le calcul.
- Line-up plat : 20 noms à la même taille = aucun ne compte. La hiérarchie de tailles EST l'information.
- Infos pratiques introuvables : date, lieu, prix doivent être visibles en < 5 secondes ET répétés au footer.
- Grille horaire fausse : chevauchements d'horaires impossibles ou journée de 3 h — simuler un programme RÉALISTE.

## Données/Images
- Pexels : chercher l'AMBIANCE spécifique — « concert crowd lights night », « music festival stage smoke », « conference audience speaker », « wedding table setting golden hour » — pas de photo de foule générique recadrée pour tout.
- Simuler : noms d'artistes/intervenants inventés mais crédibles (avec genre musical ou titre de talk), horaires cohérents (14 h-2 h festival, 9 h-18 h conf), prix réalistes (early 49 € / standard 69 € / VIP 129 €), date cible réelle dans le futur.
