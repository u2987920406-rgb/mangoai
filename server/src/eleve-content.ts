// Cœur GÉNÉRIQUE des compétences « contenu » de l'Élève (transmises 2026-06-30).
//   1) generateContentItems — rédiger un LOT d'items structurés (JSON) validés, via un
//      cerveau LLM. Né de run-toeic-content.ts, généralisé à n'importe quel sujet/schéma.
//   2) checkImageCoherence — faire JUGER par le VL que chaque image illustre bien sa scène,
//      et (option) re-chercher une meilleure image. Né de run-toeic-coherence.ts.
// Tout est PUR / à dépendances injectées (ask, fetch, juge VL, recherche d'images) → testable
// sans réseau. Les fonctions asynchrones NE LÈVENT JAMAIS (renvoient un statut).

// ── 1. Génération d'items structurés ─────────────────────────────────────────

export interface ContentSpec {
  sujet: string;            // thème/sujet du lot (ex. « questions TOEIC Part 3 », « fiches produit café »)
  schema: string;           // description LIBRE de la forme JSON attendue d'un item
  n: number;                // nombre d'items voulus
  langue?: string;          // langue des champs textuels libres (ex. « français »)
  clesRequises?: string[];  // clés qui DOIVENT être présentes dans chaque item (validation)
}

export interface GenContentDeps {
  ask: (system: string, user: string) => Promise<string>;
}

/** Construit le prompt (système + utilisateur) pour la génération. PUR. */
export function buildContentPrompt(spec: ContentSpec): { system: string; user: string } {
  const langue = spec.langue?.trim();
  const system =
    "Tu es un rédacteur de contenu structuré expert. Tu produis des données réalistes, " +
    "exactes et cohérentes. Tu réponds UNIQUEMENT par un tableau JSON valide : pas de markdown, " +
    "pas de commentaire, pas de balise de code. Chaque élément est un objet.";
  const keys = spec.clesRequises?.length
    ? `\nChaque objet DOIT contenir au moins ces clés : ${spec.clesRequises.join(", ")}.`
    : "";
  const lang = langue ? `\nLes champs de texte libre doivent être rédigés en ${langue}.` : "";
  const user =
    `Rédige ${spec.n} éléments sur le sujet : ${spec.sujet}.\n` +
    `Forme attendue de CHAQUE élément (schéma) : ${spec.schema}.${keys}${lang}\n` +
    `Renvoie UNIQUEMENT un tableau JSON de ${spec.n} objets. Commence par [ et finis par ].`;
  return { system, user };
}

/** Extrait le premier tableau JSON équilibré d'un texte (tolère fences/texte autour). PUR. Lève si absent. */
export function extractJsonArray(text: string): unknown[] {
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("[");
  if (start < 0) throw new Error("aucun tableau JSON trouvé");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1)) as unknown[];
    }
  }
  throw new Error("tableau JSON non équilibré");
}

/** Garde les items qui sont des objets non vides et portent toutes les clés requises. PUR. */
export function validateItems(items: unknown[], clesRequises?: string[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object" || Array.isArray(it)) continue;
    const obj = it as Record<string, unknown>;
    if (Object.keys(obj).length === 0) continue;
    if (clesRequises?.length && !clesRequises.every((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== "")) continue;
    out.push(obj);
  }
  return out;
}

export interface GenContentResult {
  ok: boolean;
  items: Record<string, unknown>[];
  error?: string;
}

/** Génère un lot d'items validés. Une passe + un retry. Ne lève JAMAIS. */
export async function generateContentItems(spec: ContentSpec, deps: GenContentDeps): Promise<GenContentResult> {
  if (!spec.sujet?.trim() || !spec.schema?.trim()) {
    return { ok: false, items: [], error: "Précise un `sujet` et un `schema` (forme des items)." };
  }
  const n = Math.max(1, Math.min(50, Math.round(spec.n || 0) || 1));
  const { system, user } = buildContentPrompt({ ...spec, n });
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await deps.ask(system, user);
      const arr = extractJsonArray(raw);
      const valid = validateItems(arr, spec.clesRequises);
      if (valid.length >= Math.max(1, Math.ceil(n * 0.6))) {
        return { ok: true, items: valid };
      }
      lastErr = `seulement ${valid.length}/${arr.length} items valides`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, items: [], error: `génération insuffisante (${lastErr})` };
}

// ── 2. Cohérence image ↔ texte (juge VL) ─────────────────────────────────────

export interface ImgItem {
  [key: string]: unknown;
}

export interface ImgCheckOptions {
  champImage: string;  // clé portant l'URL de l'image (ex. "image")
  champScene: string;  // clé portant la description que l'image doit illustrer (ex. "scene")
  corriger: boolean;   // re-chercher une meilleure image en cas d'incohérence
}

export interface ImgCheckDeps {
  toBase64: (url: string) => Promise<string | null>;           // télécharge l'image → base64
  judge: (b64: string, scene: string) => Promise<boolean | null>; // VL : l'image illustre-t-elle la scène ? (null = indécis)
  search: (query: string, n: number) => Promise<{ url: string }[]>; // recherche d'images de repli (Pexels)
}

export interface ImgCheckReport {
  checked: number;
  ok: number;
  fixed: number;
  flagged: number;
  flags: string[];      // descriptions des items encore incohérents
  items: ImgItem[];     // items (image éventuellement remplacée si corriger)
}

/** Juge chaque item portant une image : conserve, remplace, ou signale. Ne lève JAMAIS. */
export async function checkImageCoherence(
  items: ImgItem[],
  opts: ImgCheckOptions,
  deps: ImgCheckDeps,
): Promise<ImgCheckReport> {
  const report: ImgCheckReport = { checked: 0, ok: 0, fixed: 0, flagged: 0, flags: [], items };
  for (const it of items) {
    const url = it[opts.champImage];
    const scene = it[opts.champScene];
    if (typeof url !== "string" || !url || typeof scene !== "string" || !scene) continue;
    report.checked++;
    let b64: string | null = null;
    let verdict: boolean | null = null;
    try {
      b64 = await deps.toBase64(url);
      verdict = b64 ? await deps.judge(b64, scene) : null;
    } catch {
      verdict = null;
    }
    if (verdict === true || verdict === null) {
      report.ok++; // cohérent, ou VL indécis → on garde (jamais bloquant)
      continue;
    }
    // Incohérent : on tente une meilleure image si autorisé.
    let repaired = false;
    if (opts.corriger) {
      try {
        const cands = await deps.search(scene, 3);
        for (const c of cands) {
          if (!c?.url || c.url === url) continue;
          const cb = await deps.toBase64(c.url);
          if (!cb) continue;
          if (await deps.judge(cb, scene)) {
            it[opts.champImage] = c.url;
            repaired = true;
            break;
          }
        }
      } catch {
        /* recherche/juge indispo → on signalera */
      }
    }
    if (repaired) report.fixed++;
    else {
      report.flagged++;
      report.flags.push(String(scene).slice(0, 80));
    }
  }
  return report;
}
