---
type: entité
tags: [domaine, unity, csharp, capabilities, phase-3a]
statut: PROUVÉ live — Unity build VERT + Godot build VERT (gaté OFF)
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

## Godot (2ᵉ domaine, même patron)
- **`godotDomain`** (marqueur `project.godot`, gate `ELEVE_GODOT=on`) + **`inspectGodot`** + `templates/godot/` (project.godot + Main.tscn + `Game.add_points` pur).
- **Subtilité clé** : Godot renvoie **exit 0 même sur un script cassé** → on détecte les **marqueurs** `SCRIPT ERROR` / `Parse Error` / `Failed to load script` dans la sortie (pas le code de sortie). `GODOT_PATH` = exe **console** (sortie fiable).
- **Build Godot PROUVÉ VERT** (2026-06-29, `ok:true`, script exécuté). Godot 4.7 installé via winget.

## Preuves live (2026-06-29)
- **Unity** : `inspectByDomain` → `inspectUnity` (batchmode `Builder.PerformBuild`) → **build standalone VERT** (`ok:true`). Verdict fidèle dans les deux sens (faux vert impossible : a d'abord rendu `ok:false` honnête sur une install Unity incomplète, puis `ok:true` après réparation).
- **Godot** : build headless **VERT**.

## Limites
- [[limites|L57]] ✅ **RÉSOLU** — build Unity prouvé vert (install Unity réparée). Reste, comme béquille produit : générer un vrai JEU complet via l'Élève.

## Liens
[[capacites-mango]] · [[gardien-cloture]] · [[mcp-externe]] (assets Blender→Unity) · [[grand-chantier]] · [[statut]] · [[limites]]

## Sources
`server/src/domains.ts`, `eleve-unity-tools.ts`, `capabilities.ts`, `templates/unity/` · statut.md (2026-06-29 ba) · limites.md L57
