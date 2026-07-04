// A1.4 (2026-07-04) — Validation MÉCANIQUE avant promotion d'un axiome en
// mémoire durable (.axioms.md, injecté à VIE dans chaque prompt).
//
// Constat de la revue globale (2026-07-03, backlog #9) : les axiomes issus de
// l'escalade nocturne + de la review entrent en mémoire dès qu'un fingerprint
// change, réinjectés à vie, SANS validation ni dédup MÉCANIQUE — seul un
// garde-fou de PROMPT (REVIEW_AXIOM_GUARDRAIL) demande au modèle de généraliser
// la méthode. Un modèle peut donc écrire un quasi-doublon (même règle, autre
// formulation) ou grossir indéfiniment la mémoire.
//
// Ce module ajoute DEUX barrières mécaniques, gatées AXIOMS_VALIDATION (défaut
// off → l'appelant garde l'append historique byte-identique) :
//   1. DÉDUP SÉMANTIQUE — le nouvel axiome est embarqué (embeddings Ollama) et
//      comparé par cosinus au registre CONFIRMÉ. Au-dessus de DRIFT_THRESHOLD
//      (le même seuil que le détecteur de dérive axioms-drift.ts), il n'est PAS
//      dupliqué : il est consigné dans .axioms-conflicts.md (même fichier que le
//      détecteur de dérive) pour arbitrage humain, jamais injecté.
//   2. QUARANTAINE AVANT PROMOTION — un axiome candidat n'est PAS injecté à vie
//      immédiatement. Il entre en quarantaine (.axioms-quarantine.json) avec un
//      compteur de confirmations. Il n'est promu dans .axioms.md qu'après avoir
//      été RE-vu PROMOTE_AFTER_DEFAULT fois (preuve de récurrence, pas un one-shot).
//
// Cohérence avec l'existant : réutilise cosine + formatConflictReport +
// ATOMS_CONFLICTS_FILE_NAME d'axioms-drift.ts, et le fichier .axioms.md +
// atomicWriteFileSync d'axioms.ts / safe-io.ts. Fonctions PURES (planPromotion,
// bestSimilarity, splitAxiomBlocks) testables sans réseau ni disque ; deps
// (embedder, horloge) INJECTÉES comme axioms-drift.ts (DriftDeps). Fail-open
// TOTAL : embeddings indisponibles → promotion directe (un axiome n'est JAMAIS
// perdu faute d'Ollama), toute autre erreur avalée.
import path from "node:path";
import fs from "node:fs";
import { atomicWriteFileSync, atomicAppendFileSync } from "./safe-io.js";
import { AXIOMS_FILE_NAME } from "./axioms.js";
import { cosine, formatConflictReport, ATOMS_CONFLICTS_FILE_NAME, DRIFT_THRESHOLD } from "./axioms-drift.js";

/** Magasin de quarantaine (JSON, JAMAIS injecté dans un prompt). Un candidat y
 *  attend d'être re-vu assez souvent pour être promu dans .axioms.md. */
export const AXIOMS_QUARANTINE_FILE_NAME = ".axioms-quarantine.json";

/** Nombre de fois qu'un même axiome (à similarité près) doit être re-vu avant
 *  d'être promu en mémoire durable. 2 = « vu une fois → quarantaine ; re-vu →
 *  promotion » : filtre les axiomes accidentels/uniques sans jamais bloquer un
 *  motif réellement récurrent. */
export const PROMOTE_AFTER_DEFAULT = 2;

/** Seuil de similarité (cosinus) au-delà duquel deux axiomes sont « les mêmes »
 *  pour la dédup ET pour le rapprochement en quarantaine. Aligné sur le seuil du
 *  détecteur de dérive (axioms-drift.ts) — une seule notion de « proximité ». */
export const SIMILARITY_THRESHOLD = DRIFT_THRESHOLD;

/** Une entrée de quarantaine : le texte du bloc-axiome + son compteur de vues. */
export interface QuarantineEntry {
  /** Texte VERBATIM du bloc-axiome candidat. */
  text: string;
  /** Nombre de fois qu'il a été proposé (à similarité près). Promu à PROMOTE_AFTER. */
  seen: number;
  /** ISO de la première proposition. */
  firstSeen: string;
  /** ISO de la dernière proposition. */
  lastSeen: string;
}

// ── Fonctions PURES ──────────────────────────────────────────────────────────

/** Découpe un texte d'axiomes en BLOCS (un par en-tête « AXIOME-… »), verbatim,
 *  trimés. Les lignes avant le premier en-tête (commentaires) sont ignorées.
 *  Même logique de découpe que parseAxioms (axioms.ts), mais autonome et pure —
 *  sert à comparer/promouvoir bloc-à-bloc plutôt qu'un glob multi-axiomes. */
export function splitAxiomBlocks(text: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length && /^\s*AXIOME-/i.test(cur[0])) {
      const joined = cur.join("\n").trim();
      if (joined) blocks.push(joined);
    }
    cur = [];
  };
  for (const line of (text ?? "").split(/\r?\n/)) {
    if (/^\s*AXIOME-/i.test(line)) flush();
    cur.push(line);
  }
  flush();
  return blocks;
}

/** PUR : renvoie l'item le PLUS similaire (cosinus max) à `cand` dans `items`,
 *  ou null si aucun item embarquable. Les embeddings vides/absents sont ignorés
 *  (fail-open, comme detectConflicts). À la différence de detectConflicts (qui
 *  écarte volontairement les correspondances mot-pour-mot pour la DÉRIVE), ici on
 *  veut aussi capter le doublon EXACT (cos = 1) → on ne filtre rien. */
export function bestSimilarity(
  cand: number[],
  items: Array<{ text: string; embedding: number[] }>,
): { index: number; score: number } | null {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || !Array.isArray(it.embedding) || it.embedding.length === 0) continue;
    const s = cosine(cand, it.embedding);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best === -1 ? null : { index: best, score: bestScore };
}

/** Entrées de la décision de promotion (tout embarqué → PUR, testable). */
export interface PromotionInputs {
  /** Bloc-axiome candidat (texte). */
  candidate: string;
  /** Embedding du candidat. */
  candidateEmbedding: number[];
  /** Registre CONFIRMÉ (déjà injecté), un bloc par entrée, embarqué. */
  confirmed: Array<{ text: string; embedding: number[] }>;
  /** Quarantaine courante, chaque entrée embarquée. */
  quarantine: Array<{ entry: QuarantineEntry; embedding: number[] }>;
  /** Seuil de similarité (défaut DRIFT_THRESHOLD). */
  threshold: number;
  /** Vues requises avant promotion (défaut PROMOTE_AFTER_DEFAULT). */
  promoteAfter: number;
  /** ISO courant (horloge injectée). */
  now: string;
}

/** Décision PURE de promotion. La quarantaine renvoyée est TOUJOURS l'état
 *  suivant à persister (inchangé pour skip-duplicate). */
export type PromotionDecision =
  | { action: "skip-duplicate"; nearest: { text: string; score: number }; quarantine: QuarantineEntry[] }
  | { action: "quarantine"; quarantine: QuarantineEntry[] }
  | { action: "promote"; text: string; quarantine: QuarantineEntry[] };

/**
 * Cœur PUR de la validation : décide, pour UN bloc-axiome candidat, s'il faut
 * l'ignorer (doublon d'un confirmé), le mettre/garder en quarantaine, ou le
 * promouvoir (assez de confirmations).
 *
 * 1. Doublon d'un CONFIRMÉ (cos ≥ seuil) → skip-duplicate, quarantaine inchangée.
 * 2. Sinon, rapprochement en QUARANTAINE (cos ≥ seuil) → incrémente son compteur ;
 *    absent → nouvelle entrée (seen=1).
 * 3. Si le compteur atteint promoteAfter → promote (retiré de la quarantaine).
 */
export function planPromotion(inp: PromotionInputs): PromotionDecision {
  const candidate = inp.candidate.trim();
  const qList = inp.quarantine.map((q) => q.entry);

  // 1. Dédup vs registre confirmé (exact OU quasi).
  const confMatch = bestSimilarity(inp.candidateEmbedding, inp.confirmed);
  if (confMatch && confMatch.score >= inp.threshold) {
    return {
      action: "skip-duplicate",
      nearest: { text: inp.confirmed[confMatch.index].text, score: confMatch.score },
      quarantine: qList,
    };
  }

  // 2. Rapprochement en quarantaine.
  const qItems = inp.quarantine.map((q) => ({ text: q.entry.text, embedding: q.embedding }));
  const qMatch = bestSimilarity(inp.candidateEmbedding, qItems);

  let next: QuarantineEntry[];
  let targetIdx: number;
  if (qMatch && qMatch.score >= inp.threshold) {
    // Déjà en quarantaine → une confirmation de plus.
    next = qList.map((e, i) => (i === qMatch.index ? { ...e, seen: e.seen + 1, lastSeen: inp.now } : e));
    targetIdx = qMatch.index;
  } else {
    // Nouveau candidat.
    next = [...qList, { text: candidate, seen: 1, firstSeen: inp.now, lastSeen: inp.now }];
    targetIdx = next.length - 1;
  }

  // 3. Assez vu → promotion (on retire l'entrée de la quarantaine).
  if (next[targetIdx].seen >= inp.promoteAfter) {
    const promotedText = next[targetIdx].text;
    return {
      action: "promote",
      text: promotedText,
      quarantine: next.filter((_, i) => i !== targetIdx),
    };
  }
  return { action: "quarantine", quarantine: next };
}

// ── E/S fail-open ────────────────────────────────────────────────────────────

/** Charge la quarantaine (JSON). Fail-open : fichier absent/illisible/corrompu → []. */
export function loadQuarantine(workspaceDir: string): QuarantineEntry[] {
  try {
    const raw = fs.readFileSync(path.join(workspaceDir, AXIOMS_QUARANTINE_FILE_NAME), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is QuarantineEntry =>
        e && typeof e.text === "string" && typeof e.seen === "number" && e.text.trim().length > 0,
    );
  } catch {
    return [];
  }
}

/** Écrit la quarantaine (atomique). Best-effort : une écriture ratée ne casse rien. */
export function writeQuarantine(workspaceDir: string, entries: QuarantineEntry[]): void {
  try {
    fs.mkdirSync(workspaceDir, { recursive: true });
    atomicWriteFileSync(
      path.join(workspaceDir, AXIOMS_QUARANTINE_FILE_NAME),
      `${JSON.stringify(entries, null, 2)}\n`,
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Append d'un bloc-axiome CONFIRMÉ dans .axioms.md. Reproduit VERBATIM l'append
 * historique de reviewToAxioms (nocturnal.ts) : `(existing ? existing\n\ntext :
 * text) + "\n"`, via atomicWriteFileSync. Utilisé par les DEUX chemins (branche
 * gate OFF = comportement byte-identique, ET promotion gate ON) → une seule
 * source de vérité pour le format du registre.
 */
export function appendConfirmedAxiom(workspaceDir: string, text: string): void {
  const axiomsPath = path.join(workspaceDir, AXIOMS_FILE_NAME);
  fs.mkdirSync(workspaceDir, { recursive: true });
  const existing = fs.existsSync(axiomsPath) ? fs.readFileSync(axiomsPath, "utf8").trim() : "";
  atomicWriteFileSync(axiomsPath, (existing ? `${existing}\n\n${text}` : text) + "\n");
}

/** Deps injectables (embedder + horloge) — tests déterministes sans Ollama. */
export interface ValidationDeps {
  /** Best-effort : null si l'embedding est indisponible (Ollama down…). */
  embed: (text: string) => Promise<number[] | null>;
  /** Horloge injectable (défaut : temps réel). */
  now?: () => Date;
}

/** Verdict d'un bloc traité (pour log/tests). */
export type BlockOutcome = "promoted" | "quarantined" | "skipped-duplicate";

/**
 * Orchestrateur IMPUR (fail-open TOTAL) appelé à la place de l'append direct
 * quand AXIOMS_VALIDATION est ON. Découpe le candidat en blocs et, pour chacun :
 * embarque, décide via planPromotion (dédup + quarantaine), applique
 * (append .axioms.md / écrit quarantaine / consigne .axioms-conflicts.md).
 *
 * Fail-open : embedding du candidat indisponible → promotion DIRECTE (append
 * historique) pour ne JAMAIS perdre un axiome faute d'Ollama ; toute autre
 * erreur est avalée. Ne lève jamais.
 */
export async function runAxiomValidation(
  workspaceDir: string,
  candidateText: string,
  deps: ValidationDeps,
): Promise<{ outcomes: BlockOutcome[] }> {
  const outcomes: BlockOutcome[] = [];
  try {
    const blocks = splitAxiomBlocks(candidateText);
    if (blocks.length === 0) return { outcomes };
    const nowFn = deps.now ?? (() => new Date());

    // Registre CONFIRMÉ embarqué une fois (blocs).
    let confirmedText = "";
    try {
      confirmedText = fs.readFileSync(path.join(workspaceDir, AXIOMS_FILE_NAME), "utf8");
    } catch {
      confirmedText = "";
    }
    const confirmed: Array<{ text: string; embedding: number[] }> = [];
    for (const b of splitAxiomBlocks(confirmedText)) {
      const e = await deps.embed(b);
      if (e) confirmed.push({ text: b, embedding: e });
    }

    // Quarantaine + cache texte→embedding.
    let quar = loadQuarantine(workspaceDir);
    const embCache = new Map<string, number[]>();
    for (const q of quar) {
      const e = await deps.embed(q.text);
      if (e) embCache.set(q.text, e);
    }

    for (const block of blocks) {
      const candEmb = await deps.embed(block);
      if (!candEmb) {
        // Fail-open : pas d'embedding → promotion directe (comportement historique).
        appendConfirmedAxiom(workspaceDir, block);
        confirmed.push({ text: block, embedding: [] }); // placeholder (len 0 → ignoré par bestSimilarity)
        outcomes.push("promoted");
        continue;
      }
      const quarantine = quar
        .map((entry) => ({ entry, embedding: embCache.get(entry.text) }))
        .filter((x): x is { entry: QuarantineEntry; embedding: number[] } => Array.isArray(x.embedding));

      const decision = planPromotion({
        candidate: block,
        candidateEmbedding: candEmb,
        confirmed,
        quarantine,
        threshold: DRIFT_THRESHOLD,
        promoteAfter: PROMOTE_AFTER_DEFAULT,
        now: nowFn().toISOString(),
      });

      if (decision.action === "skip-duplicate") {
        const report = formatConflictReport(
          [{ nouveau: block, existant: decision.nearest.text, score: decision.nearest.score }],
          nowFn(),
        );
        if (report) atomicAppendFileSync(path.join(workspaceDir, ATOMS_CONFLICTS_FILE_NAME), report);
        quar = decision.quarantine;
        outcomes.push("skipped-duplicate");
      } else if (decision.action === "promote") {
        appendConfirmedAxiom(workspaceDir, decision.text);
        confirmed.push({ text: decision.text, embedding: candEmb });
        embCache.delete(decision.text);
        quar = decision.quarantine;
        outcomes.push("promoted");
      } else {
        embCache.set(block, candEmb); // le nouveau/maj candidat garde son embedding pour les blocs suivants
        quar = decision.quarantine;
        outcomes.push("quarantined");
      }
    }
    writeQuarantine(workspaceDir, quar);
  } catch {
    // fail-open TOTAL : une validation KO ne casse jamais l'apprentissage.
  }
  return { outcomes };
}
