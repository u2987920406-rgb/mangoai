// Démonstration de la MOITIÉ DROITE du Jalon D :
//   executeContract (executor.ts)  +  inspectProject (inspection.ts)
//
//   Étage 1 — Exécuteur, déterministe (dossier temporaire, sans npm) :
//             write / edit / run + les garde-fous (chemin hors projet, find
//             ambigu, commande interdite).
//   Étage 2 — Boucle complète sur un VRAI projet Vite (copie de test-pipeline
//             avec node_modules en jonction = pas de copie lourde) :
//             vert → on casse via le contrat → l'inspection le détecte
//             (signal d'ESCALADE) → on répare via le contrat → vert à nouveau.
//
// Lancer :  npx tsx src/test-jalon-d.ts
//           npx tsx src/test-jalon-d.ts --unit   (étage 1 seul, instantané)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { executeContract } from "./executor.js";
import { inspectProject } from "./inspection.js";
import type { Action } from "./contract.js";

const UNIT_ONLY = process.argv.includes("--unit");
import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

// ─────────────────────────────────────────────────────────────────────────
// ÉTAGE 1 — Exécuteur déterministe
// ─────────────────────────────────────────────────────────────────────────
async function stage1(): Promise<void> {
  line("═");
  console.log("ÉTAGE 1 — executeContract (déterministe, dossier temporaire)");
  line();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-exec-"));
  try {
    // a) write puis edit puis run inoffensif, dans l'ordre
    const plan: Action[] = [
      { kind: "write", path: "src/greet.js", content: "export const greet = (n) => `Salut ${n}`;\n" },
      { kind: "edit", path: "src/greet.js", find: "Salut", replace: "Bonjour" },
      { kind: "run", command: 'node -e "console.log(1+1)"' },
    ];
    const r = await executeContract(plan, dir);
    check("plan write+edit+run → ok", r.ok && r.applied === 3);
    const written = fs.readFileSync(path.join(dir, "src/greet.js"), "utf8");
    check("fichier réellement écrit sur disque", fs.existsSync(path.join(dir, "src/greet.js")));
    check("edit appliqué (Salut → Bonjour)", written.includes("Bonjour") && !written.includes("Salut"));

    // b) garde-fou : edit dont le <find> n'existe pas → échec + arrêt
    const r2 = await executeContract(
      [{ kind: "edit", path: "src/greet.js", find: "INEXISTANT", replace: "x" }],
      dir,
    );
    check("edit <find> introuvable → rejet", !r2.ok && r2.applied === 0);

    // c) garde-fou : chemin hors projet (défense en profondeur) → échec
    const r3 = await executeContract(
      [{ kind: "write", path: "../../evil.js", content: "x" }],
      dir,
    );
    check("write chemin hors projet → bloqué", !r3.ok);
    check("aucun fichier créé hors du bac à sable", !fs.existsSync(path.join(dir, "..", "..", "evil.js")));

    // d) garde-fou : commande interdite → échec
    const r4 = await executeContract([{ kind: "run", command: "rm -rf ~/" }], dir);
    check("commande destructrice → interdite", !r4.ok);

    // e) arrêt à la première erreur : action 2 casse, action 3 non appliquée
    const r5 = await executeContract(
      [
        { kind: "write", path: "a.txt", content: "ok" },
        { kind: "edit", path: "manquant.txt", find: "x", replace: "y" },
        { kind: "write", path: "b.txt", content: "ne doit pas exister" },
      ],
      dir,
    );
    check("arrêt à la 1ʳᵉ erreur (b.txt jamais écrit)", !r5.ok && !fs.existsSync(path.join(dir, "b.txt")));

    // f) (Un, 2026-07-03) U2 — env restreint : un secret posé dans process.env du
    //    serveur ne doit PAS être visible d'une commande <run>. La commande sort
    //    en code 1 si elle voit la clé → executeContract doit rester ok (exit 0).
    process.env["ELEVE_API_KEY_TEST_LEAK"] = "sk-secret-ne-doit-pas-fuiter";
    try {
      const r6 = await executeContract(
        [{ kind: "run", command: 'node -e "process.exit(process.env.ELEVE_API_KEY_TEST_LEAK ? 1 : 0)"' }],
        dir,
      );
      check("env restreint : le secret ne fuit pas dans <run>", r6.ok);
    } finally {
      delete process.env["ELEVE_API_KEY_TEST_LEAK"];
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true }); // pas de node_modules ici → sûr
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ÉTAGE 2 — Boucle complète sur un vrai projet Vite
// ─────────────────────────────────────────────────────────────────────────
const SOURCE = path.resolve(process.cwd(), "..", "workspace", "test-pipeline");

function copyProject(src: string, dest: string): void {
  // Copie tout SAUF node_modules, dist, .git (lourd/inutile pour le build).
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (s) => {
      const rel = path.relative(src, s);
      return !/(^|[\\/])(node_modules|dist|\.git)([\\/]|$)/.test(rel);
    },
  });
}

function junctionNodeModules(src: string, dest: string): boolean {
  const target = path.join(src, "node_modules");
  const link = path.join(dest, "node_modules");
  try {
    fs.symlinkSync(target, link, "junction"); // Windows: jonction, pas de copie
    return true;
  } catch {
    return false;
  }
}

function removeJunction(link: string): void {
  // `rmdir` (cmd) retire UNIQUEMENT le lien de jonction, jamais sa cible.
  if (process.platform === "win32") spawnSync("cmd", ["/c", "rmdir", link]);
  else fs.unlinkSync(link);
}

async function stage2(): Promise<void> {
  line("═");
  console.log("ÉTAGE 2 — boucle Élève complète (vrai build Vite)");
  line();
  if (!fs.existsSync(SOURCE)) {
    console.log(`  ⚠ projet source introuvable : ${SOURCE} — étage 2 sauté`);
    return;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-loop-"));
  const nmLink = path.join(dir, "node_modules");
  let junctioned = false;
  try {
    copyProject(SOURCE, dir);
    junctioned = junctionNodeModules(SOURCE, dir);
    if (!junctioned) {
      console.log("  ⚠ jonction node_modules impossible — étage 2 sauté");
      return;
    }

    const appPath = path.join(dir, "src", "App.jsx");
    const original = fs.readFileSync(appPath, "utf8");

    // 1) Référence : le projet compile au départ
    console.log("\n  [1] Inspection initiale (doit être verte)…");
    const base = await inspectProject(dir, { timeoutMs: 120_000 });
    check(`build initial OK (signal=${base.signal}, ${(base.durationMs / 1000).toFixed(1)}s)`, base.ok);

    // 2) L'« Élève » propose un patch CASSÉ (JSX invalide) → exécuté
    console.log("\n  [2] L'Élève écrit un patch cassé (via le contrat)…");
    const broken = original.replace("export default function App() {", "export default function App( {"); // parenthèse cassée
    const exec1 = await executeContract([{ kind: "write", path: "src/App.jsx", content: broken }], dir);
    check("patch cassé appliqué sur disque", exec1.ok);

    // 3) L'inspection objective DOIT détecter la casse → signal d'escalade
    console.log("\n  [3] Inspection après patch cassé (doit échouer)…");
    const bad = await inspectProject(dir, { timeoutMs: 120_000 });
    check(`build cassé détecté (signal=${bad.signal})`, !bad.ok && bad.signal === "build-failed");
    console.log(`      → ESCALADE vers le Maître (Claude) déclenchée par un signal OBJECTIF.`);

    // 4) Réparation via le contrat (ici on restaure ; en réel = patch de Claude)
    console.log("\n  [4] Réparation (via le contrat)…");
    const exec2 = await executeContract([{ kind: "write", path: "src/App.jsx", content: original }], dir);
    check("réparation appliquée", exec2.ok);

    // 5) L'inspection revalide → vert : pas besoin du Maître plus longtemps
    console.log("\n  [5] Inspection après réparation (doit redevenir verte)…");
    const fixed = await inspectProject(dir, { timeoutMs: 120_000 });
    check(`build OK à nouveau (signal=${fixed.signal})`, fixed.ok);
  } finally {
    // Nettoyage SÛR : retirer la jonction AVANT toute suppression récursive,
    // sinon on risquerait d'effacer le vrai node_modules de test-pipeline.
    if (junctioned) removeJunction(nmLink);
    if (!fs.existsSync(nmLink)) {
      fs.rmSync(dir, { recursive: true, force: true });
    } else {
      console.log(`  ⚠ jonction encore présente — dossier temp laissé en place : ${dir}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
(async () => {
  await stage1();
  if (!UNIT_ONLY) await stage2();
  line("═");
  if (failures === 0) {
    console.log("✅ Jalon D moitié droite : exécuteur + inspection PROUVÉS de bout en bout.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} vérification(s) en échec.`);
    process.exit(1);
  }
})();
