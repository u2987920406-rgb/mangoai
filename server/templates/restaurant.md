---
domaine: restaurant
détection: [restaurant, resto, café, cafe, coffee, bistrot, bistro, menu, carte, plat, dish, food, cuisine, chef, brasserie, pizzeria, boulangerie, bakery, recettes, recipes, gastronomie, gastronomy, brunch, traiteur]
---
# Restaurant / food

## Angle avant tout
Décide UN angle non-évident AVANT d'écrire du code, et écris-le en commentaire en tête d'App :
- **Le menu comme objet** : toute la page est construite autour de la carte, typographiée comme un menu imprimé de bistrot (filets, prix alignés à droite avec points de conduite, sections en petites capitales) — les photos deviennent des respirations entre sections.
- **Une soirée au restaurant** : la page suit la chronologie d'un repas au scroll (l'arrivée → l'apéritif → le plat → le dessert → l'addition/réservation), chaque étape avec sa lumière et son plat héros.
- **L'obsession du chef** : UN ingrédient ou UN geste en fil rouge (le feu, le levain, la tomate de juillet) raconté en manifeste typographique — le menu n'arrive qu'après la conviction.
Interdit : hero photo sombre + overlay noir 60 % + « Bienvenue chez [Nom] » centré en blanc — le cliché absolu du domaine.

## Squelette
1. **Hero** (85-100vh) : nom du lieu en display géant + type de cuisine + ville en une ligne. UNE photo de plat plein cadre OU typo seule sur fond couleur d'ancrage. CTA unique : « Réserver ».
2. **Conviction** (1 écran court) : 2-3 phrases sur ce que le lieu défend (sourcing, geste, quartier) — grande typo, pas de photo.
3. **Menu** (le cœur, ~40 % de la page) : 2-3 sections (entrées/plats/desserts ou matin/midi/soir), 4-6 items par section avec nom + description gourmande de 6-10 mots + prix. La typographie du menu prime sur les photos par item.
4. **Galerie sensorielle** : 3-4 photos en grille asymétrique (un plat macro, la salle, une main qui dresse, la façade) — une image casse la grille en débordant.
5. **Infos pratiques** : horaires en tableau lisible, adresse, téléphone cliquable (`tel:`), bloc réservation. Pas de carte Google embarquée (réseau) : adresse stylée + repère de quartier écrit.

## Design
- **Typo appétissante** : display serif à empattements marqués (`'Fraunces', 'Playfair Display', Georgia, serif` — les axes optiques de Fraunces donnent le côté gourmand) + corps grotesque discret (`'Inter', system-ui`). Nom du lieu : `clamp(3rem, 9vw, 8rem)`. Prix et labels de section en petites capitales espacées. Italique serif autorisé pour les descriptions de plats.
- **Palette** : ancrée à la CUISINE, base chaude obligatoire (crème `#faf5ec`, ivoire — jamais blanc pur ni gris froid), 1 accent saturé issu d'un ingrédient signature :
  - Italien : tomate `#c8352e` / crème / basilic.
  - Japonais : encre `#1a1a1e` / riz / un rouge sceau.
  - Boulangerie-café : croûte dorée, farine, espresso, terracotta.
- **Motion** (minimum 3, concrètes) :
  - Items du menu : entrée en scroll opacity + translateY 16px, stagger 70ms — le menu se dresse comme un service.
  - Photos en hover : `scale(1.05)` sous conteneur `overflow: hidden`, 700ms ease-out.
  - CTA « Réserver » : fond qui se remplit au hover (pseudo-élément scaleX 0→1, 350ms) + `scale(0.97)` au clic.
  - Jour courant du tableau d'horaires marqué à l'accent (état, pas animation).
  - Respecter `prefers-reduced-motion` : opacity simple partout, pas de zoom photo.

## Composants canoniques
- `MenuItem` : nom (serif medium) + points de conduite (`border-bottom: 1px dotted` sur un span flex-1) + prix aligné droite, description italique en dessous. Prix JAMAIS en gras criard.
- `SectionTitle` : petites capitales espacées + filet fin centré ou latéral, façon carte imprimée.
- `DishHero` : photo plein cadre `object-fit: cover`, légende minimale (nom + prix) posée dans un coin, pas de bandeau plein.
- `HoursTable` : deux colonnes jour/heures, « Fermé » assumé sur les vrais jours de fermeture.
- `ReserveBlock` : date/heure/couverts en 3 contrôles simples + bouton — simulation locale, confirmation stylée inline.
- `NavRestaurant` : nom + 3 ancres (Carte / Le lieu / Réserver) + téléphone visible ; fond qui apparaît au scroll (transparent → base crème, 250ms).
- Mobile : le menu reste typographique pleine largeur (les points de conduite tiennent), photos pleine largeur, CTA « Réserver » sticky en bas.

## Pièges (AVOID)
- Photos qui coupent l'appétit : image sombre, floue ou de buffet quelconque — chaque photo de plat doit être lumineuse, serrée, texturée (règle vraies-images : Pexels, jamais de placeholder gris).
- Le menu en cards avec photo par item : 12 vignettes carrées = catalogue de fast-food, pas un restaurant. La typographie du menu EST le luxe.
- Palette froide (bleus, gris acier) sur de la nourriture : anti-appétit — base chaude non-négociable.
- Menu générique sans identité : « Salade César 12 € » partout = zéro ancrage (axiome 25). Inventer des plats situés (« Poireaux grillés, beurre blanc au yuzu — 14 € »).
- Overlay noir uniforme sur toutes les photos : si le texte est illisible, changer la composition, pas assombrir l'image.

## Données/Images
- Pexels, requêtes PRÉCISES par cuisine — privilégier lumière naturelle et cadrage serré :
  - Plats : « pasta close up », « ramen bowl top view », « sourdough bread rustic », « grilled vegetables plate », « dessert plating fine dining ».
  - Ambiance : « restaurant interior warm light », « chef plating », « barista latte art », « bakery counter morning ».
  - 4-6 images MAX, cohérentes entre elles (même température de couleur, même registre).
- Simuler : nom de lieu crédible et situé (quartier réel d'une ville réelle) ; 12-18 plats avec descriptions gourmandes et prix cohérents avec le standing (bistrot 9-24 €, gastro 28-65 €) ; horaires réalistes avec jour de fermeture ; téléphone au format FR ; 1 phrase de sourcing nommant un producteur inventé plausible.
