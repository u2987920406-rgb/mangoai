// Tests du catalogue de compositions (taste-compositions.ts) — pur, déterministe.

import { COMPOSITIONS, sampleCompositions, getComposition, compositionBrief } from "./taste-compositions.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ── Catalogue ──
check("catalogue non vide", COMPOSITIONS.length >= 6);
check("ids uniques", new Set(COMPOSITIONS.map((c) => c.id)).size === COMPOSITIONS.length);
check("ids en kebab-case (servables comme <id>.jpg)", COMPOSITIONS.every((c) => /^[a-z0-9-]+$/.test(c.id)));
check("chaque composition a nom, blurb, layout", COMPOSITIONS.every((c) => c.name && c.blurb && c.layout.length > 20));

// ── sampleCompositions ──
const four = sampleCompositions(4);
check("sample(4) renvoie 4 compositions", four.length === 4);
check("sample(4) sans doublon", new Set(four.map((c) => c.id)).size === 4);

const all = sampleCompositions(COMPOSITIONS.length + 5);
check("sample(k>n) plafonne à n", all.length === COMPOSITIONS.length);

const zero = sampleCompositions(0);
check("sample(0) renvoie au moins 1 (plancher)", zero.length === 1);

check("déterministe (mêmes ids à appels répétés)",
  JSON.stringify(sampleCompositions(4).map((c) => c.id)) === JSON.stringify(four.map((c) => c.id)));

// ── favorIds : amorçage par le goût appris ──
const favId = COMPOSITIONS[COMPOSITIONS.length - 1].id; // une composition en fin de liste
const favored = sampleCompositions(3, { favorIds: [favId] });
check("favorIds amorce la sélection (1er = favori)", favored[0]?.id === favId);
check("favorIds sans doublon dans la suite", new Set(favored.map((c) => c.id)).size === favored.length);

// ── seedIndex décale le point de départ ──
const a = sampleCompositions(2, { seedIndex: 0 }).map((c) => c.id);
const b = sampleCompositions(2, { seedIndex: 3 }).map((c) => c.id);
check("seedIndex change la sélection", JSON.stringify(a) !== JSON.stringify(b));

// ── spread : k=2 sur un grand catalogue donne 2 compositions distinctes ──
check("sample(2) donne 2 compositions distinctes", new Set(sampleCompositions(2).map((c) => c.id)).size === 2);

// ── getComposition ──
check("getComposition trouve par id", getComposition(COMPOSITIONS[0].id)?.id === COMPOSITIONS[0].id);
check("getComposition → undefined si inconnu", getComposition("nope-xyz") === undefined);

// ── compositionBrief ──
const brief = compositionBrief(COMPOSITIONS[0]);
check("compositionBrief contient le nom", brief.includes(COMPOSITIONS[0].name));
check("compositionBrief impose la structure", /COMPOSITION IMPOSÉE/.test(brief) && brief.includes(COMPOSITIONS[0].layout));

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
