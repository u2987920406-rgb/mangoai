// Rétro-patch « collé à gauche » : ajoute le centrage horizontal manquant
// (mx-auto / margin-inline:auto) là où un conteneur à largeur max n'en a pas.
// Mêmes prédicats que server/src/layout-balance.ts (gardés en miroir).
//
//   node scripts/fix-left-align.mjs            # DRY-RUN (rapport, n'écrit rien)
//   node scripts/fix-left-align.mjs --apply    # applique les corrections
//   node scripts/fix-left-align.mjs --since=2026-06-27   # ne traite que les sites de cette date (mtime src/)
//
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, "..", "..", "workspace");

const APPLY = process.argv.includes("--apply");
const sinceArg = process.argv.find((a) => a.startsWith("--since="));
const SINCE = sinceArg ? sinceArg.split("=")[1] : null;

// — Prédicats (miroir de layout-balance.ts) —
const WIDE_MAXW = /\bmax-w-(xl|2xl|3xl|4xl|5xl|6xl|7xl|prose|screen-[a-z]+)\b/;
const HAS_MX_AUTO = /\b(mx-auto|m-auto)\b/;
const INTENTIONAL_ASYM = /\b(ml-auto|mr-auto|ms-auto|me-auto)\b/;
const FIXED_MAXWIDTH = /max-width\s*:\s*([^;]+)/i;
const MARGIN_AUTO = /margin(?:-inline|-left|-right|-inline-start|-inline-end)?\s*:\s*[^;]*\bauto\b/i;
const SELF_POSITIONED = /position\s*:\s*(absolute|fixed)|transform\s*:|(?:^|[;{\s])(?:left|right|inset)\s*:/i;
const CLASS_RE = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{[^}]*?"([^"]*)"[^}]*?\})/g;

function isFixedWidth(val) {
  const v = val.trim().toLowerCase();
  if (v.includes("%") || v.startsWith("none") || v.startsWith("auto")) return false;
  return /\d/.test(v) && /(px|rem|em|ch|vw|vh|pt|cm|in)\b/.test(v);
}

// — Transformations (ajoutent le centrage) —
function fixJsx(code) {
  let count = 0;
  const out = code.replace(CLASS_RE, (full, dq, sq, tl, cn) => {
    const value = dq ?? sq ?? tl ?? cn ?? "";
    if (!value || !WIDE_MAXW.test(value) || HAS_MX_AUTO.test(value) || INTENTIONAL_ASYM.test(value)) return full;
    const fixed = value.replace(WIDE_MAXW, (mm) => `${mm} mx-auto`);
    count++;
    return full.replace(value, fixed);
  });
  return { code: out, count };
}

function fixCss(code) {
  let count = 0;
  const out = code.replace(/([^{}]+)\{([^{}]*)\}/g, (full, _sel, body) => {
    const mw = FIXED_MAXWIDTH.exec(body);
    if (!mw || !isFixedWidth(mw[1]) || MARGIN_AUTO.test(body) || SELF_POSITIONED.test(body)) return full;
    const newBody = body.replace(/max-width\s*:\s*[^;]+;?/i, (d) => {
      const t = d.trimEnd();
      return `${t}${t.endsWith(";") ? "" : ";"} margin-inline: auto;`;
    });
    count++;
    return full.replace(body, newBody);
  });
  return { code: out, count };
}

function fixFile(path) {
  const ext = extname(path).toLowerCase();
  const code = readFileSync(path, "utf8");
  let res;
  if (/\.(css|scss|sass|less)$/.test(ext)) res = fixCss(code);
  else if (/\.(jsx|tsx|js|ts|mjs)$/.test(ext)) res = fixJsx(code);
  else return 0;
  if (res.count > 0 && APPLY) writeFileSync(path, res.code, "utf8");
  return res.count;
}

const SKIP = new Set(["node_modules", "dist", ".git", ".vite", ".diffs", "build"]);
function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(jsx|tsx|js|ts|mjs|css|scss|sass|less)$/i.test(name)) acc.push(p);
  }
}

function siteDate(siteDir) {
  // date de modif du src/ (ou du dossier) — pour le filtre --since
  const src = join(siteDir, "src");
  try { return statSync(existsSync(src) ? src : siteDir).mtime.toISOString().slice(0, 10); }
  catch { return ""; }
}

function main() {
  const sites = readdirSync(WORKSPACE).filter((n) => {
    const p = join(WORKSPACE, n);
    try { return statSync(p).isDirectory() && !n.startsWith("."); } catch { return false; }
  });

  let totalFixes = 0;
  let touchedSites = 0;
  const rows = [];

  for (const site of sites) {
    const dir = join(WORKSPACE, site);
    if (SINCE && siteDate(dir) !== SINCE) continue;
    const files = [];
    const srcDir = join(dir, "src");
    if (existsSync(srcDir)) walk(srcDir, files);
    // index.css / fichiers à la racine du site éventuels
    for (const root of ["index.css", "index.html"]) {
      const rp = join(dir, root);
      if (existsSync(rp) && /\.(css)$/i.test(root)) files.push(rp);
    }
    let siteFixes = 0;
    const filesTouched = [];
    for (const f of files) {
      const c = fixFile(f);
      if (c > 0) { siteFixes += c; filesTouched.push(`${f.replace(WORKSPACE + "\\", "").replace(/\\/g, "/")} (${c})`); }
    }
    if (siteFixes > 0) {
      touchedSites++;
      totalFixes += siteFixes;
      rows.push({ site, siteFixes, filesTouched });
    }
  }

  console.log(`\n${APPLY ? "🛠  APPLIQUÉ" : "🔍 DRY-RUN (rien écrit)"}${SINCE ? ` · filtre date=${SINCE}` : ""}\n`);
  for (const r of rows) {
    console.log(`  ${r.site} — ${r.siteFixes} correctif(s)`);
    for (const f of r.filesTouched) console.log(`      ${f}`);
  }
  console.log(`\n  ${touchedSites} site(s) concerné(s) · ${totalFixes} centrage(s) ajouté(s).`);
  if (!APPLY && totalFixes > 0) console.log(`  → relance avec --apply pour écrire.`);
}

main();
