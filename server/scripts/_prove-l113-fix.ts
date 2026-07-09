// Preuve live — correctif L113 : reproduit sur un VRAI dépôt git le scénario
// exact découvert dans le run showcase (2026-07-09) — un commit qui ne touche
// que des fichiers de métadonnées (.backlog.jsonl/.lexique.md) doit être détecté
// comme "pas de code réel changé", tandis qu'un commit qui touche un vrai fichier
// de code (src/App.jsx) doit être détecté comme un vrai changement.
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitDirtyPaths, hasRealCodeChange } from "../src/eleve.js";

const execFileAsync = promisify(execFile);
async function git(dir: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: dir });
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prove-l113-"));
let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
}

try {
  await git(dir, ["init"]);
  await git(dir, ["-c", "user.name=test", "-c", "user.email=t@t.local", "commit", "--allow-empty", "-m", "init"]);

  console.log("Scénario A — reproduction EXACTE du bug L113 (métadonnées seules) :");
  const beforeA = await gitDirtyPaths(dir);
  fs.writeFileSync(path.join(dir, ".backlog.jsonl"), '{"actor":"Élève"}\n');
  fs.writeFileSync(path.join(dir, ".lexique.md"), "# Lexique\n");
  const afterA = await gitDirtyPaths(dir);
  check("gitDirtyPaths voit bien les 2 fichiers", afterA.size === 2);
  check("hasRealCodeChange = FALSE (métadonnées seules, exactement le bug observé)", !hasRealCodeChange(beforeA, afterA));
  await git(dir, ["add", "-A"]);
  await git(dir, ["-c", "user.name=test", "-c", "user.email=t@t.local", "commit", "-m", "métadonnées seules"]);

  console.log("\nScénario B — le Maître écrit du VRAI code (src/App.jsx) :");
  const beforeB = await gitDirtyPaths(dir);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "App.jsx"), "export default function App() { return <div>Photographe</div>; }\n");
  fs.writeFileSync(path.join(dir, ".backlog.jsonl"), '{"actor":"Élève"}\n{"actor":"Maître"}\n', { flag: "a" }); // le backlog change aussi, comme en vrai
  const afterB = await gitDirtyPaths(dir);
  check("hasRealCodeChange = TRUE (src/App.jsx est un vrai fichier de code)", hasRealCodeChange(beforeB, afterB));

  console.log(
    failures === 0
      ? "\n✅ PREUVE : le mécanisme de détection L113 distingue correctement métadonnées seules (faux succès évité) et vrai code (succès légitime)."
      : `\n⚠️ ${failures} assertion(s) échouée(s).`,
  );
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(failures === 0 ? 0 : 1);
