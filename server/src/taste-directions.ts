// Catalogue de directions esthétiques — cœur du Moteur de Goût (#149).
//
// Pure data + pure sampler: NO I/O, NO network here. Each direction carries a few
// REAL public reference URLs; the taste engine (taste-engine.ts) captures them LIVE
// via the Sharingan (`sharinganAnalyze` in vision.ts) to ground each generated skin
// on real-world web design — never on the model's imagination. The static `tokens`
// spec is the fail-open fallback when a capture fails.
//
// Diversity is guaranteed by CURATION, not by hoping the model varies: every
// direction is a vector over 6 aesthetic axes, and `sampleDirections` picks K
// directions that are maximally spread (farthest-point sampling), with an optional
// bias toward the user's learned taste.

export type Axis =
  | "temperature" // froid (-1) … chaud (+1)
  | "luminosity" //  sombre (-1) … clair (+1)
  | "density" //     dense (-1) … aéré (+1)
  | "contrast" //    doux (-1) … fort (+1)
  | "shape" //       anguleux (-1) … arrondi (+1)
  | "energy"; //     sobre (-1) … vif (+1)

export const AXES: Axis[] = ["temperature", "luminosity", "density", "contrast", "shape", "energy"];

export interface DirectionTokens {
  palette: string[]; // indicative hex anchors (fallback if the Sharingan capture fails)
  fontPairing: string; // titrage + corps
  radius: string; // border-radius hint, e.g. "0px" | "10px" | "24px"
  density: string; // spacing scale hint
  motion: string; // micro-interaction style
  surface: string; // backgrounds / depth treatment
}

export interface TasteDirection {
  id: string;
  name: string; // libellé FR montré dans l'UI
  blurb: string; // une ligne FR
  axes: Record<Axis, number>; // -1..1, sert au calcul de diversité
  referenceUrls: string[]; // vrais sites publics incarnant la direction (cibles Sharingan)
  tokens: DirectionTokens; // spec de repli quand la capture échoue
}

// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue de départ — 12 directions espacées sur les 6 axes.
// Les URLs de référence sont éditables : ce sont les sites que le Sharingan ira
// mesurer en live. (Raf raffinera ce catalogue, éventuellement avec ses propres
// références issues d'une planche d'inspiration.)
// ─────────────────────────────────────────────────────────────────────────────
export const DIRECTIONS: TasteDirection[] = [
  {
    id: "minimal-froid",
    name: "Minimal froid",
    blurb: "Épuré, monochrome, net — esprit Linear/Vercel.",
    axes: { temperature: -0.6, luminosity: -0.4, density: -0.4, contrast: 0.2, shape: -0.4, energy: -0.6 },
    referenceUrls: ["https://linear.app", "https://vercel.com"],
    tokens: {
      palette: ["#0b0d12", "#5b6cff", "#e8eaf0"],
      fontPairing: "Inter, graisses serrées (titrage + corps)",
      radius: "6px",
      density: "compacte, échelle 4/8px",
      motion: "transitions subtiles 150ms",
      surface: "aplats sombres, hairlines fines",
    },
  },
  {
    id: "editorial-chaud",
    name: "Éditorial chaud",
    blurb: "Magazine, serif, marges généreuses, tons crème.",
    axes: { temperature: 0.7, luminosity: 0.6, density: 0.7, contrast: 0.3, shape: 0.0, energy: -0.2 },
    referenceUrls: ["https://aeon.co", "https://every.to"],
    tokens: {
      palette: ["#fbf7f0", "#1a1a1a", "#c2410c"],
      fontPairing: "Serif titrage (Fraunces/Georgia) + sans corps",
      radius: "2px",
      density: "aérée, larges marges de lecture",
      motion: "discrète",
      surface: "papier crème, filets sobres",
    },
  },
  {
    id: "bold-contraste",
    name: "Bold contrasté",
    blurb: "Grande typo, contraste franc, un accent vif.",
    axes: { temperature: 0.3, luminosity: 0.7, density: -0.2, contrast: 0.9, shape: -0.2, energy: 0.8 },
    referenceUrls: ["https://gumroad.com", "https://basecamp.com"],
    tokens: {
      palette: ["#ffffff", "#000000", "#ff3d00"],
      fontPairing: "Sans grotesque très grasse en titrage",
      radius: "0px",
      density: "blocs francs",
      motion: "snappy, états marqués",
      surface: "aplats francs, bordures noires",
    },
  },
  {
    id: "glass-sombre",
    name: "Glassmorphism sombre",
    blurb: "Sombre translucide, halos, profondeur — esprit Apple/Stripe.",
    axes: { temperature: -0.3, luminosity: -0.8, density: 0.3, contrast: 0.4, shape: 0.5, energy: 0.4 },
    referenceUrls: ["https://stripe.com", "https://www.apple.com"],
    tokens: {
      palette: ["#0a0a14", "#7c5cff", "#22d3ee"],
      fontPairing: "Inter/SF, fines à medium",
      radius: "20px",
      density: "aérée",
      motion: "fondus, parallax doux",
      surface: "panneaux translucides, blur, halos diffus",
    },
  },
  {
    id: "neo-brutalist",
    name: "Néo-brutalist",
    blurb: "Bordures épaisses, ombres dures, couleurs vives plates.",
    axes: { temperature: 0.4, luminosity: 0.7, density: -0.3, contrast: 0.9, shape: -0.8, energy: 0.9 },
    referenceUrls: ["https://gumroad.com", "https://www.framer.com"],
    tokens: {
      palette: ["#fffbe6", "#111111", "#ff90e8"],
      fontPairing: "Sans bold + mono en accents",
      radius: "0px",
      density: "grille visible",
      motion: "déplacements nets, ombres offset",
      surface: "bordures noires épaisses, ombres dures décalées",
    },
  },
  {
    id: "pastel-doux",
    name: "Pastel doux",
    blurb: "Pastels, grands arrondis, ambiance amicale.",
    axes: { temperature: 0.4, luminosity: 0.8, density: 0.5, contrast: -0.6, shape: 0.9, energy: 0.3 },
    referenceUrls: ["https://www.notion.so", "https://www.duolingo.com"],
    tokens: {
      palette: ["#fdf2f8", "#7c5cff", "#34d399"],
      fontPairing: "Sans arrondie (Nunito/Quicksand)",
      radius: "24px",
      density: "respirante",
      motion: "rebonds doux",
      surface: "cartes pastel, ombres très douces",
    },
  },
  {
    id: "luxe-sobre",
    name: "Luxe sobre",
    blurb: "Élégance retenue, beaucoup de vide, raffinement.",
    axes: { temperature: 0.1, luminosity: 0.6, density: 0.9, contrast: 0.1, shape: -0.1, energy: -0.7 },
    referenceUrls: ["https://www.aesop.com", "https://www.apple.com"],
    tokens: {
      palette: ["#f7f5f1", "#1c1c1c", "#8a7355"],
      fontPairing: "Serif fin titrage + sans léger",
      radius: "0px",
      density: "très aérée, luxe d'espace",
      motion: "lente, élégante",
      surface: "blanc cassé, filets fins",
    },
  },
  {
    id: "tech-neon",
    name: "Tech sombre néon",
    blurb: "Fond très sombre, accents néon — esprit outil dev.",
    axes: { temperature: -0.2, luminosity: -0.9, density: -0.1, contrast: 0.6, shape: 0.2, energy: 0.7 },
    referenceUrls: ["https://railway.app", "https://supabase.com"],
    tokens: {
      palette: ["#0c0c0f", "#3ecf8e", "#a855f7"],
      fontPairing: "Sans + mono",
      radius: "10px",
      density: "moyenne",
      motion: "lueurs, accents lumineux",
      surface: "fond quasi noir, accents néon",
    },
  },
  {
    id: "corporate-clair",
    name: "Corporate clair",
    blurb: "SaaS propre, bleu de confiance, lisible.",
    axes: { temperature: -0.4, luminosity: 0.8, density: 0.2, contrast: 0.2, shape: 0.3, energy: -0.1 },
    referenceUrls: ["https://www.intercom.com", "https://www.hubspot.com"],
    tokens: {
      palette: ["#ffffff", "#1f3a8a", "#2563eb"],
      fontPairing: "Sans neutre lisible",
      radius: "10px",
      density: "ordonnée",
      motion: "fonctionnelle",
      surface: "blanc, cartes légères, bleu confiance",
    },
  },
  {
    id: "organique-naturel",
    name: "Organique naturel",
    blurb: "Tons terreux, formes organiques, chaleur végétale.",
    axes: { temperature: 0.8, luminosity: 0.5, density: 0.4, contrast: 0.4, shape: 0.6, energy: 0.5 },
    referenceUrls: ["https://www.oatly.com", "https://www.notion.so"],
    tokens: {
      palette: ["#f4efe2", "#3f3a2f", "#7d8c5c"],
      fontPairing: "Sans humaniste + touches manuscrites",
      radius: "16px",
      density: "généreuse",
      motion: "organique, douce",
      surface: "tons terreux, formes organiques",
    },
  },
  {
    id: "mono-typographique",
    name: "Mono typographique",
    blurb: "Grille suisse, typo reine, noir/blanc + un accent.",
    axes: { temperature: -0.1, luminosity: 0.7, density: -0.5, contrast: 0.5, shape: -0.6, energy: 0.0 },
    referenceUrls: ["https://www.are.na", "https://vercel.com"],
    tokens: {
      palette: ["#ffffff", "#000000", "#0000ff"],
      fontPairing: "Grotesque + mono, grille suisse",
      radius: "0px",
      density: "grille stricte, dense",
      motion: "minimale",
      surface: "blanc, grille visible, conduite par la typo",
    },
  },
  {
    id: "cinematique-gradient",
    name: "Cinématique gradient",
    blurb: "Dégradés profonds, immersif, sensation premium.",
    axes: { temperature: 0.2, luminosity: -0.5, density: 0.4, contrast: 0.6, shape: 0.6, energy: 0.8 },
    referenceUrls: ["https://stripe.com", "https://www.framer.com"],
    tokens: {
      palette: ["#0f0524", "#ff6ec7", "#7c5cff"],
      fontPairing: "Sans display titrage + corps léger",
      radius: "18px",
      density: "aérée immersive",
      motion: "parallax, dégradés animés",
      surface: "dégradés profonds, sensation de profondeur",
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sampler de diversité — farthest-point sampling sur les 6 axes.
// ─────────────────────────────────────────────────────────────────────────────

export interface SampleOptions {
  favorIds?: string[]; // directions préférées par le goût appris (biais d'exploitation)
  seedIndex?: number; // point de départ déterministe quand aucun favori (défaut 0)
  pool?: TasteDirection[]; // override du catalogue (tests)
}

/** Distance euclidienne entre deux directions sur les 6 axes esthétiques. */
export function directionDistance(a: TasteDirection, b: TasteDirection): number {
  let sum = 0;
  for (const ax of AXES) {
    const d = a.axes[ax] - b.axes[ax];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Choisit K directions MAXIMALEMENT espacées (diversité garantie par construction).
 * - Si `favorIds` est fourni, on amorce avec ces directions (exploitation du goût appris)
 *   puis on complète en s'écartant le plus possible (exploration).
 * - Sinon on amorce sur `seedIndex` et on déroule le farthest-point.
 * Déterministe (départage par id) → testable.
 */
export function sampleDirections(k: number, opts: SampleOptions = {}): TasteDirection[] {
  const pool = opts.pool ?? DIRECTIONS;
  const n = pool.length;
  if (n === 0) return [];
  const count = Math.max(1, Math.min(k, n));
  const selected: TasteDirection[] = [];

  // 1. Amorçage par les favoris (biais vers le goût appris), dans l'ordre donné.
  if (opts.favorIds?.length) {
    for (const id of opts.favorIds) {
      if (selected.length >= count) break;
      const d = pool.find((x) => x.id === id);
      if (d && !selected.includes(d)) selected.push(d);
    }
  }

  // 2. Sinon amorçage déterministe.
  if (selected.length === 0) {
    const seed = (((opts.seedIndex ?? 0) % n) + n) % n;
    selected.push(pool[seed]);
  }

  // 3. Farthest-point : ajoute le candidat qui maximise la distance MINIMALE aux choisis.
  while (selected.length < count) {
    let best: TasteDirection | null = null;
    let bestScore = -1;
    for (const cand of pool) {
      if (selected.includes(cand)) continue;
      let minD = Infinity;
      for (const s of selected) minD = Math.min(minD, directionDistance(cand, s));
      if (minD > bestScore || (minD === bestScore && best !== null && cand.id < best.id)) {
        bestScore = minD;
        best = cand;
      }
    }
    if (best === null) break;
    selected.push(best);
  }

  return selected;
}

/** Récupère une direction par id. */
export function getDirection(id: string, pool: TasteDirection[] = DIRECTIONS): TasteDirection | undefined {
  return pool.find((d) => d.id === id);
}

const AXIS_WORDS: Record<Axis, [string, string]> = {
  temperature: ["froid", "chaud"],
  luminosity: ["sombre", "clair"],
  density: ["dense", "aéré"],
  contrast: ["contraste doux", "fort contraste"],
  shape: ["anguleux", "arrondi"],
  energy: ["sobre", "vif"],
};

/** Traduit le vecteur d'axes en mots (ignore les axes neutres |v| < 0.33). */
export function describeAxes(axes: Record<Axis, number>): string {
  const words: string[] = [];
  for (const ax of AXES) {
    const v = axes[ax];
    if (v <= -0.33) words.push(AXIS_WORDS[ax][0]);
    else if (v >= 0.33) words.push(AXIS_WORDS[ax][1]);
  }
  return words.join(", ");
}

/**
 * Rend une direction en fragment de prompt pour GLM (consigne d'habillage STRICT).
 * Le moteur préfixera ce fragment par les VRAIS tokens captés par le Sharingan.
 */
export const IMAGE_MOODS: Record<string, string> = {
  "minimal-froid": "minimal clean light",
  "editorial-chaud": "warm cozy morning",
  "bold-contraste": "bold vibrant colorful",
  "glass-sombre": "dark moody bokeh",
  "neo-brutalist": "graphic flat bold",
  "pastel-doux": "soft pastel bright",
  "luxe-sobre": "elegant minimal luxury",
  "tech-neon": "dark neon night",
  "corporate-clair": "bright professional clean",
  "organique-naturel": "natural wood plants",
  "mono-typographique": "monochrome black white",
  "cinematique-gradient": "cinematic moody gradient",
};

/** Mots-clés d'ambiance (EN) d'une direction pour la recherche d'image réelle (repli "modern"). */
export function directionMood(id: string): string {
  return IMAGE_MOODS[id] ?? "modern";
}

export function directionBrief(d: TasteDirection): string {
  return [
    `Direction esthétique : « ${d.name} » — ${d.blurb}`,
    `Caractère : ${describeAxes(d.axes)}.`,
    `Tokens cibles (repli si aucune référence captée) :`,
    `- Palette : ${d.tokens.palette.join(" · ")}`,
    `- Typographie : ${d.tokens.fontPairing}`,
    `- Rayon : ${d.tokens.radius} · Densité : ${d.tokens.density}`,
    `- Surfaces : ${d.tokens.surface}`,
    `- Micro-interactions : ${d.tokens.motion}`,
    `Consigne : applique CETTE direction à l'HABILLAGE uniquement (couleurs, typo, espacement, rayon, ombres, micro-interactions).`,
    `NE CHANGE PAS la structure des composants, le contenu, ni la logique.`,
  ].join("\n");
}
