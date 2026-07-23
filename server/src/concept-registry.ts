// Boucle de vérification contextuelle — Étape 1 (2026-07-08). Décalque de deux
// patrons déjà éprouvés dans ce repo (axiome #1 : chercher le rail avant d'en
// poser un neuf) :
//   - `kernel-reuse.ts` pour le CHEMIN RAPIDE (embedding + recherche cosinus
//     dans le Blackboard, repli mots-clés déterministe si l'embedding échoue) ;
//   - `self-evolution.ts` (open-gaps.json) pour le CHEMIN LENT (une définition
//     candidate jamais vue devient une « lacune de sens » — signature de dédup,
//     compteur de hits, cycle proposed → validated/dismissed — RIEN n'entre
//     dans l'index rapide sans validation humaine explicite).
//
// Incident déclencheur : un gabarit "formation" réutilisé tel quel sans jamais
// vérifier qu'il correspondait au sens réel du mot pour Raf. Ce module ne JUGE
// rien lui-même (voir verificateur-contexte.ts) — il fournit la MÉMOIRE : la
// définition validée d'un concept, ou le mécanisme pour en proposer une neuve.
import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync, dataDir } from "./safe-io.js";
import { logValidationDrop } from "./integrity-log.js";
import { getBlackboard, type Blackboard } from "./kernel/kernel-blackboard.js";
import { embedOllama } from "./ollama.js";
import { gapSignature } from "./self/self-evolution.js";

export const CONCEPT_SCOPE = "concept:valide";

export type Embed = (text: string) => Promise<number[]>;

/** Embedder par défaut : Ollama, [] si indisponible (déclenche le repli mots-clés). */
const defaultEmbed: Embed = async (t) => {
  try {
    return await embedOllama(t);
  } catch {
    return [];
  }
};

/** Une définition de concept VALIDÉE PAR UN HUMAIN — la seule chose qui entre
 *  dans le chemin rapide. Jamais écrite directement : passe TOUJOURS par
 *  `validateConceptGap`. */
export interface ConceptEntry {
  mot: string;
  definitionValidee: string;
  /** Dans quel type de tâche/contexte cette définition s'applique (ex. "formation
   *  digitale pour apprendre une compétence" ≠ "formation politique/géologique"). */
  contexteDeValidite: string;
  exemplesPositifs: string[];
  exemplesNegatifs: string[];
  source: "web" | "raf";
  /** Renforcée/dégradée par concept-consolidation.ts selon les issues réelles. */
  confiance: number;
  hits: number;
  createdAt: string;
  updatedAt: string;
}

// ── Repli mots-clés (déterministe, sans réseau) — même mécanique que kernel-reuse.ts ──
function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-zàâäéèêëîïôöùûüç0-9]+/g) ?? []).filter((t) => t.length >= 3);
}

function conceptText(c: ConceptEntry): string {
  return `${c.mot}. ${c.definitionValidee}. ${c.contexteDeValidite}`;
}

/** Dépose (ou met à jour) un concept validé dans le Blackboard avec son embedding.
 *  N'est appelé QUE par `validateConceptGap` — jamais directement depuis le
 *  chemin de vérification. */
async function indexConcept(entry: ConceptEntry, bb: Blackboard, embed: Embed): Promise<void> {
  const emb = await embed(conceptText(entry));
  bb.put(CONCEPT_SCOPE, entry.mot, entry, emb.length ? emb : undefined);
}

export interface ConceptSearchResult {
  entry: ConceptEntry;
  /** true si trouvé par similarité sémantique (embedding), false si par repli mots-clés. */
  viaEmbedding: boolean;
}

/**
 * CHEMIN RAPIDE — cherche une définition déjà validée pour ce mot, dans CE
 * contexte de tâche. Ne lève jamais. `null` = pas de définition connue (le
 * chemin lent doit prendre le relais). Le seuil de similarité est volontairement
 * strict (0.55 par défaut) : un faux positif ici fait sauter la vérification
 * contextuelle plus loin — mieux vaut un faux miss (chemin lent, coûte des
 * tokens) qu'un faux hit (silencieux, coûte un incident comme "formation").
 */
export async function searchConcept(
  mot: string,
  contexteDeTache: string,
  opts: { bb?: Blackboard; embed?: Embed; seuil?: number } = {},
): Promise<ConceptSearchResult | null> {
  const bb = opts.bb ?? getBlackboard();
  const embed = opts.embed ?? defaultEmbed;
  const seuil = opts.seuil ?? 0.55;

  // Recherche exacte d'abord (le mot lui-même est la clé) — évite l'embedding
  // quand c'est inutile.
  const exact = bb.get<ConceptEntry>(CONCEPT_SCOPE, mot.toLowerCase().trim());
  if (exact) return { entry: exact, viaEmbedding: false };

  try {
    const query = `${mot}. ${contexteDeTache}`;
    const qEmb = await embed(query);
    if (qEmb.length > 0) {
      const hits = bb.search(CONCEPT_SCOPE, qEmb, 3);
      const best = hits[0];
      if (best && best.score >= seuil) {
        return { entry: best.value as ConceptEntry, viaEmbedding: true };
      }
      // Embedding disponible mais rien d'assez proche : un repli mots-clés ne
      // ferait qu'ajouter du bruit sémantique déjà écarté — s'arrête ici.
      return null;
    }
  } catch {
    // l'embedding a échoué (Ollama indisponible) — repli mots-clés ci-dessous,
    // même mécanique que kernel-reuse.ts : ne jamais dépendre du réseau.
  }
  return keywordFallback(mot, bb);
}

/** Repli déterministe (sans réseau) : le concept dont le mot partage le plus de
 *  tokens avec la requête, s'il y a au moins un recouvrement. `null` sinon. */
function keywordFallback(mot: string, bb: Blackboard): ConceptSearchResult | null {
  const need = new Set(tokenize(mot));
  if (need.size === 0) return null;
  let best: ConceptEntry | null = null;
  let bestScore = 0;
  for (const key of bb.keys(CONCEPT_SCOPE)) {
    const entry = bb.get<ConceptEntry>(CONCEPT_SCOPE, key);
    if (!entry) continue;
    const have = new Set(tokenize(entry.mot));
    let score = 0;
    for (const t of need) if (have.has(t)) score++;
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return best && bestScore > 0 ? { entry: best, viaEmbedding: false } : null;
}

// ── Chemin lent : « lacune de sens » (décalque exact d'open-gaps.json) ───────

export type ConceptGapStatus = "proposed" | "validated" | "dismissed";

export interface ConceptGap {
  id: string;
  sig: string;
  mot: string;
  /** Définition CANDIDATE rédigée par l'Élève après recherche web — pas encore validée. */
  definitionCandidate: string;
  contexteDeValidite: string;
  /** La tâche où le concept est apparu (contexte pour Raf lors de la validation). */
  task: string;
  status: ConceptGapStatus;
  hits: number;
  createdAt: string;
  updatedAt: string;
}

function conceptGapsFile(): string {
  return process.env.CONCEPT_GAPS_FILE ?? dataDir("concept-gaps.json");
}

function isConceptGap(x: unknown): x is ConceptGap {
  return !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string"
    && typeof (x as { sig?: unknown }).sig === "string";
}

export function loadConceptGaps(): ConceptGap[] {
  try {
    const f = conceptGapsFile();
    if (!fs.existsSync(f)) return [];
    const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
    return Array.isArray(parsed) ? parsed.filter(isConceptGap) : [];
  } catch {
    return [];
  }
}

/** (2026-07-23, #196 fault-finding Partie 1) — journalise toute entrée qui entre
 *  invalide et ressort filtrée (integrity-log.ts). Ce store n'a AUCUN plafond
 *  d'éviction visible dans le code (contrairement à open-gaps.json) — toute perte
 *  ici est potentiellement suspecte, pas une décroissance voulue. */
export function saveConceptGaps(list: ConceptGap[]): void {
  const raw = Array.isArray(list) ? list : [];
  const clean = raw.filter(isConceptGap);
  logValidationDrop("concept-gaps", raw, clean, (r) =>
    r && typeof r === "object" && typeof (r as Record<string, unknown>).id === "string" ? (r as Record<string, unknown>).id as string : null);
  const f = conceptGapsFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  atomicWriteFileSync(f, JSON.stringify(clean, null, 2));
}

/**
 * Enregistre une définition candidate (issue du chemin lent) comme lacune de
 * sens à valider. Dédup par signature (mot+contexte) — un re-blocage sur le
 * même couple incrémente `hits` au lieu d'empiler. Ne lève jamais.
 */
export function recordConceptGap(
  input: { mot: string; definitionCandidate: string; contexteDeValidite: string; task?: string },
  deps: { now?: number } = {},
): ConceptGap {
  const now = deps.now ?? Date.now();
  const iso = new Date(now).toISOString();
  const mot = input.mot.trim().toLowerCase().slice(0, 60);
  const sig = gapSignature(mot, input.contexteDeValidite);
  const list = loadConceptGaps();
  const existing = list.find((g) => g.sig === sig && g.status === "proposed");
  if (existing) {
    existing.hits++;
    existing.updatedAt = iso;
    saveConceptGaps(list);
    return existing;
  }
  const gap: ConceptGap = {
    id: `concept_${now}_${sig}`.slice(0, 90),
    sig,
    mot,
    definitionCandidate: input.definitionCandidate.trim().slice(0, 2000),
    contexteDeValidite: input.contexteDeValidite.trim().slice(0, 500),
    task: (input.task ?? "").trim().slice(0, 600),
    status: "proposed",
    hits: 1,
    createdAt: iso,
    updatedAt: iso,
  };
  list.push(gap);
  saveConceptGaps(list);
  return gap;
}

export function listOpenConceptGaps(): ConceptGap[] {
  return loadConceptGaps()
    .filter((g) => g.status === "proposed")
    .sort((a, b) => b.hits - a.hits);
}

/**
 * VALIDATION HUMAINE (Raf, depuis l'Atelier — même geste que la forge #168) :
 * promeut une lacune de sens en concept validé dans l'index rapide. C'est le
 * SEUL chemin d'écriture vers `CONCEPT_SCOPE` — rien n'y entre sans ce clic.
 * `definitionFinale`/exemples optionnels : si absents, la définition candidate
 * de la lacune est reprise telle quelle (Raf a juste validé, pas réécrit).
 */
export async function validateConceptGap(
  id: string,
  patch: { definitionFinale?: string; exemplesPositifs?: string[]; exemplesNegatifs?: string[] } = {},
  deps: { bb?: Blackboard; embed?: Embed; now?: number } = {},
): Promise<ConceptEntry | null> {
  const list = loadConceptGaps();
  const i = list.findIndex((g) => g.id === id);
  if (i < 0) return null;
  const gap = list[i]!;
  const now = deps.now ?? Date.now();
  const iso = new Date(now).toISOString();

  const entry: ConceptEntry = {
    mot: gap.mot,
    definitionValidee: (patch.definitionFinale ?? gap.definitionCandidate).trim(),
    contexteDeValidite: gap.contexteDeValidite,
    exemplesPositifs: patch.exemplesPositifs ?? [],
    exemplesNegatifs: patch.exemplesNegatifs ?? [],
    source: "raf",
    confiance: 1,
    hits: 0,
    createdAt: iso,
    updatedAt: iso,
  };

  const bb = deps.bb ?? getBlackboard();
  const embed = deps.embed ?? defaultEmbed;
  await indexConcept(entry, bb, embed);

  list[i] = { ...gap, status: "validated", updatedAt: iso };
  saveConceptGaps(list);
  return entry;
}

/**
 * Ajuste la confiance d'un concept déjà validé (appelé par concept-consolidation.ts,
 * le job nocturne). RÉ-EMBEDDE systématiquement avant d'écrire — `Blackboard.put`
 * SANS embedding efface silencieusement celui déjà stocké (piège réel du store,
 * vérifié dans `kernel-blackboard-store.ts::MemoryStore.put`), donc jamais de
 * ré-écriture partielle. `null` si le mot est inconnu. Ne lève jamais.
 */
export async function updateConceptConfidence(
  mot: string,
  delta: number,
  deps: { bb?: Blackboard; embed?: Embed; now?: number } = {},
): Promise<ConceptEntry | null> {
  const bb = deps.bb ?? getBlackboard();
  const embed = deps.embed ?? defaultEmbed;
  const key = mot.toLowerCase().trim();
  const existing = bb.get<ConceptEntry>(CONCEPT_SCOPE, key);
  if (!existing) return null;
  const now = deps.now ?? Date.now();
  const updated: ConceptEntry = {
    ...existing,
    confiance: Math.max(0, Math.min(1, existing.confiance + delta)),
    updatedAt: new Date(now).toISOString(),
  };
  // `indexConcept` écrit SANS embedding si `embed` échoue — ce qui EFFACERAIT
  // l'embedding déjà en place (Blackboard n'a pas d'accesseur pour le récupérer
  // et le préserver). On vérifie donc le succès AVANT d'écrire quoi que ce soit :
  // une panne d'embedding annule la mise à jour plutôt que de corrompre l'index.
  let emb: number[];
  try {
    emb = await embed(conceptText(updated));
  } catch {
    return null;
  }
  if (emb.length === 0) return null;
  bb.put(CONCEPT_SCOPE, key, updated, emb);
  return updated;
}

/** Rejette une lacune de sens (la définition candidate était fausse/hors-sujet). */
export function dismissConceptGap(id: string, now: number = Date.now()): ConceptGap | null {
  const list = loadConceptGaps();
  const i = list.findIndex((g) => g.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i]!, status: "dismissed", updatedAt: new Date(now).toISOString() };
  saveConceptGaps(list);
  return list[i]!;
}
