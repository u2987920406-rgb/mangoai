---
type: concept
tags: [dette-technique, architecture, fragilite, refacto, qualite, a-renforcer]
statut: identifie-2026-06-21 · les 4 points renforcés 2026-06-21 (#1 gros œuvre, #2 bouclé, #3 tree-sitter, #4 outillé ; reste des affinages : tests UI au fil de l'eau, résolution de constantes flux-eye)
sources: [historique#session-2026-06-21, historique#140-filet]
maj: 2026-06-21
---

# dette-technique

Les **points fragiles** de l'architecture MangoOS, identifiés lors de l'évaluation du 2026-06-21. À **renforcer** (demande de Raf). Verdict d'ensemble : archi **solide aux bords, plus molle au centre** ; elle tient au changement par son *système immunitaire* (fail-open · [[mangoqa]] · Sharingan · tests · [[flux]] Auditeur) plus que par son squelette → **résiliente par détection**, pas par prévention.

## Les 4 points (par ordre de criticité)

| # | Point fragile | Rayon d'explosion | Renforcement (chantier lié) | Modèle optimal | Effort |
|---|---|---|---|---|---|
| 1 | **`App.jsx` god-component** : état `screen` (chaîne) + ~30 `useState` + chaîne de `if (screen === "x")` + props enfilées partout. La moelle épinière — là où vivaient l'écran fantôme `"chat"` et les 8 routes mortes. | 🔴 élevé (toucher = casser la nav silencieusement) | Éclater le hub : extraire un **router typé** + des contextes ; réduire le god-component. Couplé à [[pre-requis-gros-projet]] (#139 router-fichier). | 🧠 Opus 4.8 | L |
| 2 | **Navigation « stringly-typed »** : `setScreen("x")` sans vérif compilateur ⇒ classe de bug « écran fantôme ». L'[[flux]] Auditeur est un *pansement* sur cette faiblesse structurelle. | 🔴 élevé (corrélé au #1) | **Router fichier + TypeScript** (union de routes typées) → le compilateur attrape les cibles invalides. Même chantier que #1/#139. | ⚖️ Sonnet 4.6 | M |
| 3 | ✅ **RÉSOLU** — ~~**Heuristiques regex** pour l'extraction du graphe de flux (`flux-eye/graph.ts`)~~ : migré vers **tree-sitter/AST** (web-tree-sitter WASM, grammaire TSX) pour JS/TS/JSX/TSX, repli regex pour vue/svelte/html. 33/33 tests. Reste un bonus : résolution de constantes. | 🟢 résorbé | ✅ FAIT 2026-06-21 (tree-sitter, repo MangoQA) | — | — |
| 4 | **Couverture de test inégale** : MangoQA très testé (170+ assertions) ; la **couche React, elle, repose sur build-vert + Sharingan visuel**, pas sur des tests unitaires → la solidité est en partie *process-enforced*, pas garantie structurellement. | 🟠 moyen (régression UI silencieuse hors rituel Sharingan) | Ajouter des **tests UI** (Vitest + React Testing Library) sur les composants critiques (App nav, WindowManager, WorkspaceTools, Reglages). | ⚖️ Sonnet 4.6 | M |

## Renforcement en cours (2026-06-21 — « efficace et sûr »)

Approche validée avec Raf : **additif d'abord** (filet de sécurité) **avant** la décompo du god-component.
- ✅ **Filet de tests** (#4) : **Vitest** installé dans `ui/` (`npm test`), tests de caractérisation `slugify.test.js` + `nav.test.js`. Puis **harnais UI complet** : `@testing-library/react` + `jsdom` + `jest-dom`, `vitest.config.js` (environnement jsdom, plugin React, `test-setup.js` cleanup) — **séparé de `vite build`**. Tests **de rendu réel** : `useToasts.test.js` (5 — push/id uniques/dismiss/auto-dismiss 8 s via fake timers), `usePreview.test.js` (10 — le **hub extrait** : toggles, `requestFix`, pont d'inspection `inspect-pick` via `postMessage`, dédup d'erreurs, démarrage de l'aperçu Vite avec `fetch` mocké), `Toast.test.jsx` (4 — rendu props→DOM, lien externe, `onDismiss` au clic). **34/34**. Le rituel #4 (un test accompagne chaque composant/hook critique) est désormais outillé.
- ✅ **Source de vérité de la nav** (#2) : `ui/src/nav.js` = `SCREENS` + `WINDOWS` (figés) + gardes `isScreen`/`isWindowType`. `App.jsx` adopte `SCREENS.*` (zéro littéral d'écran). Le compilateur ne vérifie pas (JS), mais il y a désormais **un seul endroit à lire** + une garde runtime, et l'[[flux]] Auditeur a une liste canonique.
- ✅ **Décomposition de `App.jsx`** (#1, gros œuvre fait) : 6 hooks cohérents extraits vers `ui/src/hooks/` — `useToasts`, `useTutorial`, `useBackendServer`, `useProjectDelivery` (deploy+GitHub, reset au changement de projet), `useVersions` (historique+rollback, modal de confirm injecté), et — la pièce la plus enchevêtrée — `usePreview` : **le hub couplé aperçu ↔ chat** (URL/clé d'aperçu, erreurs iframe, et le pont d'inspection inspect-pick → seed du Chat, tenus ensemble par UN seul listener `message`). Injection de dépendance (`screen`/`projectName`/`pushToast`/`onRequestFix`) pour garder `pendingPrompt` côté App (partagé avec `openProject`). `App.jsx` 600→446 l. (15 `useState` sortis) ; build+tests+**snap workspace live vert** (aperçu Vite démarré, inspection OK, zéro erreur console) à chaque tranche. Méthode : une tranche à la fois, jamais sans re-vérifier.
- ✅ **`WINDOWS.*` adopté partout** (#2, suite de `SCREENS.*`) : tous les `win.type === "…"` de `WindowManager.jsx` (chaîne de 15 `if`) **et** tous les producteurs `openWindow({ type: "…" })` (App.jsx `openAppWindow`/`openProjectsWindow`/`openLauncher`, `Home.jsx` cascade, `Sidebar.jsx` dock) référencent désormais la constante `WINDOWS` de [[flux]]/`nav.js` — **zéro littéral de type de fenêtre** dans le code (vérifié par grep). `nav.test.js` renforcé (immuabilité de `WINDOWS` + format kebab-case des types) → **15/15**. La nav « stringly-typed » est maintenant centralisée : un seul endroit à lire pour écrans ET fenêtres.
- ✅ **`flux-eye/graph.ts` migré vers tree-sitter** (#3, repo **MangoQA**) : le graphe de nav s'extrait d'un **vrai arbre syntaxique** (web-tree-sitter 0.24 WASM + `tree-sitter-wasms`, grammaire TSX) pour les fichiers JS/TS/JSX/TSX ; repli regex **byte-identique** pour `.vue/.svelte/.html` et les parses cassés (`hasError`) → zéro régression. Le runtime WASM se pré-charge via `initFluxParser()` au point d'entrée, donc `buildGraph` **reste synchrone** (contrat `NavGraph` inchangé en aval). Contrat préservé (même charset historique `[\w/.:*-]+`). **Tests 33/33** (29 hérités + 4 AST prouvant la valeur : un `setX(...)` en commentaire/string n'est plus un faux fantôme) · `tsc` vert · audit réel du cockpit OK. Voir [[flux]]. ⚠️ **Découverte** : l'adoption `WINDOWS.*` (#2) a rendu 8 fenêtres invisibles au détecteur (il ne résout que les littéraux, pas `WINDOWS.SUITE`) — l'ancien regex aurait fait pareil. tree-sitter débloque la **résolution de constantes** (suite naturelle) que le regex ne pourra jamais faire.
- ⏳ **Reste** : étendre le filet UI aux autres composants critiques au fil de l'eau (WindowManager, WorkspaceTools, Reglages — l'infra est là, c'est désormais un rituel) ; **résolution de constantes** dans `flux-eye` (résoudre `WINDOWS.SUITE → "suite"` via table des symboles AST → supprime les 8 faux fantômes du cockpit hérités de #2). `openProject` reste dans App (orchestrateur multi-domaines légitime) mais consomme désormais `resetPreview()` du hook.

**Bilan #140 (2026-06-21) : les 4 points renforcés** — #1 (gros œuvre : 6 hooks), #2 (bouclé : `SCREENS.*`+`WINDOWS.*`), #3 (tree-sitter, MangoQA), #4 (filet UI outillé). Reste des affinages (tests UI au fil de l'eau, résolution de constantes dans flux-eye).

## Notes

- **#1 et #2 sont le même chantier** : le **router-fichier + TypeScript** de [[pre-requis-gros-projet]] (#139) renforce *exactement* ces deux points. Les traiter ensemble.
- **#3** est la dette du Tier 0 de l'[[flux]] Auditeur — fonctionnel aujourd'hui, mais tree-sitter le rend industriel.
- **#4** ne se « répare » pas en une fois : à intégrer comme rituel (un test UI accompagne chaque nouveau composant critique).
- Le système immunitaire (fail-open, [[mangoqa]], Sharingan, Auditeur de Flux) **compense** ces points en attendant — il **détecte** les blessures. Le renforcement vise à **prévenir** plutôt que détecter.

## Liens

- [[flux]] — l'Auditeur de Flux est le pansement de #1/#2 ; tree-sitter (#3) l'industrialise
- [[pre-requis-gros-projet]] — router-fichier + TypeScript + tree-sitter renforcent #1/#2/#3
- [[mangoqa]] — l'immunité qui compense la dette en attendant
- [[composer-os]] — #139 (Mode Gros Projet) porte le renforcement #1/#2

## Sources

- `historique.md` session 2026-06-21 (évaluation de l'architecture + des 4 points fragiles)
- `statut.md` #140 (chantier de renforcement)
