# Plan — Run automatique « 10 univers aléatoires » (2026-06-26)

> **But** : produire de la **data concrète sur Mango** pour le Plan Stratège (#164) et **débusquer les failles du process**, en générant 10 sites/apps radicalement différents, **zéro style MangoOS**, via l'**Élève souverain** (GLM-5.2 + Ollama). Cap : **OBSERVER** (souveraineté progressive). Claude = superviseur + journal des failles, **n'exécute pas** (sauf déblocage en mode hybride si Raf le réactive).

## Cadre acté (décisions Raf)

| Décision | Choix |
|---|---|
| Exécutant | **Élève souverain** (Mango/GLM `codeur` + Ollama `vision`/`juge`) |
| Cadence | **Séquentiel**, un par un, jusqu'au bout |
| Style | **Aucun ADN MangoOS** — identité inventée et unique à chaque app |
| Images | **Vraies images partout** (Pexels/Internet) · STACK uniquement micro-logos/icônes — *règle permanente enregistrée* |
| **Stack** | **Noter la stack réellement utilisée par app** (front·styling·state·data·libs·backend) → valider des full-stacks par type d'app au fil des reviews. **Mix inhabituels encouragés.** |
| Mon rôle | Superviser, **observer**, **journaliser chaque faille**. Zéro git. |

## Contrainte d'outillage — toute la batterie Élève imposée par projet

Chaque génération DOIT exercer la chaîne complète (gates `ON` pour ce run) :

1. **`planifier`** #160 — tout premier appel (plan-ancre).
2. **`chercher_artefact`** #156 — réutiliser avant de réinventer (sauf le tout premier, où la lib est vide).
3. **`extraire_site`** #159 (**Sharingan au max**) — naviguer → design → VOIR/raisonner (VL) → dossier → images contextuelles, sur un site de référence du thème.
4. **`chercher_image`** #153 / **`chercher_web`** #154 / **`lire_page`** — vraies photos Pexels + se documenter.
5. **`add_dependency`** #146 — libs réelles (react-router, framer-motion, recharts, leaflet…).
6. **`teste_parcours`** #155 — vérifier que ça MARCHE (pas juste que ça compile).
7. **`vois_ecran`** #151 / **Œil-Coach** #152 — regarder le rendu et corriger.
8. **Gardien** #161 (`ELEVE_CLOSURE_GATE=on`) — gate intention + goût + QA en clôture.
9. **`eleve-image-check`** #L30 (ON par défaut) — vérifie/répare les images cassées.
10. **Stratège** #164 (`ELEVE_STRATEGE=on`, **OBSERVE-ONLY**) — capter les diagnostics de blocage = data brute pour P1-4.

## Les 10 univers (tous distincts, identités inventées)

| # | Concept | Type | Direction visuelle inventée (≠ Mango) | Sharingan — site de réf. | Vraies images (thème) |
|---|---|---|---|---|---|
| 1 | **Marketplace cartes Pokémon** entre particuliers | Site + listings | Rétro-arcade pop, bleu électrique + jaune éclair + blanc, cartes brillantes, halos holographiques | tcgplayer / cardmarket | cartes Pokémon, classeurs, mains échangeant |
| 2 | **Benchmark modèles IA** (Claude, Ollama, GLM…) | Site data-viz | Terminal sombre « lab », vert phosphore + cyan, mono + graphes, tableaux de scores | lmarena / artificialanalysis | data centers, circuits, écrans de code |
| 3 | **Fan-club curling Japon** + boutique goodies kawaii | Site + shop | Kawaii pastel, rose poudré + bleu glace + rouge hinomaru, mascottes rondes, stickers | site officiel JCA / boutiques kawaii | curling, glace, goodies/peluches kawaii |
| 4 | **Parcours gastro 2 jours à Paris** + map interactive | App | Éditorial chic « guide », crème + bordeaux + or, sérif élégante, **map Leaflet** | Le Fooding / guide Michelin | plats gastro, bistrots parisiens, rues de Paris |
| 5 | **Management équipe assurance** (mindmap + kanban + todo) | App SaaS | Corporate clair et net, bleu ardoise + indigo + accents ambre, colonnes drag, nœuds | Linear / Trello / Notion | bureaux corporate, réunions, dashboards |
| 6 | **Frigo → scan aliments → recettes** | App mobile | Frais et appétissant, vert menthe + blanc + orange, caméra simulée, cartes-recettes | Yuka / supercook | frigo ouvert, légumes, plats cuisinés |
| 7 | **Communiquer avec son chat** (≥10 sons spécifiques) | App mobile | Ludique félin, violet doux + crème + moutarde, gros boutons sonores, ondes | apps de sons animaux | chats (postures variées), pattes, museaux |
| 8 | **« Insomnia FM »** — radio lo-fi/synthwave nocturne | App audio | Synthwave 80s, bleu nuit + magenta/cyan néon, soleil rétro, visualiseur, CRT | nightwave equivalents | villes néon, cassettes, voitures rétro |
| 9 | **« TerraSeed »** — potager urbain + calendrier de semis lunaire | App | Botanique organique, terre + sauge + ivoire, illustrations nature, calendrier lunaire | almanachs de jardinage | potagers, semis, légumes, lune |
| 10 | **« Heist Night »** — escape game immersif | Site narratif | Noir cinématographique, rouge sang + or, compte à rebours, storytelling scroll | sites d'escape games premium | coffres, ombres, intérieurs sombres |

> 8-9-10 = mes propositions ; Raf peut en swapper une avant le top départ.

## Full-stacks assignés (proposés dans le brief + observer le réel)

> **Principe directeur (Raf 2026-06-26) : le RÉSULTAT FINAL prime.** La stack et les mix sont au **service du rendu**, jamais de la nouveauté gratuite — mais **pas d'œillères** : on ne se bride pas aux combos « sûrs » par réflexe. On choisit la **meilleure stack pour CE résultat** ; un mix inhabituel n'est retenu que s'il **sert** l'app (sinon → le bon outil). Les 🧪 ci-dessous sont **favorisés, pas imposés** : si l'un risque de dégrader le résultat, on le remplace.
>
> Volontairement étalés sur **7 familles de front** + plusieurs **mix inhabituels** (marqués 🧪). **On enregistre la stack RÉELLEMENT produite** (l'Élève peut dévier — c'est une donnée).

> **Réalité du scaffolding (vérifiée)** : le générateur produit du **React + Vite + Tailwind** ; les templates additionnels sont des variantes React (`shadcn`, `mantine`, `panda`, `radix`, `daisy`, `reactflow`, `pixi`, `threejs`, `r3f`, `ecommerce`, `dashboard`…). On valide donc les full-stacks sur l'**axe réel** : système de styling + libs spécialisées de rendu — pas un changement de framework qui casserait le build. Base commune : React 19 + Vite 7.

| # | Template (stack base) | Styling | Libs spéciales / rendu | State / Data | Pourquoi ce stack sert le résultat |
|---|---|---|---|---|---|
| 1 Pokémon | `ecommerce` | Tailwind | framer-motion (holo) | Zustand · localStorage | listings + panier d'échange natifs |
| 2 Benchmark IA | `mantine` | Mantine UI | **Recharts** (intégré) | hooks · JSON | data-viz scores = Recharts + tableaux Mantine |
| 3 Curling kawaii | `daisy` | **DaisyUI** | — | localStorage (panier) | composants ludiques/kawaii prêts à l'emploi |
| 4 Gastro Paris | base React | Tailwind | **Leaflet** (add_dependency) | Context · localStorage | map interactive = Leaflet |
| 5 Assurance | `reactflow` (**@xyflow/react**) | Tailwind | nœuds/edges + dnd | localStorage | mindmap + kanban = canvas de nœuds natif |
| 6 Frigo scan | `shadcn` (**Radix**) | Tailwind | getUserMedia (caméra) | Zustand · localStorage | cartes propres + flux caméra |
| 7 Sons de chat | `panda` (**PandaCSS**) | Panda (CSS-in-JS) | **Web Audio API** | — | styling distinct + son félin |
| 8 Insomnia FM | `pixi` (**Pixi.js**) | Tailwind | **Web Audio + visualiseur Pixi** | localStorage | visualiseur audio 2D performant |
| 9 TerraSeed | `radix` | Tailwind | calcul phases lunaires (maison) | localStorage | UI accessible + calendrier de semis |
| 10 Heist Night | `r3f` (**react-three-fiber**) | Tailwind | **Three.js immersif** + scroll | localStorage | escape game immersif 3D |

**Axes de stack couverts** : styling → Tailwind · Mantine · DaisyUI · PandaCSS · Radix/shadcn ; rendu spécialisé → Recharts · Leaflet · @xyflow/react · Pixi.js · Three.js/r3f ; média → getUserMedia · Web Audio. **Large matrice réellement buildable** pour valider/invalider des full-stacks par type d'app.

## Protocole d'observation (le vrai livrable — data Stratège)

Pour **chaque** app, je consigne dans `RUN-RAPPORT-ALEATOIRE-2026-06-26.md` :

- **Stack réellement produite** (front·styling·state·data·libs·backend) vs stack imposée → écart éventuel + **verdict full-stack** (tient / friction / à éviter pour ce type d'app) ;
- **Outils déclenchés** (lesquels, dans quel ordre, lesquels manqués) ;
- **Diagnostics Stratège** #164 captés (classe de blocage, remède non choisi puisque observe-only) ;
- **Itérations** jusqu'à `finish` / blocage (ex. sur-exploration L17) ;
- **Images** : nb réelles vs cassées (réparées par #L30 ?) ;
- **Gardien** : verdicts intention/goût/QA, relances, INCOMPLET ou non ;
- **Failles du process** rencontrées (la cible de Raf) → candidates `limites.md` ;
- **Goût VL** mesuré (Sharingan Playwright pleine page + lecture image).

Synthèse finale : tableau récap 10 lignes + top failles + **catalogue des full-stacks validés / invalidés par type d'app** → recommandations Phase Stratège.

## Procédure de lancement (au top départ de Raf)

1. **Check anti-orphelin port 3000** (CLAUDE.md) → tuer tout `node` mort-vivant, backend FRAIS.
2. Backend `server/` avec gates : `ELEVE_CLOSURE_GATE=on ELEVE_VISION=on ELEVE_STRATEGE=on ELEVE_PLANIFIER=on ELEVE_SITE=on ELEVE_SITE_VISION=on ELEVE_SITE_IMAGES=on` (+ `ELEVE_IMAGE_CHECK` ON par défaut), `PEXELS_API_KEY` présente.
3. Pré-chauffe de l'œil (`vision-prewarm`) au boot — laisser faire.
4. **Boucle séquentielle** : pour chaque app → `POST /api/chat` `model:"eleve"` mode élite, brief détaillé (concept + direction visuelle imposée + « vraies images » + « inspire-toi de <site réf> via extraire_site »).
5. Après chaque app : **vérif visuelle Sharingan** (Vite + Playwright + lecture image + 2 interactions) → entrée de rapport.
6. À la fin : synthèse + mise à jour `statut.md` / `historique.md` / `wiki/` / `limites.md`. **Zéro git** sans OK de Raf.

## Risques connus (anticipés)

- **L17 sur-exploration** sur les apps riches (3/5 au dernier run) → app complète mais pas de `finish` propre. *Atténué (i)* mais à surveiller.
- **Map interactive (#4)** et **audio (#7/#8)** = terrains neufs pour l'Élève → candidats failles probables (bon pour la data).
- **Contention backend** : séquentiel = pas de conflit port, mais runs longs → patience.
- **Requêtes image FR↔Pexels EN** (L15) → quelques images hors-sujet possibles.
