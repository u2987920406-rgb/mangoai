// Idée #41 — Signal humain 👍/👎 (RLHF personnel).
// Reçoit le signal de l'utilisateur sur une livraison, extrait le pattern
// et l'enregistre dans .axioms.md avec le tag validé-utilisateur ou à-éviter.
import path from "node:path";
import fs from "node:fs";
import { resolveProvider } from "./llm/llm-engine.js";
import { getBrain } from "./kernel.js";
import { AXIOMS_FILE_NAME } from "./axioms.js";

export type FeedbackRating = "like" | "dislike";

// Suivi des 👎 consécutifs par projet (in-memory, reset au démarrage — acceptable phase A)
const dislikeStreaks = new Map<string, number>();
const ESCALATION_THRESHOLD = 2;

/** Mise à jour synchrone du streak — renvoie true si le seuil d'escalade est atteint. */
export function checkAndUpdateStreak(projectName: string, rating: FeedbackRating): boolean {
  if (rating === "like") {
    dislikeStreaks.delete(projectName);
    return false;
  }
  const streak = (dislikeStreaks.get(projectName) ?? 0) + 1;
  dislikeStreaks.set(projectName, streak);
  return streak >= ESCALATION_THRESHOLD;
}

/** Reset du streak après une escalade traitée. */
export function resetStreak(projectName: string): void {
  dislikeStreaks.delete(projectName);
}

export async function processFeedback(
  workspaceDir: string,
  rating: FeedbackRating,
  messageText: string,
  projectName: string,
  // Souveraineté : si fourni (ex. réponse de GLM en mode Élève), l'extraction de
  // l'axiome est faite par CE cerveau au lieu du FEEDBACK_PROVIDER (Claude) par
  // défaut — le pouce appartient à GLM/Mango, jamais à Claude.
  ask?: (system: string, prompt: string) => Promise<string>,
): Promise<void> {
  const tag = rating === "like" ? "validé-utilisateur" : "à-éviter";
  const axiomCat = rating === "like" ? "UX" : "AVOID";
  const today = new Date().toISOString().slice(0, 10);

  const prompt = rating === "like"
    ? `L'utilisateur a 👍 cette réponse de MangoOS dans le projet "${projectName}". Extrait le PATTERN UX/visuel/architectural qui lui a plu sous forme d'axiome universel réutilisable. Ne décris pas ce que le message dit — extrait la RÈGLE ABSTRAITE applicable à d'autres projets.

Message liké :
${messageText.slice(0, 1500)}

Réponds UNIQUEMENT avec un bloc axiome dans ce format exact (rien d'autre) :
AXIOME-${axiomCat}-XX [candidat] [${tag}]
- Contexte: (quand cette règle s'applique)
- Piège: (l'erreur à éviter)
- Règle d'or: (la règle concrète)
- Source: 👍 utilisateur (${today}) — projet ${projectName}`
    : `L'utilisateur a 👎 cette réponse de MangoOS dans le projet "${projectName}". Extrait le PATTERN à éviter sous forme d'axiome universel. Ne décris pas ce que le message dit — extrait ce qu'il ne faut JAMAIS faire dans un contexte similaire.

Message disliké :
${messageText.slice(0, 1500)}

Réponds UNIQUEMENT avec un bloc axiome dans ce format exact (rien d'autre) :
AXIOME-${axiomCat}-XX [candidat] [${tag}]
- Contexte: (quand ce pattern apparaît)
- Piège: (ce qui déplaît à l'utilisateur)
- Règle d'or: (ce qu'il faut faire à la place)
- Source: 👎 utilisateur (${today}) — projet ${projectName}`;

  const axiomText = ask
    ? await ask('', prompt)
    : await getBrain().complete('', prompt, {
        provider: resolveProvider(process.env.FEEDBACK_PROVIDER),
        maxTokens: 400,
      });

  if (!axiomText.startsWith("AXIOME-")) return;

  const axiomsPath = path.join(workspaceDir, AXIOMS_FILE_NAME);
  const existing = fs.existsSync(axiomsPath)
    ? fs.readFileSync(axiomsPath, "utf8").trim()
    : "";
  const updated = existing ? `${existing}\n\n${axiomText}` : axiomText;
  fs.writeFileSync(axiomsPath, updated + "\n", "utf8");
}

export async function processEscalationReference(
  workspaceDir: string,
  projectName: string,
  referenceText: string,
): Promise<void> {
  // Haiku analyse la référence et extrait le goût visuel de l'utilisateur
  // comme axiome [validé-utilisateur]
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `L'utilisateur a fourni cette référence visuelle/stylistique à MangoOS pour corriger sa direction : "${referenceText.slice(0, 1000)}"

Extrait le GOÛT VISUEL / STYLISTIQUE précis de l'utilisateur sous forme d'axiome universel réutilisable. Ne décris pas la référence — extrait la RÈGLE ABSTRAITE sur ce que l'utilisateur aime visuellement.

Réponds UNIQUEMENT avec un bloc axiome dans ce format exact (rien d'autre) :
AXIOME-UX-XX [candidat] [validé-utilisateur]
- Contexte: (quand appliquer ce style)
- Piège: (ce que l'utilisateur n'aime pas)
- Règle d'or: (ce que l'utilisateur préfère visuellement)
- Source: 🎯 escalade utilisateur (${today}) — projet ${projectName}`;

  const axiomText = await getBrain().complete('', prompt, {
    provider: resolveProvider(process.env.FEEDBACK_PROVIDER),
    maxTokens: 400,
  });

  if (!axiomText.startsWith("AXIOME-")) return;

  const axiomsPath = path.join(workspaceDir, AXIOMS_FILE_NAME);
  const existing = fs.existsSync(axiomsPath)
    ? fs.readFileSync(axiomsPath, "utf8").trim()
    : "";
  const updated = existing ? `${existing}\n\n${axiomText}` : axiomText;
  fs.writeFileSync(axiomsPath, updated + "\n", "utf8");
}
