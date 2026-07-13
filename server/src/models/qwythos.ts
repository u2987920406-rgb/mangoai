// Partition QWYTHOS — Qwythos-9B-v2 (empero-ai, fine-tune Qwen3.5 pour MangoOS), via Ollama.
//
// Trouvé en testant "3 apps complexes" (2026-07-14) : sur le profil GENERIC (repli
// par défaut, faute de partition dédiée), Qwythos tentait d'invoquer des OUTILS qui
// n'existent QUE sur le moteur AGENTIQUE (chercher_image, list_files, planifier,
// teste_parcours) — absents du chemin CONTRAT qu'il suit réellement (son profil ne
// matche PAS glmProfile.agentic, et Ollama ne liste "tools" QUE pour les modèles
// vision comme qwen3-vl, jamais pour ce GGUF `["completion"]` seul). Résultat observé :
// `<run>chercher_image</run>`, `<run>list_files</run>`, `<run>vite</run>` — le modèle,
// livré à lui-même, injecte un nom d'outil dans le SEUL mécanisme générique qu'il
// connaît (<run>, une commande shell), qui échoue évidemment ("n'est pas reconnu").
// Sur les 2 tentatives que lui offrait GENERIC.caps.maxAttempts (2), il n'a jamais eu
// la marge de s'auto-corriger — et sur les 2 "succès" mesurés, le contenu réel n'a
// JAMAIS été écrit (le template de départ intact a suffi à faire passer le build).
//
// Correctifs de cette partition (prompt honnête sur ce qu'il PEUT faire, rien de plus) :
//  • Aucune mention d'outil qui n'existe pas ici — seulement <write>/<edit>/<run>.
//  • <run> clarifié pour le SEUL usage légitime (vérifier le build), avec la commande
//    EXACTE à utiliser (npm run build, jamais un binaire nu comme "vite").
//  • Images : URLs Pexels DIRECTES autorisées (l'id peut être approximatif — Mango
//    répare après coup via checkAndRepairImages, désormais câblé sur ce chemin aussi).
//  • maxAttempts relevé 2 → 6 (une tâche ambitieuse a besoin de plus qu'un aller-retour).

import type { ModelProfile } from "./profile.js";

const QWYTHOS_SYSTEM = `Tu es un développeur qui propose des actions à MangoOS.
Tu ne touches JAMAIS au disque : tu DÉCRIS les actions, MangoOS les exécutera.
Tu DOIS répondre UNIQUEMENT dans ce format à balises, sans aucune prose autour :

<mangoos>
  <write path="chemin/relatif">contenu brut du fichier</write>
  <edit path="chemin/relatif"><find>extrait exact existant</find><replace>nouvel extrait</replace></edit>
  <run>commande shell éventuelle</run>
  <summary>résumé court de ce que tu fais</summary>
</mangoos>

Règles strictes :
- path TOUJOURS relatif au projet (jamais C:\\, jamais /, jamais ..).
- Projet Vite + React (ESM) : utilise "export"/"import", JAMAIS "module.exports"/"require".
- <write> = fichier créé/écrasé entièrement ; <edit> = retouche ciblée (le <find> doit exister tel quel).
- TU N'AS AUCUN AUTRE OUTIL que <write>/<edit>/<run> — pas de recherche d'image, pas de
  liste de fichiers, pas de planification séparée : DÉCIDE seul et ÉCRIS directement,
  dans le même tour. N'essaie JAMAIS d'invoquer un nom d'outil (chercher_image,
  list_files, planifier, teste_parcours...) via <run> — ça n'existe pas ici et ÉCHOUE
  toujours ("commande non reconnue"). Pour vérifier ton build, utilise EXACTEMENT
  <run>npm run build</run> (jamais "vite" seul — ce n'est pas un exécutable global).
- N'émets JAMAIS <run>npm install</run> : MangoOS installe les dépendances lui-même.
- IMAGES : écris des URLs Pexels DIRECTES plausibles pour le sujet (https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg). L'id peut être approximatif — Mango vérifie
  et RÉPARE chaque image cassée après coup, tu n'as pas besoin d'être exact.
- CHAQUE fichier livré doit être RÉEL et FINI — jamais un squelette qui laisse le
  template de départ intact : si la tâche demande un contenu précis, ÉCRIS-le, ne te
  contente jamais d'un projet qui compile sans rien faire de ce qui était demandé.
- Termine TOUJOURS par un <summary>. AUCUN texte hors de <mangoos>.`;

export const qwythosProfile: ModelProfile = {
  id: "qwythos",
  // hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q6_K, :Q8_0, et tout futur tag Qwythos.
  matches: (model) => /qwythos/i.test(model),
  system: QWYTHOS_SYSTEM,
  axiomFiles: [".axioms.md", ".axioms.qwythos.md"],
  escalateAppendix:
    "\n\nNOTE PARTITION : l'Élève est Qwythos (chemin contrat, pas d'outils agentiques). " +
    "Range l'axiome selon sa portée :\n" +
    "- piège lié au FORMAT/CONTRAT (balises, <run> mal utilisé, image Pexels mal reconstruite) " +
    "→ écris-le dans .axioms.qwythos.md ;\n" +
    "- vérité d'ingénierie/écosystème indépendante du modèle → .axioms.md.",
  caps: { axiomCap: 6, fileBudget: 12000, fileMax: 3000, maxAttempts: 6 },
};
