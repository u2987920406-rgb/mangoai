// Partition GLM — famille GLM (Zhipu AI / Z.ai), ici GLM-5.2 via Ollama Cloud.
//
// Contrairement aux petits modèles locaux (Gemma 12B) en régime WRITE-ONLY, GLM-5.2
// est un GROS modèle capable : il fait le find/replace (<edit>) de façon fiable, et
// supporte un contexte large. On lui offre donc <write> ET <edit> (l'édition ciblée
// est plus efficace que la réécriture de fichiers entiers) et des caps généreuses,
// pour exploiter sa capacité au lieu de le brider avec les garde-fous d'un petit
// modèle. Accédé via le provider « openai » (Ollama Cloud, endpoint OpenAI-compat).
//
// Bascule Élève #54 — 2026-06-22 (Gemma 4 12B local → GLM-5.2 cloud).

import type { ModelProfile } from "./profile.js";

// Contrat WRITE + EDIT (modèle fort, find/replace fiable).
const GLM_SYSTEM = `Tu es un développeur qui propose des actions à MangoOS.
Tu ne touches JAMAIS au disque : tu DÉCRIS les actions, MangoOS les exécutera.
Tu DOIS répondre UNIQUEMENT dans ce format à balises, sans aucune prose autour :

<mangoos>
  <write path="chemin/relatif">contenu COMPLET et final du fichier</write>
  <edit path="chemin/relatif"><find>extrait exact existant</find><replace>nouvel extrait</replace></edit>
  <run>commande shell éventuelle</run>
  <summary>résumé court de ce que tu fais</summary>
</mangoos>

Règles strictes :
- path TOUJOURS relatif au projet (jamais C:\\, jamais /, jamais ..).
- Projet Vite + React (ESM) : utilise "export"/"import", JAMAIS "module.exports"/"require".
- <write> = fichier créé/écrasé ENTIÈREMENT (contenu final, jamais un squelette à compléter) ;
  <edit> = retouche ciblée, le <find> doit exister TEL QUEL dans le fichier.
- N'émets JAMAIS <run>npm install</run> (ni aucune installation de dépendances) :
  MangoOS installe les dépendances lui-même, hors de ton contrat.
- Termine TOUJOURS par un <summary>. AUCUN texte hors de <mangoos>.`;

export const glmProfile: ModelProfile = {
  id: "glm",
  // Reconnaît la famille GLM : glm-5.2:cloud, glm-4.6, etc.
  matches: (model) => /glm/i.test(model),
  system: GLM_SYSTEM,
  // Universels (partagés + Claude) PUIS mécaniques propres à la famille GLM.
  axiomFiles: [".axioms.md", ".axioms.glm.md"],
  escalateAppendix:
    "\n\nNOTE PARTITION : l'Élève est de la famille GLM (GLM-5.2 via Ollama Cloud), " +
    "offrant <write> ET <edit>. Range l'axiome selon sa portée :\n" +
    "- piège lié au FORMAT/OUTIL de l'Élève (find/replace raté, contrat à balises, " +
    "squelette livré incomplet) → écris-le dans .axioms.glm.md ;\n" +
    "- vérité d'ingénierie/écosystème indépendante du modèle → .axioms.md.",
  // Caps généreuses : gros modèle capable, on ne le bride pas comme un petit local.
  // Valeurs de départ, à affiner à l'usage.
  caps: { axiomCap: 10, fileBudget: 24000, fileMax: 6000, maxAttempts: 3 },
};
