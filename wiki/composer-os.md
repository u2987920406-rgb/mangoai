---
type: concept
tags: [composition, os-apps, gros-projet, shell, contrat, données-partagées, kanban, micro-frontend]
statut: concept-validé · à-construire-après-#137
sources: [statut#138, statut#139, historique#échange-2026-06-21, plan.md]
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

**Faisable aujourd'hui ?** À moitié : la boucle de chat **édite déjà le même projet** (site page-par-page manuel OK), Perfect Plan + réutilisation [[blackboard]]. Manque : scaffold auto du squelette · **router** (apps SPA sans router par défaut) · tableau Kanban · gestion du contexte sur gros projet (index/RAG des fichiers du projet).

## Graines déjà présentes (réutiliser, pas réinventer)

[[blackboard]] (palettes/composants cross-app + recherche sémantique) · `multi-project.ts`/`MultiProject.jsx` (injection des fichiers des autres apps ; copie manuelle aujourd'hui) · [[bureau-os]] (le shell) · le gradient de réutilisation ([[boucle-curation]], 0→67 %) · `SuperAgentBuilder.jsx` (experts par domaine).

## Séquencement

[[flux]] **#137 (Auditeur de Flux) d'abord** — il est le **QA de cohérence** dont #138/#139 ont besoin. Puis **#139 avant #138** : le « socle-d'abord + Kanban » sert *aussi* à bâtir le shell de #138, et les gros projets uniques sont un besoin plus fréquent que la suite multi-apps.

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
