---
type: entite
tags: [architecture, curation, reutilisation, boucle]
statut: actif
sources: [statut, historique]
maj: 2026-06-26
---

# Boucle de curation & réutilisation

> La boucle d'auto-amélioration de MangoOS : **mesurer → réinjecter → prouver → chiffrer → orienter** la réutilisation d'artefacts. Construite incrémentalement de **#117 à #130**. C'est le cœur « compounding » du système — et le miroir exact de la philosophie *LLM Wiki*.

## Rôle

Faire en sorte que chaque projet généré rende les suivants meilleurs/moins chers, en réutilisant les artefacts du [[blackboard]] plutôt qu'en réinventant. Au run 2026-06-20, le **gradient de réutilisation** est monté `0% → 33% → 50% → 60% → 67%` comme prévu, et les tours **avec** réutilisation ont coûté ~10 % de moins (directionnel).

## Détails clés — la chaîne d'idées

- **#118** Réinjection des artefacts avant le build (palettes proches de la cible rappelées à l'agent).
- **#119/#120** Composants, blueprints et skills réinjectés **par pertinence** (cœur de tri partagé `searchRanked`, divulgation progressive).
- **#121→#124** Mesure de la réutilisation effective : un `Read` sur `.components/.skills/.procedures` = réutilisation ; corrélation réutilisation ↔ coût/qualité ; impact **segmenté par famille** (quelle dimension rapporte).
- **#122** Réutilisation des **palettes** mesurée par recouvrement de couleurs réelles (`paletteOverlap`).
- **#156 / L3 Phase A (2026-06-26)** — `chercher_artefact` atteint enfin les **composants réutilisables** cross-projet par **recherche TEXTE** (param `recherche`). L'infra `kernel-reuse.ts` (index `artifact:component` + embedding texte `embedOllama` + repli mots-clés `keywordRank`) existait mais n'était utilisée qu'en réinjection passive de prompt ; nouveau pont `searchComponentsRanked` → l'Élève trouve un composant par SENS (« barre de recherche »→`SearchBar`) et le réutilise. Mesuré par le genre `artifact`. Prouvé live (8 composants réels en lib). Reste L3 : layouts distincts, embedding texte sites/palettes, skills dans l'outil.
- **#156 / L29 (2026-06-26)** — Réutilisation via la **mémoire d'artefacts** (`chercher_artefact`) mesurée : nouveau genre **`artifact`** + `detectArtefactReuse`. Le recouvrement de hex (#122) est **aveugle** quand l'Élève applique l'identité via classes Tailwind (constat du run 2026-06-25 : réutilisation visible mais `reuseRatePct=0`). Désormais `chercher_artefact` enregistre les **provenances servies** (palettes + dossiers de site #159 P4) dans un store éphémère par projet (`eleve-artefact-usage.ts`) que le `finally` du tour consomme → signal **complémentaire** au recouvrement. Prouvé live : `reuseRatePct 0→100 %`, `byKind.artifact=1`. Couvre automatiquement les futurs types d'artefacts (L3). Résidu : mesure « la mémoire a SERVI », pas une preuve pixel d'application.
- **#125→#130** La boucle se referme : curation nocturne **pondérée par le rendement** (#125), **preuve d'efficacité** par différence-de-différences avec verdict honnête `insufficient` tant que les données manquent (#126), **auto-réglage des knobs** exploit/explore par le verdict (#127), rendement **fenêtré** causal (#128), réglage **continu** interpolé (#129), **amortissement EMA** anti-oscillation (#130).

Honnêteté assumée partout : garde-fous `sampleSufficient` / `insufficient`, signaux directionnels annoncés comme tels.

## Liens

S'appuie sur [[blackboard]] (stockage) et [[kernel]] (Bus/traces qui fournissent les signaux) · nourrit [[boucle-nocturne]] (la directive de curation est appendée au prompt nocturne) · distinct de [[mangoqa]].

## Sources

[[statut]] #117→#130 (détaillés dans les « Dernière/Précédent mise à jour ») · [[historique]].
