// Garde déterministe d'ÉQUILIBRE DE MISE EN PAGE (#layout-balance).
// Détecte le biais « contenu collé à gauche » : un bloc à LARGEUR MAX (max-w-* / max-width)
// SANS centrage horizontal (mx-auto / margin:auto) → contenu borné mais calé à gauche,
// vide à droite. PUR (aucun I/O ici), donc testable sans navigateur ni cloud.
//
// Pourquoi déterministe : contrairement au juge VL (bruité), c'est une mesure objective
// du code généré — au même titre que la QA WCAG. Le Gardien peut donc renvoyer l'Élève
// corriger sans risque de faux verdict subjectif.

export interface BalanceFinding {
  file: string;
  line: number;
  kind: "jsx-maxw-no-center" | "css-maxwidth-no-center";
  snippet: string;
}

// On ne cible que les conteneurs de contenu LARGES (sections / hero / wrappers de page),
// là où le défaut est flagrant. Les petits max-w-xs/sm/md sont souvent des cartes/inputs
// centrés par un parent flex → on les ignore pour éviter le bruit (faux positifs).
const WIDE_MAXW = /\bmax-w-(xl|2xl|3xl|4xl|5xl|6xl|7xl|prose|screen-[a-z]+)\b/;
// Centrage horizontal Tailwind (mx-auto = margin-inline auto ; m-auto couvre aussi).
const HAS_MX_AUTO = /\b(mx-auto|m-auto)\b/;
// Asymétrie VOLONTAIRE (poussé à gauche/droite) → ce n'est pas le bug, on ne signale pas.
const INTENTIONAL_ASYM = /\b(ml-auto|mr-auto|ms-auto|me-auto)\b/;

/** Extrait toutes les chaînes de classes d'un fichier JSX/TSX :
 *  className="…", className='…', className={`…`}, className={cn("…")}. */
function classStrings(code: string): Array<{ value: string; index: number }> {
  const out: Array<{ value: string; index: number }> = [];
  const re = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{[^}]*?"([^"]*)"[^}]*?\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    if (value) out.push({ value, index: m.index });
  }
  return out;
}

function lineOf(code: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < code.length; i++) if (code[i] === "\n") line++;
  return line;
}

/** Conteneur Tailwind large non centré (max-w-* sans mx-auto, hors asymétrie voulue). */
function scanJsx(code: string, file: string): BalanceFinding[] {
  const out: BalanceFinding[] = [];
  for (const { value, index } of classStrings(code)) {
    if (!WIDE_MAXW.test(value)) continue;
    if (HAS_MX_AUTO.test(value) || INTENTIONAL_ASYM.test(value)) continue;
    out.push({
      file,
      line: lineOf(code, index),
      kind: "jsx-maxw-no-center",
      snippet: value.trim().slice(0, 120),
    });
  }
  return out;
}

// Valeur de max-width FIXE (px/rem/em/ch/vw…) — une largeur en % ou `none`/`auto` ne crée
// pas le déséquilibre (elle suit le parent), on l'ignore.
const FIXED_MAXWIDTH = /max-width\s*:\s*([^;]+)/i;
const MARGIN_AUTO = /margin(?:-inline|-left|-right|-inline-start|-inline-end)?\s*:\s*[^;]*\bauto\b/i;
// Si le bloc se positionne lui-même (absolu/fixe/transform), le centrage peut venir d'ailleurs
// (left:50%;transform:translateX(-50%)) → on ne signale pas, pour éviter le faux positif.
const SELF_POSITIONED = /position\s*:\s*(absolute|fixed)|transform\s*:|(?:^|[;{\s])(?:left|right|inset)\s*:/i;

function isFixedWidth(val: string): boolean {
  const v = val.trim().toLowerCase();
  if (v.includes("%") || v.startsWith("none") || v.startsWith("auto")) return false;
  return /\d/.test(v) && /(px|rem|em|ch|vw|vh|pt|cm|in)\b/.test(v);
}

/** Règle CSS avec max-width fixe sans margin:auto (et qui ne se positionne pas seule). */
function scanCss(code: string, file: string): BalanceFinding[] {
  const out: BalanceFinding[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const selector = m[1].trim();
    const body = m[2];
    const mw = FIXED_MAXWIDTH.exec(body);
    if (!mw || !isFixedWidth(mw[1])) continue;
    if (MARGIN_AUTO.test(body)) continue;
    if (SELF_POSITIONED.test(body)) continue;
    out.push({
      file,
      line: lineOf(code, m.index),
      kind: "css-maxwidth-no-center",
      snippet: `${selector.slice(0, 70)} { …max-width:${mw[1].trim()}… }`,
    });
  }
  return out;
}

/** Détecte les blocs à largeur max non centrés dans un fichier. PUR.
 *  Le type est déduit de l'extension ; .jsx/.tsx/.js → Tailwind, .css/.scss → CSS. */
export function findUncentered(code: string, file: string): BalanceFinding[] {
  const lower = file.toLowerCase();
  if (/\.(css|scss|sass|less)$/.test(lower)) return scanCss(code, file);
  if (/\.(jsx|tsx|js|ts|mjs)$/.test(lower)) return scanJsx(code, file);
  // type inconnu : tenter les deux (rare)
  return [...scanJsx(code, file), ...scanCss(code, file)];
}

/** Lit les fichiers (via un lecteur injecté) et agrège les findings. Ne lève jamais. */
export function scanFilesForBalance(
  files: string[],
  read: (file: string) => string | null,
): BalanceFinding[] {
  const out: BalanceFinding[] = [];
  for (const f of files) {
    if (!/\.(jsx|tsx|js|ts|mjs|css|scss|sass|less)$/i.test(f)) continue;
    let code: string | null = null;
    try {
      code = read(f);
    } catch {
      code = null;
    }
    if (!code) continue;
    out.push(...findUncentered(code, f));
  }
  return out;
}

/** Formate les findings en une raison de correction pour le Gardien. PUR. */
export function formatBalanceRaison(findings: BalanceFinding[], maxShown = 6): string {
  if (!findings.length) return "";
  const shown = findings.slice(0, maxShown);
  const lines = shown.map((f) => `  - ${f.file}:${f.line} → ${f.snippet}`);
  const extra = findings.length > maxShown ? `\n  …(+${findings.length - maxShown} autre(s))` : "";
  return (
    `STRUCTURE — ${findings.length} bloc(s) à largeur max NON centrés (contenu collé à gauche). ` +
    `Ajoute le centrage horizontal : \`mx-auto\` (Tailwind) ou \`margin-inline:auto\` (CSS) sur ces conteneurs, ` +
    `sauf si l'asymétrie est VOULUE (auquel cas mets \`ml-auto\`/\`mr-auto\` explicitement) :\n` +
    lines.join("\n") +
    extra
  );
}
