// Tests du cœur #169 — découverte/validation/résolution des briques d'infra back.
// I/O mockée + lecture du VRAI brick.json de la brique 'auth' → prouve que le manifeste est lisible par machine.
import {
  validateBrickManifest,
  normalizeBrickManifest,
  parseBrickManifest,
  listBricks,
  buildAssemblyPlan,
  type BricksIO,
  type BrickManifest,
} from "./backend-bricks.js";
import fs from "node:fs/promises";
import path from "node:path";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// fabrique un manifeste valide minimal, surchargé par `over`
function manifest(over: Partial<BrickManifest> = {}): BrickManifest {
  return normalizeBrickManifest({
    name: "x", title: "X", description: "desc", level: "core",
    files: ["src/x.ts"], mount: { import: "i", use: "u" },
    dependencies: {}, env: [], ...over,
  } as Record<string, unknown>);
}

async function run() {
  console.log("[1] validateBrickManifest — PUR");
  {
    check("objet non-objet → erreur", validateBrickManifest(null).length > 0);
    check("name manquant signalé", validateBrickManifest({ title: "t", description: "d", level: "core", files: ["a"], mount: { import: "i", use: "u" } }).includes("name manquant"));
    check("level invalide signalé", validateBrickManifest({ name: "n", title: "t", description: "d", level: "huh", files: ["a"], mount: { import: "i", use: "u" } }).some((e) => e.includes("level")));
    check("files vide signalé", validateBrickManifest({ name: "n", title: "t", description: "d", level: "core", files: [], mount: { import: "i", use: "u" } }).some((e) => e.includes("files")));
    check("mount manquant signalé", validateBrickManifest({ name: "n", title: "t", description: "d", level: "core", files: ["a"] }).some((e) => e.includes("mount")));
    check("env sans name signalé", validateBrickManifest({ name: "n", title: "t", description: "d", level: "core", files: ["a"], mount: { import: "i", use: "u" }, env: [{ required: true }] }).some((e) => e.includes("env[0].name")));
    check("manifeste minimal valide → 0 erreur", validateBrickManifest({ name: "n", title: "t", description: "d", level: "core", files: ["a"], mount: { import: "i", use: "u" } }).length === 0);
  }

  console.log("\n[2] parseBrickManifest — tolérant");
  {
    check("JSON cassé → erreur, ne lève pas", parseBrickManifest("{not json").manifest === null);
    const r = parseBrickManifest(JSON.stringify({ name: "n", title: "t", description: "d", level: "app", files: ["a"], mount: { import: "i", use: "u" }, dependencies: { express: "^4" }, provides: ["n"] }));
    check("valide → manifeste normalisé", !!r.manifest && r.errors.length === 0);
    check("defaults sûrs (optionalDependencies = {})", !!r.manifest && typeof r.manifest.optionalDependencies === "object");
    check("level app conservé", r.manifest?.level === "app");
  }

  console.log("\n[3] listBricks — I/O injectée");
  {
    const files: Record<string, string> = {
      "/bricks/auth/brick.json": JSON.stringify({ name: "auth", title: "Auth", description: "d", level: "core", files: ["a"], mount: { import: "i", use: "u" }, dependencies: { express: "^4" }, provides: ["auth"] }),
      "/bricks/db/brick.json": "{ broken",
      // 'notes' n'a pas de brick.json → ignoré
    };
    const io: BricksIO = {
      async readdir() { return ["auth", "db", "notes"]; },
      async readFile(p) { if (p in files) return files[p]; throw new Error("ENOENT"); },
    };
    const found = await listBricks("/bricks", io);
    check("découvre auth + db (notes ignoré, pas de manifeste)", found.length === 2);
    check("auth parsé valide", found.find((b) => b.name === "auth")?.manifest?.name === "auth");
    check("db manifeste cassé → errors non vide, manifest null", (found.find((b) => b.name === "db")?.errors.length ?? 0) > 0);
    check("dossier inexistant → liste vide, ne lève pas", (await listBricks("/nope", { async readdir() { throw new Error("ENOENT"); }, async readFile() { throw new Error(""); } })).length === 0);
  }

  console.log("\n[4] buildAssemblyPlan — fusion deps + ordre + requires");
  {
    const auth = manifest({ name: "auth", level: "core", dependencies: { express: "^4.18.2" }, env: [{ name: "AUTH_SECRET", required: true }], provides: ["auth"], mount: { import: "imp-auth", use: "use-auth" } });
    const stripe = manifest({ name: "stripe", level: "app", dependencies: { express: "^4.18.2", stripe: "^16" }, env: [{ name: "STRIPE_KEY", required: true }], requires: ["auth"], mount: { import: "imp-stripe", use: "use-stripe" } });
    const plan = buildAssemblyPlan([stripe, auth]);
    check("ordre core avant app", plan.order[0] === "auth" && plan.order[1] === "stripe");
    check("deps fusionnées (express + stripe)", plan.dependencies.express === "^4.18.2" && plan.dependencies.stripe === "^16");
    check("env dédupliqué (2 entrées)", plan.env.length === 2);
    check("requires satisfait (stripe requiert auth, présent)", plan.missingRequires.length === 0);
    check("mounts dans l'ordre", plan.mounts[0].brick === "auth" && plan.mounts[1].import === "imp-stripe");

    // requires non satisfait
    const lonely = buildAssemblyPlan([stripe]);
    check("requires non satisfait signalé", lonely.missingRequires.some((m) => m.brick === "stripe" && m.requires === "auth"));

    // conflit de version
    const a2 = manifest({ name: "a", dependencies: { express: "^4" } });
    const b2 = manifest({ name: "b", dependencies: { express: "^5" } });
    const conf = buildAssemblyPlan([a2, b2]);
    check("conflit de version détecté", conf.conflicts.some((c) => c.dep === "express" && c.versions.length === 2));
  }

  console.log("\n[5] manifeste RÉEL de la brique auth (preuve machine-lisible)");
  {
    const real = path.resolve("templates/backend/_bricks/auth/brick.json");
    let text = "";
    try { text = await fs.readFile(real, "utf8"); } catch { /* exécuté hors server/ */ }
    if (!text) {
      console.log("  (brick.json auth introuvable depuis ce cwd — lancer depuis server/)");
    } else {
      const { manifest: m, errors } = parseBrickManifest(text);
      check("brick.json auth parse sans erreur", !!m && errors.length === 0);
      check("auth est une brique 'core'", m?.level === "core");
      check("auth déclare AUTH_SECRET requis", !!m?.env.find((e) => e.name === "AUTH_SECRET" && e.required));
      check("auth liste ses 4 fichiers", (m?.files.length ?? 0) === 4);
      check("auth fournit 'auth' + 'requireAuth'", !!m?.provides.includes("auth") && !!m?.provides.includes("requireAuth"));
      const plan = buildAssemblyPlan(m ? [m] : []);
      check("plan d'assemblage auth : express en dépendance", plan.dependencies.express?.startsWith("^4"));
      check("plan d'assemblage auth : argon2 en optionnel", !!plan.optionalDependencies.argon2);
    }
  }

  console.log("\n[6] dossier _bricks RÉEL — la convention passe à 3 briques (auth + db + paiement)");
  {
    const bricksDir = path.resolve("templates/backend/_bricks");
    const io: BricksIO = {
      async readdir(dir) { return fs.readdir(dir); },
      async readFile(p) { return fs.readFile(p, "utf8"); },
    };
    let found: Awaited<ReturnType<typeof listBricks>> = [];
    try { found = await listBricks(bricksDir, io); } catch { /* hors server/ */ }
    if (found.length === 0) {
      console.log("  (dossier _bricks introuvable depuis ce cwd — lancer depuis server/)");
    } else {
      check("découvre auth + db + paiement", ["auth", "db", "paiement"].every((n) => found.some((b) => b.name === n)));
      check("toutes les briques réelles sont valides (0 erreur)", found.every((b) => b.manifest !== null && b.errors.length === 0));
      const manifests = found.map((b) => b.manifest!).filter(Boolean);
      const plan = buildAssemblyPlan(manifests);
      check("plan d'assemblage : 0 conflit de version (express ^4.18.2 partagé)", plan.conflicts.length === 0);
      check("plan d'assemblage : 0 require non satisfait", plan.missingRequires.length === 0);
      check("ordre core avant app (auth/db avant paiement)", plan.order.indexOf("paiement") === plan.order.length - 1);
      check("db fournit 'userStore' (sur quoi auth se branche)", manifests.find((m) => m.name === "db")?.provides.includes("userStore") === true);
      check("paiement fournit 'payments'", manifests.find((m) => m.name === "paiement")?.provides.includes("payments") === true);
    }
  }

  console.log(`\n=== backend-bricks : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
