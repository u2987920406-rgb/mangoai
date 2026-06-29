# Template Unity (domaine Unity — Phase 3a)

Scaffold de départ pour un projet Unity piloté par MangoOS (gaté `ELEVE_UNITY=on`).

## Structure
- `ProjectSettings/ProjectVersion.txt` — marqueur de projet Unity (détecté par `domains.ts`).
- `Packages/manifest.json` — dépendances (Test Framework, uGUI).
- `Assets/Editor/Builder.cs` — **point d'entrée du build headless** appelé par MangoOS
  (`Builder.PerformBuild`, via `Unity -batchmode -executeMethod`). Sort `!= 0` sur échec.
- `Assets/Scripts/` — `GameController.cs` (MonoBehaviour) + `Score` (logique PURE testable) + `Mango.asmdef`.
- `Assets/Tests/EditMode/` — tests NUnit (`ScoreTests.cs`) lancés par `unity_test`.
- `Assets/Scenes/Main.unity` — scène de départ (caméra).

## Pré-requis machine
- **Unity Editor** installé localement (LTS 6000.x recommandé) + module de build Standalone.
- Variable d'environnement **`UNITY_PATH`** = chemin du binaire Unity (ex.
  `C:\Program Files\Unity\Hub\Editor\6000.0.23f1\Editor\Unity.exe`).

Sans `UNITY_PATH`, les outils `unity_build` / `unity_test` le disent franchement (pas de faux succès).

## Vérification
- `unity_build` → build headless (équivalent `vite build`).
- `unity_test` → suite EditMode/PlayMode (équivalent `npm test`).

> Note : ce scaffold est un point de départ. Ouvrir une fois le projet dans l'Éditeur
> régénère les fichiers `.meta` et valide la scène.
