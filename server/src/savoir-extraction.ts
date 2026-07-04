// #177 É3 — savoir-extraction.ts : segments → claims candidats, VERBATIM vérifié.
//
// Mission (docs/plan-177-video-connaissance.md, D5/É3) : transformer les segments
// horodatés d'un transcript (produits par É1, stockés par É2) en `claims`
// candidats, via un appel LLM structuré — avec LE garde-fou du chantier : chaque
// claim porte un `extrait` verbatim, et une validation DÉTERMINISTE vérifie que
// cet extrait figure réellement dans le segment source. Un extrait introuvable =
// REJETÉ mécaniquement, jamais inséré. C'est la transposition de l'asymétrie
// #178 §1.2 : on ne garantit pas que l'énoncé est bien *interprété*, on garantit
// qu'il est *ancré* dans une phrase réellement prononcée à un timestamp réel.
//
// Patron réutilisé : eleve-content.ts (prompt + schéma + extractJsonArray +
// validateItems + une-passe-puis-retry, NE LÈVE JAMAIS). L'appel LLM `ask` est
// une dépendance INJECTÉE → testable sans réseau. Liaison aux entités connues =
// mécanique #178 É3 (resolveEntite d'É2, tolérant alias : lie au lieu de
// dupliquer). Écritures en statut `candidat` via SavoirStore (É2).
//
// Gate SAVOIR_EXTRACTION (flags.ts), défaut OFF — ce module reste pur/appelable
// sans le gate (le gate protège les SURFACES qui l'exposeront : runner É4,
// route É6). Tout contenu de transcript reste de la DONNÉE (jamais instruction).

import { extractJsonArray, validateItems } from "./eleve-content.js";
import type { SavoirStore, ClaimType, EntiteRow, SegmentRow } from "./savoir-store.js";

// ── Les 6 types contrôlés (D2, schéma `claims.type`) ─────────────────────────

export const CLAIM_TYPES: readonly ClaimType[] = [
  "technique",
  "reglage",
  "recommandation",
  "fait",
  "opinion",
  "avertissement",
] as const;

export function isClaimType(t: unknown): t is ClaimType {
  return typeof t === "string" && (CLAIM_TYPES as readonly string[]).includes(t);
}

// ── Fenêtrage des segments (D5 : ~3-5 k caractères, chevauchement d'un segment) ──

export interface WindowSegment {
  /** id DB du segment (source de vérité pour segment_id / t_start_s). */
  id: number;
  tStartS: number;
  tEndS: number;
  texte: string;
}

export interface SegmentWindow {
  segments: WindowSegment[];
}

/**
 * Regroupe des segments en fenêtres d'au plus `maxChars` caractères, avec un
 * chevauchement d'UN segment entre fenêtres consécutives (D5) : le dernier
 * segment d'une fenêtre ré-ouvre la suivante, pour qu'un claim à cheval sur une
 * frontière ne soit pas perdu. Chaque fenêtre contient au moins 1 segment (même
 * si ce segment dépasse `maxChars`). PUR.
 */
export function windowSegments(segments: WindowSegment[], maxChars = 4000): SegmentWindow[] {
  const segs = segments.filter((s) => s && typeof s.texte === "string" && s.texte.trim().length > 0);
  const windows: SegmentWindow[] = [];
  if (segs.length === 0) return windows;

  let i = 0;
  while (i < segs.length) {
    const cur: WindowSegment[] = [];
    let chars = 0;
    let j = i;
    while (j < segs.length && (cur.length === 0 || chars + segs[j].texte.length <= maxChars)) {
      cur.push(segs[j]);
      chars += segs[j].texte.length;
      j++;
    }
    windows.push({ segments: cur });
    if (j >= segs.length) break;
    // Chevauchement d'un segment : la fenêtre suivante ré-ouvre sur le dernier
    // segment de celle-ci — sauf si cela ne progresse pas (segment géant seul).
    const next = j - 1;
    i = next > i ? next : j;
  }
  return windows;
}

// ── Matching VERBATIM tolérant (casse / espaces / ponctuation / accents) ─────

/**
 * Normalise un texte pour le matching verbatim tolérant : minuscules, accents
 * retirés, ponctuation réduite à des espaces, espaces compactés. On tolère la
 * FORME (l'extracteur re-ponctue, ré-accentue, recase) mais pas le FOND :
 * l'extrait doit rester une sous-chaîne de mots réellement prononcés. PUR.
 */
export function normalizeForMatch(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritiques
    .toLowerCase()
    .replace(/[^0-9a-z\s]/g, " ") // ponctuation → espace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * LE garde-fou déterministe (D5). Cherche, parmi les segments d'une fenêtre, le
 * PREMIER dont le texte normalisé CONTIENT l'extrait normalisé. Retourne ce
 * segment (source de vérité du segment_id + t_start_s réels) ou null si aucun ne
 * le contient — auquel cas le claim est un extrait halluciné et sera rejeté.
 * Un extrait vide ou trop court (< 8 caractères normalisés) est refusé : il ne
 * prouve aucun ancrage. PUR.
 */
export function findSourceSegment(extrait: string, window: WindowSegment[]): WindowSegment | null {
  const needle = normalizeForMatch(extrait);
  if (needle.length < 8) return null;
  for (const seg of window) {
    if (normalizeForMatch(seg.texte).includes(needle)) return seg;
  }
  return null;
}

// ── Prompt d'extraction (patron eleve-content.ts, discipliné par D5) ─────────

export interface ExtractionPromptInput {
  window: WindowSegment[];
  /** Noms d'entités déjà connues du corpus (pour lier au lieu de dupliquer). */
  entitesConnues: string[];
  langue?: string;
}

/** Construit le prompt (système + utilisateur). PUR. */
export function buildExtractionPrompt(input: ExtractionPromptInput): { system: string; user: string } {
  const system =
    "Tu es un extracteur de connaissances expert. À partir d'un transcript vidéo horodaté, " +
    "tu extrais des AFFIRMATIONS (claims) autoportantes et sourcées. Règles ABSOLUES :\n" +
    "1. Chaque claim porte un `extrait` : une citation EXACTE, mot pour mot, COPIÉE du transcript " +
    "fourni ci-dessous. N'invente JAMAIS l'extrait, ne le reformule pas — copie-colle une phrase réelle. " +
    "Un claim dont l'extrait n'est pas une copie littérale du transcript sera rejeté.\n" +
    "2. `enonce` : l'affirmation reformulée pour être compréhensible SEULE (hors contexte).\n" +
    "3. `type` : EXACTEMENT l'une de ces 6 valeurs — technique | reglage | recommandation | fait | opinion | avertissement.\n" +
    "4. `sujet` : l'entité/concept normalisé du claim. Si le sujet correspond à une entité connue " +
    "(liste fournie), réutilise EXACTEMENT son nom pour éviter les doublons.\n" +
    "5. `conditions` : contexte de validité s'il existe (ex. « en basse lumière »), sinon chaîne vide.\n" +
    "6. `t_start_s` : le timestamp (en secondes) du segment d'où vient l'extrait.\n" +
    "Tu réponds UNIQUEMENT par un tableau JSON valide : pas de markdown, pas de commentaire, pas de balise de code. " +
    "Si un segment ne contient aucune affirmation extractible, n'invente rien — produis moins de claims.";

  const entites = input.entitesConnues.length
    ? `Entités déjà connues du corpus (réutilise leur nom exact si pertinent) : ${input.entitesConnues.join(", ")}.\n`
    : "";
  const lang = input.langue?.trim() ? `\nLes champs de texte libre sont rédigés en ${input.langue}.` : "";
  const transcript = input.window
    .map((s) => `[t=${s.tStartS}s] ${s.texte}`)
    .join("\n");

  const user =
    `${entites}` +
    `Transcript (segments horodatés) :\n${transcript}\n\n` +
    "Extrais les affirmations de ce transcript. CHAQUE objet a la forme : " +
    '{ "enonce": string, "sujet": string, "type": "technique|reglage|recommandation|fait|opinion|avertissement", ' +
    '"conditions": string, "t_start_s": number, "extrait": string (copie LITTÉRALE du transcript) }.' +
    `${lang}\n` +
    "Renvoie UNIQUEMENT un tableau JSON. Commence par [ et finis par ].";
  return { system, user };
}

// ── Extraction d'une vidéo → claims candidats ────────────────────────────────

export interface ExtractionDeps {
  /** Appel LLM injecté (GLM en prod, scripté en test). NE DOIT PAS lever idéalement. */
  ask: (system: string, user: string) => Promise<string>;
  /** Embedding optionnel de l'énoncé (safeEmbed en prod) — fail-open si absent/null. */
  embed?: (text: string) => Promise<number[] | null>;
}

export interface ExtractionOptions {
  /** Taille de fenêtre en caractères (défaut 4000, D5 : ~3-5 k). */
  maxChars?: number;
  /** Langue des champs libres (défaut "français"). */
  langue?: string;
}

export interface ExtractionResult {
  windows: number;
  proposed: number; // claims bien formés proposés par le LLM (avant garde verbatim)
  inserted: number; // claims candidats réellement écrits
  rejected: number; // rejetés par le garde-fou (verbatim / type / vide)
  duplicates: number; // fix L78-2 : claims ré-extraits (chevauchement de fenêtres) écartés avant insertion
  rejectedReasons: string[]; // pour la gate de décision D5 (taux de rejet)
}

/**
 * Extrait les claims candidats d'UNE vidéo déjà transcrite (ses segments sont en
 * base, É2). Pour chaque fenêtre : prompt → ask (1 passe + retry sur parse
 * cassé) → validation. Chaque claim n'entre en base QUE si son `extrait` est
 * retrouvé DÉTERMINISTIQUEMENT dans un segment de la fenêtre ; le segment
 * matché fixe le `segment_id` et le `t_start_s` RÉELS (on ne fait pas confiance
 * au timestamp annoncé par le LLM). Le `sujet` passe par resolveEntite (liaison
 * par alias, jamais de doublon). NE LÈVE JAMAIS : toute panne = fenêtre sautée.
 */
export async function extractClaimsForVideo(
  store: SavoirStore,
  videoId: number,
  deps: ExtractionDeps,
  opts: ExtractionOptions = {},
): Promise<ExtractionResult> {
  const result: ExtractionResult = { windows: 0, proposed: 0, inserted: 0, rejected: 0, duplicates: 0, rejectedReasons: [] };

  // Fix L78-2 : le fenêtrage des segments chevauche d'UN segment (D5), donc GLM
  // ré-extrait souvent la MÊME phrase dans deux fenêtres adjacentes → doublons en
  // base (32 claims mesurés, 12/13 « consensus » n'étaient qu'un locuteur qui se
  // duplique). On déduplique à l'intérieur d'un même run par (extrait+énoncé)
  // normalisés : on garde la 1ʳᵉ occurrence, on écarte les suivantes AVANT insertion.
  const seenClaims = new Set<string>();
  const dedupKey = (extrait: string, enonce: string) => `${normalizeForMatch(extrait)}␟${normalizeForMatch(enonce)}`;

  let segRows: SegmentRow[];
  try {
    segRows = store.getSegmentsByVideo(videoId);
  } catch {
    return result;
  }
  const winSegs: WindowSegment[] = segRows.map((s) => ({
    id: s.id,
    tStartS: s.t_start_s,
    tEndS: s.t_end_s,
    texte: s.texte,
  }));
  const windows = windowSegments(winSegs, opts.maxChars ?? 4000);
  result.windows = windows.length;

  let entitesConnues: string[] = [];
  try {
    entitesConnues = store.listEntites().map((e: EntiteRow) => e.nom);
  } catch {
    entitesConnues = [];
  }

  for (const win of windows) {
    const { system, user } = buildExtractionPrompt({
      window: win.segments,
      entitesConnues,
      langue: opts.langue ?? "français",
    });

    // Une passe + retry, uniquement sur parse cassé (patron eleve-content.ts).
    let items: Record<string, unknown>[] | null = null;
    for (let attempt = 0; attempt < 2 && items === null; attempt++) {
      try {
        const raw = await deps.ask(system, user);
        const arr = extractJsonArray(raw);
        items = validateItems(arr, ["enonce", "sujet", "type", "extrait"]);
      } catch {
        items = null; // JSON cassé/malformé → on retente une fois, sinon on saute
      }
    }
    if (items === null) continue; // fail-open : rien n'entre, rien ne lève

    for (const it of items) {
      result.proposed++;
      const enonce = String(it.enonce ?? "").trim();
      const sujetBrut = String(it.sujet ?? "").trim();
      const type = it.type;
      const extrait = String(it.extrait ?? "");
      const conditions = typeof it.conditions === "string" ? it.conditions.trim() : "";

      if (!enonce || !sujetBrut) {
        result.rejected++;
        result.rejectedReasons.push("champ enonce/sujet vide");
        continue;
      }
      if (!isClaimType(type)) {
        result.rejected++;
        result.rejectedReasons.push(`type invalide: ${String(type)}`);
        continue;
      }
      // ── LE garde-fou déterministe : l'extrait DOIT figurer dans un segment ──
      const src = findSourceSegment(extrait, win.segments);
      if (!src) {
        result.rejected++;
        result.rejectedReasons.push(`extrait introuvable dans le segment source: "${extrait.slice(0, 60)}"`);
        continue;
      }

      // Fix L78-2 : dédup dans le run (chevauchement de fenêtres) — écarte un claim
      // déjà extrait à l'identique (extrait+énoncé normalisés), sans le compter rejeté.
      const key = dedupKey(extrait, enonce);
      if (seenClaims.has(key)) {
        result.duplicates++;
        continue;
      }
      seenClaims.add(key);

      // Liaison d'entité (tolérant alias) : le sujet canonique évite les doublons.
      let sujet = sujetBrut;
      try {
        sujet = store.resolveEntite(sujetBrut).nom;
      } catch {
        sujet = sujetBrut; // fail-open : on garde le sujet brut si la résolution casse
      }

      let embedding: number[] | undefined;
      if (deps.embed) {
        try {
          const v = await deps.embed(enonce);
          if (Array.isArray(v) && v.length > 0) embedding = v;
        } catch {
          /* embedding best-effort */
        }
      }

      try {
        store.insertClaim({
          enonce,
          sujet,
          type,
          conditions,
          videoId,
          tStartS: src.tStartS, // timestamp RÉEL du segment matché, pas celui annoncé
          segmentId: src.id,
          extrait,
          statut: "candidat",
          embedding,
        });
        result.inserted++;
      } catch (e) {
        result.rejected++;
        result.rejectedReasons.push(`insertion échouée: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return result;
}
