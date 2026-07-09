// Tests des compétences « contenu » de l'Élève (genere_contenu + verifie_coherence_images).
// Tout mocké (LLM, VL, recherche d'images, FS) — aucun réseau, aucun GPU.

import {
  buildContentPrompt,
  extractJsonArray,
  validateItems,
  generateContentItems,
  checkImageCoherence,
  type GenContentDeps,
  type ImgCheckDeps,
  type ImgItem,
} from "../eleve-content.js";
import { buildEleveContentTools, type ContentToolDeps } from "../eleve-tools/eleve-content-tools.js";
import path from "node:path";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// Racine NORMALISÉE par l'OS (path.resolve) pour que resolveInside compare des séparateurs cohérents.
const ROOT = path.resolve("proj-test");

async function run() {
  console.log("[1] buildContentPrompt — PUR");
  {
    const { system, user } = buildContentPrompt({ sujet: "fiches café", schema: "{nom, prix}", n: 5, langue: "français", clesRequises: ["nom", "prix"] });
    check("système impose le JSON pur", /tableau JSON/i.test(system));
    check("user porte le sujet, le schéma et n", user.includes("fiches café") && user.includes("{nom, prix}") && user.includes("5"));
    check("clés requises listées", user.includes("nom, prix"));
    check("langue mentionnée", /français/.test(user));
    const p2 = buildContentPrompt({ sujet: "x", schema: "y", n: 3 });
    check("sans options : pas de clause clés/langue", !/clés/i.test(p2.user) === false || !p2.user.includes("DOIT contenir"));
  }

  console.log("\n[2] extractJsonArray — PUR");
  {
    check("tableau nu", JSON.stringify(extractJsonArray('[{"a":1}]')) === '[{"a":1}]');
    check("avec fences ```json", (extractJsonArray('```json\n[{"a":1},{"b":2}]\n```') as unknown[]).length === 2);
    check("avec texte autour", (extractJsonArray('Voici : [{"a":1}] merci') as unknown[]).length === 1);
    check("crochet dans une string ne casse pas", (extractJsonArray('[{"a":"x[y]z"}]') as unknown[]).length === 1);
    let threw = false;
    try { extractJsonArray("pas de tableau"); } catch { threw = true; }
    check("absence de tableau → lève", threw);
  }

  console.log("\n[3] validateItems — PUR");
  {
    check("garde les objets non vides", validateItems([{ a: 1 }, {}, "x", null, [1]]).length === 1);
    check("filtre par clés requises", validateItems([{ a: 1, b: 2 }, { a: 1 }], ["a", "b"]).length === 1);
    check("clé vide = invalide", validateItems([{ a: "", b: 2 }], ["a", "b"]).length === 0);
  }

  console.log("\n[4] generateContentItems — ne lève jamais");
  {
    const okDeps: GenContentDeps = { ask: async () => '[{"q":"1"},{"q":"2"},{"q":"3"}]' };
    const r1 = await generateContentItems({ sujet: "s", schema: "sc", n: 3, clesRequises: ["q"] }, okDeps);
    check("happy → ok + 3 items", r1.ok && r1.items.length === 3);

    let calls = 0;
    const flaky: GenContentDeps = { ask: async () => { calls++; return calls === 1 ? "cassé" : '[{"q":"1"},{"q":"2"}]'; } };
    const r2 = await generateContentItems({ sujet: "s", schema: "sc", n: 2 }, flaky);
    check("retry après 1er échec de parsing", r2.ok && calls === 2);

    const badDeps: GenContentDeps = { ask: async () => "jamais du JSON" };
    const r3 = await generateContentItems({ sujet: "s", schema: "sc", n: 5 }, badDeps);
    check("2 échecs → ok:false sans lever", r3.ok === false && r3.items.length === 0 && !!r3.error);

    const r4 = await generateContentItems({ sujet: "", schema: "sc", n: 3 }, okDeps);
    check("sujet manquant → ok:false", r4.ok === false);

    const r5 = await generateContentItems({ sujet: "s", schema: "sc", n: 100 }, { ask: async () => '[{"q":1}]' });
    check("n borné à 50 (seuil 60% non atteint sur 1 item) → ok:false", r5.ok === false);
  }

  console.log("\n[5] checkImageCoherence — juge/corrige/signale, ne lève jamais");
  {
    const base = (verdict: boolean | null, found: string | null): ImgCheckDeps => ({
      toBase64: async (u) => (u ? "b64:" + u : null),
      judge: async (_b, _s) => verdict,
      search: async () => (found ? [{ url: found }] : []),
    });
    const items1: ImgItem[] = [{ image: "u1", scene: "a cat" }];
    const r1 = await checkImageCoherence(items1, { champImage: "image", champScene: "scene", corriger: true }, base(true, null));
    check("verdict OK → conservé", r1.ok === 1 && r1.fixed === 0 && r1.flagged === 0);

    const items2: ImgItem[] = [{ image: "u1", scene: "a cat" }];
    const r2 = await checkImageCoherence(items2, { champImage: "image", champScene: "scene", corriger: true }, base(null, null));
    check("VL indécis (null) → conservé, jamais bloquant", r2.ok === 1);

    // mismatch puis recherche trouve une image que le juge VALIDE
    let jcalls = 0;
    const fixDeps: ImgCheckDeps = {
      toBase64: async (u) => "b64:" + u,
      judge: async (b) => { jcalls++; return b === "b64:better"; }, // l'originale échoue, "better" passe
      search: async () => [{ url: "better" }],
    };
    const items3: ImgItem[] = [{ image: "u1", scene: "a cat" }];
    const r3 = await checkImageCoherence(items3, { champImage: "image", champScene: "scene", corriger: true }, fixDeps);
    check("mismatch → image remplacée", r3.fixed === 1 && items3[0].image === "better");

    const items4: ImgItem[] = [{ image: "u1", scene: "a cat" }];
    const r4 = await checkImageCoherence(items4, { champImage: "image", champScene: "scene", corriger: true }, base(false, null));
    check("mismatch sans remplaçant → signalé", r4.flagged === 1 && r4.flags.length === 1);

    const items5: ImgItem[] = [{ image: "u1", scene: "a cat" }];
    const r5 = await checkImageCoherence(items5, { champImage: "image", champScene: "scene", corriger: false }, base(false, "better"));
    check("corriger:false → ne remplace pas, signale", r5.fixed === 0 && r5.flagged === 1);

    const items6: ImgItem[] = [{ scene: "no image" }, { image: "u", scene: "" }];
    const r6 = await checkImageCoherence(items6, { champImage: "image", champScene: "scene", corriger: true }, base(true, null));
    check("items sans image/scène ignorés", r6.checked === 0);
  }

  console.log("\n[6] outils KernelTool — wiring, écriture confinée, erreurs");
  {
    const files: Record<string, string> = {};
    const deps: ContentToolDeps = {
      ask: async () => '[{"q":"1"},{"q":"2"}]',
      img: {
        toBase64: async (u) => "b64:" + u,
        judge: async (b) => b === "b64:https://img/better.jpg", // l'originale échoue, le remplaçant passe
        search: async () => [{ url: "https://img/better.jpg" }],
      },
      readFile: (abs) => files[abs] ?? (() => { throw new Error("ENOENT"); })(),
      writeFile: (abs, data) => { files[abs] = data; },
    };
    const tools = buildEleveContentTools(ROOT, deps);
    const genere = tools.find((t) => t.name === "genere_contenu")!;
    const verifie = tools.find((t) => t.name === "verifie_coherence_images")!;
    check("2 outils exposés", tools.length === 2 && !!genere && !!verifie);

    const g1 = await genere.handler({ sujet: "quiz", schema: "{q}", n: 2 });
    check("genere_contenu écrit le fichier par défaut", !g1.isError && Object.keys(files).some((k) => k.endsWith("contenu.json")));

    const g2 = await genere.handler({ sujet: "", schema: "{q}", n: 2 });
    check("genere_contenu sujet vide → isError", g2.isError === true);

    const gEsc = await genere.handler({ sujet: "s", schema: "{q}", n: 2, fichier: "../evil.json" });
    check("genere_contenu refuse un chemin hors projet", gEsc.isError === true);

    // verifie : prépare un fichier d'items avec une image incohérente → doit corriger
    const abs = path.resolve(ROOT, "data.json");
    files[abs] = JSON.stringify([{ image: "https://img/old.jpg", scene: "a dog" }]);
    const v1 = await verifie.handler({ fichier: "data.json", champ_scene: "scene" });
    check("verifie_coherence_images rapporte un bilan", !v1.isError && /vérifiées/.test(v1.text));
    check("verifie corrige l'image dans le fichier", JSON.parse(files[abs])[0].image === "https://img/better.jpg");

    const vMiss = await verifie.handler({ fichier: "" });
    check("verifie sans fichier → isError", vMiss.isError === true);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-content : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
