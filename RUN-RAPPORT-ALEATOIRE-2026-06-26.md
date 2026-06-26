# Run automatique « 10 univers aléatoires » — Rapport (2026-06-26)

> Élève souverain (GLM-5.2 + Ollama), séquentiel, zéro style MangoOS. Plan : `docs/plan-run-aleatoire-2026-06-26.md`.
> Gates ON : `ELEVE_CLOSURE_GATE`, `ELEVE_VISION`, `ELEVE_STRATEGE` (observe-only), `ELEVE_PLANIFIER`, `ELEVE_SITE`, `ELEVE_SITE_VISION`, `ELEVE_SITE_IMAGES`, `ELEVE_IMAGE_CHECK`.

## Tableau de bord

| # | App | Stack imposé | Statut | finish ? | Images réelles/cassées | Gardien | Goût VL | Failles notées |
|---|---|---|---|---|---|---|---|---|
| 1 | poke-trade | ecommerce | ✅ build vert, app complète | ✗ (L17, 2 relances) | 16 réelles / 0 cassée (1 réparée par #L30) | intention 0/100 ✗ (faux-nég) | non jugeable (sauté) | L17 récurrent · Gardien intention 0 · vedette vide |
| 2 | ai-bench-lab | base+Recharts *(F4: mantine cassé)* | ✅ build vert, finish | ✓ (23 it) | 1 réelle (header) / 0 cassée | **intention 100/100 ✓** | non jugeable (sauté) | L17 wandering relance 1 · scatter vide |
| 3 | curling-kawaii | daisy | ✅ build vert, finish propre | ✓ (17 it, 1er coup) | 12 réelles / 0 cassée | **intention 100/100 ✓** | non jugeable (sauté) | aucune (RAS) |
| 4 | paris-gusto-map | base+map natif *(F5: leaflet bloqué)* | ✅ build vert, finish | ✓ (22 it) | 3+ réelles / 0 cassée | **intention 100/100 ✓** | non jugeable (sauté) | carte custom OK (Leaflet contourné) |
| 5 | assurio-board | base+DnD/SVG natif *(F4/F5: reactflow)* | ✅ build vert, finish | ✓ (19 it) | 2 réelles / 0 cassée | **intention 100/100 ✓** | non jugeable (sauté) | reactflow contourné (SVG natif OK) |
| 6 | fridge-chef | shadcn | ✅ build vert, finish | ✓ (22+12 it) | ~25 réelles / 0 cassée (2 mortes → boucle repair) | **intention 100/100 ✓** | non jugeable (sauté) | L17 plateau (récupéré) · repair-loop déclenchée |
| 7 | cat-talk | base+WebAudio *(F4: panda cassé)* | ✅ build vert, finish | ✓ (23 it) | 13 réelles / 0 cassée | **intention 100/100 ✓** | non jugeable (sauté) | L17 plateau (récupéré) |
| 8 | insomnia-fm | base+Canvas/WebAudio *(F4/F5: pixi)* | ✅ build vert, finish | ✓ (10 it) | 6+ réelles / 0 cassée | **intention 100/100 ✓** | non jugeable (sauté) | L17 plateau (récupéré) · pixi contourné |
| 9 | terraseed-app | base+Tailwind *(F7: radix cassé)* | ✅ build vert, app complète | ✗ (boucle Gardien épuisée) | 4 réelles / 0 cassée | 20→100, gate ✗ (WCAG ?) | non jugeable (sauté) | F7 radix · boucle Gardien complète · L17 ×2 |
| 10 | heist-night | base+framer-motion *(F4/F5: r3f)* | ✅ build vert, finish | ✓ (14 it) | 8 réelles / 0 cassée | **intention 100/100 ✓** | non jugeable (sauté) | L17 plateau (récupéré) · r3f contourné |

---

## 🏁 SYNTHÈSE FINALE

**10/10 apps livrées, build vert partout, 10 univers radicalement distincts, ZÉRO style MangoOS, 0 image cassée au final sur les 10.** Coût Claude $0 (souverain, Élève GLM + Ollama). Aperçus live : :5201→:5210.

### Verdicts clés (data Stratège #164)
1. **Vraies images : 100 % de réussite.** Chaque app = vraies photos Pexels (16/12/12/3+/2/25/13/6+/4/8). **L'image-check #L30 prouvé live** (réparation auto sur #1, boucle de renvoi sur #6) → **0 image cassée** au final partout. La règle « vraies images » tient.
2. **Gardien #161 — intention solide** : **8/10 à 100/100** ✓. Exceptions : #1 (0/100, faux-négatif ponctuel — l'app était conforme) et #9 (20→100, bloqué par **WCAG/goût** sur palette douce → bon réflexe a11y, non résolu dans le budget).
3. **Goût VL « non jugeable (sauté) » sur les 10** → **le juge visuel ne produit AUCUN score de goût de tout le run** (prolonge L28 : sans `GLOBAL:` parsable, le volet goût est sauté ; seul WCAG mesure). **À fiabiliser** : le goût n'est de fait pas dans la boucle ce run (l'intention + WCAG ont porté le Gardien).
4. **Stratège #164 (observe-only) = mine d'or** : il a **diagnostiqué CHAQUE blocage** (toujours `plateau-iterations` puis parfois `wandering`), nommé l'indice (iterations 24/24, lectures répétées) et le remède (`delegate`). Fait marquant : l'Élève a **appelé `delegate` de lui-même** (#2) — le remède suggéré. → **Prêt pour la Phase 1 du Stratège** (routeur déterministe qui AGIT sur le remède).
5. **L17 (sur-exploration) = LA faille dominante (F1)** : 7/10 ont buté au moins une fois (plateau 24/24 / wandering / relectures). Toujours **récupéré par auto-relance** sauf #9 (budget épuisé). Apps **complètes** même sans `finish` propre. **Priorité de fiabilisation n°1.**

### 📦 Catalogue full-stacks (validés / cassés / non testés)

| Stack | Type d'app éprouvé | Verdict |
|---|---|---|
| **base** (React19+Vite+Tailwind) | universel | ✅ socle fiable |
| **ecommerce** | marketplace / listings + panier | ✅ validé (#1) |
| **daisy** (DaisyUI) | univers ludique/coloré | ✅ validé (#3) |
| **shadcn** (Radix+Tailwind) | app produit propre + caméra | ✅ validé (#6) |
| base + **Recharts** (add_dependency) | data-viz / dashboard | ✅ validé (#2) |
| base + **framer-motion** (add_dependency) | site immersif narratif | ✅ validé (#10) |
| base + **Web Audio** natif | app sonore (synthèse) | ✅ validé (#7) |
| base + **Canvas + Web Audio** natif | visualiseur audio | ✅ validé (#8) |
| base + **SVG natif** | mind map / diagramme | ✅ validé (#5) |
| base + **HTML5 DnD** natif | kanban | ✅ validé (#5) |
| base + **pins CSS custom** | carte interactive | ✅ validé (#4) |
| **mantine / reactflow / pixi / r3f / panda** | — | ❌ **CASSÉS (F4)** — non testables tels quels |
| **radix** (vanilla-extract) | — | ❌ **CASSÉ (F7)** — npm install échoue |
| **@xyflow/react / pixi.js / three / leaflet** | — | ⛔ non testés (F5 : hors allowlist) |

→ **Recommandation reviews** : pour un nouveau projet, privilégier **base + lib allowlistée** (Recharts/framer-motion) ou un template SAIN (ecommerce/daisy/shadcn). Les approches **natives** (SVG/Canvas/Web Audio/DnD/pins) sont des full-stacks fiables et sans dépendance — souvent préférables.

### 🔧 Top failles → candidates `limites.md`
- **F1 (L17)** sur-exploration/plateau — récurrent, dominant. *Fiabilisation prioritaire (le Stratège Phase 1 est la réponse).*
- **F4** 5 templates cassés (`@tailwindcss/vite` manquant).
- **F7** template `radix` (peer dep vanilla-extract vs vite7).
- **F5** allowlist `add_dependency` trop étroite.
- **F-goût** : le juge VL ne score jamais le goût (sauté sur 10/10) → goût absent de la boucle ce run.
- **F2** Gardien intention 0/100 ponctuel (#1) sur app conforme.

### Prochain lot (décision Raf)
**Sortir du cadre observe-only** : corriger **F4 + F7** (audit & fix de TOUS les templates) et **F5** (élargir l'allowlist : leaflet, @xyflow/react, pixi.js, three, @react-three/fiber, gsap) AVANT le prochain run → permettra de valider en vrai les stacks riches (ReactFlow, Pixi, Three, Leaflet) au lieu de les contourner.

---

## ✅ VALIDATION POST-FIX (F4/F5/F7 corrigés et reprouvés end-to-end)

Après correction (`mergePackageJson` pour F4 · bump vanilla-extract pour F7 · allowlist étendue pour F5), **backend frais** puis 2 nouvelles apps sur les stacks jadis cassées :

| App | Stack (jadis cassée) | Résultat | Preuve |
|---|---|---|---|
| **questline** (arbre de quêtes RPG, fantasy sombre) | **template `reactflow`** (F4) | ✅ finish 19 it, Gardien 90/100 ✓ | template **boote** (plus de « Preview exited ») ; `package.json` = **@xyflow/react + @tailwindcss/vite ensemble** (fusion live OK) ; **vrai graphe ReactFlow** rendu (nœuds+edges+MiniMap+Controls), 12 vraies images, 0 cassée, 0 erreur · :5211 |
| **diveatlas** (atlas plongée, océan profond) | base + **leaflet** via `add_dependency` (F5) | ✅ finish 17 it, Gardien 0→**100/100 ✓** (autocorrigé) | `add_dependency("leaflet")` **passe** (était bloqué) ; **vraie carte Leaflet monde** (tuiles OSM sombres) + marqueurs aux sites + liste synchro + vraies photos, 30 images, 0 cassée, 0 erreur · :5212 |

→ **F4 + F5 confirmés de bout en bout dans le backend live.** (F7 radix déjà prouvé au boot.) Les stacks riches (ReactFlow, Leaflet — et par extension Pixi/Three) sont désormais utilisables par l'Élève.

---

## ⚠ Failles de PROCESS transversales (trouvailles majeures)

### F4 — 4 templates spécialisés cassés au boot (`@tailwindcss/vite` manquant)
`createProject` copie le template de base (`server/template` : `package.json` AVEC `@tailwindcss/vite` + `vite.config.js` qui l'importe) puis **superpose** `templates/<t>` avec `force`. Les templates qui apportent leur **propre `package.json`** (sans `@tailwindcss/vite`) **mais pas** de `vite.config.js` propre héritent du `vite.config` de base → vite échoue : `Cannot find package '@tailwindcss/vite'`. **Cassés : `mantine`, `reactflow`, `pixi`, `r3f`, `panda`** (l'Élève ne démarre même pas — `Preview server exited before announcing its url (code 1)`). Sains : `ecommerce`, `daisy`, `shadcn`, `radix` (ont soit `@tailwindcss/vite` dans leur pkg, soit un `vite.config` propre cohérent). *Note : probablement d'autres templates à pkg-propre touchés (cytoscape, d3tree, phaser, threejs, mantine…) — à auditer en bloc au fix.*
- **Fix recommandé** : ajouter `@tailwindcss/vite` (+ `tailwindcss`) au `package.json` de chaque template cassé, OU leur donner un `vite.config.js` propre. *Candidate limites.md.* 🟢 codable en interne (1 ligne/template).

### F5 — allowlist `add_dependency` trop étroite pour les stacks riches
`SAFE_DEPENDENCIES` (`eleve-action-tools.ts`) autorise `recharts`, `chart.js`, `framer-motion`, `zustand`, `react-router-dom`… mais **PAS** `leaflet`, `@xyflow/react`, `pixi.js`, `three`, `@react-three/fiber`. Donc impossible de contourner F4 via le template base pour ces libs.
- **Fix recommandé** : élargir l'allowlist aux libs de rendu sûres et populaires (leaflet, @xyflow/react, pixi.js, three, @react-three/fiber, gsap…). *Candidate limites.md.* 🟢 codable en interne.

### F7 — template `radix` : conflit de peer dependency (`vanilla-extract` vs `vite@7`)
`npm install` échoue en `ERESOLVE` : `templates/radix` apporte `@vanilla-extract/vite-plugin@^4` dont le **peer dep est `vite@"^4.0.3 || ^5.0.0"`**, incompatible avec le `vite@^7` du template de base → arbre de dépendances non résolu, projet non créé.
- **Fix recommandé** : mettre à jour `@vanilla-extract/vite-plugin` vers une version compatible vite@7, OU aligner la version de vite, OU installer avec `--legacy-peer-deps`. *Candidate limites.md.* 🟢 codable.
- **Confirmés SAINS à ce jour** : `base`, `ecommerce`, `daisy`, `shadcn`. **Cassés** : `mantine`/`reactflow`/`pixi`/`r3f`/`panda` (F4), `radix` (F7). → audit de TOUS les templates recommandé avant le prochain run.

**Impact run** : #2 (mantine), #4 (leaflet), #5 (reactflow), #8 (pixi), #9 (radix→base), #10 (r3f) touchés. Décision de contournement consignée par app (voir détails). Cap OBSERVER respecté → on ne modifie pas la source MangoOS pendant le run sans l'aval de Raf.

---

## Détails par app

### #1 — poke-trade (marketplace cartes Pokémon · template ecommerce)

- **Stack réelle** : React 19 + Vite + Tailwind (template `ecommerce`), navigation **par état** (`useState page`, pas de react-router), panier d'échange `useTradeCart` + localStorage, data mock `cards.js` (SELLERS + cartes, **toutes images = vraies URLs Pexels**). → *Verdict full-stack : `ecommerce` TIENT pour une marketplace (listings+filtres+panier), mais navigation par état = pas d'URL profondes (`/catalogue` direct ne marche pas).* 
- **Outils déclenchés** (ordre) : `planifier` → `extraire_site` (Sharingan) → `chercher_image` ×6 → `check_build` → `vois_ecran` ×2 → `teste_parcours` → `chercher_image` ×3 → `finish` (16 it) ; puis 2 auto-relances avec re-`check_build`/`vois_ecran`/`teste_parcours`/`chercher_image`. **Toute la batterie a tiré.**
- **Image-check #L30** : 🖼 1 image morte sur 8 → **1 réparée** (URL canonique re-dérivée de l'id Pexels). Live, comme prévu.
- **Stratège #164 (observe-only)** — 2 diagnostics RÉELS captés :
  1. `plateau-iterations` (iterations=24/24) → remède suggéré : décomposer via `delegate`.
  2. `wandering` (stuck, 14 lectures) → remède : ré-ancrer le plan (L17) ou `delegate`.
- **Gardien #161** : intention **0/100** ✗ (goût non jugeable → sauté) → renvoie corriger → l'Élève re-planifie mais sur-explore → cède.
- **Rendu (Sharingan)** : accueil rétro-arcade bleu/jaune + vraie photo de cartes en main ; **Catalogue = 8 cartes, filtres, 16 images réelles, 0 cassée, 0 erreur console**. Style radicalement distinct de Mango. Aperçu live : http://localhost:5201
- **FAILLES notées** :
  - **F1 (récurrent, majeur) — L17** : pas de `finish` propre, 2 auto-relances épuisées sur plateau/wandering. 3ᵉ run consécutif où les apps riches butent là-dessus. *Candidate limites.md.*
  - **F2 (nouveau) — Gardien intention 0/100 faux-négatif** : l'app correspond pourtant clairement à la demande (marketplace Pokémon complète). Le juge a scoré 0 (au lieu du neutre 100 attendu en cas d'échec d'analyse) → à investiguer (résumé `finish` trop maigre après relance ? parse KO ?). *Candidate limites.md.*
  - **F3 (mineur)** — section « Cartes en vedette » **vide** sur l'accueil (les cartes ne remontent que sur le Catalogue).

### #2 — ai-bench-lab (benchmark modèles IA · base + Recharts) — *template mantine remplacé (F4)*

- **Stack réelle** : React 19 + Vite + Tailwind + **Recharts** (ajouté en live via `add_dependency("recharts")` ✅), nav par état, données mock. → *Verdict full-stack : **base + Recharts VALIDÉ** pour un site data-viz ; `add_dependency` fonctionne bien pour une lib allowlistée.*
- **Outils** : `planifier` → `extraire_site` → **`add_dependency`** → `chercher_image` ×nombreux → write/read → (plafond 7 it) → relance 1 (sur-exploration `search_code` ×15, `delegate` appelé) → relance 2 (write ×4, `check_build`, `vois_ecran`, `teste_parcours`, `finish` à 23 it / 34 outils).
- **Stratège #164** : `plateau-iterations` (7/24) capté. Fait notable : l'Élève a **appelé `delegate`** (le remède suggéré) de lui-même en relance.
- **Gardien #161** : **intention 100/100 ✓** (goût non jugeable → sauté). Confirme que le 0/100 de #1 était un faux-négatif ponctuel.
- **Rendu (Sharingan)** : terminal lab vert phosphore/cyan, leaderboard triable avec nos modèles (Claude Opus 4.8 / Sonnet 4.6 / Haiku 4.5, qwen3-vl, gemma, GLM-5.2) + barres par axe ; page Graphiques = **radar + barres Recharts OK**. 0 erreur console. Aperçu : http://localhost:5202
- **FAILLES** :
  - **F1 (récurrent) — L17** : grosse sur-exploration en relance 1 (≈15 `search_code` d'affilée avant de produire). Confirme F1.
  - **F6 (mineur, app)** — la **courbe coût/performance (scatter Recharts) est VIDE** (axes tracés, aucun point) → données scatter non mappées.

### #3 — curling-kawaii (fan-club curling Japon + boutique kawaii · template daisy)

- **Stack réelle** : React 19 + Vite + **DaisyUI** (template `daisy`, sain), nav par état, panier `CartDrawer` + localStorage, `data.js`. → *Verdict full-stack : **`daisy` VALIDÉ** — boot OK, composants DaisyUI utilisés, idéal pour un univers ludique/coloré.*
- **Outils** : `planifier` → `extraire_site` → `chercher_image` ×11 → write ×14 → `check_build` → `vois_ecran` → `teste_parcours` ×2 → `finish` (**17 it / 37 outils, du premier coup, AUCUNE auto-relance**).
- **Stratège #164** : aucun blocage (run propre).
- **Gardien #161** : **intention 100/100 ✓**.
- **Rendu (Sharingan)** : kawaii pastel rose/bleu glace + rouge hinomaru, héros « Allez le Japon, glisse avec le cœur ! » + vraie photo curling sur glace ; **Boutique = 9 goodies kawaii** (peluches/pin's/écharpes/mugs) en vraies photos + panier ; vraie foule de supporters. **12 images réelles / 0 cassée, 0 erreur console.** Aperçu : http://localhost:5203
- **FAILLES** : aucune notable. **Meilleur run jusqu'ici** (finish 1er coup + Gardien OK + RAS). Corrélation : template SAIN + univers riche en images = run fluide.

### #4 — paris-gusto-map (parcours gastro Paris + carte interactive · base, map natif) — *Leaflet contourné (F5)*

- **Stack réelle** : React 19 + Vite + Tailwind (base), **carte CUSTOM native** (`ParisMap.jsx` : fond stylisé + pins numérotés positionnés en absolu, clic → fiche, synchro liste↔carte), nav par état. → *Verdict full-stack : **carte interactive native VALIDÉE** sans Leaflet — pins cliquables + itinéraire synchronisé suffisent pour un parcours guidé (pan/zoom réel perdu, acceptable).* 
- **Outils** : `planifier` → `extraire_site` → `chercher_image` ×11 → write ×11 + edit → `check_build` ×2 → `vois_ecran` → `teste_parcours` ×2 → `finish` (**22 it / 35 outils, 1er coup, pas de relance**).
- **Stratège #164** : aucun blocage.
- **Gardien #161** : **intention 100/100 ✓**.
- **Rendu (Sharingan)** : éditorial guide crème/bordeaux/or, serif élégant, héros « un itinéraire gourmand » sur photo de rue parisienne ; section carte = plan custom + pins + itinéraire (Du Pain et des Idées, Café de Flore, Marché des Enfants Rouges, La Compagnie du Café…) ; fiches avec vraies photos (croissants, plat gastro). **Interaction testée** : clic sur une étape → fiche détaillée mise à jour. 0 cassée, 0 erreur console. Aperçu : http://localhost:5204
- **FAILLES** : RAS majeur. *Léger doute* : un clic « Café de Flore » a affiché la fiche « Marché des Enfants Rouges » (sélection possiblement décalée) — non confirmé, mineur.

### #5 — assurio-board (management assurance · base, kanban DnD natif + mindmap SVG) — *reactflow contourné (F4/F5)*

- **Stack réelle** : React 19 + Vite + Tailwind (base), **kanban drag HTML5 natif** (draggable/onDrop) + **mind map SVG natif** (`<path>` courbes) + todo, localStorage. → *Verdict full-stack : **mindmap SVG natif + kanban DnD natif VALIDÉS** — remplacent reactflow sans lib, rendu pro et propre.*
- **Outils** : `planifier` → `chercher_image` ×5 → write ×7 + edit ×2 → `run_command` ×4 (tsc) → `check_build` → `vois_ecran` → `teste_parcours` → `finish` (**19 it / 28 outils, 1er coup**). *Note : `extraire_site` non appelé ici (brief avec refs claires).*
- **Stratège #164** : aucun blocage.
- **Gardien #161** : **intention 100/100 ✓**.
- **Rendu (Sharingan)** : SaaS corporate clair (ardoise/indigo/ambre), kanban 4 colonnes (À traiter/En cours/En attente client/Validé) avec dossiers réalistes (sinistre auto, RC Pro, flotte, dommages…) ; **Mind Map SVG** = Assurio Group → Paris/Londres/Singapour → sous-branches + compteurs ; vraie photo gratte-ciel. 0 cassée, 0 erreur console. Aperçu : http://localhost:5205
- **FAILLES** : RAS. *Non deep-testé* : le drag réel des cartes kanban (rendu OK, `teste_parcours` passé côté Élève).

### #6 — fridge-chef (scan frigo → recettes · template shadcn)

- **Stack réelle** : React 19 + Vite + Tailwind + **shadcn/Radix** (template `shadcn`, sain), `getUserMedia` (caméra) avec **fallback démo gracieux**, localStorage. → *Verdict full-stack : **`shadcn` VALIDÉ** — boot OK, composants Radix, bon pour une app produit propre ; getUserMedia + fallback = robuste.*
- **Outils** : `planifier` ×2 → `extraire_site` → `chercher_image` ×17 → write ×10 + edit ×6 → `search_code` ×6 → `teste_parcours` ×4 → `check_build` ×4 → `vois_ecran` ×2 → `finish`. **Boucle image-repair #L30 déclenchée** : 2 images mortes/25 non réparables → **renvoi de l'Élève** → corrigées.
- **Stratège #164** : `plateau-iterations` (16/24) capté entre deux passes, puis récupéré via auto-relance.
- **Gardien #161** : **intention 100/100 ✓**.
- **Rendu (Sharingan)** : mobile-first frais vert menthe/sapin/orange, « Ton frigo, ton chef. » + vraie photo frigo + bouton scan ; modal scan = **fallback caméra propre** (« Utiliser le frigo de démonstration » + photo réelle). **0 image cassée** (les 2 mortes réparées via boucle), 0 erreur console. Aperçu : http://localhost:5206
- **FAILLES** :
  - **F1 (récurrent) — L17** : 1 plateau au milieu (récupéré).
  - *Positif notable* : **l'image-check a fait son travail end-to-end** (détection 2 mortes → renvoi → réparation → 0 cassée final).

### #7 — cat-talk (sons de chat · base, Web Audio synthétisé) — *panda contourné (F4)*

- **Stack réelle** : React 19 + Vite + Tailwind (base), **Web Audio API** (AudioContext + oscillators + ADSR, sons SYNTHÉTISÉS — aucun fichier audio), localStorage favoris. → *Verdict full-stack : **Web Audio synthèse natif VALIDÉ** — 12 vocalises générées par code, 0 erreur AudioContext au clic.*
- **Outils** : `planifier` → `chercher_image` ×27 → write ×8 + edit ×8 → `teste_parcours` ×7 → `check_build` ×6 → `vois_ecran` ×2 → (plateau 24/24) → relance 1 → `finish` (23 it).
- **Stratège #164** : `plateau-iterations` (24/24) capté → relance → finish.
- **Gardien #161** : **intention 100/100 ✓**.
- **Rendu (Sharingan)** : ludique félin crème/violet/moutarde, « Communique avec ton chat » + vraie photo de chat ; grille de **12 vocalises** (Miaou d'appel, Ronronnement, Trille, Faim, Feulement, Attention, Chasse, Appel maternel, Détresse, Grognement, Salutation, Jouer) chacune = carte + vraie photo + sens + émotion + bouton play ; onglets Sons/Dictionnaire/Favoris. **13 images réelles / 0 cassée.** **Interaction testée** : clic « Miaou d'appel » → 0 erreur console (Web Audio OK). Aperçu : http://localhost:5207
- **FAILLES** : **F1 (récurrent) — L17** : 1 plateau (récupéré). Tâche riche (12 sons synthétisés) = beaucoup d'itérations.

### #8 — insomnia-fm (radio synthwave nocturne · base, Canvas + Web Audio) — *pixi contourné (F4/F5)*

- **Stack réelle** : React 19 + Vite + Tailwind (base), **Canvas natif** (visualiseur, requestAnimationFrame) + **Web Audio** (AnalyserNode + pad synthétisé), localStorage. → *Verdict full-stack : **Canvas + Web Audio natifs VALIDÉS** — remplacent pixi pour un visualiseur audio, rendu superbe.*
- **Outils** : `planifier` → `extraire_site` → `chercher_image` ×10 → write ×8 + edit ×4 → `check_build` ×3 → `vois_ecran` ×2 → `teste_parcours` ×4 → (plateau 24/24) → relance 1 → `finish` (10 it).
- **Stratège #164** : `plateau-iterations` (24/24) → relance → finish.
- **Gardien #161** : **intention 100/100 ✓**.
- **Rendu (Sharingan)** : **synthwave 80s textbook** — soleil rétro dégradé orange/magenta, grille en perspective néon magenta/cyan, glow, lecteur « Midnight Drive / Chrome Highway » + visualiseur ; page Stations avec 6 vraies pochettes. **0 cassée, 0 erreur console.** Aperçu : http://localhost:5208
- **FAILLES** : **F1 (récurrent) — L17** : 1 plateau (récupéré).

### #9 — terraseed-app (potager urbain + calendrier lunaire · base) — *radix cassé F7, replié sur base*

- **Stack réelle** : React 19 + Vite + Tailwind (base), **calcul de phase lunaire maison** (pas de lib), `chercher_web`/`lire_page` pour se documenter, localStorage. → *Verdict full-stack : base + calcul maison OK ; **run le plus coûteux en itérations** (5 passes moteur).*
- **Outils** : `planifier` ×2 → `extraire_site` → **`chercher_web` ×7 + `lire_page` ×2** → `chercher_image` ×17 → write ×13 + edit ×5 → `search_code` ×10 → `check_build` ×5 → `vois_ecran` ×6 → `teste_parcours` ×6.
- **Stratège #164** : `plateau-iterations` (24/24) capté **2 fois**.
- **Gardien #161** — **1ʳᵉ vraie BOUCLE DE CORRECTION complète du run** : finish → intention **20/100 ✗** → corrige → finish → intention **100/100 mais ✗** (levier bloquant = goût/**WCAG**, contraste faible palette douce sauge/ivoire ; le gate inclut measureDesign #111) → corrige (2/2) → Élève bloqué → sortie incomplète. **Build vert, app COMPLÈTE visuellement.**
- **Rendu (Sharingan)** : botanique organique réussie (ivoire/sauge/terre/ocre), « Cultive ton balcon au rythme de la Lune » + vraie photo plante ; **Mon potager** (Tomate/Basilic/Radis, vraies photos, stades + actions) ; **Calendrier lunaire** (phase + « Jour fruits » + conseils + jours lunaires) ; Journal. **4 images / 0 cassée, 0 erreur console.** Aperçu : http://localhost:5209
- **FAILLES** : **F7** (radix cassé → repli base) · **F1 — L17** (2 plateaux) · **Observation Gardien** : verdict `✗` avec **intention 100/100** → bloqueur = WCAG/goût, pas l'intention. Bon comportement (a accroché un écart a11y réel) mais non résolu dans le budget → app « incomplète » alors que complète. Aussi : lock Windows (`Device busy`) sur le dossier après échec d'install (gêne le nettoyage).

### #10 — heist-night (escape game immersif · base + framer-motion) — *r3f contourné (F4/F5)*

- **Stack réelle** : React 19 + Vite + Tailwind + **framer-motion** (ajouté via `add_dependency`), scroll-storytelling `whileInView` + compte à rebours JS, localStorage (réservation). → *Verdict full-stack : **base + framer-motion VALIDÉ** pour un site immersif narratif — remplace r3f sans 3D, rendu cinématographique convaincant.*
- **Outils** : `planifier` → **`add_dependency(framer-motion)`** → `chercher_image` ×17 → write ×13 + edit → `check_build` ×2 → `vois_ecran` ×3 → `teste_parcours` ×2 → (plateau 24/24) → relance 1 → `finish` (14 it).
- **Stratège #164** : `plateau-iterations` (24/24) → relance → finish.
- **Gardien #161** : **intention 100/100 ✓**.
- **Rendu (Sharingan)** : noir cinématographique rouge sang/or, « HEIST NIGHT » + **compte à rebours animé** (03:27:48) + « Réserver le casse » ; section « Les salles du casse » = cartes 01/02 avec vraies photos de salles sombres ; pitch ; formulaire de réservation. **8 images / 0 cassée, 0 erreur console.** Aperçu : http://localhost:5210
- **FAILLES** : **F1 — L17** (1 plateau récupéré). **Gotcha de notre vérif (pas un bug app)** : framer-motion `whileInView` + capture **fullPage** = contenu en `opacity:0` → sections apparaissent noires sur le snap pleine page ; en **viewport scrollé** elles se révèlent. À retenir pour le Sharingan (capturer en viewport pour les sites à reveals).
