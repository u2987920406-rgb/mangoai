// Tests du catalogue de directions esthétiques (taste-directions.ts, Moteur de Goût #149).
// Déterministe, zéro réseau : le module est pur (données + sampler).

import {
  DIRECTIONS, AXES, sampleDirections, directionDistance, describeAxes,
  directionBrief, getDirection, type TasteDirection,
} from "../taste/taste-directions.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// — Intégrité du catalogue —
check("catalogue non vide", DIRECTIONS.length >= 8);
check("ids uniques", new Set(DIRECTIONS.map((d) => d.id)).size === DIRECTIONS.length);
check("chaque direction porte les 6 axes", DIRECTIONS.every((d) => AXES.every((ax) => typeof d.axes[ax] === "number")));
check("axes bornés [-1,1]", DIRECTIONS.every((d) => AXES.every((ax) => d.axes[ax] >= -1 && d.axes[ax] <= 1)));
check("≥ 2 URLs de référence par direction (cibles Sharingan)", DIRECTIONS.every((d) => d.referenceUrls.length >= 2));
check("URLs publiques http(s)", DIRECTIONS.every((d) => d.referenceUrls.every((u) => /^https?:\/\//.test(u))));
check("tokens de repli complets", DIRECTIONS.every((d) => d.tokens.palette.length > 0 && !!d.tokens.fontPairing && !!d.tokens.radius));

// — Sampler : nombre & distinction —
const four = sampleDirections(4);
check("renvoie exactement K", four.length === 4);
check("directions distinctes", new Set(four.map((d) => d.id)).size === 4);
check("clamp K > catalogue", sampleDirections(999).length === DIRECTIONS.length);
check("clamp K <= 0 → au moins 1", sampleDirections(0).length === 1);

// — Diversité : le farthest-point bat une coupe naïve des K premiers —
function spread(set: TasteDirection[]): number {
  let total = 0, pairs = 0;
  for (let i = 0; i < set.length; i++)
    for (let j = i + 1; j < set.length; j++) { total += directionDistance(set[i], set[j]); pairs++; }
  return pairs ? total / pairs : 0;
}
const naive = DIRECTIONS.slice(0, 4);
check("le sampler écarte plus que les 4 premiers du catalogue", spread(four) > spread(naive));

// — Déterminisme —
check("même seed → même résultat", JSON.stringify(sampleDirections(4, { seedIndex: 2 })) === JSON.stringify(sampleDirections(4, { seedIndex: 2 })));
check("seeds différents → départs différents", sampleDirections(4, { seedIndex: 0 })[0].id !== sampleDirections(4, { seedIndex: 1 })[0].id);

// — Biais vers le goût appris (favorIds amorce, puis on s'écarte) —
const favored = sampleDirections(4, { favorIds: ["pastel-doux"] });
check("favori présent en tête", favored[0].id === "pastel-doux");
check("favori + complétion = K distincts", new Set(favored.map((d) => d.id)).size === 4);
const twoFav = sampleDirections(3, { favorIds: ["minimal-froid", "luxe-sobre"] });
check("plusieurs favoris respectés dans l'ordre", twoFav[0].id === "minimal-froid" && twoFav[1].id === "luxe-sobre");

// — Helpers —
check("describeAxes ignore les axes neutres", !describeAxes({ temperature: 0, luminosity: 0, density: 0, contrast: 0, shape: 0, energy: 0 }).length);
check("describeAxes nomme un axe marqué", describeAxes({ temperature: 0.9, luminosity: 0, density: 0, contrast: 0, shape: 0, energy: 0 }).includes("chaud"));
check("getDirection trouve par id", getDirection("tech-neon")?.name === "Tech sombre néon");
check("getDirection inconnu → undefined", getDirection("nope") === undefined);
const brief = directionBrief(DIRECTIONS[0]);
check("directionBrief impose l'habillage SEUL", /HABILLAGE uniquement/.test(brief) && /NE CHANGE PAS la structure/.test(brief));
check("directionBrief expose les tokens de repli", brief.includes(DIRECTIONS[0].tokens.palette[0]));

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
