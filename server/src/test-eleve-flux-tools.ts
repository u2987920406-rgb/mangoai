// Tests de genere_image (Flux local, L16). ComfyUI SIMULÉ via fetchImpl mock — aucun GPU.
// On exerce : workflow PUR, modèles+env, generateFlux (happy/injoignable/refus/erreur/timeout),
// l'outil (prompt vide, écriture du PNG dans public/generated, repli si ComfyUI down), hash.

import path from "node:path";
import {
  buildFluxWorkflow,
  fluxModels,
  generateFlux,
  buildEleveFluxTools,
  hashString,
  type FluxDeps,
  type FluxToolDeps,
} from "./eleve-flux-tools.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

function resp(opts: { ok?: boolean; status?: number; json?: unknown; text?: string; bytes?: Uint8Array }): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => opts.json,
    text: async () => opts.text ?? "",
    arrayBuffer: async () => (opts.bytes ?? new Uint8Array()).buffer,
  } as unknown as Response;
}

/** Fake ComfyUI : /prompt → prompt_id ; /history/<id> → image ; /view → bytes. */
function fakeComfy(over: { imageReady?: boolean; promptOk?: boolean; historyError?: boolean } = {}): FluxDeps {
  return {
    fetchImpl: (async (url: string) => {
      const u = String(url);
      if (u.includes("/prompt")) {
        return over.promptOk === false ? resp({ ok: false, status: 400, text: "bad" }) : resp({ json: { prompt_id: "pid-1" } });
      }
      if (u.includes("/history/")) {
        if (over.historyError) return resp({ json: { "pid-1": { status: { status_str: "error" } } } });
        if (over.imageReady === false) return resp({ json: {} });
        const hist = { "pid-1": { outputs: { "9": { images: [{ filename: "mango_flux_00001_.png", subfolder: "", type: "output" }] } } } };
        return resp({ json: hist });
      }
      if (u.includes("/view")) return resp({ bytes: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) });
      return resp({ ok: false, status: 404 });
    }) as unknown as typeof fetch,
    sleep: async () => {},
    now: (() => {
      let t = 0;
      return () => (t += 600);
    })(),
  };
}

async function run() {
  console.log("\n[1] buildFluxWorkflow — PUR");
  {
    const g = buildFluxWorkflow("a cat", 768, 512, 42, fluxModels()) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    check("9 nodes", Object.keys(g).length === 9);
    check("UnetLoaderGGUF + DualCLIPLoaderGGUF", g["1"]!.class_type === "UnetLoaderGGUF" && g["2"]!.class_type === "DualCLIPLoaderGGUF");
    check("type flux sur le dual clip", g["2"]!.inputs["type"] === "flux");
    check("prompt injecté dans le positif", g["4"]!.inputs["text"] === "a cat");
    check("taille + seed dans latent/sampler", g["6"]!.inputs["width"] === 768 && g["6"]!.inputs["height"] === 512 && g["7"]!.inputs["seed"] === 42);
    check("SaveImage en sortie", g["9"]!.class_type === "SaveImage");
  }

  console.log("\n[2] fluxModels — défauts + env");
  {
    const m = fluxModels();
    check("défaut schnell GGUF + 4 étapes + cfg1", m.unet === "flux1-schnell-Q4_K_S.gguf" && m.steps === 4 && m.cfg === 1);
    process.env["FLUX_STEPS"] = "8";
    check("env override steps", fluxModels().steps === 8);
    delete process.env["FLUX_STEPS"];
  }

  console.log("\n[3] generateFlux — happy path");
  {
    const r = await generateFlux("a mango", { width: 768, height: 768, seed: 1 }, fakeComfy());
    check("ok + octets PNG", r.ok === true && r.ok && r.bytes.length === 7 && r.filename.includes(".png"));
  }

  console.log("\n[4] generateFlux — pannes gérées (ne lève jamais)");
  {
    const down: FluxDeps = { fetchImpl: (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch, sleep: async () => {}, now: () => 0 };
    const r1 = await generateFlux("x", { width: 512, height: 512, seed: 1 }, down);
    check("ComfyUI injoignable → ok:false + indice de lancement", r1.ok === false && /injoignable|ComfyUI/.test((r1 as { error: string }).error));

    const r2 = await generateFlux("x", { width: 512, height: 512, seed: 1 }, fakeComfy({ promptOk: false }));
    check("workflow refusé → ok:false", r2.ok === false);

    const r3 = await generateFlux("x", { width: 512, height: 512, seed: 1 }, fakeComfy({ historyError: true }));
    check("erreur d'exécution ComfyUI → ok:false", r3.ok === false);

    const prev = process.env["FLUX_TIMEOUT_MS"];
    process.env["FLUX_TIMEOUT_MS"] = "1000";
    const r4 = await generateFlux("x", { width: 512, height: 512, seed: 1 }, fakeComfy({ imageReady: false }));
    check("jamais d'image → timeout ok:false", r4.ok === false && /trop longue|long/i.test((r4 as { error: string }).error));
    if (prev === undefined) delete process.env["FLUX_TIMEOUT_MS"]; else process.env["FLUX_TIMEOUT_MS"] = prev;
  }

  console.log("\n[5] Outil genere_image");
  {
    const tool = (over: Partial<FluxToolDeps> = {}) => {
      const writes: { path: string; len: number }[] = [];
      const deps: FluxToolDeps = {
        ...fakeComfy(),
        writeImage: (p, b) => writes.push({ path: p, len: b.length }),
        ...over,
      };
      const [t] = buildEleveFluxTools(path.resolve("proj-flux-test"), deps);
      return { t, writes };
    };
    const { t } = tool();
    check("nom = genere_image", t!.name === "genere_image");

    const vide = await t!.handler({ prompt: "  " });
    check("prompt vide → isError", vide.isError === true);

    const { t: t2, writes } = tool();
    const ok = await t2!.handler({ prompt: "a ripe mango on a table", nom: "hero" });
    check("happy → écrit le PNG sous public/generated", writes.length === 1 && /public[\\/]generated[\\/]hero\.png$/.test(writes[0]!.path) && writes[0]!.len === 7);
    check("renvoie le chemin PUBLIC /generated/hero.png", !ok.isError && /\/generated\/hero\.png/.test(ok.text) && /<img/.test(ok.text));

    const { t: t3 } = tool({ fetchImpl: (async () => { throw new Error("down"); }) as unknown as typeof fetch });
    const ko = await t3!.handler({ prompt: "x" });
    check("ComfyUI down → isError + repli chercher_image", ko.isError === true && /chercher_image/.test(ko.text));
  }

  console.log("\n[6] hashString — déterministe");
  {
    check("même entrée → même hash", hashString("abc") === hashString("abc"));
    check("entrées différentes → hash différents", hashString("abc") !== hashString("abd"));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-flux-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
