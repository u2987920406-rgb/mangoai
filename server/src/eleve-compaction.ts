// Compaction de contexte pour l'Élève (2026-07-13) — demande de Raf : la même IDÉE
// que le `/compact` de Claude (un cerveau relit l'historique et écrit un résumé
// structuré, plutôt que de tronquer bêtement), mais SANS la mécanique de session du
// SDK Claude (que l'Élève, stateless, n'a pas) — et avec l'ÉLÈVE LUI-MÊME comme
// résumeur, pas Haiku (souveraineté : $0, pas de dépendance cloud pour ça non plus).
//
// Avant ce module, la fenêtre de contexte du Discuter/Accueil était une simple
// fenêtre glissante de 12 tours FIXE (loadHistory(dir).slice(-12)) — ni consciente
// de la taille réelle, ni intelligente (les vieux tours disparaissent purement et
// simplement, aucune trace des décisions qu'ils portaient).
//
// Design : le fichier de DISPLAY (.chat-history.json, history.ts) reste INTACT —
// Raf doit toujours voir sa conversation complète telle quelle en rouvrant le
// projet. Le résumé vit dans un fichier SÉPARÉ (.eleve-context-summary.json) qui ne
// sert QU'À construire ce qu'on envoie au modèle — exactement comme le /compact de
// Claude ne touche jamais l'affichage, seulement la session interne du SDK.
import path from "node:path";
import fs from "node:fs";
import { atomicWriteFileSync } from "./safe-io.js";
import { estimateTokens, resolveContextWindow } from "./tokenizer.js";

/** Entrée conversationnelle minimale — sous-ensemble de ChatEntry (history.ts),
 *  mais découplé du disque : l'appelant fournit ses propres entrées (disque pour
 *  l'Atelier via loadHistory, tableau client pour l'Accueil qui n'a pas d'historique
 *  fichier), `ts` sert seulement à ORDONNER/comparer (chaîne triable, pas forcément
 *  une vraie date ISO). */
export interface CompactableEntry {
  role: "user" | "agent";
  text: string;
  ts: string;
}

export const SUMMARY_FILE_NAME = ".eleve-context-summary.json";

// Même seuil de déclenchement que compaction.ts (COMPACT_THRESHOLD, cohérence Claude/Élève).
const THRESHOLD = Number(process.env.COMPACT_THRESHOLD ?? 0.7);
// Derniers tours JAMAIS résumés (protégés), même patron que KEEP_RECENT (eleve-runtime.ts).
const KEEP_RECENT = 6;

interface SummaryCache {
  /** Horodatage (ts) de la dernière entrée déjà pliée dans ce résumé. */
  upToTs: string;
  summary: string;
}

const COMPACT_SYSTEM =
  "Tu es un compresseur de contexte conversationnel. On te donne un historique de discussion " +
  "(parfois déjà partiellement résumé) — réécris-le en un résumé DENSE et STRUCTURÉ qui préserve : " +
  "le sujet/la demande en cours, les décisions prises et préférences exprimées, les faits précis " +
  "(noms, chiffres, fichiers, projets mentionnés), les questions restées sans réponse. Compresse " +
  "agressivement le reste (bavardage, détails déjà traités, contenu déjà résumé une fois). " +
  "Réponds UNIQUEMENT avec le résumé, en français, sans préambule ni méta-commentaire.";

function summaryFile(dir: string): string {
  return path.join(dir, SUMMARY_FILE_NAME);
}

function readSummary(dir: string): SummaryCache | null {
  try {
    const raw = JSON.parse(fs.readFileSync(summaryFile(dir), "utf8"));
    if (raw && typeof raw.upToTs === "string" && typeof raw.summary === "string") return raw;
    return null;
  } catch {
    return null;
  }
}

function writeSummary(dir: string, cache: SummaryCache): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    atomicWriteFileSync(summaryFile(dir), JSON.stringify(cache, null, 2));
  } catch {
    // Cache best-effort : un échec d'écriture ne doit jamais casser le tour.
  }
}

function formatEntry(e: CompactableEntry): string {
  return `${e.role === "user" ? "Humain" : "MangoOS"} : ${e.text}`;
}

/** Cerveau injectable (tests sans réseau) — même contrat que chatEleve. */
export type CompactAsk = (system: string, user: string) => Promise<string>;

/**
 * Construit le contexte conversationnel à donner au modèle pour ce tour, en
 * compactant AUTOMATIQUEMENT quand c'est nécessaire (au-delà de THRESHOLD % de la
 * fenêtre réelle). Ne lève JAMAIS : un échec de compaction retombe sur la fenêtre
 * glissante brute (comportement d'avant ce chantier), jamais un tour cassé.
 */
export async function buildEleveContext(
  dir: string,
  entries: CompactableEntry[],
  ask: CompactAsk,
  window = resolveContextWindow("ollama"),
): Promise<string> {
  if (entries.length === 0) return "";

  const cache = readSummary(dir);
  const cachedSummary = cache?.summary ?? "";
  const newEntries = cache ? entries.filter((e) => e.ts > cache.upToTs) : entries;

  // Rien de nouveau depuis le dernier résumé : renvoie tel quel (cas fréquent, $0).
  if (cache && newEntries.length === 0) return cachedSummary;

  const recentRaw = newEntries.slice(-KEEP_RECENT);
  const toFold = cache ? newEntries.slice(0, -KEEP_RECENT || undefined) : newEntries.slice(0, Math.max(0, newEntries.length - KEEP_RECENT));
  const recentText = recentRaw.map(formatEntry).join("\n");
  const candidateFull = [cachedSummary, ...toFold.map(formatEntry), recentText].filter(Boolean).join("\n");

  const tokens = estimateTokens(candidateFull).count;
  if (tokens < window * THRESHOLD || toFold.length === 0) {
    // Sous le seuil (ou rien à plier de plus) : pas de compaction ce tour-ci.
    return candidateFull;
  }

  // Au-delà du seuil : demande à l'ÉLÈVE LUI-MÊME de plier [résumé précédent + vieux
  // tours nouveaux] en un résumé mis à jour, en gardant les derniers tours INTACTS.
  const toSummarize = [cachedSummary, ...toFold.map(formatEntry)].filter(Boolean).join("\n");
  try {
    const newSummary = (await ask(COMPACT_SYSTEM, toSummarize)).trim();
    if (!newSummary) return candidateFull; // repli honnête si l'Élève répond vide
    const lastFolded = toFold[toFold.length - 1]?.ts ?? cache?.upToTs ?? "";
    if (lastFolded) writeSummary(dir, { upToTs: lastFolded, summary: newSummary });
    return [newSummary, recentText].filter(Boolean).join("\n");
  } catch {
    // La compaction elle-même a échoué (réseau/modèle) : on continue avec la
    // fenêtre brute plutôt que de casser le tour — même discipline que compaction.ts.
    return candidateFull;
  }
}
