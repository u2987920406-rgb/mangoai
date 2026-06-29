extends Node2D
## Script de départ (domaine Godot). Logique pure testable (Score) + scène qui se ferme
## proprement en headless pour la vérif de build.

class_name Game


## Logique de score PURE (testable hors runtime).
static func add_points(current: int, points: int) -> int:
	if points < 0:
		return current
	return current + points


func _ready() -> void:
	var score := add_points(0, 5)
	score = add_points(score, 3)
	print("[Mango] Godot prêt — score = %d" % score)
	# En headless (build/vérif), on se ferme après l'init.
	if DisplayServer.get_name() == "headless":
		get_tree().quit()
