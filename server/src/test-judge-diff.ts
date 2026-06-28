// Tests de gitFileDiff (L21). PUR : le runner git est injecté (aucun git réel).

import { gitFileDiff, type GitRun } from "./judge-diff.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("\n[1] diff non vide → renvoyé (trimmé)");
{
  const run: GitRun = (_d, args) =>
    args.join(" ") === "diff HEAD -- src/App.jsx" ? "\n@@ -1 +1 @@\n-a\n+b\n" : null;
  const d = gitFileDiff("/proj", "src/App.jsx", run);
  check("patch renvoyé", d === "@@ -1 +1 @@\n-a\n+b");
}

console.log("\n[2] diff vide → null (nouveau / inchangé)");
{
  const run: GitRun = () => "   \n  ";
  check("vide → null", gitFileDiff("/proj", "x.jsx", run) === null);
}

console.log("\n[3] run renvoie null (pas un dépôt / git absent) → null");
{
  const run: GitRun = () => null;
  check("null → null", gitFileDiff("/proj", "x.jsx", run) === null);
}

console.log("\n[4] passe les bons arguments à git (-C dir, diff HEAD -- rel)");
{
  let captured: { dir: string; args: string[] } | null = null;
  const run: GitRun = (dir, args) => { captured = { dir, args }; return "patch"; };
  gitFileDiff("/mon/projet", "src/lib/x.ts", run);
  check("projectDir transmis", captured!.dir === "/mon/projet");
  check("args = diff HEAD -- <rel>", captured!.args.join(" ") === "diff HEAD -- src/lib/x.ts");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} judge-diff : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
