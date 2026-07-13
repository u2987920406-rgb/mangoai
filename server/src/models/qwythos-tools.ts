// Partition QWYTHOS-TOOLS — mêmes poids que Qwythos (qwythos.ts), mais recréés
// dans Ollama avec le VRAI template Qwen3.5 (ChatML + <tool_call>), copié du
// modèle officiel qwen3:8b. Trouvé le 2026-07-14 : le Modelfile original de
// Qwythos était quasi vide (`TEMPLATE {{ .Prompt }}`, sans rôles ni section
// outils) — Ollama annonçait donc `capabilities: ["completion"]` seul, malgré
// des poids Qwen3.5 nativement capables de tool-calling (Raf avait raison).
// Après recréation (`ollama create qwythos-tools:q6 -f Modelfile.qwythos-tools`),
// Ollama annonce désormais `["completion","tools","thinking"]` — à confirmer
// EMPIRIQUEMENT (mesurer, pas supposer) que le moteur agentique en tire un
// comportement réellement meilleur que qwen3:8b/llama3-groq-tool-use.

import type { ModelProfile } from "./profile.js";

const QWYTHOS_TOOLS_SYSTEM = `Tu es un développeur qui propose des actions à MangoOS.
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

export const qwythosToolsProfile: ModelProfile = {
  id: "qwythos-tools",
  matches: (model) => model === "qwythos-tools:q6" || /^qwythos-tools:/i.test(model),
  system: QWYTHOS_TOOLS_SYSTEM,
  axiomFiles: [".axioms.md", ".axioms.qwythos.md"],
  escalateAppendix:
    "\n\nNOTE PARTITION : l'Élève est Qwythos avec template Qwen3.5 corrigé (moteur " +
    "agentique, outils réels). Range l'axiome selon sa portée :\n" +
    "- piège lié aux OUTILS/APPELS DE FONCTION → écris-le dans .axioms.qwythos.md ;\n" +
    "- vérité d'ingénierie/écosystème indépendante du modèle → .axioms.md.",
  caps: { axiomCap: 8, fileBudget: 16000, fileMax: 4000, maxAttempts: 4 },
  agentic: true,
};
