// Partition DEEPSEEK — famille DeepSeek V (DeepSeek-AI), ici deepseek-v4.1-flash
// via Ollama Cloud (provider « openai », endpoint OpenAI-compat https://ollama.com/v1).
//
// GROS modèle cloud : function-calling natif vérifié en réel le 2026-09-29
// (POST /v1/chat/completions avec tools=[read_file] → tool_calls read_file
// {"path":"package.json"}, usage complet). On lui ouvre donc la boucle AGENTIQUE à
// outils, et des caps généreuses alignées sur la partition GLM (l'autre gros modèle
// cloud prouvé) — on ne le bride pas avec les garde-fous d'un petit local.
//
// `system` sert de repli si le moteur agentique retombe sur le contrat (agentic
// désactivé via ELEVE_AGENTIC=off) : contrat WRITE + EDIT, comme GLM. Le vrai
// comportement agentique vient de AGENTIC_TOOL_CONTRACT/AGENTIC_FALLBACK_SYSTEM
// (eleve/contract.ts), pas d'ici.
//
// Bascule Élève — 2026-09-29 (mimo-v2.6-pro → deepseek-v4.1-flash).

import type { ModelProfile } from "./profile.js";

// Contrat WRITE + EDIT (modèle fort, find/replace fiable) — repli du chemin agentique.
const DEEPSEEK_SYSTEM = `Tu es un développeur qui propose des actions à MangoOS.
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

export const deepseekProfile: ModelProfile = {
  id: "deepseek",
  // Famille DeepSeek V (cloud) : deepseek-v4.1-flash, deepseek-v4-flash:0731, deepseek-v3.x…
  // Volontairement PAS /deepseek/i : les distillations locales « deepseek-r1:7b » (base
  // Qwen/Llama) ou « deepseek-coder:6.7b » sont de petits modèles sans function-calling
  // prouvé — ils doivent rester sur GENERIC (chemin contrat, caps prudentes).
  matches: (model) => /deepseek-v\d/i.test(model),
  system: DEEPSEEK_SYSTEM,
  // Universels (partagés + Claude) PUIS mécaniques propres à la famille DeepSeek.
  axiomFiles: [".axioms.md", ".axioms.deepseek.md"],
  escalateAppendix:
    "\n\nNOTE PARTITION : l'Élève est de la famille DeepSeek (deepseek-v4.1-flash via " +
    "Ollama Cloud, moteur agentique à outils réels, repli contrat <write> ET <edit>). " +
    "Range l'axiome selon sa portée :\n" +
    "- piège lié aux OUTILS/APPELS DE FONCTION ou au FORMAT de l'Élève (mauvais argument, " +
    "outil mal choisi, find/replace raté, squelette livré incomplet) → écris-le dans .axioms.deepseek.md ;\n" +
    "- vérité d'ingénierie/écosystème indépendante du modèle → .axioms.md.",
  // Caps généreuses, alignées sur GLM (gros modèle cloud, même rang) — toutes au-dessus
  // de GENERIC (5 / 9000 / 2500 / 2). Valeurs de départ NON mesurées sur DeepSeek,
  // à affiner à l'usage (la mesure #148 d'une fiche cerveau les écrase si elle existe).
  caps: { axiomCap: 10, fileBudget: 24000, fileMax: 6000, maxAttempts: 3 },
  // Function-calling natif vérifié en réel (2026-09-29) → boucle agentique autorisée.
  agentic: true,
};
