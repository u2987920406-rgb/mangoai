// (C3, 2026-07-03) Ensemble / vote de cerveaux — LE MÉCANISME, gaté OFF.
//
// Idée (recommandation « saturer le milieu de gamme, les faire voter ») : pour
// une décision CRITIQUE et CATÉGORIELLE (le juge de clôture d'abord), au lieu de
// faire confiance à UN seul modèle, on interroge N modèles moyens/bon marché et
// on agrège — majorité, ou un juge final qui tranche. Plus robuste contre le
// biais d'un modèle unique, pour un coût borné (≤3 appels de modèles moyens).
//
// Ce module est PUR et DÉCOUPLÉ du transport : chaque « membre » est une closure
// `() => Promise<AgentResult>` injectée (l'appelant décide COMMENT chaque modèle
// répond — dispatch, provider distinct, etc.). Ainsi le mécanisme se teste sans
// réseau, et le câblage réel (quels modèles, comment) reste la responsabilité de
// l'appelant. Rien ne s'active tant que BRAIN_ENSEMBLE + une config `ensemble` ne
// sont pas présents (double verrou côté appelant).
import type { AgentResult } from "../agent/agent-contract.js";
import type { AgentId } from "./brain-registry.js";

/** Un membre du vote : produit un AgentResult (déjà dispatché). Ne doit pas lever
 *  (les échecs remontent en AgentResult dégradé — comme dispatch). */
export type EnsembleMember = () => Promise<AgentResult>;

export interface EnsembleOptions {
  /** "majority" : vote sur une CLÉ catégorielle (keyFn) ; "judge" : un arbitre final tranche. */
  aggregator: "majority" | "judge";
  /** (majority) Extrait la clé de vote d'un résultat (ex. un statut, un bucket).
   *  Retourne null → ce résultat ne vote pas. Défaut : le `status`. */
  keyFn?: (r: AgentResult) => string | null;
  /** (majority) Minimum de voix concordantes pour trancher. Défaut : majorité
   *  simple des membres AYANT voté (floor(valides/2)+1). */
  minAgree?: number;
  /** (judge) Arbitre final : reçoit les avis VALIDES (anonymisés par l'appelant),
   *  rend le verdict. Obligatoire en mode "judge". */
  judge?: (valides: AgentResult[]) => Promise<AgentResult>;
}

/** Un résultat OK et exploitable (pas un dégradé timeout/error). */
function estValide(r: AgentResult): boolean {
  return r.status === "ok" || r.status === "partial";
}

/**
 * Délibère : lance tous les membres EN PARALLÈLE (un échec n'arrête pas les
 * autres — chaque membre rend un AgentResult, même dégradé), puis agrège.
 * Ne lève jamais. `agentId` sert seulement à étiqueter un éventuel dégradé.
 */
export async function deliberate(
  agentId: AgentId,
  members: EnsembleMember[],
  opts: EnsembleOptions,
): Promise<AgentResult> {
  const started = Date.now();
  if (!members.length) {
    return { status: "error", agent: agentId, summary: "ensemble vide", data: {}, confidence: 0, durationMs: 0 };
  }
  // Un membre qui lèverait malgré tout → dégradé (robustesse ; dispatch ne lève
  // pas, mais on ne fait pas confiance aveugle à l'injection).
  const results = await Promise.all(
    members.map(async (m): Promise<AgentResult> => {
      try {
        return await m();
      } catch (e) {
        return { status: "error", agent: agentId, summary: `membre KO : ${(e as Error).message}`.slice(0, 120), data: {}, confidence: 0, durationMs: 0 };
      }
    }),
  );
  const valides = results.filter(estValide);

  if (opts.aggregator === "judge") {
    if (valides.length < 2 || !opts.judge) {
      // Pas assez d'avis pour un arbitrage utile → dégradé (l'appelant garde son repli).
      return { status: "error", agent: agentId, summary: `ensemble (judge) : ${valides.length} avis valide(s), arbitrage impossible`, data: {}, confidence: 0, durationMs: Date.now() - started };
    }
    try {
      return await opts.judge(valides);
    } catch (e) {
      return { status: "error", agent: agentId, summary: `arbitre KO : ${(e as Error).message}`.slice(0, 120), data: {}, confidence: 0, durationMs: Date.now() - started };
    }
  }

  // ── majority ──────────────────────────────────────────────────────────────
  const keyFn = opts.keyFn ?? ((r: AgentResult) => r.status);
  const votes = new Map<string, AgentResult[]>();
  for (const r of valides) {
    const k = keyFn(r);
    if (k == null) continue;
    (votes.get(k) ?? votes.set(k, []).get(k)!).push(r);
  }
  const voteCount = [...votes.values()].reduce((n, arr) => n + arr.length, 0);
  const minAgree = opts.minAgree ?? Math.floor(voteCount / 2) + 1;
  // Clé gagnante = la plus votée.
  let best: { key: string; arr: AgentResult[] } | null = null;
  for (const [key, arr] of votes) {
    if (!best || arr.length > best.arr.length) best = { key, arr };
  }
  if (!best || best.arr.length < minAgree) {
    // Pas de consensus suffisant → dégradé (l'appelant garde son repli habituel).
    return {
      status: "error",
      agent: agentId,
      summary: `ensemble (majorité) : pas de consensus (meilleur ${best?.arr.length ?? 0}/${voteCount}, requis ${minAgree})`,
      data: { avis: valides.map((r) => r.summary.slice(0, 80)) },
      confidence: 0,
      durationMs: Date.now() - started,
    };
  }
  // Consensus : on renvoie un représentant de la clé gagnante, annoté.
  const rep = best.arr[0];
  return {
    ...rep,
    durationMs: Date.now() - started,
    data: { ...rep.data, ensemble: { aggregator: "majority", key: best.key, agree: best.arr.length, total: voteCount } },
  };
}
