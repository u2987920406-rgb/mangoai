---
domaine: landing-saas
détection: [landing, saas, produit, product, startup, vitrine produit, outil, service, app à vendre, waitlist, launch, lancement]
---
# Landing page produit / SaaS

## Angle avant tout
Décide UN angle non-évident AVANT d'écrire du code, et écris-le en commentaire en tête d'App :
- **Démo vivante** : le produit s'utilise DANS le hero (mini-version interactive), pas une capture d'écran.
- **Avant/Après** : la page entière est structurée comme la douleur → la délivrance, avec un pivot visuel au scroll.
- **Manifeste** : une conviction forte en très grande typo, le produit n'apparaît qu'ensuite.
Interdit : le hero générique « titre + sous-titre + deux boutons + image à droite » sans idée.

## Squelette
1. **Hero** (100vh max) : headline < 44 caractères, sous-titre 1 phrase, UN seul CTA primaire, un élément visuel fort (démo, produit, ou typo géante). Nav minimale (logo + 3 liens + CTA).
2. **Preuve immédiate** : bande de logos clients OU stat forte (« 12 000 équipes ») juste sous le hero.
3. **3 bénéfices** (pas 6) : chacun = icône/visuel + titre bénéfice (pas feature) + 1 phrase. Grille asymétrique bienvenue.
4. **Moment démo** : une section où on VOIT le produit agir (animation au scroll, onglets interactifs, ou vidéo simulée).
5. **Témoignage unique** mis en scène (grande citation, photo, nom, rôle) — pas un carrousel de 6.
6. **Pricing simple** (2-3 plans, celui du milieu mis en avant) — seulement si pertinent.
7. **CTA final** plein écran : reprend la headline autrement + bouton.
8. Footer sobre.

## Design
- **Typo** : display expressif pour les titres (ex. « Space Grotesk », « Clash Display » via fontsource ou system fallback `font-family: 'Space Grotesk', system-ui`), corps lisible (Inter). Headline hero : `clamp(2.5rem, 7vw, 5.5rem)`, letter-spacing négatif (-0.02em à -0.04em).
- **Palette** : ancrée au MÉTIER du produit (fintech → vert profond/or ; devtool → noir/vert terminal ; santé → bleu-vert doux). 1 accent saturé, base neutre. Jamais le violet-dégradé-générique-SaaS sans justification.
- **Motion** : (1) entrées en scroll (opacity+translateY 20px, stagger 80ms entre cards) ; (2) hover des cards (translateY -4px + ombre) ; (3) CTA avec micro-feedback (scale 0.98 au clic). Respecter `prefers-reduced-motion`.

## Composants canoniques
- `Hero` : split-screen OU typo-centrée — choisis selon l'angle.
- `LogoStrip` : logos en opacity 0.5, grayscale, hover couleur.
- `FeatureCard` : padding généreux (32px+), radius 16-24px, une seule ombre douce.
- `BigQuote` : citation en 28-36px, serif italique acceptable ici.
- `PricingCard` : plan vedette avec bordure accent + badge.

## Pièges (AVOID)
- Accumulation : 8 sections moyennes < 5 sections excellentes (axiome 31).
- Palette flottante sans ancrage au sujet (axiome 28).
- « Fonctionnel technique » : si aucune section ne surprend, l'angle est raté (axiome 33).
- Texte lorem/placeholder : invente un produit crédible avec noms, chiffres, témoignages réalistes.

## Données/Images
- Pexels : chercher le CONTEXTE d'usage du produit (bureaux, mains sur clavier, équipe) — jamais d'image « tech abstraite » générique.
- Logos clients : les écrire en typo stylée (pas d'images), noms d'entreprises inventés crédibles.
