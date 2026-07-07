// taste-compare.ts (É3, Loop Engineering 2026-07-07) — jugement RELATIF par paires,
// scaffold recommandé par la revue d'architecture Fable de cette session (axiome 15
// de methode-fable.md : « un juge probabiliste ne rend jamais un nombre qui traverse
// un seuil ; il rend un ordre ou une catégorie »). Remplace, à terme, la notation
// absolue 0-100 de taste-judge.ts (prouvée non-discriminante : 6 vraies apps Mango,
// toutes notées 92-94/100, alors que la seule note humaine distincte — festival-aurora
// 4/5 parmi des 5/5 — était invisible dans ce bruit).
//
// Câblé sur brain-ensemble.ts::deliberate en mode "majority" : 2 membres — ordre
// normal (A,B) et ordre inversé (B,A) avec remap de la clé de vote — minAgree:2
// (les deux ordres doivent s'accorder). Un désaccord d'ordre = biais de position
// avéré → catégorie "instable", jamais une erreur à réessayer en boucle.
//
// parsePairVerdict naît avec un champ `parsed:boolean` dès sa conception (pas en
// réparation après incident, contrairement à taste-judge/eleve-judge/savoir-reconcile
// cette même session) : une réponse hors-format ne doit JAMAIS être indiscernable
// d'un vrai verdict.
import { deliberate, type EnsembleMember } from "./brain-ensemble.js";
import type { AgentResult } from "./agent-contract.js";
import type { AgentId } from "./brain-registry.js";
import type { JudgeContext } from "./taste-judge.js";

export type PairVerdict = "A" | "B" | "tie";
/** "instable" = les deux ordres se contredisent (biais de position détecté) —
 *  un diagnostic DIFFÉRENT de "aucun signal de goût", jamais confondu avec lui. */
export type PairOutcome = PairVerdict | "instable";

export interface PairResult {
  verdict: PairOutcome;
  agree: number;
  total: number;
  reason: string;
}

export interface ParsedPairVerdict {
  verdict: PairVerdict; // valeur d'AFFICHAGE seule si parsed:false (défaut "tie")
  parsed: boolean;
  reason: string;
}

/** Un appel LLM vision unique avec DEUX images, dans l'ordre (imgA, imgB) donné par
 *  l'appelant — chaque membre de l'ensemble choisit son propre ordre physique. */
export type CompareRaw = (
  imgA: Buffer,
  imgB: Buffer,
  system: string,
  user: string,
) => Promise<{ status: string; summary?: string }>;

export interface CompareDeps {
  comparePairRaw: CompareRaw;
}

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const COMPARE_MODEL = process.env.TASTE_COMPARE_MODEL ?? "qwen3.5:cloud";

/** Transport réel : appel direct à l'API Ollama (chat, 2 images, temperature:0).
 *  Ne lève jamais côté transport normal : une erreur réseau devient status "error". */
async function realComparePairRaw(
  imgA: Buffer,
  imgB: Buffer,
  system: string,
  user: string,
): Promise<{ status: string; summary?: string }> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: COMPARE_MODEL,
        stream: false,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user, images: [imgA.toString("base64"), imgB.toString("base64")] },
        ],
      }),
    });
    if (!res.ok) return { status: "error", summary: `HTTP ${res.status}` };
    const data = (await res.json()) as { message?: { content?: string } };
    const summary = (data.message?.content ?? "").trim();
    return summary ? { status: "ok", summary } : { status: "error", summary: "" };
  } catch (e) {
    return { status: "error", summary: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
}

const realDeps: CompareDeps = { comparePairRaw: realComparePairRaw };

/** Prompt système — choix FORCÉ entre A/B ; « égalité » n'est permise que si les
 *  deux captures sont vraiment indiscernables, pas un repli de confort. */
export function comparePrompt(ctx: JudgeContext): string {
  const gout = [
    ctx.tasteAxioms.trim() ? `GOÛT APPRIS DE RAF (priorité haute) :\n${ctx.tasteAxioms.trim()}` : "",
    ctx.designSystem.trim() ? `DESIGN SYSTEM (cohérence) :\n${ctx.designSystem.trim()}` : "",
  ].filter(Boolean).join("\n\n");
  return (
    "Tu es l'œil de Mango — un juge de goût UI/UX. On te montre DEUX captures d'écran, " +
    "étiquetées A et B. Choisis laquelle a la MEILLEURE exécution UI/UX globale (qualité " +
    "universelle : lisibilité, hiérarchie, cohérence, absence de casse, exécution soignée " +
    "de sa direction esthétique). Ne réponds « égalité » que si les deux sont VRAIMENT " +
    "indiscernables — ce n'est pas une option de confort. " +
    (gout ? `\n\n${gout}\n\n` : "\n\n") +
    "Réponds STRICTEMENT sur une seule ligne, ce format exact :\n" +
    "MEILLEUR: <A|B|égalité> | <raison courte en français>"
  );
}

/** Parse la réponse du juge → verdict + parsed. PUR. */
export function parsePairVerdict(text: string): ParsedPairVerdict {
  const t = (text ?? "").trim();
  const m = t.match(/MEILLEUR\s*:?\s*(A|B|[ée]galit[ée]|tie)/i);
  const parsed = !!m;
  let verdict: PairVerdict = "tie";
  if (m) {
    const v = m[1].toLowerCase();
    if (v === "a") verdict = "A";
    else if (v === "b") verdict = "B";
    else verdict = "tie";
  }
  let reason = "";
  const parts = t.split("|");
  if (parts.length >= 2) reason = parts.slice(1).join("|").trim();
  if (!reason) reason = t.split("\n")[0].replace(/MEILLEUR\s*:?\s*\S+/i, "").replace(/^[|\s—-]+/, "").trim();
  return { verdict, parsed, reason: reason.slice(0, 200) };
}

/**
 * Compare deux captures via un ensemble à 2 membres (ordre normal / inversé+remap),
 * vote majoritaire à l'unanimité (minAgree:2). Ne lève jamais : tout échec (membre
 * muet, hors-format, désaccord d'ordre) se résout en `PairResult`, jamais une exception.
 */
export async function comparePair(
  a: Buffer,
  b: Buffer,
  ctx: JudgeContext,
  deps: CompareDeps = realDeps,
): Promise<PairResult> {
  const system = comparePrompt(ctx);
  const user = "Capture A puis capture B. Laquelle est la meilleure ?";

  const toResult = (verdict: PairVerdict | null, reason: string): AgentResult =>
    verdict === null
      ? { status: "error", agent: "juge" as AgentId, summary: reason, data: {}, confidence: 0, durationMs: 0 }
      : { status: "ok", agent: "juge" as AgentId, summary: reason, data: { verdict }, confidence: 1, durationMs: 0 };

  const normal: EnsembleMember = async () => {
    const r = await deps.comparePairRaw(a, b, system, user);
    if (r.status !== "ok" || !r.summary?.trim()) return toResult(null, r.summary || "muet");
    const v = parsePairVerdict(r.summary);
    return v.parsed ? toResult(v.verdict, v.reason) : toResult(null, "hors-format");
  };

  const inverse: EnsembleMember = async () => {
    const r = await deps.comparePairRaw(b, a, system, user); // ordre PHYSIQUE inversé
    if (r.status !== "ok" || !r.summary?.trim()) return toResult(null, r.summary || "muet");
    const v = parsePairVerdict(r.summary);
    if (!v.parsed) return toResult(null, "hors-format");
    // Remap : le juge a vu (b,a) donc son "A" désigne b et son "B" désigne a.
    const remapped: PairVerdict = v.verdict === "A" ? "B" : v.verdict === "B" ? "A" : "tie";
    return toResult(remapped, v.reason);
  };

  const agg = await deliberate("juge" as AgentId, [normal, inverse], {
    aggregator: "majority",
    keyFn: (r) => (typeof r.data?.verdict === "string" ? (r.data.verdict as string) : null),
    minAgree: 2, // unanimité des deux ordres — un désaccord = biais de position, pas un hasard qu'on tranche à la majorité de 1
  });

  if (agg.status !== "ok" && agg.status !== "partial") {
    // deliberate renvoie "error" à la fois pour "pas de consensus" (désaccord d'ordre
    // réel) ET pour "ensemble vide/tous muets" — les deux sont honnêtement "instable"
    // ici : on n'a PAS de verdict de goût fiable, peu importe la cause exacte.
    return { verdict: "instable", agree: 0, total: 2, reason: agg.summary };
  }
  const ens = agg.data?.ensemble as { agree?: number; total?: number } | undefined;
  const verdict = (agg.data?.verdict as PairVerdict | undefined) ?? "tie";
  return { verdict, agree: ens?.agree ?? 2, total: ens?.total ?? 2, reason: agg.summary };
}
