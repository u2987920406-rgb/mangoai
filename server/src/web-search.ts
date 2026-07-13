// Recherche web SOUVERAINE pour tout le pipeline MangoOS/MangoQA (2026-07-13) —
// remplace `claudeWebResearch` (server/src/llm/llm-engine.ts), qui dépendait
// intrinsèquement de l'outil natif Claude `WebSearch` (`allowedTools:['WebSearch']`,
// query() du SDK Claude Code) et ne renvoyait qu'une synthèse texte opaque.
//
// Ne réinvente RIEN : réutilise `searchWeb` (eleve-tools/eleve-web-tools.ts), déjà
// une fonction PURE, exportée, testée, sans dépendance au contrat KernelTool —
// chaîne Tavily (si clé) → Firechrome (si configuré) → DuckDuckGo → Mojeek,
// résultats STRUCTURÉS (titre/url/extrait), jamais une prose opaque.
//
// Choix délibéré : formatage DÉTERMINISTE (pas d'appel LLM de synthèse). Les 2
// appelants (lexique.ts, super-agent-builder.ts) n'ont besoin que d'un contexte
// texte exploitable, pas d'une prose parfaite — et zéro synthèse = zéro
// hallucination possible sur ce qui a été trouvé, $0, instantané.
import { searchWeb, type WebResult } from "./eleve-tools/eleve-web-tools.js";
import { sanitizeExternal } from "./agent/agent-contract.js";

export { searchWeb, type WebResult };

export interface WebResearchDeps {
  search: (query: string, n: number) => Promise<WebResult[]>;
}

const realDeps: WebResearchDeps = { search: searchWeb };

const DEFAULT_N = 5;
const MAX_N = 8;
const SNIPPET_MAX = 400; // caractères par extrait (borne le coût en tokens côté appelant)

/**
 * Recherche + synthèse texte déterministe, prête à injecter dans un prompt.
 * Ne lève JAMAIS : un échec de recherche revient en texte honnête ("indisponible"),
 * jamais une exception qui casserait l'appelant.
 */
export async function webResearch(
  query: string,
  opts: { n?: number } = {},
  deps: WebResearchDeps = realDeps,
): Promise<string> {
  const q = (query ?? "").trim();
  if (!q) return "";
  const n = Math.min(MAX_N, Math.max(1, opts.n ?? DEFAULT_N));

  let results: WebResult[];
  try {
    results = await deps.search(q, n);
  } catch (e) {
    return `(recherche web indisponible pour « ${q} » — ${(e as Error).message})`;
  }
  if (!results.length) {
    return `(aucun résultat web pour « ${q} »)`;
  }

  const lines = results.map((r, i) => {
    const extrait = sanitizeExternal((r.extrait || "(pas d'extrait)").slice(0, SNIPPET_MAX));
    return `${i + 1}. ${r.titre || r.url}\n   ${r.url}\n   ${extrait}`;
  });
  return `Résultats web pour « ${q} » :\n${lines.join("\n\n")}`;
}
