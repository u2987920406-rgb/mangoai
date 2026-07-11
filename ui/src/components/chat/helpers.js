// Helpers PURS du chat — extraits de Chat.jsx (Phase C, audit-mango-2.0 §5 :
// découpage du monolithe sans changement de comportement).

// Réponse guidée : l'agent peut clore son message par une demande de décision
// (PROTOCOLE DE RÉPONSE GUIDÉE du prompt), sous deux formes :
//  • [OUI/NON]                       → box Oui / Non (touches Y/N)
//  • [[OPTIONS]] - a | desc … [[/OPTIONS]]  → box de 2-4 choix (touches 1-4)
// On les détecte pour afficher une box cliquable, et on les masque à l'affichage.
const YESNO_RE = /\s*\[\s*oui\s*\/\s*non\s*\]\s*$/i;
const OPTIONS_RE = /\[\[\s*options\s*\]\]([\s\S]*?)\[\[\s*\/\s*options\s*\]\]/i;

export function parseOptionsBlock(text = "") {
  const m = text.match(OPTIONS_RE);
  if (!m) return null;
  const options = m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-"))
    .map((l) => {
      const body = l.replace(/^-\s*/, "");
      const [label, ...rest] = body.split("|");
      return { label: label.trim(), description: rest.join("|").trim() || null };
    })
    .filter((o) => o.label);
  return options.length ? options : null;
}

// → { kind: "yesno" | "options" | null, options: [{label, description}] }
export function parseQuestion(text = "") {
  const options = parseOptionsBlock(text);
  if (options) return { kind: "options", options };
  if (YESNO_RE.test(text)) return { kind: "yesno", options: [{ label: "Oui" }, { label: "Non" }] };
  return { kind: null, options: [] };
}

export const stripQuestionMarkers = (text = "") =>
  text.replace(OPTIONS_RE, "").replace(YESNO_RE, "").trimEnd();

// Les 3 actions de la chatbox. Le MODÈLE n'est plus codé en dur par action :
// chaque action a son propre modèle, configurable par bouton (menu déroulant) et
// mémorisé. Par défaut tout est sur l'Élève (GLM-5.2) → « rester sur GLM » vaut
// pour Discuter, Planifier ET Construire. Construire = build (elite/runRelay côté
// Élève) ; Planifier & Discuter = tour conversationnel (mode discuss, zéro build).
export const CHAT_ACTIONS = [
  { id: "construire", label: "Construire", mode: "elite"   },
  { id: "planifier",  label: "Planifier",  mode: "discuss" },
  { id: "discuter",   label: "Discuter",   mode: "discuss" },
];
// Raf (2026-07-11) : "eleve" n'a pas de nom fixe — c'est QUEL QUE SOIT le cerveau
// local configuré dans Réglages (brain-registry.json → orchestrateur). Le libellé
// ci-dessous est un REPLI le temps du fetch ; useChatActionModels() récupère le
// vrai nom via /api/brain-registry et le passe en override (voir actionModelLabel).
export const ACTION_MODEL_OPTIONS = [
  { id: "eleve",  label: "Élève (local)" },
  { id: "sonnet", label: "Sonnet 4.6" },
  { id: "opus",   label: "Opus 4.8"   },
  { id: "haiku",  label: "Haiku 4.5"  },
];
export const DEFAULT_ACTION_MODELS = { construire: "eleve", planifier: "eleve", discuter: "eleve" };
export const ACTION_MODELS_KEY = "mangoos.actionModels";
export function loadActionModels() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACTION_MODELS_KEY) || "{}");
    return { ...DEFAULT_ACTION_MODELS, ...raw };
  } catch {
    return { ...DEFAULT_ACTION_MODELS };
  }
}
/** Nom court lisible depuis un identifiant de modèle brut (registre brain-registry
 * ou tag Ollama), ex. "hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q6_K" → "Qwythos 9B v2 (Q6)". */
export function shortModelLabel(raw) {
  if (!raw || typeof raw !== "string") return null;
  const afterSlash = raw.split("/").pop();
  const [name, tag] = afterSlash.split(":");
  const clean = name.replace(/-GGUF$/i, "").replace(/[-_]+/g, " ").trim();
  const quant = tag ? tag.replace(/^([Qq]\d+).*$/, "$1").toUpperCase() : "";
  if (!tag) return clean;
  return quant && quant !== tag.toUpperCase() ? `${clean} (${quant})` : `${clean} ${tag}`;
}
/** `eleveLabel` (optionnel) écrase le libellé statique de "eleve" par le nom du
 * cerveau local RÉELLEMENT configuré (Réglages → brain-registry). */
export const actionModelLabel = (id, eleveLabel) =>
  (id === "eleve" && eleveLabel) || ACTION_MODEL_OPTIONS.find((m) => m.id === id)?.label || id;

// Collapse consecutive tool messages into one expandable group
export function groupMessages(messages) {
  const out = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (m.role === "tool") {
      if (prev?.kind === "tools") prev.items.push(m);
      else out.push({ kind: "tools", key: `g${m.id}`, items: [m] });
    } else {
      out.push({ kind: "msg", key: m.id, message: m });
    }
  }
  out.forEach((g, i) => {
    g.isLast = i === out.length - 1;
  });
  return out;
}
