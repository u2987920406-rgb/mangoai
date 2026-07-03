---
domaine: crypto-finance
détection: [crypto, bitcoin, ethereum, finance, bourse, stock, marché, market, trading, tracker, portefeuille, wallet, budget, dépenses, expenses, épargne, savings, calculateur, calculator, intérêts, interest, prêt, loan, investissement, investment, cours, ticker]
---
# Finance / crypto / budget

## Angle avant tout
Décide UN angle non-évident AVANT d'écrire du code, et écris-le en commentaire en tête d'App :
- **Le terminal habité** : esthétique Bloomberg apprivoisée — densité mono, tickers qui défilent, chiffres qui tiquent — mais hiérarchisée pour un humain : UNE position dominante, le bruit en périphérie.
- **L'argent comme temps** : chaque montant est traduit en équivalent vécu (« −87 € ce mois = 6 h de travail », « à ce rythme : objectif atteint en mars 2027 ») — le calculateur devient un miroir, pas une feuille de calcul.
- **La météo du marché** : l'état global rendu ambiant — fond, accent et vocabulaire glissent subtilement selon la tendance (marché calme / agité / euphorique), les chiffres confirment ce que l'ambiance annonce.
Interdit : fond noir + dégradés violets + pièces Bitcoin 3D qui flottent — le kitsch crypto-bro de 2021.

## Squelette
1. **Bandeau vital** (20-25vh) : LA valeur maîtresse (total portefeuille, solde, ou cours vedette) en très grand tabular-nums + variation signée du jour + sparkline 7j. C'est la réponse à « où j'en suis ? ».
2. **Graphique principal** (40-45vh) : courbe de la valeur maîtresse, sélecteur de période (1J/7J/1M/1A) — le changement de période interpole la courbe ; min/max de la période annotés dessus.
3. **Liste des positions/postes** (le corps) : 5-8 lignes (actifs ou catégories de budget) — nom + valeur + delta % coloré + sparkline par ligne, triées par poids décroissant.
4. **Calculateur** (si pertinent) : entrées à gauche (sliders + champs), résultat à droite recalculé EN DIRECT à chaque input — jamais de bouton « Calculer ».
5. **Détail au clic** : ligne → panneau avec historique de la position, répartition, min/max de période, 2-3 transactions récentes.

## Design
- **Typo** : TOUS les chiffres en `'JetBrains Mono', 'Roboto Mono', monospace` ou `font-variant-numeric: tabular-nums` — un montant qui change de largeur en tiquant est disqualifiant. Labels/titres : `'Inter', system-ui`, medium/semi-bold (500-600, jamais thin sur fond sombre). Valeur maîtresse : `clamp(2.5rem, 7vw, 5rem)`, graisse 600.
- **Palette** : fond sombre true grey (`#141417`, jamais noir pur), élévation par fonds (`#1c1c20` cards, `#242429` hover), sans bordures :
  - Rouge/vert conventionnels mais RAFFINÉS : vert menthe désaturé `#34d399` et corail `#f87171` — jamais `#00ff00`/`#ff0000` criards.
  - Ces deux couleurs sont réservées EXCLUSIVEMENT aux variations (deltas, flashs) — pas de vert décoratif.
  - UN accent neutre-luxe (ambre doux ou cyan glacier) pour sélection, sliders et interactions.
  - Budget personnel : variante fond clair chaud acceptable, mêmes règles de réserve chromatique.
- **Motion — les chiffres VIVENT** (minimum 3, concrètes) :
  - Toute valeur qui change TIQUE : count-up interpolé 400-600ms ease-out + flash de fond teinté 300ms (vert 8 % si hausse, rouge 8 % si baisse) qui s'efface.
  - Courbe : tracé progressif à l'arrivée (`stroke-dashoffset`, 800ms) et interpolation entre périodes (jamais de re-render sec).
  - Simulation live : 1-3 valeurs mises à jour toutes les 2-4 s (variation ±0,05-0,4 %) via `setInterval` — la page respire.
  - Sliders du calculateur : le résultat suit sans délai perceptible (recalcul à l'événement `input`, pas `change`).
  - Respecter `prefers-reduced-motion` : valeurs directes, pas de tick périodique, le delta coloré reste.

## Composants canoniques
- `HeroValue` : montant tabular-nums géant + badge delta (`+2,34 %` en pastille teintée 12 % de fond) + libellé de période muet.
- `AssetRow` : 48-56px — pastille symbole + nom + sparkline 64×20 SVG inline + valeur alignée à droite + delta coloré ; hover fond élevé.
- `Sparkline` : polyline SVG maison, stroke 1.5px, teintée par le signe de la période, dernier point marqué d'un dot.
- `PeriodTabs` : segmented control, actif fond élevé + accent, déclenche l'interpolation de la courbe.
- `CalcSlider` : range stylé (track fine, thumb 20px accent) + valeur formatée en direct via `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`.
- `TxLine` (budget) : date relative + libellé nommé + catégorie en pastille + montant signé mono.

## Pièges (AVOID)
- Chiffres qui sautent au lieu de tiquer : la vie des nombres est LE critère du domaine — sans interpolation ni tabular-nums, l'app est morte.
- Rouge/vert saturés à pleine puissance partout : ils ne signalent plus rien — désaturés, et uniquement sur les variations.
- Données financières incohérentes : total ≠ somme des positions, un +12 % avec une sparkline qui descend, BTC à 250 € — chaque chiffre doit se recouper avec ses voisins et les ordres de grandeur réels.
- Le calculateur à bouton « Calculer » : recalcul réactif obligatoire, le résultat suit les sliders en direct.
- Surcharge terminal non hiérarchisée : 40 tickers de même taille = aucun point d'entrée ; la valeur maîtresse écrase visuellement tout le reste (progressive disclosure).

## Données/Images
- ZÉRO image externe : symboles d'actifs en pastilles typographiques (initiale + fond teinté par actif) ou SVG maison — tout le reste est chiffres et courbes.
- Simuler :
  - Cours réalistes en ordre de grandeur : BTC ~60-110 k€, ETH ~2-5 k€, actions 10-900 €, taux d'épargne 2-4 %.
  - Historiques en marche aléatoire à tendance : `v *= 1 + (Math.random() - 0.48) * vol` avec volatilité par actif (crypto 3-8 %, actions 1-2 %, livret ~0).
  - Budget : catégories vécues (loyer, courses, sorties, abonnements, transport) avec montants FR plausibles + 2-3 transactions nommées par catégorie (« Monoprix », « Spotify »).
  - Horodatages relatifs (« il y a 12 s », « hier 18:42 ») pour le live et les transactions.
