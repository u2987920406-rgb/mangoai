---
type: concept
tags: [composition, os-apps, gros-projet, shell, contrat, données-partagées, kanban, micro-frontend]
statut: "#139 spine livrée & validée e2e (2026-06-21) · #138 concept-validé à-construire-après-#139"
sources: [statut#138, statut#139, historique#échange-2026-06-21, historique#139-spine, plan.md]
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

**Le rôle de l'agent bascule** : non pas « fusionner après » mais **« composer à la génération »** (générer chaque app déjà conforme au contrat : point de montage, tokens, lit/écrit la donnée commune, entrée de nav). 2 niveaux : **L1 coexistence** (≈ déjà là) / **L2 intégration** (donnée partagée → vrai OS ; implique de **standardiser sur React** pour les apps composables — la donnée se partage cross-framework, pas les composants).

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

[[flux]] **#137 (Auditeur de Flux) d'abord** ✅ — il est le **QA de cohérence** dont #138/#139 ont besoin. Puis **#139 avant #138** ✅ (spine #139 livrée) : le « socle-d'abord + Kanban » sert *aussi* à bâtir le shell de #138, et les gros projets uniques sont un besoin plus fréquent que la suite multi-apps. **Reste #138** (compositeur d'apps) + la **Phase 2 de #139** (RAG/LSP).

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
