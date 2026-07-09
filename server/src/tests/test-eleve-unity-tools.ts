// Tests des outils Unity de l'Élève (Phase 3a). Deps injectées : pas de CLI Unity réel.
// On exerce : forme des outils, message honnête quand UNITY_PATH absent, build vert/cassé,
// tests verts/rouges, timeout, et « ne lève jamais ».

import { buildEleveUnityTools, type UnityToolDeps } from "../eleve-tools/eleve-unity-tools.js";

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

function tools(over: Partial<UnityToolDeps> = {}) {
  const deps: UnityToolDeps = {
    binary: over.binary ?? (() => "C:/Unity/Unity.exe"),
    run: over.run ?? (async () => ({ code: 0, out: "ok", timedOut: false })),
  };
  const [build, test] = buildEleveUnityTools("/proj", deps);
  return { build, test };
}

async function run() {
  console.log("\n[1] Forme");
  {
    const { build, test } = tools();
    check("unity_build présent", build.name === "unity_build");
    check("unity_test présent", test.name === "unity_test");
    check("build : schéma buildTarget", "buildTarget" in build.inputSchema);
    check("test : schéma testPlatform", "testPlatform" in test.inputSchema);
  }

  console.log("\n[2] UNITY_PATH absent → message honnête (isError, pas de faux succès)");
  {
    const { build, test } = tools({ binary: () => null });
    const rb = await build.handler({});
    const rt = await test.handler({});
    check("build → isError + parle d'UNITY_PATH", rb.isError === true && /UNITY_PATH/.test(rb.text));
    check("test → isError + parle d'UNITY_PATH", rt.isError === true && /UNITY_PATH/.test(rt.text));
  }

  console.log("\n[3] Build vert / cassé / timeout");
  {
    const ok = await tools({ run: async () => ({ code: 0, out: "Build succeeded", timedOut: false }) }).build.handler({});
    check("code 0 → BUILD UNITY VERT", ok.isError !== true && /VERT/.test(ok.text));

    const ko = await tools({ run: async () => ({ code: 1, out: "error CS1002", timedOut: false }) }).build.handler({});
    check("code 1 → isError + détail compilation", ko.isError === true && /CS1002/.test(ko.text));

    const to = await tools({ run: async () => ({ code: -1, out: "...", timedOut: true }) }).build.handler({});
    check("timeout → isError", to.isError === true && /TIMEOUT/.test(to.text));
  }

  console.log("\n[4] buildTarget passé au CLI");
  {
    let captured = "";
    const { build } = tools({ run: async (cmd) => ((captured = cmd), { code: 0, out: "", timedOut: false }) });
    await build.handler({ buildTarget: "Android" });
    check("buildTarget Android dans la commande", /-buildTarget Android/.test(captured));
    const { build: b2 } = tools({ run: async (cmd) => ((captured = cmd), { code: 0, out: "", timedOut: false }) });
    await b2.handler({});
    check("défaut StandaloneWindows64", /-buildTarget StandaloneWindows64/.test(captured));
  }

  console.log("\n[5] Tests verts / rouges + plateforme");
  {
    const ok = await tools({ run: async () => ({ code: 0, out: "All passed", timedOut: false }) }).test.handler({ testPlatform: "PlayMode" });
    check("tests verts → VERTS + plateforme", ok.isError !== true && /VERTS/.test(ok.text) && /PlayMode/.test(ok.text));
    const ko = await tools({ run: async () => ({ code: 2, out: "1 failed", timedOut: false }) }).test.handler({});
    check("tests rouges → isError", ko.isError === true && /ROUGES/.test(ko.text));
  }

  console.log("\n[6] Ne lève jamais (run qui throw)");
  {
    let threw = false;
    try {
      const r = await tools({
        run: async () => {
          throw new Error("spawn EACCES");
        },
      }).build.handler({});
      check("retourne isError au lieu de lever", r.isError === true && /EACCES/.test(r.text));
    } catch {
      threw = true;
    }
    check("handler ne propage pas l'exception", !threw);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-unity-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
