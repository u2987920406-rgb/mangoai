---
type: entité
tags: [domaine, unity, csharp, capabilities, phase-3a]
statut: socle livré (gaté OFF, testé) ; build live à prouver (Unity Editor requis)
sources: [statut, limites, "domains.ts", "eleve-unity-tools.ts", capacites-mango]
maj: 2026-06-29
---

# Domaines & Unity

Abstraction de **domaine** (Web vs Unity) qui découple le pipeline du tout-Vite, + la compétence **Unity/C#** comme premier domaine non-web.

## Rôle
Avant, tout supposait Vite + navigateur + port 5174 (templates web, `check_build = npm run build`, preview = Vite, capture = screenshot). Ajouter Unity n'était pas « ajouter des outils » mais **sortir du Vite hardcodé**. Un `Domain` décrit COMMENT un projet se construit/se vérifie. **Phase 3a** du grand plan.

## Détails clés
- **`domains.ts`** : `Domain` = `{ id, label, marker, detect, enabled }`. **`webDomain`** (défaut, marqueur `package.json`, toujours actif) reproduit **exactement** l'existant → zéro régression. **`unityDomain`** (marqueur `ProjectSettings/ProjectVersion.txt`, gaté `ELEVE_UNITY=on`).
- **`resolveDomain(dir)`** : forçage `MANGOOS_DOMAIN` > domaine non-web activé+détecté > web. **`inspectByDomain(dir)`** route : web → `inspectProject` (chemin INCHANGÉ), unity → `inspectUnity` (build headless `Unity -batchmode -executeMethod Builder.PerformBuild`).
- **Outils Élève** (`eleve-unity-tools.ts`, gate `ELEVE_UNITY=off`, deps injectables) : `unity_build` (équivalent `check_build`), `unity_test` (EditMode/PlayMode). Si `UNITY_PATH` absent → le DIT franchement (jamais de faux vert).
- **Template** `templates/unity/` : `Builder.cs` (`PerformBuild` headless, sort ≠0 sur échec) · `GameController.cs` + `Score` (logique PURE testable) · tests NUnit EditMode · scène `Main.unity` · `manifest.json`.
- **Capabilities** ([[capacites-mango]]) : Unity sort du hors-périmètre quand `ELEVE_UNITY=on` — `detectOutOfScope(text, allow)` + `scopeAllowList()` (réintègre `unity`, garde Unreal/Godot natif hors-scope) ; le scope-guard du juge ([[gardien-cloture]]) ne plafonne plus une tâche Unity.
- **Tests** : `test-domains` 17/17 · `test-eleve-unity-tools` 15/15 · `test-capabilities` 22/22.

## Limites
- [[limites|L57]] — build/tests Unity **non prouvés live** : Unity Editor non installé, `UNITY_PATH` non défini. Socle (domaine+outils+template+gating) livré et testé, gaté OFF ; preuve live quand l'Editor sera installé.

## Liens
[[capacites-mango]] · [[gardien-cloture]] · [[mcp-externe]] (assets Blender→Unity) · [[grand-chantier]] · [[statut]] · [[limites]]

## Sources
`server/src/domains.ts`, `eleve-unity-tools.ts`, `capabilities.ts`, `templates/unity/` · statut.md (2026-06-29 ba) · limites.md L57
