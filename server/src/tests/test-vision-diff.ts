// Preuve déterministe de la capture avant/après (idée #80) : gating par mode,
// captureDiff (purge au "before", écriture, throw→null, un seul couple conservé),
// safeDiffPath (anti path-traversal). Capture mockée → zéro Playwright.
//
// Lancer :  npx tsx src/test-vision-diff.ts

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  DIFF_DIR_NAME,
  shouldCaptureDiff,
  safeDiffPath,
  captureDiff,
  type DiffDeps,
} from "../vision-diff.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const line = (c = "─") => console.log(c.repeat(64));
const mkdir = () => fs.mkdtempSync(path.join(os.tmpdir(), "diff-"));
const listDiffs = (dir: string) => {
  try {
    return fs.readdirSync(path.join(dir, DIFF_DIR_NAME));
  } catch {
    return [];
  }
};
const fakeCapture: DiffDeps = { capture: async () => Buffer.from([0xff, 0xd8, 0xff]) };

line("═");
console.log("vision-diff — capture avant/après (#80)");
line();

// 1) shouldCaptureDiff ────────────────────────────────────────────────────────
console.log("shouldCaptureDiff :");
check("elite / finition / esthetique → true", shouldCaptureDiff("elite") && shouldCaptureDiff("finition") && shouldCaptureDiff("esthetique"));
check("mvp / nocturne → false", !shouldCaptureDiff("mvp") && !shouldCaptureDiff("nocturne"));

// 2) captureDiff ──────────────────────────────────────────────────────────────
line();
console.log("captureDiff :");
const d1 = mkdir();
const before = await captureDiff(d1, "http://x", "before", 111, fakeCapture);
check("before → fichier before-111.jpg écrit + nom renvoyé", before === "before-111.jpg" && listDiffs(d1).includes("before-111.jpg"));
const after = await captureDiff(d1, "http://x", "after", 111, fakeCapture);
check("after → after-111.jpg écrit (couple complet)", after === "after-111.jpg" && listDiffs(d1).length === 2);

// un nouveau "before" purge l'ancien couple (un seul couple conservé)
const before2 = await captureDiff(d1, "http://x", "before", 222, fakeCapture);
check("nouveau before purge l'ancien couple", before2 === "before-222.jpg" && listDiffs(d1).length === 1 && listDiffs(d1)[0] === "before-222.jpg");

// capture qui throw → null, pas de crash
const boom: DiffDeps = { capture: async () => { throw new Error("navigateur absent"); } };
const failed = await captureDiff(mkdir(), "http://x", "before", 333, boom);
check("capture qui throw → null (best-effort)", failed === null);

// 3) safeDiffPath (anti path-traversal) ───────────────────────────────────────
line();
console.log("safeDiffPath :");
const d2 = mkdir();
check("nom valide before-1.jpg → chemin sous .diffs", (safeDiffPath(d2, "before-1.jpg") ?? "").includes(DIFF_DIR_NAME));
check("traversée '../x.jpg' → null", safeDiffPath(d2, "../x.jpg") === null);
check("sous-chemin 'a/b.jpg' → null", safeDiffPath(d2, "a/b.jpg") === null);
check("extension non .jpg → null", safeDiffPath(d2, "before-1.png") === null);
check("nom vide → null", safeDiffPath(d2, "") === null);

// ── Bilan ─────────────────────────────────────────────────────────────────────
line("═");
if (failures === 0) {
  console.log("✅ vision-diff — toutes les assertions vertes");
} else {
  console.log(`❌ vision-diff — ${failures} assertion(s) en échec`);
  process.exitCode = 1;
}
