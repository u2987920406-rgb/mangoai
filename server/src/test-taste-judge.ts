// Tests du juge-pixels (#149 v2 — taste-judge.ts). Déterministe, sans réseau ni
// navigateur : dispatch + readImage injectés. Exerce parseJudgeScore + judgeSkins
// (notation, tri, recommended, cassées en bas, dégradés gracieux, cold-start).
import { parseJudgeScore, judgeSkins, buildJudgeContext, type JudgeDeps } from "./taste-judge.js";
import type { SkinRender } from "./taste-render.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function skin(id: string): SkinRender {
  return { id, name: id, ok: true, file: `${id}.jpg`, palette: ["#abc"] };
}

/** Deps mockées : la note dépend de l'id du skin (via le user prompt). */
function deps(scoreById: Record<string, string>, opts: { throwOn?: string } = {}): JudgeDeps {
  return {
    readImage: () => Buffer.from("fake"),
    dispatch: async (_a, _s, user) => {
      // Le user prompt est `Note cette variante « <id> ».` → match précis sur « id ».
      const id = Object.keys(scoreById).find((k) => user.includes(`« ${k} »`));
      if (opts.throwOn && user.includes(`« ${opts.throwOn} »`)) throw new Error("boom");
      return { status: "ok", summary: id ? scoreById[id] : "SCORE: 50 | CASSÉ: non | ok" };
    },
  };
}

async function run() {
  console.log("\n[1] parseJudgeScore — formats");
  {
    const a = parseJudgeScore("SCORE: 87 | CASSÉ: non | palette chaude cohérente");
    check("format strict → score 87", a.score === 87 && !a.broken);
    check("format strict → raison extraite", /palette chaude/.test(a.reason));
    const b = parseJudgeScore("SCORE: 20 | CASSÉ: oui | texte qui déborde");
    check("CASSÉ: oui → broken true", b.broken === true && b.score === 20);
    const c = parseJudgeScore("Je dirais environ 72 sur 100, propre.");
    check("repli premier entier → 72", c.score === 72);
    const d = parseJudgeScore("aucune note ici");
    check("ni note ni entier → défaut 50 (affichage seul)", d.score === 50);
    check("ni note ni entier → parsed:false (ne doit jamais compter comme un vrai jugement)", d.parsed === false);
    const g = parseJudgeScore("SCORE: 87 | CASSÉ: non | ok");
    check("note lisible → parsed:true", g.parsed === true);
    const e = parseJudgeScore("SCORE: 250 | CASSÉ: non");
    check("score borné à 100", e.score === 100);
    const f = parseJudgeScore("Le contenu est illisible, contraste trop faible");
    check("mot-clé casse → broken", f.broken === true);
  }

  console.log("\n[2] judgeSkins — notation, tri, recommended");
  {
    const skins = [skin("a"), skin("b"), skin("c")];
    const d = deps({
      a: "SCORE: 40 | CASSÉ: non | correct",
      b: "SCORE: 90 | CASSÉ: non | superbe",
      c: "SCORE: 65 | CASSÉ: non | bien",
    });
    const out = await judgeSkins("/skins", skins, { tasteAxioms: "", designSystem: "" }, d);
    check("tri meilleure-d'abord (b 90 > c 65 > a 40)", out.map((s) => s.id).join("") === "bca");
    check("scores assignés", out[0].score === 90 && out[2].score === 40);
    check("raisons assignées", out[0].judgeReason === "superbe");
    check("top recommandé = b", out[0].recommended === true && out[1].recommended !== true);
  }

  console.log("\n[3] judgeSkins — cassées reléguées en bas");
  {
    const skins = [skin("x"), skin("y")];
    const d = deps({
      x: "SCORE: 95 | CASSÉ: oui | mais déborde",   // haute note MAIS cassée
      y: "SCORE: 60 | CASSÉ: non | propre",
    });
    const out = await judgeSkins("/skins", skins, { tasteAxioms: "", designSystem: "" }, d);
    check("la cassée (x, 95) passe SOUS la saine (y, 60)", out.map((s) => s.id).join("") === "yx");
    check("recommandé = la saine y (pas la cassée)", out[0].id === "y" && out[0].recommended === true);
    check("x marquée broken", out[1].broken === true);
  }

  console.log("\n[4] dégradé gracieux — dispatch qui throw");
  {
    const skins = [skin("p"), skin("q")];
    const d = deps({ q: "SCORE: 80 | CASSÉ: non | ok" }, { throwOn: "p" });
    const out = await judgeSkins("/skins", skins, { tasteAxioms: "", designSystem: "" }, d);
    check("p non noté (score undefined), pas de crash", out.find((s) => s.id === "p")?.score === undefined);
    check("q noté normalement", out.find((s) => s.id === "q")?.score === 80);
    check("q (noté) recommandé, pas p", out.find((s) => s.recommended)?.id === "q");
  }

  console.log("\n[5] dispatch dégradé (status error) → skin non noté");
  {
    const skins = [skin("z")];
    const d: JudgeDeps = { readImage: () => Buffer.from("x"), dispatch: async () => ({ status: "error", summary: "" }) };
    const out = await judgeSkins("/skins", skins, { tasteAxioms: "", designSystem: "" }, d);
    check("status error → score undefined", out[0].score === undefined);
  }

  console.log("\n[6] judgeSkins — réponse ok mais illisible (pas de score) → skin non noté, jamais 50 fantôme");
  {
    const skins = [skin("m"), skin("n")];
    const d: JudgeDeps = {
      readImage: () => Buffer.from("x"),
      dispatch: async (_a, _s, user) =>
        user.includes("« m »")
          ? { status: "ok", summary: "Très joli, vraiment agréable à regarder." } // aucun chiffre
          : { status: "ok", summary: "SCORE: 80 | CASSÉ: non | propre" },
    };
    const out = await judgeSkins("/skins", skins, { tasteAxioms: "", designSystem: "" }, d);
    check("réponse illisible → score undefined (pas 50)", out.find((s) => s.id === "m")?.score === undefined);
    check("réponse lisible → notée normalement", out.find((s) => s.id === "n")?.score === 80);
  }

  console.log("\n[7] buildJudgeContext — cold-start tolérant (workspace vide)");
  {
    const ctx = buildJudgeContext("/chemin/inexistant", "vitrine");
    check("ne throw pas, renvoie des chaînes", typeof ctx.tasteAxioms === "string" && typeof ctx.designSystem === "string");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} test-taste-judge : ${pass} ✓ / ${fail} ✗`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error("FATAL", e); process.exit(1); });
