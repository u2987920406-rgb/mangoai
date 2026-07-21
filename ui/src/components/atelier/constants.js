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

// Ce que fait chaque agent, en une phrase concrète (affiché à côté du nom dans l'Atelier).
export const AGENT_DESC = {
  orchestrateur: "il ordonne les étapes d'une mission et répartit le travail entre agents",
  architecte:    "il conçoit la structure d'un projet avant que le code ne s'écrive",
  codeur:        "il écrit et modifie le code — c'est l'Élève, les mains qui codent",
  vision:        "il regarde les captures d'écran et juge le rendu visuel",
  designer_ux:   "il propose la mise en page, les couleurs, l'ergonomie",
  extracteur:    "il aspire un site existant et en extrait la structure réutilisable",
  testeur:       "il fait tourner l'app et vérifie que le parcours fonctionne",
  auditeur:      "il relit le code produit et traque les régressions",
  optimiseur:    "il resserre le code déjà fonctionnel (perf, taille, clarté)",
  chercheur:     "il va chercher des infos ou des images sur le web",
  juge:          "il note un rendu ou tranche entre deux versions",
  stratege:      "il observe l'activité globale et pousse des conseils proactifs",
  forgeron:      "il forge de nouveaux agents spécialisés pour combler une lacune",
  routeur:       "il choisit quel agent/cerveau traite une requête donnée",
  accueil:       "il gère le premier échange avec l'utilisateur",
};

export function fmtBytes(n) {
  if (!n) return "";
  const gb = n / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} Go`;
  return `${Math.round(n / 1e6)} Mo`;
}
