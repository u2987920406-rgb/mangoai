---
domaine: dark-luxe
détection: [luxe, luxury, premium, haut de gamme, montre, watch, horlogerie, parfum, perfume, fragrance, automobile, voiture de luxe, supercar, joaillerie, bijou, jewelry, champagne, spiritueux, whisky, heist, braquage, noir, exclusif, exclusive]
---
# Marque premium / dark luxe (montre, parfum, automobile, heist)

## Angle avant tout
Décide UN angle non-évident AVANT de coder, écris-le en commentaire en tête d'App. Le luxe se montre par la retenue, jamais par la démonstration :
- **L'objet en lumière de musée** : fond noir profond, l'objet unique éclairé comme une pièce de collection — la page entière est une seule vitrine qu'on parcourt lentement, chaque scroll révèle un DÉTAIL (le guillochage, le sillage, la couture).
- **Le dossier confidentiel** : la page se présente comme un document classé (numéro de série, spécifications tamponnées, révélations progressives) — parfait pour heist, édition limitée, montre numérotée. Le mystère structure la lecture.
- **La matière avant l'objet** : ouvrir sur des textures abstraites plein écran (grain du cuir, brume du parfum, reflet du métal) sans montrer le produit ; l'objet complet n'apparaît qu'au dernier tiers — le désir se construit par fragments.
Interdit : le cliché « fond noir + texte doré partout + LUXURY en majuscules » — l'or en aplat généreux est du toc, pas du luxe.

## Squelette
1. **Hero** (100vh) : noir quasi total, le nom de la marque/objet en serif racée très espacée, UNE ligne de mystère (« Trente-huit exemplaires. Aucune seconde chance. »), aucun CTA visible d'abord — juste un indice de scroll discret. Le silence visuel EST le hero.
2. **Révélation** : l'objet apparaît (image ou composition CSS) — grand, seul, entouré de vide (60 %+ d'espace négatif).
3. **Trois détails** (~40 % de la page) : chaque détail = plein écran ou presque, une image serrée + un mot-titre + 2 lignes maximum. Un détail par écran, jamais une grille de features.
4. **Les chiffres rares** : 3-4 spécifications en très grande typo fine espacée (« 38 exemplaires · 72 h de réserve · 9,2 mm ») — les chiffres du luxe sont des preuves, pas des stats.
5. **L'histoire** : un court récit (origine, artisan, nuit du braquage) en colonne étroite centrée, serif, interlignage ample.
6. **CTA final** : sobre et rare — « Demander un rendez-vous », « Réserver le n° 07 » — bouton fantôme (bordure fine), jamais un bloc criard. Footer minimal.

## Design
- **Typo** : display serif racée (« Cormorant Garamond » ou « Playfair Display », fallback `Georgia, serif`), graisses light-regular, `letter-spacing: 0.08-0.2em` sur les titres et labels en capitales — l'espacement fait la noblesse.
  - Corps sans-serif discret (« Inter », fallback `system-ui`) en 0.95-1.05rem, gris clair.
  - Titres : `clamp(2.5rem, 7vw, 5.5rem)`. Chiffres rares en serif light très grande taille.
- **Palette** : noir profond MAIS nuancé — base true grey #0a0a0c à #121214 (JAMAIS #000 pur), élévations par paliers de gris (#1a1a1e cartes, #232328 hover) sans bordures dures.
  - UN métal seulement, choisi selon l'objet : or champagne (#c9a962) pour horlogerie/parfum, argent froid (#b8bcc4) pour automobile/tech, cuivre pour spiritueux — en filets, lettrines et détails (< 5 % de la surface), jamais en aplats.
  - Textes : blanc cassé #e8e6e1, jamais blanc pur.
- **Motion** (3 minimum) — lenteur assumée, c'est la signature :
  - Toutes les entrées au scroll en 900-1200ms ease-out (opacity + translateY 30px) — deux fois plus lent qu'un site normal, c'est voulu.
  - Hover des images : scale 1.03 en 800ms + le filet métallique se dessine (scaleX 0→1, 600ms).
  - Le nom du hero apparaît par lettres ou par mots (stagger 80-120ms, opacity + léger translateY), une seule fois au chargement.
  - CTA fantôme : au hover le fond se remplit du métal en 500ms, le texte passe en noir.
  - Respecter `prefers-reduced-motion` : tout apparaît en fondu simple 200ms, zéro translation.

## Composants canoniques
- `HeroSilence` : 100vh, contenu centré, beaucoup de vide, indice de scroll (fine ligne verticale animée 1px).
- `DetailPleinEcran` : image 100vw ou 60vw + légende minimale, un par viewport.
- `ChiffresRares` : rangée ou colonne de specs, valeur en serif 3-4rem light, label en capitales espacées 0.7rem, séparateurs en filet métallique 1px.
- `Lettrine` / `FiletOr` : les seuls emplacements du métal — première lettre, lignes de séparation 1px, numéro d'exemplaire.
- `CtaFantome` : bordure 1px métal, padding généreux (20px 48px), capitales espacées, remplissage au hover.
- `RecitColonne` : max-width ~32rem centrée, serif, `line-height: 1.9`, lettrine métal sur le premier paragraphe.

## Pièges (AVOID)
- Or partout : boutons dorés, titres dorés, fonds dégradés or = bijouterie de casino. Le métal se mérite : filets, lettrines, détails — moins de 5 % de la surface.
- Noir pur #000 : écrase toute profondeur ; sans paliers de gris, aucune élévation possible — la page devient un trou plat.
- Densité de e-commerce : grille de produits, badges promo, compte à rebours d'achat = l'exact opposé du luxe. Une seule chose à la fois, du vide autour.
- Typo thin illisible : light ≤ 300 sur fond sombre en petite taille disparaît — le light se réserve aux très grandes tailles (3rem+), le corps reste regular.
- Vitesse de site normal : des animations à 200-300ms cassent le registre — ici la lenteur (800-1200ms) est une signature, pas un bug.
- Superlatifs vides : « exceptionnel, unique, ultime » sans preuve = brochure. Remplacer par des faits précis (matière, nombre, durée, provenance).

## Données/Images
- Pexels : chiaroscuro obligatoire — « luxury watch macro dark », « perfume bottle black background smoke », « sports car night reflection », « whisky glass dark moody », « leather texture close up dark » ; refuser toute image à fond clair ou lumière plate (elle détruirait la palette). 3-5 images max, toutes dans la même obscurité.
- Simuler : nom de marque inventé sonnant maison européenne (2 syllabes + fondation : « Maison Verlaine — 1924 »), specs crédibles du domaine (calibre, réserve de marche 72 h, notes de tête/cœur/fond, 0-100 en 3,1 s), tirage limité avec numéros (« N° 07/38 »), prix suggéré seulement sur demande — jamais affiché en gros.
