---
domaine: e-commerce
détection: [boutique, shop, store, e-commerce, ecommerce, produit, product, fiche produit, drop, vente, sell, panier, cart, checkout, achat, buy, marque, brand, sneakers, vêtements, clothing, collection, merch]
---
# Boutique / fiche produit

## Angle avant tout
Décide UN angle non-évident AVANT d'écrire du code, et écris-le en commentaire en tête d'App :
- **Le produit comme pièce de musée** : UN seul produit, mis en scène sur fond neutre, le scroll tourne autour (changement d'angle photo par section), specs présentées comme un cartel d'exposition.
- **Le drop** : tension et rareté — compteur avant ouverture, stock affiché qui descend, numérotation des exemplaires (« 038/200 »), typo utilitaire de bordereau d'expédition.
- **La matière d'abord** : la page s'ouvre sur des macros de texture (cuir, maille, aluminium brossé) avant de montrer le produit entier — on vend la fabrication, le produit est la conclusion.
Interdit : grille de produits + hero « Nouvelle collection » + bandeau promo −20 % — l'esthétique Shopify par défaut.

## Squelette
1. **Hero produit** (100vh) : split-screen — visuel produit 55-60 % de largeur / colonne texte : nom, prix EN ÉVIDENCE (2ᵉ élément le plus visible après le nom), 1 phrase de désir, CTA « Ajouter au panier » pleine largeur de colonne. Hiérarchie prix→CTA lisible en 3 secondes.
2. **Galerie produit** : 3-5 vues (porté/posé/détail macro), navigation par vignettes, l'image active en grand format dominant (70 %+ de la zone).
3. **Bénéfices matière** (3 max) : matériau, fabrication, entretien — macro ou icône inline + 1 phrase chacun.
4. **Trust signals** (près du CTA, jamais relégués en footer) : livraison/retours/garantie en 3 pictos-lignes + note d'avis (« 4,8/5 — 212 avis ») + 1 avis client incarné.
5. **Sélecteur de variantes** : tailles/couleurs en boutons radio stylés, état sélectionné net (bordure 2px accent), taille indisponible barrée mais visible.
6. **CTA final sticky** (mobile surtout) : barre basse prix + « Ajouter », apparaît quand le CTA hero sort du viewport (IntersectionObserver).

## Design
- **Typo** : display grotesque à caractère (`'Space Grotesk', 'Archivo', system-ui`) pour nom produit et prix + corps neutre (`'Inter', system-ui`). Nom : `clamp(2rem, 5vw, 4rem)`. Prix : même famille que le nom, 1.5rem+, `font-variant-numeric: tabular-nums`. Variante drop : `'JetBrains Mono', monospace` pour prix, stock et numérotation.
- **Palette** : ancrée au PRODUIT — le produit fournit l'accent (sneaker orange → accent orange exact prélevé sur la photo), UI en neutres :
  - Fond ivoire `#f7f5f1` ou grège — jamais blanc pur clinique.
  - UN seul accent, réservé au CTA et aux états actifs (variante sélectionnée, lien).
  - Rouge uniquement pour l'urgence réelle (stock bas), jamais décoratif.
- **Motion** (minimum 3, concrètes) :
  - Image produit en hover : zoom `scale(1.06)` sous `overflow: hidden`, 500ms `cubic-bezier(0.22, 1, 0.36, 1)` — le geste « inspecter ».
  - Ajout panier : bouton `scale(0.97)` au clic, label → « Ajouté ✓ » pendant 1,2 s, badge compteur du panier qui pope (`scale 0→1.2→1`, 300ms).
  - Changement de variante : cross-fade de l'image 250ms + prix qui tique si différent (count-up court).
  - Sticky bar : translateY 100 %→0 en 300ms ease-out à l'apparition.
  - Respecter `prefers-reduced-motion` : cross-fades en changement direct, pas de zoom.

## Composants canoniques
- `PriceTag` : prix actuel dominant ; si promo, l'ancien en `line-through` opacity 0.45 APRÈS le nouveau, jamais l'inverse.
- `VariantPicker` : boutons 44px min (tap target), sélection bordure accent + fond teinté 8 %, indisponible barré en diagonale.
- `TrustRow` : 3 items horizontaux (icône SVG inline + 5-7 mots), sous le CTA, opacity 0.75.
- `StickyBuyBar` : `position: fixed` bas, fond élevé + ombre haute douce, prix + bouton compact.
- `ReviewCard` : note en chiffres + prénom + détail d'usage concret (« taille comme du 42 »), pas d'étoiles seules flottantes.
- `GalleryThumbs` : vignettes 64-80px, active avec bordure accent, clavier ←/→ bienvenu.

## Pièges (AVOID)
- Prix introuvable ou timide : si l'œil ne trouve pas le prix en 2 secondes, la hiérarchie est ratée — c'est LE test du domaine.
- Deux CTA rivaux (« Acheter » + « En savoir plus » de même poids) : UN primaire plein, le reste en lien texte discret.
- Fausse urgence incohérente (« Plus que 2 ! » sur un compteur qui boucle) : un trust signal qui se contredit détruit tous les autres.
- Photos produit hétérogènes : fonds et lumières différents entre les vues = étal de brocante ; toutes les vues partagent fond et température de couleur.
- Grille de 12 produits identiques sans produit héros : commencer par UN produit incarné, la collection est secondaire (axiome 31).

## Données/Images
- Pexels, produit sur fond propre + 1 image lifestyle :
  - « sneakers white background », « ceramic vase studio shot », « leather bag product », « perfume bottle minimal », « headphones flat lay », « watch macro detail ».
  - Lifestyle : le produit porté/en contexte (« man wearing denim jacket street »).
  - Vérifier la cohérence de fond entre les vues retenues avant de les utiliser.
- Simuler : marque nommée avec un ton (pas « MaBoutique ») ; 1 produit héros complet — nom évocateur, prix réaliste au marché, 3 variantes, matière, origine de fabrication ; note 4,6-4,9 avec volume d'avis plausible (87-340) ; 2-3 avis rédigés avec détails d'usage ; politique chiffrée (« Retours 30 jours », « Livré en 48 h », « Garantie 2 ans »).
