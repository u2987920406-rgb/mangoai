---
domaine: immobilier-voyage
détection: [hôtel, hotel, voyage, travel, destination, immobilier, real estate, bien, villa, appartement, apartment, location, airbnb, riad, lodge, chalet, séjour, resort, tourisme, visite, propriété, property]
---
# Vitrine de lieu (hôtel, destination, bien immobilier)

## Angle avant tout
Décide UN angle non-évident AVANT de coder, écris-le en commentaire en tête d'App. On vend une EXPÉRIENCE de lieu, pas des m² :
- **Une journée sur place** : la page se déroule chronologiquement (aube → matin → après-midi → nuit), chaque section = un moment vécu avec sa lumière propre (la palette évolue au scroll).
- **Le détail avant l'ensemble** : ouvrir sur des fragments sensoriels en très gros plan (matière du lin, vapeur du café, reflet de la piscine) et ne révéler la vue d'ensemble du lieu qu'au tiers de la page — inversion du réflexe « drone shot d'abord ».
- **Le lieu raconté par une voix** : un récit à la première personne (l'hôte, l'architecte, un habitant) qui traverse la page en pull quotes, les images illustrant ses phrases.
Interdit : le carrousel plein écran + barre de recherche dates/voyageurs + grille de 12 chambres identiques — le template Booking sans âme.

## Squelette
1. **Hero immersif** (100vh) : UNE image Pexels plein écran (la plus forte), voile discret (overlay 25-40 %), nom du lieu en typo racée, une ligne de positionnement (« Sept chambres face aux Cyclades »), indice de scroll. Nav transparente qui devient opaque au scroll.
2. **Le storytelling** (2-3 blocs) : alternance texte court (3-4 phrases max, colonne étroite ~30rem) / image — layout en quinconce, images qui débordent de la grille (broken grid : une image chevauche la section suivante de -60px).
3. **Galerie** (~30 % de la page) : grille asymétrique (pas des vignettes uniformes) — 1 grande + 2 moyennes + 2 petites, ratios variés, lightbox au clic.
4. **Les espaces / le bien en détail** : chambres/pièces en cards horizontales généreuses, OU pour l'immobilier : chiffres clés (surface, pièces, étage, DPE) en grande typo tabulaire.
5. **La localisation** : carte stylisée simplifiée (SVG maison ou fond neutre + repères), 3-4 points d'intérêt avec distances (« Plage — 4 min à pied »).
6. **CTA final** plein écran sur image : « Réserver » / « Visiter » / « Demander le dossier », une seule action.

## Design
- **Typo** : pairing hospitalité — display serif élégante (« Fraunces » ou « Cormorant Garamond », fallback `Georgia, serif`) pour le nom du lieu et les intertitres + corps sans-serif discret (« Inter », fallback `system-ui`).
  - Nom du lieu : `clamp(3rem, 8vw, 7rem)`.
  - Petites capitales espacées (`letter-spacing: 0.15em`) pour les labels (« LA SUITE », « À PARTIR DE »).
- **Palette** : EXTRAITE du lieu lui-même — méditerranéen : blanc chaux/bleu profond/terracotta ; montagne : bois/vert sapin/crème ; urbain haussmannien : pierre/noir/laiton ; tropical : sable/vert palme.
  - Base neutre chaude, 1 accent tiré de la géographie. Jamais le bleu-corporate-voyagiste.
- **Motion** (3 minimum) — lenteur contemplative :
  - Images en révélation au scroll : clip-path ou scale 1.06→1 + opacity, 800ms ease-out.
  - Hover galerie : scale 1.04 de l'image DANS son cadre fixe (overflow hidden, 400ms) + légende qui monte.
  - Hero avec effet de profondeur au scroll : l'image se déplace à 40-50 % de la vitesse de scroll (translateY).
  - Chiffres clés immobilier qui comptent en entrant dans le viewport (~1s, ease-out).
  - Respecter `prefers-reduced-motion` : images affichées directement, hero fixe.

## Composants canoniques
- `HeroImmersif` : figure 100vh + overlay dégradé bas (pour la lisibilité), contenu en position absolue bas-gauche ou centré selon l'angle.
- `BlocRecit` : grille 2 colonnes en quinconce, image en débord (`margin-bottom: -60px` ou grille avec `grid-row` chevauchant).
- `GalerieAsymetrique` : CSS grid avec zones nommées (une cellule 2×2, des 1×1), `gap` généreux (16-24px), lightbox simple (overlay + image + fermeture).
- `CardEspace` : image 60 % / texte 40 %, nom serif, 2-3 attributs (« 32 m² · vue mer · lit king »), prix par nuit en tabular-nums.
- `ChiffresCles` (immo) : rangée de 4 stats en très grande typo, labels en petites capitales.
- `CarteStylisee` : fond neutre ou SVG simplifié + repères, liste des points d'intérêt avec distances à pied/voiture.
- `NavTransparente` : `position: fixed`, fond transparent → opaque (backdrop-filter) après 80px de scroll.

## Pièges (AVOID)
- Images écrasées : les photos sont LE produit — jamais moins de 55-60 % de la surface de la page en imagerie ; du texte partout = échec du domaine.
- Photos incohérentes : mélanger 6 lieux différents de Pexels qui ne peuvent pas être le même endroit (piscine tropicale + chalet neige) — choisir des images à la lumière et géographie compatibles.
- Overlay assassin : un voile à 70 % qui tue l'image, ou du texte blanc thin illisible sur ciel clair — overlay 25-40 % max + scrim localisé sous le texte.
- Fiche technique froide : lister « WiFi, parking, climatisation » en bullet points au lieu de raconter — les équipements se glissent dans le récit ou en fin de card, jamais en section dédiée.
- Prix absent ou absurde : afficher un vrai prix crédible (nuit : 120-800 € selon standing ; bien : cohérent avec surface et ville).

## Données/Images
- Pexels : 6-10 images d'UN MÊME univers cohérent — requêtes précises : « boutique hotel pool mediterranean », « riad courtyard morocco », « alpine chalet interior fireplace », « parisian apartment haussmann interior », « infinity pool sunset villa » + 2-3 gros plans matière (« linen bed morning light », « coffee terrace sea view »). Trier mentalement par lumière compatible.
- Simuler : nom de lieu évocateur et crédible, prix par nuit ou prix de vente réaliste, 3-4 points d'intérêt géographiquement plausibles avec distances, 1 témoignage voyageur avec prénom + provenance, surfaces et capacités cohérentes entre sections.
