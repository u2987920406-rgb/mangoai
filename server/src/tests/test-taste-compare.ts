// Test de preuve — taste-compare.ts (É3, Loop Engineering 2026-07-07).
//   npx tsx src/test-taste-compare.ts
// Zéro réseau : comparePairRaw est injecté (mock). Exerce parsePairVerdict (pur)
// + comparePair (ensemble à 2 membres via brain-ensemble.ts::deliberate) :
//   [1] verdict CONCORDANT (les deux ordres s'accordent après remap)
//   [2] "instable" (biais de position : les deux ordres se contredisent)
//   [3] hors-format (parsed:false des deux côtés → instable, jamais un verdict décidé)
//   [4] membre muet (comparePairRaw qui lève → instable, jamais une exception qui remonte)
import { comparePrompt, parsePairVerdict, comparePair, type CompareDeps } from "../taste/taste-compare.js";
import type { JudgeContext } from "../taste/taste-judge.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const CTX: JudgeContext = { tasteAxioms: "", designSystem: "" };
const A = Buffer.from("CONTENU_A_MEILLEUR");
const B = Buffer.from("CONTENU_B_MOINS_BON");

console.log("\n[0] comparePrompt — forcé, égalité pas un confort");
check("mentionne 'égalité' seulement si vraiment indiscernable", /VRAIMENT indiscernables/i.test(comparePrompt(CTX)));

console.log("\n[1] parsePairVerdict — formats");
{
  const a = parsePairVerdict("MEILLEUR: A | plus cohérent");
  check("verdict A", a.verdict === "A" && a.parsed);
  const b = parsePairVerdict("MEILLEUR: B | meilleure hiérarchie");
  check("verdict B", b.verdict === "B" && b.parsed);
  const t = parsePairVerdict("MEILLEUR: égalité | vraiment identiques");
  check("verdict tie (égalité)", t.verdict === "tie" && t.parsed);
  const off = parsePairVerdict("Les deux sont sympas.");
  check("hors-format → parsed:false", off.parsed === false);
  check("hors-format → verdict par défaut 'tie' (affichage seul)", off.verdict === "tie");
}

async function run() {
  console.log("\n[2] comparePair — verdict CONCORDANT (contenu-aware, insensible à l'ordre)");
  {
    const deps: CompareDeps = {
      comparePairRaw: async (imgA) => {
        const firstIsA = imgA.equals(A);
        return firstIsA
          ? { status: "ok", summary: "MEILLEUR: A | plus soigné" }
          : { status: "ok", summary: "MEILLEUR: B | l'autre est plus soigné" };
      },
    };
    const r = await comparePair(A, B, CTX, deps);
    check("A gagne (concordant sur les 2 ordres)", r.verdict === "A");
    check("agree:2 / total:2", r.agree === 2 && r.total === 2);
  }

  console.log("\n[3] comparePair — 'instable' (biais de position : toujours le PREMIER vu)");
  {
    const deps: CompareDeps = {
      comparePairRaw: async () => ({ status: "ok", summary: "MEILLEUR: A | premier vu, donc meilleur" }),
    };
    const r = await comparePair(A, B, CTX, deps);
    check("instable (désaccord d'ordre détecté)", r.verdict === "instable");
  }

  console.log("\n[4] comparePair — réponse hors-format des deux côtés → instable, jamais un verdict décidé");
  {
    const deps: CompareDeps = {
      comparePairRaw: async () => ({ status: "ok", summary: "C'est vraiment sympa comme design, dur à dire." }),
    };
    const r = await comparePair(A, B, CTX, deps);
    check("instable (pas de verdict fantôme sur hors-format)", r.verdict === "instable");
  }

  console.log("\n[5] comparePair — membre qui lève (transport KO) → jamais d'exception, instable");
  {
    const deps: CompareDeps = {
      comparePairRaw: async () => { throw new Error("réseau injoignable"); },
    };
    let threw = false;
    let r;
    try {
      r = await comparePair(A, B, CTX, deps);
    } catch {
      threw = true;
    }
    check("ne lève jamais", !threw);
    check("instable (aucun membre valide)", r?.verdict === "instable");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} test-taste-compare : ${pass} ✓ / ${fail} ✗`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
