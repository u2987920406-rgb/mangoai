# Template Godot 4 (domaine Godot)

Scaffold de départ pour un projet Godot 4 piloté par MangoOS (gaté `ELEVE_GODOT=on`).

## Structure
- `project.godot` — marqueur de projet Godot (détecté par `domains.ts`).
- `Main.tscn` — scène principale (un `Node2D` + le script).
- `main.gd` — `Game.add_points` (logique PURE testable) + `_ready` qui ferme la scène en headless.

## Pré-requis machine
- **Godot 4** installé (`winget install GodotEngine.GodotEngine`).
- `GODOT_PATH` = chemin de l'**exe console** (sous Windows : `Godot_v…_win64_console.exe` — sortie/headless fiables ; l'exe GUI ne renvoie pas la sortie de façon fiable).

## Vérification (`inspectGodot`)
`godot --headless --path <projet> --quit-after 5`. Godot **ne renvoie pas** de code ≠ 0 sur une
erreur de script → le signal objectif = la présence de marqueurs `SCRIPT ERROR` / `Parse Error` /
`Failed to load script` dans la sortie. Vert = aucun marqueur d'erreur.
