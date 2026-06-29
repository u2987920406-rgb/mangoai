// Tests de l'abstraction de domaine (Phase 3a). Crée des projets factices en tempdir
// (marqueurs web vs Unity), exerce resolveDomain (gates + forçage), et inspectUnity /
// inspectByDomain SANS Unity réel (UNITY_PATH absent → message honnête, jamais de faux ok).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { webDomain, unityDomain, godotDomain, resolveDomain, inspectUnity, inspectGodot, inspectByDomain, unityBinary, godotBinary } from "./domains.js";

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

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mango-domain-"));
}
function webProject(): string {
  const d = tmp();
  fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: "x", scripts: { build: "vite build" } }));
  return d;
}
function unityProject(): string {
  const d = tmp();
  fs.mkdirSync(path.join(d, "ProjectSettings"), { recursive: true });
  fs.writeFileSync(path.join(d, "ProjectSettings", "ProjectVersion.txt"), "m_EditorVersion: 6000.0.23f1\n");
  return d;
}
function godotProject(): string {
  const d = tmp();
  fs.writeFileSync(path.join(d, "project.godot"), 'config_version=5\n\n[application]\nconfig/name="X"\n');
  return d;
}

function withEnv(over: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(over)) {
    saved[k] = process.env[k];
    if (over[k] === undefined) delete process.env[k];
    else process.env[k] = over[k];
  }
  const restore = () => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  const r = fn();
  return r instanceof Promise ? r.finally(restore) : (restore(), Promise.resolve());
}

async function run() {
  console.log("\n[1] Détection des marqueurs");
  {
    const web = webProject();
    const uni = unityProject();
    check("web détecté par package.json", webDomain.detect(web));
    check("unity détecté par ProjectVersion.txt", unityDomain.detect(uni));
    check("web non détecté comme unity", !unityDomain.detect(web));
    check("unity non détecté comme web (pas de package.json)", !webDomain.detect(uni));
  }

  console.log("\n[2] resolveDomain — gates");
  {
    const uni = unityProject();
    const web = webProject();
    await withEnv({ ELEVE_UNITY: undefined, MANGOOS_DOMAIN: undefined }, () => {
      check("unity NON activé (ELEVE_UNITY absent) → web par défaut", resolveDomain(uni).id === "web");
      check("web reste web", resolveDomain(web).id === "web");
    });
    await withEnv({ ELEVE_UNITY: "on", MANGOOS_DOMAIN: undefined }, () => {
      check("unity activé + détecté → unity", resolveDomain(uni).id === "unity");
      check("projet web (pas de marqueur unity) reste web même si gate on", resolveDomain(web).id === "web");
    });
  }

  console.log("\n[3] resolveDomain — forçage MANGOOS_DOMAIN");
  {
    const web = webProject();
    await withEnv({ MANGOOS_DOMAIN: "unity", ELEVE_UNITY: undefined }, () => {
      check("MANGOOS_DOMAIN=unity force unity même sans détection", resolveDomain(web).id === "unity");
    });
    await withEnv({ MANGOOS_DOMAIN: "inconnu" }, () => {
      check("domaine forcé inconnu → retombe sur web", resolveDomain(web).id === "web");
    });
  }

  console.log("\n[4] unityBinary + inspectUnity sans Unity installé");
  {
    const uni = unityProject();
    await withEnv({ UNITY_PATH: undefined }, async () => {
      check("unityBinary null sans UNITY_PATH", unityBinary() === null);
      const insp = await inspectUnity(uni);
      check("inspectUnity ne ment pas (ok=false)", insp.ok === false);
      check("message explicite UNITY_PATH", /UNITY_PATH/.test(insp.detail));
    });
  }

  console.log("\n[5] inspectByDomain — route vers le bon domaine");
  {
    const uni = unityProject();
    await withEnv({ ELEVE_UNITY: "on", UNITY_PATH: undefined, MANGOOS_DOMAIN: undefined }, async () => {
      const r = await inspectByDomain(uni);
      check("projet unity → domain=unity", r.domain === "unity");
      check("sans binaire → ok=false (pas de faux vert)", r.ok === false);
    });
    // Le chemin WEB reste délégué à inspectProject : un dossier vide (pas de package.json)
    // est traité comme un projet web cassé (no-package), PAS comme unity.
    const empty = tmp();
    await withEnv({ ELEVE_UNITY: "on", MANGOOS_DOMAIN: undefined }, async () => {
      const r = await inspectByDomain(empty);
      check("dossier sans marqueur → domain=web", r.domain === "web");
      check("web vide → no-package", r.signal === "no-package");
    });
  }

  console.log("\n[6] Domaine Godot — détection, gate, inspectGodot sans GODOT_PATH");
  {
    const g = godotProject();
    check("godot détecté par project.godot", godotDomain.detect(g));
    check("web non détecté comme godot", !godotDomain.detect(webProject()));
    await withEnv({ ELEVE_GODOT: undefined, MANGOOS_DOMAIN: undefined, ELEVE_UNITY: undefined }, () => {
      check("godot NON activé → web par défaut", resolveDomain(g).id === "web");
    });
    await withEnv({ ELEVE_GODOT: "on", MANGOOS_DOMAIN: undefined, ELEVE_UNITY: undefined }, async () => {
      check("godot activé + détecté → godot", resolveDomain(g).id === "godot");
      await withEnv({ GODOT_PATH: undefined }, async () => {
        check("godotBinary null sans GODOT_PATH", godotBinary() === null);
        const insp = await inspectGodot(g);
        check("inspectGodot sans binaire → ok=false + message GODOT_PATH", insp.ok === false && /GODOT_PATH/.test(insp.detail));
      });
      const r = await inspectByDomain(g, { timeoutMs: 5000 });
      check("inspectByDomain route vers godot", r.domain === "godot");
    });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} domains : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
