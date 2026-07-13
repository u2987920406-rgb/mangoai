// Partition LLAMA3-GROQ-TOOL-USE — fine-tune Groq/Llama3 spécifiquement entraîné
// pour la fiabilité d'appel d'outils (function-calling), via Ollama.
//
// Testé le 2026-07-14 en comparaison directe avec qwen3.ts (même besoin : sortir
// du chemin CONTRAT de Qwythos, structurellement mal équipé pour des tâches
// ambitieuses). Angle différent de Qwen3 : ce modèle est un fine-tune DÉDIÉ à la
// précision du tool-calling plutôt qu'un généraliste — hypothèse à vérifier en
// conditions réelles, pas supposée acquise.

import type { ModelProfile } from "./profile.js";

const LLAMA3_GROQ_SYSTEM = `Tu es un développeur qui propose des actions à MangoOS.
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
- <write> = fichier créé/écrasé ENTIÈREMENT ; <edit> = retouche ciblée (le <find> doit exister tel quel).
- N'émets JAMAIS <run>npm install</run> : MangoOS installe les dépendances lui-même.
- Termine TOUJOURS par un <summary>. AUCUN texte hors de <mangoos>.`;

export const llama3GroqToolUseProfile: ModelProfile = {
  id: "llama3-groq-tool-use",
  matches: (model) => /groq-tool-use/i.test(model),
  system: LLAMA3_GROQ_SYSTEM,
  axiomFiles: [".axioms.md", ".axioms.llama3-groq.md"],
  escalateAppendix:
    "\n\nNOTE PARTITION : l'Élève est Llama3-Groq-Tool-Use (moteur agentique, fine-tune " +
    "dédié à la fiabilité d'appel d'outils). Range l'axiome selon sa portée :\n" +
    "- piège lié aux OUTILS/APPELS DE FONCTION → écris-le dans .axioms.llama3-groq.md ;\n" +
    "- vérité d'ingénierie/écosystème indépendante du modèle → .axioms.md.",
  caps: { axiomCap: 8, fileBudget: 16000, fileMax: 4000, maxAttempts: 4 },
  // Fine-tuné spécifiquement pour le function-calling → boucle agentique autorisée.
  agentic: true,
};
