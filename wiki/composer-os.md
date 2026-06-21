---
type: concept
tags: [composition, os-apps, gros-projet, shell, contrat, données-partagées, kanban, micro-frontend]
statut: "#138 spine livrée & prouvée e2e (2026-06-21) · #139 spine livrée & validée e2e (2026-06-21)"
sources: [statut#138, statut#139, historique#échange-2026-06-21, historique#138-spine, historique#139-spine, plan.md]
maj: 2026-06-21
---

# composer-os

Comment **assembler** ce que MangoOS produit — soit une **suite d'apps** qui se parlent (#138), soit **un gros produit unique** construit par morceaux (#139). Né d'une intuition de Raf après la refonte du cockpit (« on a plein de mini-apps isolées — peut-on les fondre en un OS ? et un site de 20 pages, comment ? »).

## Le foncteur commun

> **Socle / contrat partagé d'abord, puis incréments bornés qui s'y conforment.**

Deux cas distincts (à ne pas confondre — c'est la confusion qui fait rater les gros projets) :

| | #138 — OS d'apps (= Office) | #139 — Gros projet unique |
|---|---|---|
| **Quoi** | Apps **distinctes** qui se parlent (todo · dashboard · mind map) | **Un** produit (site 20 pages, jeu multi-stages) |
| **Analogie** | Word/Excel/PowerPoint + OLE | Un seul document à 20 sections / un moteur + niveaux |
| **Ce qui est partagé** | une **colonne de données** + un shell de nav | un **squelette** (design system, router, layout, modèle de données) |
| **Unité d'ajout** | une app conforme au contrat | une page / un stage (= contenu, pas une app) |

## #138 — OS d'apps personnelles (suite type Office)

**Verdict d'architecture :**
- ❌ **Compilateur qui fusionne le code** — les apps générées sont des projets Vite **indépendants**, **frameworks hétérogènes** (React *et* Vue), `node_modules` isolés, imports en dur, CSS global → problème micro-frontend (l'un des plus durs) **+ chaque régénération re-casse la fusion**. Contraire à [[fondation]] « ne pas réinventer un problème dur ».
- ❌ **Monolithe géant** — perd la boucle « générer une chose focalisée vite », gonfle le contexte de l'agent, rend chaque changement risqué.
- ✅ **Shell + contrat qui héberge des apps autonomes** — exactement le pattern [[bureau-os]] déjà construit (Window Manager, dock, Launcher).

**Cohérence = 3 couches du contrat « MangoApp »** : design partagé (tokens — [[blackboard]] partage déjà les palettes) · **colonne de données partagée** (*la vraie valeur d'OS* ; sans elle, un Launcher de 20 apps = un menu Démarrer plus joli — à décider **en amont**) · shell de nav ([[flux]]).

**Le rôle de l'agent bascule** : non pas « fusionner après » mais **« composer à la génération »** (générer chaque app déjà conforme au contrat : point de montage, tokens, lit/écrit la donnée commune, entrée de nav). 2 niveaux : **L1 coexistence** (≈ déjà là) / **L2 intégration** (donnée partagée → vrai OS). **Raffinement de la spine** : la donnée passe par **REST** (`/api/shared`, CORS ouvert) → **cross-framework** ; standardiser sur React n'est nécessaire que pour partager des *composants UI* (hors scope), pas pour la donnée.

**✅ SPINE LIVRÉE & prouvée e2e (2026-06-21).** Implémentation **purement additive sur la [[coque-souple]]** :
- **Colonne de données partagée** (le cœur) — `server/src/shared-data.ts` = wrapper mince sur [[blackboard]], scope `shared:<collection>` (`list/get/put/deleteDoc` + `slug`). Routes REST `GET /api/shared/:collection` · `GET/PUT/DELETE /api/shared/:collection/:key` (CORS ouvert → app sur un autre port = cross-framework ; garde-fous slug + valeur ≤ 256 ko). Sync = **polling court** côté apps.
- **Contrat MangoApp** — `server/src/mango-app-contract.ts` : manifest `.mangoapp.json` ({id,name,icon,color,navEntry,collections[{name,access}]}) calqué sur `perfect-plan.ts` (lecture défensive) + `mangoAppContractSection` (bloc de prompt).
- **Mode 🧩 « App composable »** — `agent.ts` (`ALLOWED_MODES`+`compose`), `scenario.ts` (`MANGO_APP_RULES` + `MANGO_DATA_RULES` calqué sur `SUPABASE_RULES` : client `src/lib/mangoData.ts` → `/api/shared` via `VITE_API_URL`, polling, dégradation propre ; `SCENARIOS.compose` = arsenal Élite **+ contrat+données en tête**, **sans** le socle-d'abord du mode projet). Sélecteur Header 🧩.
- **Fenêtre Suite** (le shell) — `server/src/suite-routes.ts` (`GET /api/suite/apps` = apps conformes **+ graphe des collections** lecteurs/écrivains/docCount live ; `/collection/:name`) + `ui/src/components/SuiteWindow.jsx` (apps + bouton Ouvrir, graphe « qui écrit → qui lit », aperçu **live** poll 2 s). Câblée dock ([[bureau-os]]) + Launcher.
- **Test live** : 2 apps (« Mango Tâches » écrit `tasks` / « Mango Tableau » lit `tasks`) partagent la collection — l'écriture de l'une est lue par l'autre via REST ; `/api/suite/apps` rend le graphe exact (écrit:Tâches → lu:les deux, 2 docs) ; Sharingan de la Suite lu (apps + graphe + JSON live). `tsc`+build verts, `test-shared-data.ts` 14/14 + `test-mango-app-contract.ts` 19/19.

**Phase 2 — en cours** :
- ✅ **Sync SSE temps réel** (2026-06-21) : pub/sub dans `shared-data.ts` + route `GET /api/shared/:collection/stream` (SSE `snapshot`→`change`). `MANGO_DATA_RULES` SSE-first (EventSource, repli polling). Remplace le poll aveugle.
- ✅ **ACL de conformance par app** (2026-06-21) : en-tête `X-MangoApp-Id` → une app qui a déclaré une collection `read` est refusée (403) en écriture. Helpers purs `accessAllowsWrite`/`findManifestById`. Garde-fou local-first (pas une frontière de sécurité), rétro-compatible.
- ✅ **Aperçus simultanés — LIVRÉS** (2026-06-21, serveur + UI) : **(serveur)** `preview.ts` n'est plus le singleton `current` mais un **pool borné** (clé = dossier résolu, plafond `MAX_PREVIEWS`=3, éviction **LRU**) → plusieurs serveurs Vite à la fois, chacun sur son port (vite walk-past, pas de `--strictPort`). Lanceur Vite **injectable** → pool testé sans process réel (`test-preview` 20/20 : reuse, simultané, config in-place, arrêt sélectif, cap+LRU). `startPreview(dir)` ne tue plus les autres ; `stopPreview(dir?)` ; `previewList()`/`isPreviewing()` + route `GET /api/preview`. **(UI, « le plus moderne »)** la fenêtre Suite gagne une **grille d'aperçus live côte à côte** (`SuiteWindow.jsx`, toggle opt-in « Aperçus live » → démarre l'aperçu de chaque app via le pool ; tuiles translucides, badge ● LIVE, une iframe par app ; les apps se synchronisent d'elles-mêmes en lisant `/api/shared`). **Preuve live** : Mango Tâches/Tableau sur ports distincts (5180/5181), snaps Playwright avant/après lus (2 iframes réelles, zéro erreur console).
- ⏳ **Reste** : audit [[mangoqa]] **cross-app** · **validation de schéma** par collection · partage de **composants UI** (impliquerait de standardiser React).

## #139 — Mode « Gros Projet » (build incrémental d'un produit unique)

**Méthode = socle-d'abord** (ni tout d'un coup, ni morceaux compilés) :
1. **Perfect Plan** ([[coque-souple]]) → verrouille le contrat (type/style/nav/données).
2. **Squelette** (scaffold unique) : design system + **router multi-pages** + layout partagé + modèle de données.
3. **Page/stage par page/stage** → chaque incrément réutilise le squelette, l'agent travaille un **delta borné**, [[mangoqa]] vérifie la cohérence à chaque delta.

- « Blocs de 5 » = simple batching ; le levier réel = socle-d'abord + réutilisation.
- **Kanban de pages/stages** (à faire / en cours / fait, 1 carte = 1 incrément) = la bonne orchestration (borne le contexte, zéro oubli).
- **Jeu vidéo** : moteur d'abord, stages = niveaux chargés.

**✅ SPINE LIVRÉE & validée e2e (2026-06-21).** Implémentation **purement additive sur la [[coque-souple]]** (aucune refonte d'archi) :
- **Mode `projet`** (sélecteur Header 🏗️ + scénario dédié = arsenal Élite sans les portes humaines questionneuses). Deux blocs : `SCAFFOLD_RULES` (injecté tant que le squelette n'est pas posé — **interdit la délégation aux builders**, impose **TypeScript** + **React Router v7** + design tokens + layout partagé + pages **placeholder** + écriture du manifest) et `PROJET_MODE_RULES` (un incrément borné par tour, réutilise le squelette, cohérence de nav).
- **Manifest `.project-plan.json`** (`server/src/project-plan.ts`, source de vérité, lecture **défensive** car écrit par l'agent) ; routes `GET/PUT /api/projects/:name/plan` + réconciliation post-commit (`markIncrementDone`).
- **Kanban « Chantier »** dans le rail workspace (`ui/src/components/ProjectKanban.jsx`, 3 colonnes todo/doing/done, bouton **Construire** → tour `/api/chat` borné avec `incrementId`, ajout/déplacement d'incréments, badge de cohérence flux [[mangoqa]]).
- **Test live** : site 4 pages « Mango Café » → tour 1 scaffolde TS+RRv7+placeholders+manifest (tout `todo`), puis Construire Accueil → page étoffée + `done`, les 3 autres `todo`. `tsc`+build verts, `test-project-plan.ts` 26/26. *(1ʳᵉ itération a dévié — délégation aux builders → JS + tout d'un coup ; `SCAFFOLD_RULES` durci, re-testé OK.)*

**Phase 2 reportée** (assumée) : **index/RAG intra-projet** (tree-sitter repo-map + embeddings code) + **LSP-MCP** — pas nécessaires sous ~12 pages, le squelette + le manifest **bornent déjà le contexte**. Les briques sont consignées dans [[pre-requis-gros-projet]] (TypeScript ✅ fait ici · router fichier ✅ fait ici · LSP-MCP · tree-sitter · sqlite-vec).

## Graines déjà présentes (réutiliser, pas réinventer)

[[blackboard]] (palettes/composants cross-app + recherche sémantique) · `multi-project.ts`/`MultiProject.jsx` (injection des fichiers des autres apps ; copie manuelle aujourd'hui) · [[bureau-os]] (le shell) · le gradient de réutilisation ([[boucle-curation]], 0→67 %) · `SuperAgentBuilder.jsx` (experts par domaine).

## Séquencement

[[flux]] **#137 (Auditeur de Flux) d'abord** ✅ — il est le **QA de cohérence** dont #138/#139 ont besoin. Puis **#139 avant #138** ✅ : le « socle-d'abord + Kanban » a servi *aussi* à bâtir le shell de #138. **Les deux spines sont désormais livrées** ✅. **Reste** : la **Phase 2 de #138** (SSE, schéma/ACL, aperçus simultanés, MangoQA cross-app) et la **Phase 2 de #139** (RAG/LSP intra-projet).

## Liens

- [[bureau-os]] — le shell déjà construit (preuve que le pattern marche)
- [[flux]] — le contrat de cohérence ; l'Auditeur de Flux #137 = le QA de #138/#139
- [[blackboard]] — la graine de la donnée/design partagés
- [[coque-souple]] — Perfect Plan = le contrat verrouillé en amont
- [[boucle-curation]] — le gradient de réutilisation mesure déjà la cohérence cross-app

## Sources

- `statut.md` #138 (OS d'apps), #139 (Mode Gros Projet)
- `historique.md` Échange 2026-06-21
- `plan.md` section CONCEPT #138/#139
