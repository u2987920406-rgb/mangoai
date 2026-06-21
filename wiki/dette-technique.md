---
type: concept
tags: [dette-technique, architecture, fragilite, refacto, qualite, a-renforcer]
statut: identifie-2026-06-21 · renforcement-en-cours (filet de sécurité posé 2026-06-21)
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
| 3 | **Heuristiques regex** pour l'extraction du graphe de flux (`flux-eye/graph.ts`) : durcies contre les faux positifs, mais technique connue-fragile. | 🟠 moyen (faux positifs/négatifs sur du code inhabituel) | Passer à **tree-sitter / AST** (cf. [[pre-requis-gros-projet]]) pour un graphe fiable, multi-langage. | ⚖️ Sonnet 4.6 | M |
| 4 | **Couverture de test inégale** : MangoQA très testé (170+ assertions) ; la **couche React, elle, repose sur build-vert + Sharingan visuel**, pas sur des tests unitaires → la solidité est en partie *process-enforced*, pas garantie structurellement. | 🟠 moyen (régression UI silencieuse hors rituel Sharingan) | Ajouter des **tests UI** (Vitest + React Testing Library) sur les composants critiques (App nav, WindowManager, WorkspaceTools, Reglages). | ⚖️ Sonnet 4.6 | M |

## Renforcement en cours (2026-06-21 — « efficace et sûr »)

Approche validée avec Raf : **additif d'abord** (filet de sécurité) **avant** la décompo du god-component.
- ✅ **Filet de tests** (#4, amorce) : **Vitest** installé dans `ui/` (`npm test`), tests de caractérisation `slugify.test.js` + `nav.test.js` — **13/13**.
- ✅ **Source de vérité de la nav** (#2) : `ui/src/nav.js` = `SCREENS` + `WINDOWS` (figés) + gardes `isScreen`/`isWindowType`. `App.jsx` adopte `SCREENS.*` (zéro littéral d'écran). Le compilateur ne vérifie pas (JS), mais il y a désormais **un seul endroit à lire** + une garde runtime, et l'[[flux]] Auditeur a une liste canonique.
- 🔨 **Décomposition de `App.jsx`** (#1, amorcée) : 5 hooks cohérents extraits vers `ui/src/hooks/` — `useToasts`, `useTutorial`, `useBackendServer`, `useProjectDelivery` (deploy+GitHub, reset au changement de projet), `useVersions` (historique+rollback, modal de confirm injecté). `App.jsx` 600→517 l. (9 `useState` sortis) ; build+tests+snap verts à chaque tranche. Méthode : une tranche à la fois, jamais sans re-vérifier.
- ⏳ **Reste** : le hub COUPLÉ preview↔chat + `openProject` (à décomposer avec un workspace live pour vérifier le flux) ; adopter `WINDOWS.*` dans `WindowManager.jsx` ; élargir les tests UI (#4, testing-library/jsdom) ; tree-sitter pour `flux-eye/graph.ts` (#3, repo MangoQA, lié au socle tree-sitter de #139-P2/[[vault-projet]]).

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
