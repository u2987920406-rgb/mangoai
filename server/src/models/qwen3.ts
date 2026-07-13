// Partition QWEN3 — Qwen3 officiel (Alibaba), via Ollama, ex. qwen3:8b/qwen3:14b.
//
// Contrairement à Qwythos (fine-tune GGUF importé SANS template de tool-calling,
// capacités Ollama `["completion"]` seul — voir qwythos.ts), les builds officiels
// Qwen3 de la bibliothèque Ollama exposent la capacité "tools" nativement (comme
// qwen3-vl:8b, déjà utilisé pour la vision). Testé le 2026-07-14 en réponse à la
// découverte que le chemin CONTRAT (Qwythos) est structurellement mal équipé pour
// des tâches ambitieuses (pas d'outils réels, écriture de fichier entier en un
// jet) — hypothèse : un modèle qui PILOTE VRAIMENT le function-calling peut faire
// de l'édition incrémentale (read/write/edit ciblés) au lieu de tout réécrire.
//
// `system` sert de repli si jamais le moteur agentique retombe sur le contrat
// (agentic désactivé via ELEVE_AGENTIC=off) — le vrai comportement agentique vient
// de AGENTIC_TOOL_CONTRACT/AGENTIC_FALLBACK_SYSTEM (eleve/contract.ts), pas d'ici.

import type { ModelProfile } from "./profile.js";

const QWEN3_SYSTEM = `Tu es un développeur qui propose des actions à MangoOS.
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

export const qwen3Profile: ModelProfile = {
  id: "qwen3",
  // "qwen3:8b", "qwen3:14b"... — PAS "qwen3-vl:8b" (vision, tiret pas deux-points
  // après "qwen3") ni "qwen3.5:cloud" (point, famille différente = Qwythos/GLM-adjacent).
  matches: (model) => /^qwen3:/i.test(model),
  system: QWEN3_SYSTEM,
  axiomFiles: [".axioms.md", ".axioms.qwen3.md"],
  escalateAppendix:
    "\n\nNOTE PARTITION : l'Élève est Qwen3 officiel (moteur agentique, outils réels). " +
    "Range l'axiome selon sa portée :\n" +
    "- piège lié aux OUTILS/APPELS DE FONCTION (mauvais argument, outil mal choisi) " +
    "→ écris-le dans .axioms.qwen3.md ;\n" +
    "- vérité d'ingénierie/écosystème indépendante du modèle → .axioms.md.",
  caps: { axiomCap: 8, fileBudget: 16000, fileMax: 4000, maxAttempts: 4 },
  // Qwen3 officiel pilote le function-calling nativement (capacité "tools" Ollama,
  // contrairement à Qwythos) → boucle agentique à outils autorisée.
  agentic: true,
};
