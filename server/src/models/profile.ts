// Partitions par FAMILLE de modèle Élève (idée : partitionnement modèle).
//
// Le cœur MangoOS (Mango + Claude = quasi 100 % de réussite) doit rester
// IMPÉNÉTRABLE : son raisonnement n'est jamais paramétré par un modèle Élève
// donné. Tout ce qui est spécifique à une famille (prompt système de l'Élève,
// fichiers d'axiomes injectés, consigne de routage des axiomes à l'escalade)
// vit dans une PARTITION isolée, exposée via ce contrat. Le core (eleve.ts)
// consomme un ModelProfile sans connaître aucune famille.
//
// Ajouter une famille (DeepSeek, etc.) = créer un fichier models/<famille>.ts
// et l'ajouter à PROFILES — JAMAIS toucher au core.

import { GENERIC } from "./generic.js";
import { gemmaProfile } from "./gemma.js";
import { uxuiProfile } from "./uxui.js";
import { layoutProfile } from "./layout.js";
import { glmProfile } from "./glm.js";
import { qwythosProfile } from "./qwythos.js";
import { qwythosToolsProfile } from "./qwythos-tools.js";
import { qwen3Profile } from "./qwen3.js";
import { llama3GroqToolUseProfile } from "./llama3-groq-tool-use.js";
import { deepseekProfile } from "./deepseek.js";

export interface ModelProfile {
  /** Identifiant court de la famille ("gemma", "generic"). */
  id: string;
  /** Reconnaît la famille à partir de l'identifiant de modèle (nom Ollama/API). */
  matches: (model: string) => boolean;
  /** Prompt système de l'Élève (la face ENTRÉE du contrat <mangoos>). */
  system: string;
  /** Fichiers d'axiomes injectés à l'Élève (universel d'abord, puis famille). */
  axiomFiles: string[];
  /** Consigne de routage des axiomes ajoutée au prompt du Maître à l'escalade
   *  ("" = neutre : le Maître écrit dans l'unique .axioms.md, comportement actuel). */
  escalateAppendix: string;
  /** Garde-fous anti-saturation (un petit modèle se noie vite). */
  caps: {
    axiomCap: number; // nb max d'axiomes injectés
    fileBudget: number; // budget total (caractères) de contenu de fichiers
    fileMax: number; // cap par fichier (caractères)
    maxAttempts: number; // tentatives de l'Élève avant escalade
  };
  /** Modèle assez fort pour piloter une boucle AGENTIQUE à outils (function-calling :
   *  read/list/search/build…) ? Réservé aux cerveaux forts (GLM) — les petits
   *  modèles ratent souvent les appels d'outils fiables (frontière #135). Absent
   *  ou false → boucle par contrat <mangoos> classique (comportement prouvé). */
  agentic?: boolean;
}

// Registre des familles reconnues. L'ordre compte : première correspondance
// gagne. Un modèle non reconnu retombe sur GENERIC (= comportement actuel exact).
// ORDRE IMPORTANT : qwythosToolsProfile AVANT qwythosProfile — "qwythos-tools:q6"
// contient "qwythos" et matcherait qwythosProfile en premier sinon (regex /qwythos/i),
// perdant agentic:true. Premier match gagne (Array.find), donc le plus SPÉCIFIQUE
// doit toujours précéder le plus GÉNÉRAL.
const PROFILES: ModelProfile[] = [gemmaProfile, uxuiProfile, layoutProfile, glmProfile, qwythosToolsProfile, qwythosProfile, qwen3Profile, llama3GroqToolUseProfile, deepseekProfile];

/** Résout la partition d'un modèle ; fallback GENERIC (non-régression garantie). */
export function resolveProfile(model: string): ModelProfile {
  return PROFILES.find((p) => p.matches(model)) ?? GENERIC;
}
