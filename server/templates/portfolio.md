---
domaine: portfolio
détection: [portfolio, photographe, photographer, designer, artiste, artist, cv, book, créatif, creative, illustrateur, illustrator, développeur, developer, freelance, showcase, travaux, works, réalisations]
---
# Portfolio créatif

## Angle avant tout
Décide UN angle non-évident AVANT d'écrire du code, et écris-le en commentaire en tête d'App :
- **Le travail EST l'interface** : zéro chrome, les projets occupent 100 % du viewport, la navigation émerge du contenu (hover révèle titre/index, scroll horizontal ou snap vertical).
- **Archive obsessionnelle** : le portfolio comme index numéroté façon catalogue raisonné (001–024), typo mono, densité de liste — le clic ouvre le projet plein écran. L'austérité met le travail en valeur.
- **Autoportrait éditorial** : la personnalité d'abord — une déclaration en typo 10-14vw (« Je photographie ce que les autres ne voient pas »), le travail arrive en preuve, pas en vitrine.
Interdit : la grille de vignettes uniformes 3 colonnes avec « Mes projets » en titre — c'est le template Wix mental de tout LLM.

## Squelette
1. **Ouverture** (100vh) : nom + discipline + UNE phrase de positionnement. Le moment typographique mémorable de la page est ICI (titre 8-14vw, kinetic ou variable font). Pas de photo de profil dans le hero.
2. **Travaux** (60-70 % de la page) : 4-6 projets MAX, chacun traité différemment (un plein écran, un diptyque, un qui casse la grille en débordant du conteneur). Chaque projet = visuel + titre + année + 1 ligne de contexte.
3. **À propos** (compact, 1 écran max) : portrait éventuel ICI, bio 3-4 phrases à la première personne avec une vraie voix, liste de clients/expositions en typo brute.
4. **Contact** : email en très grande typo cliquable (`mailto:`), réseaux en une ligne. Pas de formulaire.

## Design
- **Typo** : pairing à fort contraste — display serif éditorial pour l'identité (`'Playfair Display', Georgia, serif` ou `'Fraunces', serif`) + grotesque neutre pour les métadonnées (`'Inter', system-ui`). Variante archive : tout en mono (`'JetBrains Mono', 'Courier New', monospace`). Nom/titre : `clamp(3rem, 10vw, 9rem)`, letter-spacing -0.03em, line-height 0.95.
- **Palette** : ancrée à la DISCIPLINE, l'UI reste neutre car les images fournissent la couleur :
  - Photographe : fond crème `#f5f1ea` ou noir profond (true grey `#141414`), zéro accent coloré.
  - Designer : 1 accent électrique assumé (le « rouge signature ») sur base neutre.
  - Développeur : fond sombre, accent vert/ambre terminal, mono dominant.
- **Motion** (minimum 3, concrètes) :
  - Images en hover : `scale(1.04)` interne avec `overflow: hidden` sur le conteneur, 600ms `cubic-bezier(0.22, 1, 0.36, 1)`.
  - Titres de projets : reveal au scroll — translateY 100 % → 0 sous clip (overflow hidden), 700ms, stagger 60ms par ligne.
  - Curseur/label « Voir → » qui suit la souris sur les zones cliquables (translate3d, lerp 0.1 par frame).
  - Email de contact : underline animé au hover (scaleX 0→1, transform-origin left, 300ms).
  - Respecter `prefers-reduced-motion` : tout retombe en opacity simple, pas de suivi de curseur.

## Composants canoniques
- `ProjectBlock` : ratio d'image VARIABLE par projet (16/9, 4/5, plein bleed) — l'uniformité tue.
- `IndexRow` (variante archive) : numéro mono + titre + année + tag, bordure basse 1px, hover inverse les couleurs de la ligne entière.
- `BigEmail` : email en `clamp(2rem, 6vw, 5rem)`, un seul lien, aucun bouton concurrent.
- `MetaLabel` : petites capitales espacées (11-12px, letter-spacing 0.12em, opacity 0.55) pour années/catégories/rôles.
- `ClientList` : noms de clients en ligne, séparés par « / » ou en colonnes typographiques, jamais de logos-images.
- `NavMinimal` : 2-3 ancres max (Travaux / À propos / Contact) + nom en haut à gauche ; fixe et discrète (mix-blend-mode `difference` bienvenu sur fond changeant).
- Mobile : blocs projets empilés pleine largeur, le titre géant reste géant (`clamp` fait le travail), suivi de curseur désactivé au tactile.

## Pièges (AVOID)
- Grille uniforme de cards identiques : un portfolio sans hiérarchie dit « tous mes projets se valent » — donc aucun ne compte (axiome 31).
- Bio générique à la 3ᵉ personne (« passionné par le design ») : inventer une voix, des clients nommés, des années précises (axiome 25 — ancrage identitaire).
- L'UI qui rivalise avec le travail : dégradés, glassmorphism et ombres colorées sur un portfolio photo = le contenant écrase le contenu.
- 12 projets moyens au lieu de 5 forts : la curation EST le message d'un créatif.
- Vignettes déformées : `object-fit: cover` + ratios maîtrisés, jamais d'image étirée ni pixellisée.
- Carrousel automatique de projets : le travail se contemple au rythme du visiteur, jamais d'autoplay qui arrache l'image sous les yeux.

## Données/Images
- Pexels, selon la discipline inventée :
  - Photographe : cohérence de SÉRIE — « brutalist architecture », « fog portrait », « analog street photography », « desert minimal » — les 4-6 projets doivent sembler d'une même main (même registre, même lumière).
  - Designer : « poster design », « editorial print layout », « exhibition space », « studio workspace ».
  - Développeur : pas de photos de code Pexels — recréer les interfaces en HTML/CSS stylisé, plus crédible.
- Simuler : prénom + nom crédibles, une ville réelle ; 4-6 projets titrés avec année (2021-2026) et client ; 3-5 clients/expositions nommés plausibles (galeries, magazines, studios inventés) ; 1 distinction ou publication datée.
