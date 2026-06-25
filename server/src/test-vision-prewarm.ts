// Tests du pré-chauffage de l'œil (L22). Déterministe, deps injectées (warm/brain
// mockés). On exerce : visionNeedsPrewarm (local oui / cloud non / claude non),
// prewarmVision (local → warm appelé avec le modèle ; cloud → sauté ; VISION_PREWARM=off
// → sauté ; warm qui lève → ne lève jamais).

import { visionNeedsPrewarm, prewarmVision, type PrewarmDeps } from "./vision-prewarm.js";

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

function deps(over: Partial<PrewarmDeps> = {}): { d: PrewarmDeps; calls: { warm: string[] } } {
  const calls = { warm: [] as string[] };
  const d: PrewarmDeps = {
    brain: over.brain ?? (() => ({ provider: "ollama", model: "qwen3-vl:8b" })),
    warm:
      over.warm ??
      (async (model) => {
        calls.warm.push(model);
        return "prêt";
      }),
    now: over.now ?? (() => 0),
    log: over.log ?? (() => {}),
  };
  return { d, calls };
}

async function run() {
  console.log("\n[1] visionNeedsPrewarm (PUR)");
  {
    check("ollama local → true", visionNeedsPrewarm({ provider: "ollama", model: "qwen3-vl:8b" }) === true);
    check("ollama :cloud → false", visionNeedsPrewarm({ provider: "ollama", model: "qwen3.5:cloud" }) === false);
    check("claude → false", visionNeedsPrewarm({ provider: "claude", model: "opus" }) === false);
    check("sans modèle → false", visionNeedsPrewarm({ provider: "ollama" }) === false);
  }

  console.log("\n[2] prewarmVision — local → warm appelé avec le modèle");
  {
    const { d, calls } = deps();
    await prewarmVision(d);
    check("warm appelé 1× avec qwen3-vl:8b", calls.warm.length === 1 && calls.warm[0] === "qwen3-vl:8b");
  }

  console.log("\n[3] prewarmVision — cloud → sauté (pas de cold-load)");
  {
    const { d, calls } = deps({ brain: () => ({ provider: "ollama", model: "qwen3.5:cloud" }) });
    await prewarmVision(d);
    check("warm NON appelé", calls.warm.length === 0);
  }

  console.log("\n[4] prewarmVision — VISION_PREWARM=off → sauté");
  {
    process.env.VISION_PREWARM = "off";
    const { d, calls } = deps();
    await prewarmVision(d);
    delete process.env.VISION_PREWARM;
    check("warm NON appelé quand off", calls.warm.length === 0);
  }

  console.log("\n[5] prewarmVision — warm qui lève → ne lève JAMAIS (best-effort)");
  {
    const { d } = deps({
      warm: async () => {
        throw new Error("ollama down");
      },
    });
    let threw = false;
    try {
      await prewarmVision(d);
    } catch {
      threw = true;
    }
    check("le boot n'est jamais cassé", !threw);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} vision-prewarm : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
