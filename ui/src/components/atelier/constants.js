// Constantes partagées de l'Atelier des cerveaux (#162).

export const PROVIDERS = ["claude", "ollama", "openai", "deepseek", "mistral", "groq", "litellm"];

export const FIELD_CLS =
  "w-full rounded-lg border border-edge bg-raised px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-accent/50";

// Couleur par verdict #148 (palette MangoOS).
export const VERDICT = {
  agentic:  { label: "Agentique",  cls: "bg-[#34C759]/15 text-[#34C759] border-[#34C759]/30" },
  contract: { label: "Contrat",    cls: "bg-[#FFCC00]/15 text-[#E0A800] border-[#FFCC00]/30" },
  discuss:  { label: "Discussion", cls: "bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30" },
  reject:   { label: "Recalé",     cls: "bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/30" },
};

// verdict → agents conseillés (la capability `vision` reste requise à part).
export const SUGGESTED = {
  agentic:  ["codeur", "orchestrateur", "architecte", "juge", "optimiseur"],
  contract: ["extracteur", "testeur", "auditeur"],
  discuss:  ["chercheur", "designer_ux"],
  reject:   [],
};

// Badge de capability Ollama (vision/tools/thinking…).
export const CAP_LABEL = { vision: "vision", tools: "outils", thinking: "raisonne", completion: "texte" };

export function fmtBytes(n) {
  if (!n) return "";
  const gb = n / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} Go`;
  return `${Math.round(n / 1e6)} Mo`;
}
