// (A1.2 / B1.3, 2026-07-03) Rappel sémantique de la MÉMOIRE DANS la boucle.
//
// Le plus gros levier « harnais dernière génération » : jusqu'ici, le Blackboard
// (palettes/artefacts appris cross-projet) EXISTAIT mais n'était JAMAIS consulté
// pendant que l'Élève raisonne. Ce module fait deux choses, gaté ELEVE_MEMOIRE :
//   1. Injection PROACTIVE : avant la boucle, on embarque la tâche, on cherche les
//      souvenirs pertinents et on les ajoute au system en une section BORNÉE.
//   2. Outil `memoire_rappel` : le modèle peut interroger sa mémoire EN COURS de
//      route (« ai-je déjà fait quelque chose de proche ? »).
//
// Deps INJECTÉES (embed + search) → 100 % testable sans réseau ni Blackboard réel.
// Fail-open partout : la mémoire est un CONFORT, jamais un point de panne — si
// l'embedding échoue (Ollama absent) ou la recherche lève, on rend "" / [].
import { z } from "zod";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";
import type { SearchHit } from "./kernel-blackboard-store.js";

/** Dépendances injectables : embarquer un texte (nomic, null si indispo) + chercher. */
export interface MemoireDeps {
  embed: (text: string) => Promise<number[] | null>;
  /** Recherche sémantique dans le Blackboard (un ou plusieurs scopes déjà fixés
   *  par le câblage réel). Renvoie des hits {key, score, value}. Ne doit pas lever. */
  search: (queryEmbedding: number[], k: number) => SearchHit[] | Promise<SearchHit[]>;
}

/** Un souvenir prêt à afficher : sa clé, sa pertinence, un résumé COURT lisible. */
export interface Souvenir {
  key: string;
  score: number;
  resume: string;
}

/** Cap DUR de la section (comme les axiomes) — la mémoire ne doit jamais SATURER
 *  le prompt qu'elle est censée aider. */
export const MEMOIRE_SECTION_MAX_CHARS = 800;
/** Score minimal pour retenir un souvenir (en dessous = bruit, on jette). */
export const MEMOIRE_MIN_SCORE = 0.55;

/** Résume défensivement la valeur d'un artefact en une ligne courte (on ne sait
 *  pas son shape exact — palette, composant, procédure… — on extrait ce qui aide). */
export function resumeValeur(key: string, value: unknown): string {
  if (value == null) return key;
  if (typeof value === "string") return value.slice(0, 120);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const label = (v.label ?? v.name ?? v.title ?? v.titre) as string | undefined;
    const colors = Array.isArray(v.colors) ? (v.colors as unknown[]).slice(0, 5).join(" ") : "";
    const tags = Array.isArray(v.tags) ? (v.tags as unknown[]).slice(0, 4).join(", ") : "";
    const parts = [label, colors, tags].filter(Boolean);
    if (parts.length) return parts.join(" · ").slice(0, 140);
  }
  return key;
}

/** Cœur PUR : embarque `sujet`, cherche, filtre par score, renvoie les top-k
 *  souvenirs. Ne lève jamais (fail-open → [] si embed indispo ou search lève). */
export async function rappelerSouvenirs(
  sujet: string,
  deps: MemoireDeps,
  opts: { k?: number; minScore?: number } = {},
): Promise<Souvenir[]> {
  const s = (sujet ?? "").trim();
  if (!s) return [];
  const k = opts.k ?? 3;
  const minScore = opts.minScore ?? MEMOIRE_MIN_SCORE;
  try {
    const vec = await deps.embed(s);
    if (!vec || vec.length === 0) return []; // pas d'embedding → pas de rappel (repli silencieux)
    const hits = await deps.search(vec, k);
    return (hits ?? [])
      .filter((h) => h.score >= minScore)
      .map((h) => ({ key: h.key, score: h.score, resume: resumeValeur(h.key, h.value) }));
  } catch {
    return []; // la mémoire ne casse jamais un tour
  }
}

/** Formate les souvenirs en section injectable, BORNÉE. "" si aucun. Le libellé
 *  insiste : ce sont des INDICATIONS à vérifier, pas des vérités (le rendu réel
 *  et la demande priment toujours). */
const MEMOIRE_HEADER =
  "\n\nSOUVENIRS PERTINENTS (mémoire cross-projet — indicatifs, vérifie avant de t'en servir ; ta demande et le rendu réel priment) :\n";

export function formatSouvenirs(souvenirs: Souvenir[], maxChars: number = MEMOIRE_SECTION_MAX_CHARS): string {
  if (!souvenirs.length) return "";
  const lignes: string[] = [];
  // Budget = cap MOINS la taille RÉELLE de l'en-tête (l'ancienne marge fixe de 80
  // était plus petite que l'en-tête prudent → la section débordait le cap).
  let budget = maxChars - MEMOIRE_HEADER.length;
  for (const sv of souvenirs) {
    const ligne = `- ${sv.resume}`;
    if (ligne.length + 1 > budget) break;
    lignes.push(ligne);
    budget -= ligne.length + 1;
  }
  if (!lignes.length) return "";
  return `${MEMOIRE_HEADER}${lignes.join("\n")}`;
}

/** Section prête à ajouter au system prompt avant la boucle. "" si rien/indispo. */
export async function memoireSection(sujet: string, deps: MemoireDeps, opts?: { k?: number }): Promise<string> {
  const souvenirs = await rappelerSouvenirs(sujet, deps, opts);
  return formatSouvenirs(souvenirs);
}

/** Construit l'outil `memoire_rappel` (le modèle interroge sa mémoire en cours de
 *  boucle). Renvoyé en tableau pour l'enregistrer dans le registre d'action. */
export function buildMemoireTool(deps: MemoireDeps): KernelTool[] {
  const tool: KernelTool = {
    name: "memoire_rappel",
    description:
      "Interroge ta MÉMOIRE cross-projet (palettes, composants, procédures déjà appris) sur un sujet. " +
      "Utile pour réutiliser plutôt que réinventer. Donne un `sujet` en quelques mots ; tu reçois les " +
      "souvenirs les plus proches (indicatifs — vérifie avant de t'en servir).",
    inputSchema: {
      sujet: z.string().describe("Ce que tu cherches en mémoire (ex. « palette sombre premium », « barre de recherche »)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const sujet = String(args.sujet ?? "").trim();
      if (!sujet) return { text: "Précise le `sujet` à retrouver en mémoire.", isError: true };
      const souvenirs = await rappelerSouvenirs(sujet, deps, { k: 5 });
      if (!souvenirs.length) {
        return { text: `Aucun souvenir pertinent pour « ${sujet} ». Continue sans — tu crées du neuf.` };
      }
      const lignes = souvenirs.map((s) => `- (${s.score.toFixed(2)}) ${s.resume}`);
      return { text: `Souvenirs pour « ${sujet} » :\n${lignes.join("\n")}\n(Indicatifs — vérifie avant de réutiliser.)` };
    },
  };
  return [tool];
}
