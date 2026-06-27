# Plan — 20 projets (10 style Mango · 10 zéro style) — 2026-06-27

> Lot de validation grandeur nature. **But** : nourrir la donnée (souveraineté, réutilisation, classes de blocage, reviews QCM) sur des sujets RÉELS et variés. 10 projets avec le **goût Mango** (`clientMode: false`), 10 **sans aucun style Mango** (`clientMode: true`, l'identité du sujet pilote l'esthétique). Tous différents.

## ⭐ Contrainte n°1 — Contexte d'abord (NON négociable, toutes les apps)

**Avant de coder, Mango cherche sur Internet l'IDENTITÉ réelle du sujet, puis développe autour.**
- **Marque** → identité de marque (site officiel, charte, histoire, produits).
- **Objet** → identité de l'objet (origine, design, matériaux, dates).
- **Lieu / site historique** → l'histoire (ex. **Wikipédia**).

**Séquence d'amont (avant le 1ᵉʳ écran)** : `planifier` #160 → `sharingan_url`/moodboard #46 (2-3 leaders du domaine) → `chercher_web`/`extraire_site` #154/#159 (identité + histoire) → `chercher_image` #153 (vraies photos Pexels) → synthèse `.perfect-plan.md` #99. → *cerner d'abord, coder ensuite.*

## Contraintes habituelles (rappel)
- **Vraies images obligatoires** (Pexels / extraites), jamais de placeholder.
- **Tracer la stack réellement utilisée** par app (front · styling · state · data · libs).
- **Gardien de clôture #161** (intention/goût/QA) avant `finish` · **vérifier que ça MARCHE** (`teste_parcours` #155), pas juste que ça compile.

## Comment lancer (rappel `/api/chat`)
`{ prompt, projectName, mode: "elite", clientMode, model }` — **`clientMode:false` = style Mango · `clientMode:true` = zéro style**. Cerveau de build recommandé : **🎓 Élève (GLM)** pour tout le lot (mesure la souveraineté ; bascule libre).

---

## Lot 1 — Style Mango (`clientMode: false`) · l'identité pilote le CONTENU, le goût Mango pilote l'esthétique

| # | projectName | Sujet & identité à rechercher | Type d'app | Stack hint | Modèle | Effort |
|---|---|---|---|---|---|---|
| 1 | `mango-aesop` | **Aesop** (marque cosmétique) — apothicaire minimaliste, ingrédients botaniques (aesop.com, Wikipédia) | Vitrine produit / e-boutique | React+Tailwind +framer-motion | 🎓 Élève | S |
| 2 | `mango-eames` | **Eames Lounge Chair** (objet) — Herman Miller, 1956, contreplaqué moulé + cuir (hermanmiller, Wikipédia) | Page produit narrative (scroll) | React+Tailwind scroll-storytelling | 🎓 Élève | S→M |
| 3 | `mango-mont-saint-michel` | **Mont-Saint-Michel** (lieu) — abbaye, marées, histoire (Wikipédia) | Guide de visite + carte | React+**Leaflet** | 🎓 Élève | M |
| 4 | `mango-bialetti` | **Moka Bialetti** (objet) — 1933, Alfonso Bialetti, design octogonal alu | Microsite patrimoine produit | React+Tailwind | 🎓 Élève | S |
| 5 | `mango-tour-de-france` | **Tour de France** (événement) — maillots, étapes, histoire (Wikipédia) | Éditorial + suivi d'étapes | React+Tailwind (+carte option) | 🎓 Élève | M |
| 6 | `mango-polaroid` | **Polaroid** (marque) — Edwin Land, SX-70, renouveau instantané | Galerie photo instantané | React+Tailwind | 🎓 Élève | S |
| 7 | `mango-calanques` | **Parc des Calanques** (site naturel) — géologie, faune, sentiers (Wikipédia) | Guide rando + carte | React+**Leaflet** | 🎓 Élève | M |
| 8 | `mango-vespa` | **Vespa** (objet/marque) — Piaggio 1946, design italien d'après-guerre | Showcase patrimoine (scroll) | React+Tailwind +framer-motion | 🎓 Élève | S |
| 9 | `mango-chambord` | **Château de Chambord** (lieu) — François Iᵉʳ, Renaissance, escalier à double révolution | Microsite encyclopédique + visite | React+Tailwind | 🎓 Élève | S→M |
| 10 | `mango-le-creuset` | **Le Creuset** (marque/objet) — 1925, fonte émaillée, couleur « Volcanique » | Catalogue produit coloré | React+Tailwind | 🎓 Élève | S |

## Lot 2 — Zéro style Mango (`clientMode: true`) · l'identité du sujet pilote AUSSI l'esthétique

| # | projectName | Sujet & identité à rechercher | Type d'app | Direction visuelle (du SUJET) | Stack hint | Modèle | Effort |
|---|---|---|---|---|---|---|---|
| 11 | `neutral-rubiks` | **Rubik's Cube** (objet) — Ernő Rubik, 1974 (Wikipédia) | Site ludique interactif | Primaires du cube, ludique géométrique | React+Tailwind | 🎓 Élève | S |
| 12 | `neutral-petra` | **Petra** (lieu, Wikipédia) — Nabatéens, Khazneh, grès rose | Éditorial archéologique | Ocre / grès / désert | React+Tailwind | 🎓 Élève | S |
| 13 | `neutral-patagonia` | **Patagonia** (marque) — Yvon Chouinard, 1% for the Planet, militantisme | Site outdoor / militant | Identité terreuse Patagonia | React+Tailwind | 🎓 Élève | S |
| 14 | `neutral-concorde` | **Concorde** (objet) — 1969, supersonique, retraite 2003 | Patrimoine aéronautique | Rétro-futuriste BA / Air France | React+Tailwind | 🎓 Élève | S→M |
| 15 | `neutral-pompei` | **Pompéi** (lieu) — Vésuve 79 ap. J.-C., fresques (Wikipédia) | Microsite archéologique | Rouge fresque romaine, pierre | React+Tailwind | 🎓 Élève | S |
| 16 | `neutral-hellfest` | **Hellfest** (festival réel) — Clisson, line-ups metal | Affiche / programme festival | Noir / rouge brutaliste metal | React+Tailwind | 🎓 Élève | S |
| 17 | `neutral-angkor` | **Angkor Wat** (lieu) — XIIᵉ s., Empire khmer (Wikipédia) | Guide temple + carte | Pierre / safran khmer | React+**Leaflet** | 🎓 Élève | M |
| 18 | `neutral-leica` | **Leica** (marque/objet) — Oskar Barnack 1925, point rouge | Précision allemande minimaliste | Noir / argent, point rouge | React+Tailwind | 🎓 Élève | S |
| 19 | `neutral-route66` | **Route 66** (culturel/historique) — « Mother Road » (Wikipédia) | Road trip americana | Néon diner rétro 50s | React+Tailwind (+carte) | 🎓 Élève | M |
| 20 | `neutral-bauhaus` | **Bauhaus** (mouvement design) — Weimar 1919, Gropius | Hommage design géométrique | Rouge/jaune/bleu, formes pures | React+Tailwind | 🎓 Élève | S |

---

## Notes d'exécution
- **Stacks riches** : `Leaflet` (cartes #3/#7/#17/#19) et `framer-motion`/`gsap` sont dans l'allowlist `add_dependency` (curée). `three.js`/`@react-three/fiber` dispo si un objet mérite la 3D (ex. Eames) — optionnel, ne pas forcer. Tracer la stack réelle par app.
- **Diversité voulue** : marques (Aesop, Polaroid, Le Creuset, Patagonia, Leica) · objets (Eames, Bialetti, Vespa, Rubik's, Concorde) · lieux/histoire (Mont-Saint-Michel, Chambord, Calanques, Petra, Pompéi, Angkor) · culture/événements (Tour de France, Hellfest, Route 66, Bauhaus). App-types variés : vitrine, page produit, guide+carte, éditorial, galerie, microsite.
- **Mesures à relire après le lot** : `/api/sovereignty` (taux Claude tient-il à 0 % ?), `/api/reuse` (réutilisation décolle-t-elle ?), classes de blocage Stratège, reviews QCM → axiomes.
- **Piste pendant le lot** : si la séquence « contexte d'abord » n'est pas spontanée, l'**ancrer dans le prompt de génération** (clause dédiée, comme la clause de fidélité) — proposition à valider par Raf.
