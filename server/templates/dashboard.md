---
domaine: dashboard
détection: [dashboard, tableau de bord, admin, analytics, analytique, kpi, monitoring, métriques, metrics, stats, statistiques, suivi, panel, backoffice, reporting, temps réel, real-time, observabilité]
---
# Dashboard analytique / admin

## Angle avant tout
Décide UN angle non-évident AVANT d'écrire du code, et écris-le en commentaire en tête d'App :
- **La question unique** : le dashboard répond d'abord à « est-ce que tout va bien ? » — UN indicateur santé dominant (grand, coloré, verbal : « Tout est nominal ») avant toute grille de chiffres ; le détail est un drill-down.
- **La salle de contrôle** : esthétique mission control — densité assumée, typo mono pour les valeurs, timestamps qui tiquent, indicateurs live qui pulsent ; on surveille un système vivant.
- **Le récit du jour** : le dashboard raconte (« Mardi 14 h — pic inhabituel sur l'Europe ») avec annotations posées sur les courbes et faits saillants rédigés, au lieu d'aligner des widgets muets.
Interdit : la grille 4×2 de cards blanches identiques avec un chiffre + une flèche verte chacune — le dashboard-template que tout LLM régurgite.

## Squelette
1. **Barre haute** (56-64px) : nom du système + sélecteur de période (24h/7j/30j) + statut global (point pulsant + libellé). Pas de barre de recherche décorative.
2. **Rangée santé** (~25 % du viewport) : LA métrique maîtresse en très grand (`clamp(2.5rem, 6vw, 4.5rem)`, tabular-nums) + 3 KPI secondaires nettement plus petits, chacun avec delta signé et sparkline.
3. **Zone principale** (~50 %) : UN grand graphique dominant (courbe temporelle, 2-3 séries max) sur ~66 % de largeur + panneau latéral (répartition ou top-liste) sur ~33 %.
4. **Drill-down** (progressive disclosure) : table dense (8-12 lignes, tri au clic) OU cards détail — sous le pli, jamais en concurrence avec la rangée santé.
5. **Sidebar navigation** : optionnelle ; si présente, icônes + labels, état actif net (fond élevé + accent), 220px ou repliée 56px.

## Design
- **Dark-mode — règles fermes (recherche 2026)** :
  - Base **true grey, JAMAIS noir pur** : fond `#131316`, cards `#1c1c21`, hover `#232329` — élévation par décalages de fond, **sans bordures**.
  - Texte : blanc cassé `#e8e8ea`, secondaire `#9a9aa3`, muet `#71717a`.
  - **UN accent saturé** (infra → cyan ; ventes → ambre ; santé → menthe) pour sélection, série principale et statut OK. Tout le reste en gris neutres — la retenue fait le premium. Rouge/orange réservés aux alertes réelles.
- **Palette dataviz DÉDIÉE au sombre** : séries désaturées douces (`#7dd3c8`, `#8ea6e8`, `#c9a2e0`, `#e0b98a`) — JAMAIS une palette claire inversée (résultat néon illisible). Gridlines à 3-8 % au-dessus de la base (`rgba(255,255,255,0.06)`), labels d'axes muets 11px.
- **Typo** : `'Inter', system-ui` en **medium/semi-bold (500-600) — jamais thin/light sur fond sombre, pas d'italique**. Valeurs : `'JetBrains Mono', monospace` ou `font-variant-numeric: tabular-nums` partout — les colonnes de chiffres ne dansent pas.
- **Motion** (minimum 3, concrètes) :
  - Valeurs à l'arrivée : count-up interpolé 600ms ease-out — un chiffre qui compte est vivant, un chiffre qui saute est mort.
  - Courbes : tracé progressif au chargement (`stroke-dashoffset` animé, 800ms).
  - Hover de card : élévation par fond (`#1c1c21`→`#232329`, 150ms) ; tooltip de graphique avec crosshair vertical qui suit le curseur.
  - Point de statut live : pulse opacity 2s infinite (halo `box-shadow`).
  - Respecter `prefers-reduced-motion` : valeurs affichées directement, pas de pulse ni de tracé progressif.

## Composants canoniques
- `KpiCard` : label 11-12px petites capitales muettes + valeur tabular-nums dominante + delta signé coloré (`+12,4 %` menthe / `−3,1 %` corail doux) + sparkline 60×24px SVG inline.
- `TimeChart` : SVG maison ou canvas — 2-3 séries max, zone sous courbe en dégradé accent 12 %→0, tooltip crosshair, 4-5 ticks d'axe seulement.
- `StatusDot` : 8px, couleur d'état, halo pulsant si live.
- `DataTable` : lignes 44-48px, séparateurs `rgba(255,255,255,0.05)`, nombres alignés à droite, hover de ligne par fond, tri par en-tête.
- `PeriodSwitch` : segmented control, segment actif fond élevé + accent, déclenche la ré-interpolation des courbes.

## Pièges (AVOID)
- Noir pur `#000` + cards bordées de gris : le combo « bootstrap sombre » — élévation par fond, pas par bordure.
- Arc-en-ciel de widgets : chaque card avec SA couleur = plus aucune hiérarchie d'alerte ; l'accent unique est non-négociable.
- Tout montrer d'un coup : 12 graphiques au même niveau = aucune réponse à « ça va ? » — la métrique maîtresse doit écraser visuellement le reste (progressive disclosure).
- Données simulées incohérentes : un total qui ne somme pas ses parties, un delta contredit par sa sparkline — les chiffres doivent se recouper entre widgets.
- Typo thin « élégante » sur fond sombre : illisible et scintillante — graisse 500 minimum, partout.

## Données/Images
- ZÉRO image externe : le dashboard est fait de chiffres, de courbes et de SVG maison.
- Simuler :
  - Un système nommé et incarné (« Orbital — CDN européen », « Boutique Ferme du Vallon ») avec ses métriques propres, pas des « Metric 1/2/3 ».
  - Séries temporelles à forme crédible : saisonnalité jour/nuit, tendance de fond, 1-2 pics anormaux racontables (annotés sur la courbe).
  - Cohérence transversale : total = somme des segments, deltas alignés sur les courbes, mêmes ordres de grandeur entre widgets.
  - Timestamps relatifs (« il y a 2 min ») ; 8-12 lignes de table avec noms réalistes du domaine surveillé (routes, produits, serveurs).
