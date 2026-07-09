// Phase E (#135) — Registre de cerveaux MESURÉS + routage par INTENTION.
//
// Le dernier étage du moteur souverain (#146) : chaque intention (construire /
// planifier / discuter) est routée vers SON cerveau — façon Haiku/Sonnet/Opus de
// Claude Code, mais souverain et MESURÉ. Ce module persiste les sorties du scanner
// d'entrée #148 (model-scan.ts) en FICHES CERVEAU durables et tient le mapping
// intention → cerveau.
//
// Principe validé avec Raf : le scan RECOMMANDE l'aptitude (verdict agentic/
// contract/discuss/reject), l'humain DÉCIDE l'emploi (quelle intention sur quel
// cerveau), MangoOS AVERTIT si une affectation contredit la mesure. Jamais
// d'affectation imposée — choix éclairé, pas à l'aveugle.
//
// Module PUR/synchrone : aucun réseau ici. Le scan vit dans model-scan.ts ; on n'en
// consomme que le RÉSULTAT (cardFromScan). Stockage = un JSON plat versionnable à la
// racine MangoOS (.brains/registry.json) — fiches + routage dans un seul fichier.

import path from "node:path";
import { atomicWriteFileSync } from "./safe-io.js";
import fs from "node:fs";
import type { LLMProvider } from "./llm/llm-engine.js";
import type { ScanReport, ScanVerdict } from "./model-scan.js";
import type { ModelProfile } from "./models/profile.js";

// ── Intentions (= les 3 boutons : Construire / Planifier / Discuter) ───────────
export type Intention = "construire" | "planifier" | "discuter";
export const INTENTIONS: Intention[] = ["construire", "planifier", "discuter"];
export const INTENTION_LABELS: Record<Intention, string> = {
  construire: "Construire",
  planifier: "Planifier",
  discuter: "Discuter",
};

// ── Modèle de données ─────────────────────────────────────────────────────────

/** Une fiche cerveau = ce que le scan #148 a MESURÉ, figé pour le routage. */
export interface BrainCard {
  /** Slug stable dérivé du modèle (clé d'identité dans le registre). */
  id: string;
  /** Nom lisible (par défaut = le modèle). */
  label: string;
  /** Identifiant du modèle (Ollama/API), ex. "glm-4.6:cloud", "gemma4:12b". */
  model: string;
  /** Provider à employer pour ce cerveau. */
  provider: LLMProvider;
  /** Verdict de placement mesuré par le scanner #148. */
  verdict: ScanVerdict;
  /** Assez fort pour piloter la boucle agentique à outils ? */
  agentic: boolean;
  /** Garde-fous anti-saturation suggérés par la mesure. */
  caps: ModelProfile["caps"];
  /** Scores des sondes (dimension → 0..1), pour diagnostic/affichage. */
  capabilities?: Record<string, number>;
  /** Latence moyenne mesurée (ms). */
  avgLatencyMs?: number;
  /** Date du scan (ISO). */
  scannedAt: string;
  /** Endpoint OpenAI-compat custom (C1-P0, ex. Zhipu). Absent = endpoint .env global. */
  baseUrl?: string;
  /** Nom de la variable d'env qui porte la clé API (ex. "ZHIPU_API_KEY") — jamais la clé elle-même. */
  apiKeyEnv?: string;
}

export interface BrainRegistry {
  brains: BrainCard[];
  /** intention → id de cerveau (absent = aucune affectation). */
  routing: Partial<Record<Intention, string>>;
}

const EMPTY_REGISTRY: BrainRegistry = { brains: [], routing: {} };

// ── Emplacement (racine MangoOS, config système cross-projet) ──────────────────
// Résolution PARESSEUSE (lue à chaque appel) : un test peut rediriger BRAINS_DIR
// vers un dossier temporaire même avec un import statique du module.
const ROOT = path.resolve(import.meta.dirname, "..", "..");
export function brainsDir(): string {
  return process.env.BRAINS_DIR ?? path.join(ROOT, ".brains");
}
function registryFile(): string {
  return path.join(brainsDir(), "registry.json");
}

/** Slug stable et sûr depuis un identifiant de modèle (anti path-traversal). */
export function slugifyModel(model: string): string {
  return (
    model
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "brain"
  );
}

// ── Persistance (synchrone, best-effort, jamais lève à la lecture) ─────────────

export function loadRegistry(): BrainRegistry {
  try {
    const raw = fs.readFileSync(registryFile(), "utf8");
    const data = JSON.parse(raw) as Partial<BrainRegistry>;
    return {
      brains: Array.isArray(data.brains) ? data.brains : [],
      routing: data.routing && typeof data.routing === "object" ? data.routing : {},
    };
  } catch {
    return { ...EMPTY_REGISTRY, routing: {} };
  }
}

export function saveRegistry(reg: BrainRegistry): void {
  fs.mkdirSync(brainsDir(), { recursive: true });
  atomicWriteFileSync(registryFile(), JSON.stringify(reg, null, 2) + "\n");
}

// ── Construction d'une fiche depuis un rapport de scan #148 ────────────────────

/** Mappe un ScanReport (model-scan.ts) en fiche cerveau persistable. PUR. */
export function cardFromScan(
  report: ScanReport,
  provider: LLMProvider,
  // baseUrl/apiKeyEnv optionnels (C1-P0) : absents par défaut → fiche identique
  // à avant (repli sur l'endpoint .env global via brain-runtime/eleve).
  opts: { label?: string; scannedAt: string; baseUrl?: string; apiKeyEnv?: string },
): BrainCard {
  const card: BrainCard = {
    id: slugifyModel(report.model),
    label: opts.label?.trim() || report.model,
    model: report.model,
    provider,
    verdict: report.verdict,
    agentic: report.suggestedProfile.agentic,
    caps: report.suggestedProfile.caps,
    capabilities: report.capabilities,
    avgLatencyMs: report.avgLatencyMs,
    scannedAt: opts.scannedAt,
  };
  if (opts.baseUrl) card.baseUrl = opts.baseUrl;
  if (opts.apiKeyEnv) card.apiKeyEnv = opts.apiKeyEnv;
  return card;
}

// ── CRUD (chaque mutation lit → modifie → réécrit le registre) ─────────────────

export function getBrain(id: string): BrainCard | null {
  return loadRegistry().brains.find((b) => b.id === id) ?? null;
}

/** Insère ou remplace une fiche (clé = id). Renvoie le registre à jour. */
export function upsertBrain(card: BrainCard): BrainRegistry {
  const reg = loadRegistry();
  const i = reg.brains.findIndex((b) => b.id === card.id);
  if (i >= 0) reg.brains[i] = card;
  else reg.brains.push(card);
  saveRegistry(reg);
  return reg;
}

/** Retire une fiche ET toute affectation qui la pointait (cohérence). */
export function removeBrain(id: string): BrainRegistry {
  const reg = loadRegistry();
  reg.brains = reg.brains.filter((b) => b.id !== id);
  for (const intent of INTENTIONS) {
    if (reg.routing[intent] === id) delete reg.routing[intent];
  }
  saveRegistry(reg);
  return reg;
}

/** Affecte une intention à un cerveau (brainId=null pour désaffecter). Lève si
 * le cerveau est inconnu — on n'écrit jamais un routage pendant. */
export function setRouting(intention: Intention, brainId: string | null): BrainRegistry {
  const reg = loadRegistry();
  if (brainId === null) {
    delete reg.routing[intention];
  } else {
    if (!reg.brains.some((b) => b.id === brainId)) {
      throw new Error(`cerveau inconnu : "${brainId}"`);
    }
    reg.routing[intention] = brainId;
  }
  saveRegistry(reg);
  return reg;
}

/** Le routeur : la fiche cerveau affectée à une intention (null = non affecté). */
export function resolveBrainForIntention(intention: Intention, reg: BrainRegistry = loadRegistry()): BrainCard | null {
  const id = reg.routing[intention];
  if (!id) return null;
  return reg.brains.find((b) => b.id === id) ?? null;
}

// ── « MangoOS avertit » : aptitude requise par intention vs verdict mesuré ──────

export type Fit = "ok" | "suboptimal" | "mismatch";

export interface RoutingWarning {
  intention: Intention;
  brainId: string;
  fit: Fit;
  message: string;
}

/**
 * Confronte le verdict MESURÉ d'un cerveau à ce qu'une intention EXIGE :
 *   - construire : doit pouvoir produire du code (agentic idéal, contract acceptable
 *     mais sous-optimal) → discuss/reject = mismatch.
 *   - planifier  : raisonnement/texte → reject = mismatch (le reste passe).
 *   - discuter   : texte simple → reject = mismatch (le reste passe).
 * Renvoie le niveau d'adéquation + un message prêt à afficher. PUR.
 */
export function intentionFit(intention: Intention, card: BrainCard): { fit: Fit; message: string } {
  const v = card.verdict;
  if (intention === "construire") {
    if (v === "agentic") return { fit: "ok", message: "" };
    if (v === "contract") {
      return {
        fit: "suboptimal",
        message: `${card.label} construit via contrat (pas d'outils fiables) — fonctionnel, mais le moteur agentique (lecture/écriture/build en boucle) lui est fermé.`,
      };
    }
    return {
      fit: "mismatch",
      message: `${card.label} a été jugé « ${v} » par l'examen : il ne sait pas construire de façon fiable. Risque élevé d'échec en Construire — un cerveau agentic est recommandé.`,
    };
  }
  // planifier / discuter : du texte ; seul "reject" est disqualifiant.
  if (v === "reject") {
    return {
      fit: "mismatch",
      message: `${card.label} n'a pas passé l'examen d'entrée (« reject ») — peu fiable même pour ${INTENTION_LABELS[intention].toLowerCase()}.`,
    };
  }
  return { fit: "ok", message: "" };
}

/** Tous les avertissements du routage courant (fit ≠ ok). Pour l'UI Réglages. */
export function routingWarnings(reg: BrainRegistry = loadRegistry()): RoutingWarning[] {
  const out: RoutingWarning[] = [];
  for (const intention of INTENTIONS) {
    const card = resolveBrainForIntention(intention, reg);
    if (!card) continue;
    const { fit, message } = intentionFit(intention, card);
    if (fit !== "ok") out.push({ intention, brainId: card.id, fit, message });
  }
  return out;
}
