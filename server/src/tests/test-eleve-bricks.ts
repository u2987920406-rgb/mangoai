// Tests de l'assemblage de briques (#169) — VRAIES briques de templates/backend/_bricks/,
// projet EN MÉMOIRE (aucune écriture disque). Prouve que Mango peut composer son infra seul.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleBricks, listAvailableBricks, type AssembleDeps } from "../eleve-bricks.js";
import { buildEleveBricksTools, type BricksToolDeps } from "../eleve-tools/eleve-bricks-tools.js";
import type { BricksIO } from "../backend-bricks.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const BRICKS_DIR = fileURLToPath(new URL("../../templates/backend/_bricks", import.meta.url));
const realBricksIO: BricksIO = {
  readdir: (dir) => fs.promises.readdir(dir),
  readFile: (p) => fs.promises.readFile(p, "utf8"),
};

// Projet en mémoire (lecture réelle des briques, écriture capturée).
function memProject(seedPkg?: object) {
  const files = new Map<string, string>();
  if (seedPkg) files.set("package.json", JSON.stringify(seedPkg));
  const deps: AssembleDeps = {
    bricksIO: realBricksIO,
    readBrickFile: (rel) => fs.readFileSync(path.join(BRICKS_DIR, rel), "utf8"),
    readProjectFile: (rel) => files.get(rel) ?? null,
    writeProjectFile: (rel, data) => { files.set(rel, data); },
  };
  return { files, deps };
}

async function run() {
  console.log("[1] catalogue — les 5 briques découvertes");
  {
    const cat = await listAvailableBricks(BRICKS_DIR, realBricksIO);
    check("5 briques", cat.length === 5);
    check("auth/db/paiement/securite/RGPD présentes", ["auth", "db", "paiement", "securite", "RGPD"].every((n) => cat.some((b) => b.name === n)));
    check("RGPD déclare requires auth", cat.find((b) => b.name === "RGPD")?.requires.includes("auth") === true);
  }

  console.log("\n[2] assemblage simple — paiement (requires vide)");
  {
    const { files, deps } = memProject();
    const r = await assembleBricks(BRICKS_DIR, ["paiement"], deps);
    check("ok", r.ok && r.errors.length === 0);
    check("aucune brique auto-ajoutée", r.autoAdded.length === 0);
    check("fichiers de paiement copiés", r.written.includes("src/payments.ts") && r.written.includes("src/signature.ts"));
    check("package.json écrit", files.has("package.json"));
    check("deps : express + stripe", !!r.depsAdded.express && !!r.depsAdded.stripe);
    const pkg = JSON.parse(files.get("package.json")!);
    check("package.json contient stripe", !!pkg.dependencies.stripe);
  }

  console.log("\n[3] résolution transitive — RGPD tire auth automatiquement");
  {
    const { files, deps } = memProject();
    const r = await assembleBricks(BRICKS_DIR, ["RGPD"], deps);
    check("ok", r.ok);
    check("auth ajoutée automatiquement", r.autoAdded.includes("auth"));
    check("ordre : auth (core) avant RGPD (app)", r.resolved.indexOf("auth") < r.resolved.indexOf("RGPD"));
    check("fichiers d'auth ET de RGPD écrits", files.has("src/auth.ts") && files.has("src/privacy.ts"));
    check("env cumule AUTH_SECRET + PRIVACY_POLICY_VERSION", r.env.some((e) => e.name === "AUTH_SECRET") && r.env.some((e) => e.name === "PRIVACY_POLICY_VERSION"));
  }

  console.log("\n[4] composition complète + fusion package.json non destructive");
  {
    const { files, deps } = memProject({ name: "mon-api", dependencies: { "mon-lib": "^1.0.0" } });
    const r = await assembleBricks(BRICKS_DIR, ["auth", "db", "securite"], deps);
    check("ok", r.ok);
    check("0 conflit (express ^4.18.2 partagé)", r.errors.length === 0);
    const pkg = JSON.parse(files.get("package.json")!);
    check("dépendance préexistante conservée", pkg.dependencies["mon-lib"] === "^1.0.0");
    check("dépendances des briques ajoutées", !!pkg.dependencies.express);
    check("nom du projet préservé", pkg.name === "mon-api");
    check("snippets de montage rendus pour chaque brique", r.mounts.length === 3);
  }

  console.log("\n[5] erreurs — brique inconnue, sélection vide");
  {
    const { deps } = memProject();
    const bad = await assembleBricks(BRICKS_DIR, ["licorne"], deps);
    check("brique inconnue → ok:false + erreur, rien écrit", !bad.ok && bad.errors.some((e) => e.includes("inconnue")) && bad.written.length === 0);
    const empty = await assembleBricks(BRICKS_DIR, [], deps);
    check("sélection vide → erreur", !empty.ok);
  }

  console.log("\n[6] KernelTool assemble_brique — catalogue, assemblage, confinement");
  {
    const files = new Map<string, string>();
    const toolDeps: BricksToolDeps = {
      bricksDir: BRICKS_DIR,
      io: {
        bricksIO: realBricksIO,
        readBrickFile: (rel) => fs.readFileSync(path.join(BRICKS_DIR, rel), "utf8"),
        readProjectFile: (rel) => files.get(rel) ?? null,
        writeProjectFile: (rel, data) => {
          if (rel.includes("..")) throw new Error("chemin hors du projet"); // confinement simulé
          files.set(rel, data);
        },
      },
    };
    const [tool] = buildEleveBricksTools("/proj", toolDeps);
    check("outil nommé assemble_brique", tool.name === "assemble_brique");

    const cat = await tool.handler({});
    check("sans arg → catalogue (5 briques listées)", !cat.isError && /auth/.test(cat.text) && /RGPD/.test(cat.text));

    const asm = await tool.handler({ briques: ["db"] });
    check("avec briques → assemble + rend le montage", !asm.isError && /Infra assemblée/.test(asm.text) && files.has("src/db.ts"));
    check("le rapport mentionne npm install", /npm install/.test(asm.text));

    const unknown = await tool.handler({ briques: ["fantome"] });
    check("brique inconnue → isError", unknown.isError === true);
  }

  console.log(`\n=== eleve-bricks : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
