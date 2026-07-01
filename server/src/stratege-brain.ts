// #164 « Le Stratège » Phase 3 — CERVEAU pour les cas AMBIGUS + échelle d'escalade.
//
// Quand `diagnose` (stratege-signals.ts) ne sait pas trancher (`blocker === "ambiguous"`),
// on consulte un CERVEAU pour CLASSER le blocage — JAMAIS pour le résoudre ni écrire du
// code. Leçon TRINITY (veille Sakana, wiki/veille-sakana-fugu.md) : un coordinateur
// MINUSCULE suffit à orchestrer — le cerveau Stratège n'a pas besoin d'être gros. D'où :
//
//   • SORTIE CONTRAINTE — le cerveau choisit UNE classe d'un catalogue FERMÉ (jamais du
//     texte libre exécuté) ; toute réponse hors-catalogue → on RESTE ambigu (repli sûr).
//   • ÉCHELLE D'ESCALADE bornée — barreau 1 : `gemma4:12b` LOCAL ($0). Si non résolu ET
//     l'escalade cloud est activée → barreau 2 : un cloud supérieur (configurable). JAMAIS
//     plus de deux appels (un par barreau) → aucune boucle.
//   • NE LÈVE JAMAIS — dispatch ne throw pas, le parseur est pur ; toute erreur ⇒ null
//     (= on reste ambigu, l'escalade normale d'eleve.ts reprend la main).
//
// Déterministe-testable : `dispatch` est injectable (aucun réseau dans les tests).

import type { AgentId } from "./brain-registry.js";
import type { AgentResult } from "./agent-contract.js";
import { dispatch as realDispatch, type DispatchOpts } from "./brain-dispatch.js";
import { REMEDY_BY_CLASS, type BlockerClass, type BlockerSymptoms, type Diagnosis } from "./stratege-signals.js";

/** Transport injectable (tests). Même signature que `dispatch`. */
export type StrategeDispatch = (
  agentId: AgentId,
  system: string,
  user: string,
  opts?: DispatchOpts,
) => Promise<AgentResult>;

/** Classes que le cerveau peut PROPOSER (catalogue FERMÉ).
 *  On exclut volontairement :
 *   - `none`/`ambiguous` (pas des remèdes),
 *   - `missing-dependency` (le remède exige le NOM du paquet ; si l'extracteur
 *     déterministe a échoué, on n'a pas ce nom → laisser le cerveau le choisir
 *     mènerait à une escalade « module non identifié » trompeuse). */
export const BRAIN_CATALOGUE: { cls: Exclude<BlockerClass, "none" | "ambiguous" | "missing-dependency">; desc: string }[] = [
  { cls: "knowledge-gap", desc: "usage d'une lib/API erroné, sans s'être documenté (chercher_web)" },
  { cls: "wrong-tool", desc: "tâtonnement sur le mauvais outil (shell en boucle pour lire/éditer)" },
  { cls: "repetitive-failure", desc: "réécrit en boucle le(s) même(s) fichier(s) sans résoudre l'erreur de build" },
  { cls: "wandering", desc: "dérive / sur-exploration : relit et replanifie sans produire" },
  { cls: "plateau-iterations", desc: "tâche trop large d'un bloc, à décomposer (delegate)" },
  { cls: "flaky-resource", desc: "ressource externe morte dans le livrable (image/URL 404)" },
];

const CATALOGUE_CLASSES = BRAIN_CATALOGUE.map((c) => c.cls);
const TOKEN = "inconnu"; // le cerveau répond ceci s'il ne sait pas → on reste ambigu

// ── Prompt (sortie contrainte) ────────────────────────────────────────────────
export function buildStrategeSystem(): string {
  const lines = BRAIN_CATALOGUE.map((c) => `- ${c.cls} : ${c.desc}`).join("\n");
  return [
    "Tu es LE STRATÈGE de MangoOS. Le diagnostic déterministe n'a PAS su classer ce blocage.",
    "Ton SEUL rôle : choisir LA classe la plus probable dans le catalogue FERMÉ ci-dessous.",
    "Tu ne résous RIEN, tu n'écris AUCUN code — tu CLASSES, point.",
    "",
    "CATALOGUE (n'invente jamais une autre classe) :",
    lines,
    `- ${TOKEN} : aucun de ces cas ne colle clairement.`,
    "",
    "RÉPONDS EXACTEMENT en une ligne :",
    `CLASSE: <un nom du catalogue ou ${TOKEN}>`,
    "puis une phrase courte de justification. Rien d'autre.",
  ].join("\n");
}

/** Texte des symptômes (DONNÉE non fiable : sortie de build, trace d'outils, tâche). */
export function buildStrategeUser(s: BlockerSymptoms): string {
  const tools = (s.toolNames ?? []).join(", ") || "(aucun)";
  const detail = (s.buildDetail ?? "").slice(0, 500) || "(aucun détail de build)";
  return [
    `Tâche demandée : ${s.task ?? "(non précisée)"}`,
    `Build OK : ${s.buildOk ? "oui" : "non"} · finish : ${s.finished ? "oui" : "non"} · bloqué : ${s.stuck ? "oui" : "non"}`,
    `Itérations : ${s.iterations}${s.maxIterations ? `/${s.maxIterations}` : ""}`,
    `Outils appelés : ${tools}`,
    `Sortie/erreur de build :`,
    detail,
  ].join("\n");
}

// ── Parseur PUR (robuste à un petit modèle local) ─────────────────────────────
/**
 * Extrait une classe du catalogue depuis la réponse brute. Stratégie :
 *  1. ligne `CLASSE: <x>` prioritaire ;
 *  2. sinon, première classe du catalogue mentionnée dans le texte.
 * Renvoie null si rien de reconnu ou si le cerveau répond « inconnu » (→ on reste ambigu).
 * Ne lève jamais.
 */
export function parseStrategeClass(raw: string): BlockerClass | null {
  const text = (raw ?? "").toLowerCase();
  if (!text.trim()) return null;
  // 1. Ligne CLASSE: <x>
  const m = /classe\s*[:=]\s*([a-z-]+)/.exec(text);
  if (m) {
    const tok = m[1];
    if (tok.startsWith(TOKEN)) return null;
    const hit = CATALOGUE_CLASSES.find((c) => tok === c || tok.startsWith(c));
    if (hit) return hit;
  }
  // 2. Repli : première classe du catalogue citée dans le texte (avant tout « inconnu »).
  let best: { cls: BlockerClass; at: number } | null = null;
  for (const c of CATALOGUE_CLASSES) {
    const at = text.indexOf(c);
    if (at >= 0 && (!best || at < best.at)) best = { cls: c, at };
  }
  const unknownAt = text.indexOf(TOKEN);
  if (best && (unknownAt < 0 || best.at < unknownAt)) return best.cls;
  return null;
}

/** Justification nettoyée : retire la ligne `CLASSE: …` pour ne garder que la prose. */
export function cleanJustification(why: string): string {
  return (why ?? "")
    .split("\n")
    .filter((l) => !/^\s*classe\s*[:=]/i.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Forge un Diagnosis raffiné à partir de la classe choisie par le cerveau. */
export function refinedDiagnosis(blocker: BlockerClass, why: string, source: string): Diagnosis {
  return {
    blocker,
    cause: cleanJustification(why).slice(0, 200) || `classé « ${blocker} » par le cerveau Stratège`,
    evidence: `cerveau Stratège (${source}) — cas ambigu reclassé`,
    remedy: REMEDY_BY_CLASS[blocker] ?? "—",
  };
}

export interface ReclassifyOpts {
  dispatch?: StrategeDispatch;
  /** Agent du barreau 1 (local $0). Défaut : "stratege" (gemma4:12b). */
  rung1?: AgentId;
  /** Agent du barreau 2 (cloud supérieur). Défaut : env STRATEGE_ESCALATE_AGENT ?? "juge". */
  rung2?: AgentId;
  /** true → barreau 2 (cloud) autorisé si le barreau 1 échoue. Défaut false (souverain). */
  escalateCloud?: boolean;
}

interface RungOutcome {
  diagnosis: Diagnosis | null;
  source: string; // pour l'observabilité ("barreau 1 (local)", …)
}

async function consultRung(
  agentId: AgentId,
  label: string,
  s: BlockerSymptoms,
  dispatch: StrategeDispatch,
): Promise<RungOutcome> {
  try {
    // freeform : le cerveau répond en prose courte (CLASSE: …) — on parse nous-mêmes.
    // trustExternal=false (défaut) : la sortie de build externe est sanitizée par dispatch.
    const res = await dispatch(agentId, buildStrategeSystem(), buildStrategeUser(s), { freeform: true });
    const cls = parseStrategeClass(res.summary ?? "");
    if (cls) return { diagnosis: refinedDiagnosis(cls, res.summary ?? "", label), source: label };
    return { diagnosis: null, source: label };
  } catch {
    return { diagnosis: null, source: label }; // dispatch ne throw pas, mais ceinture+bretelles
  }
}

/**
 * Reclasse un blocage AMBIGU via l'échelle d'escalade bornée. Renvoie un Diagnosis raffiné
 * (classe routable) ou null (= reste ambigu → escalade normale d'eleve.ts). Au plus DEUX
 * appels de cerveau (un par barreau). Ne lève jamais.
 */
export async function reclassifyAmbiguous(s: BlockerSymptoms, opts: ReclassifyOpts = {}): Promise<Diagnosis | null> {
  const dispatch = opts.dispatch ?? realDispatch;
  const rung1 = opts.rung1 ?? "stratege";
  // Barreau 1 — LOCAL $0.
  const r1 = await consultRung(rung1, "barreau 1 (local)", s, dispatch);
  if (r1.diagnosis) return r1.diagnosis;
  // Barreau 2 — cloud supérieur, opt-in (coût marginal). Configurable.
  if (!opts.escalateCloud) return null;
  const rung2 = opts.rung2 ?? ((process.env.STRATEGE_ESCALATE_AGENT as AgentId | undefined) ?? "juge");
  const r2 = await consultRung(rung2, "barreau 2 (cloud)", s, dispatch);
  return r2.diagnosis;
}

/** Ligne lisible « Mango fait monter l'échelle » (observabilité). */
export function formatReclassify(before: BlockerClass, d: Diagnosis | null): string {
  if (!d) return `🧠 Stratège (cerveau) : cas ambigu non tranché → escalade normale`;
  return `🧠 Stratège (cerveau) : ambigu → reclassé « ${d.blocker} » (${d.evidence})`;
}
