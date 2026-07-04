// A1.3 — Détecteur de contradiction/dérive mémoire (fondation.md, Visage 1 du
// Gardien : « Détecteur dérive mémoire → magasin saturé/contradictoire = gèle
// l'écriture »). Ici on n'implémente QUE la détection + consignation : la
// décision (fusionner/amender/garder) reste humaine, cohérent avec
// computeAblationVerdict (axioms.ts) qui RECOMMANDE sans jamais supprimer.
//
// Principe : à chaque nouvel axiome appris, on le compare par similarité
// cosinus (embeddings nomic locaux, cf. notes-rag.ts) aux axiomes existants.
// Un score élevé signale soit un DOUBLON (même règle reformulée), soit une
// CONTRADICTION (même sujet, conclusion opposée) — on ne tranche pas ici, le
// texte seul ne suffit pas à distinguer les deux de façon fiable ; c'est au
// reviewer nocturne (ou à Raf) de lire les deux lignes et d'arbitrer.
//
// Fail-open TOTAL, comme le reste du magasin d'axiomes (cf. appendAxiom) :
// - embedding indisponible (Ollama down, modèle absent) → safeEmbed retourne
//   null → aucune détection, l'axiome est déjà appendé, rien ne casse.
// - toute autre erreur (lecture fichier, écriture rapport) → avalée.
// Ce module ne DOIT jamais faire échouer ou ralentir l'apprentissage d'un
// axiome — il est un observateur best-effort, pas une porte.
import path from "node:path";
import fs from "node:fs";
import { atomicAppendFileSync } from "./safe-io.js";

/** Fichier où sont consignées les paires suspectes, pour arbitrage nocturne.
 *  Append-only, jamais injecté dans un prompt (à la différence de .axioms.md). */
export const ATOMS_CONFLICTS_FILE_NAME = ".axioms-conflicts.md";

/** Une paire suspecte : le nouvel axiome vs. un axiome existant proche. */
export interface ConflictPair {
  nouveau: string;
  existant: string;
  score: number;
}

/** Nombre maximal de paires consignées par détection (anti-saturation du
 *  rapport — un nouvel axiome ne devrait de toute façon ressembler qu'à une
 *  poignée d'existants s'il y a vraiment un souci). */
const MAX_PAIRS = 5;

/** Borne du nombre d'axiomes existants comparés (coût des embeddings) — on ne
 *  compare qu'aux N derniers, les plus susceptibles d'être encore "chauds"
 *  (un axiome très ancien, déjà revu plusieurs fois, est moins à risque). */
export const DRIFT_COMPARE_WINDOW = 200;

/** Seuil de similarité au-dessus duquel une paire est jugée suspecte. Choisi
 *  haut (0.80) : on veut peu de faux positifs — mieux vaut rater une dérive
 *  subtile que noyer le reviewer sous des paires sans rapport. */
export const DRIFT_THRESHOLD = 0.8;

/**
 * Fonction PURE : compare le nouvel axiome (déjà embarqué) à une liste
 * d'axiomes existants (chacun avec sa ligne + son embedding), retourne les
 * paires dont le cosinus dépasse `seuil`, triées par score décroissant,
 * plafonnées à 5. Ne tranche PAS doublon vs contradiction — les deux se
 * ressemblent en embedding (même sujet), seul un humain distingue avec
 * certitude "même règle reformulée" de "règle opposée sur le même sujet".
 */
export function detectConflicts(
  nouvelAxiome: string,
  existants: Array<{ ligne: string; embedding: number[] }>,
  nouvelEmbedding: number[],
  seuil: number = DRIFT_THRESHOLD,
): ConflictPair[] {
  const pairs: ConflictPair[] = [];
  for (const ex of existants) {
    if (!ex.ligne || !Array.isArray(ex.embedding) || ex.embedding.length === 0) continue;
    if (ex.ligne.trim() === nouvelAxiome.trim()) continue; // identique mot pour mot : pas une "dérive", un doublon trivial hors scope ici
    const score = cosine(nouvelEmbedding, ex.embedding);
    if (score >= seuil) pairs.push({ nouveau: nouvelAxiome, existant: ex.ligne, score });
  }
  return pairs.sort((a, b) => b.score - a.score).slice(0, MAX_PAIRS);
}

/** Similarité cosinus locale (évite de dépendre de kernel-blackboard-store.ts,
 *  hors-scope de modification — même formule, testée indépendamment). Exportée
 *  pour être RÉUTILISÉE par axioms-validation.ts (dédup avant promotion) : une
 *  seule implémentation cosinus pour tout le magasin d'axiomes. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Formate un rapport markdown horodaté pour `.axioms-conflicts.md`, lisible
 * par le reviewer nocturne (ou par Raf) : chaque paire liste le nouvel
 * axiome, l'existant qui lui ressemble, le score, et rappelle explicitement
 * que la décision (fusionner / amender / garder) reste à arbitrer — ce
 * module ne supprime et ne modifie jamais rien de lui-même.
 */
export function formatConflictReport(pairs: ConflictPair[], date: Date = new Date()): string {
  if (pairs.length === 0) return "";
  const lines: string[] = [];
  lines.push(`\n## Dérive détectée — ${date.toISOString()}`);
  lines.push(`${pairs.length} paire(s) suspecte(s) (similarité ≥ ${DRIFT_THRESHOLD}) — à arbitrer par le reviewer : fusionner / amender / garder. Aucune suppression automatique.`);
  for (const p of pairs) {
    lines.push("");
    lines.push(`- score ${p.score.toFixed(3)}`);
    lines.push(`  - nouveau  : ${p.nouveau}`);
    lines.push(`  - existant : ${p.existant}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Deps injectables — permet des tests déterministes sans Ollama ni disque réel. */
export interface DriftDeps {
  /** Best-effort : null si l'embedding est indisponible (Ollama down…). */
  embed: (text: string) => Promise<number[] | null>;
  /** Charge les lignes d'axiomes existantes (non vides, non-commentaires) du
   *  fichier de registre. Ne lève jamais (fichier absent → []). */
  loadExisting: (workspaceDir: string, file: string) => Array<{ ligne: string }>;
}

/** Une ligne de commentaire markdown (titres "# …", séparateurs) — à exclure
 *  du parcours des axiomes existants : ce ne sont pas des règles à comparer. */
function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.length === 0 || t.startsWith("#");
}

/** Implémentation réelle de `loadExisting` : lit le fichier d'axiomes du
 *  workspace et retourne ses lignes non vides / non-commentaires. Fail-open
 *  (fichier absent ou illisible → []). Exportée pour le câblage dans axioms.ts. */
export function loadExistingAxiomLines(workspaceDir: string, file: string): Array<{ ligne: string }> {
  try {
    const raw = fs.readFileSync(path.join(workspaceDir, file), "utf8");
    return raw
      .split(/\r?\n/)
      .filter((l) => !isCommentLine(l))
      .map((ligne) => ({ ligne: ligne.trim() }));
  } catch {
    return [];
  }
}

/**
 * Point d'entrée best-effort appelé après l'append d'un nouvel axiome (cf.
 * axioms.ts → appendAxiom). Embarque le nouvel axiome et (au plus) les
 * `DRIFT_COMPARE_WINDOW` derniers axiomes existants, détecte les paires
 * suspectes, et si au moins une paire dépasse le seuil, APPEND un rapport
 * dans `<workspaceDir>/.axioms-conflicts.md`.
 *
 * Fail-open TOTAL : n'importe quelle étape qui échoue (embedding indisponible,
 * lecture/écriture disque) laisse simplement l'axiome appris sans rapport de
 * dérive — jamais d'exception qui remonte à l'appelant, jamais de blocage.
 * Ne supprime et ne modifie JAMAIS un axiome existant.
 */
export async function checkAxiomDrift(
  workspaceDir: string,
  nouvelAxiome: string,
  file: string,
  deps: DriftDeps,
): Promise<void> {
  try {
    const texte = (nouvelAxiome ?? "").trim();
    if (!texte) return;
    const nouvelEmbedding = await deps.embed(texte);
    if (!nouvelEmbedding) return; // embedding indisponible → fail-open, pas de détection possible

    const existantsBruts = deps.loadExisting(workspaceDir, file);
    // Fenêtre : au plus les DRIFT_COMPARE_WINDOW derniers (les plus récents en
    // fin de fichier, cf. appendAxiom qui append en fin de registre) — borne le
    // coût des embeddings à chaque écriture.
    const fenetre = existantsBruts.slice(-DRIFT_COMPARE_WINDOW).filter((e) => e.ligne.trim() !== texte);
    if (fenetre.length === 0) return;

    const existants: Array<{ ligne: string; embedding: number[] }> = [];
    for (const e of fenetre) {
      const emb = await deps.embed(e.ligne);
      if (emb) existants.push({ ligne: e.ligne, embedding: emb });
    }
    if (existants.length === 0) return;

    const pairs = detectConflicts(texte, existants, nouvelEmbedding);
    if (pairs.length === 0) return;

    const report = formatConflictReport(pairs, new Date());
    if (!report) return;
    const conflictsFile = path.join(workspaceDir, ATOMS_CONFLICTS_FILE_NAME);
    atomicAppendFileSync(conflictsFile, report);
  } catch {
    // fail-open assumé (cf. docstring) : un détecteur KO ne casse jamais
    // l'apprentissage d'un axiome, déjà écrit sur disque par appendAxiom.
  }
}
