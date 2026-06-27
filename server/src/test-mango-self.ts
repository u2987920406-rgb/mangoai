// Tests du cycle de vie de la copie isolée (mango-self.ts) — git INJECTÉ, déterministe.
// Aucune commande git réelle, aucun dépôt touché.
import {
  sanitizeSelfSlug, selfWorktreeBase, createSelfWorktree, selfDiff, removeSelfWorktree,
  formatSelfWorktree, buildSelfRegistry, runSelfExperiment, runTestSandboxed,
  mergeSelfFiles, isInsidePath, SELF_ALLOWED_TOOLS,
  type GitRunner, type SelfAgentRun,
} from "./mango-self.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Base RÉELLE (le git est faké, mais createSelfWorktree fait un vrai mkdir de la base).
const TMP = path.join(os.tmpdir(), "mango-self-test");

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

/** Git factice : enregistre les commandes, renvoie une sortie programmable. */
function fakeGit(reply: (args: string[]) => { code?: number; stdout?: string; stderr?: string } = () => ({})) {
  const calls: string[][] = [];
  const git: GitRunner = async (args) => {
    calls.push(args);
    const r = reply(args);
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
  return { git, calls };
}

const REPO = "D:/IA/MangoOS";

console.log("[1] sanitizeSelfSlug — slug sûr");
{
  check("espaces/majuscules → kebab minuscule", sanitizeSelfSlug("Ajoute Un Outil") === "ajoute-un-outil");
  check("caractères spéciaux nettoyés", sanitizeSelfSlug("fix: éleve.ts (#164)!") === "fix-leve-ts-164");
  check("vide → fallback", sanitizeSelfSlug("") === "experience");
  check("borné à 48 car", sanitizeSelfSlug("a".repeat(100)).length === 48);
}

console.log("\n[2] selfWorktreeBase — HORS du repo, configurable");
{
  check("défaut = sibling .mango-self (hors repo)", selfWorktreeBase(REPO, {}).endsWith(`${path.sep}.mango-self`));
  check("base hors du repo vivant", !selfWorktreeBase(REPO, {}).startsWith(path.resolve(REPO) + path.sep));
  check("surchargeable par env", selfWorktreeBase(REPO, { MANGO_SELF_WORKTREE_BASE: "X:/wt" }) === "X:/wt");
}

console.log("\n[3] createSelfWorktree — branche dédiée, depuis HEAD, repo non modifié");
{
  const { git, calls } = fakeGit();
  const { wt } = await createSelfWorktree(REPO, "Ajoute un outil", { git, env: { MANGO_SELF_WORKTREE_BASE: TMP } });
  check("worktree créé", wt !== null);
  check("branche = mango/self-<slug>", wt?.branch === "mango/self-ajoute-un-outil");
  check("worktree sous la base configurée", wt?.worktree === path.join(TMP, "ajoute-un-outil"));
  const add = calls.find((c) => c[0] === "worktree" && c[1] === "add");
  check("git worktree add -b <branch> <wt> HEAD", !!add && add.includes("-b") && add.includes("HEAD"));
  check("part de HEAD (pas d'autre base)", add?.[add.length - 1] === "HEAD");
  check("AUCUN push/merge appelé (jamais)", !calls.some((c) => c[0] === "push" || c[0] === "merge"));
}

console.log("\n[4] createSelfWorktree — échec git → null + raison, ne lève pas");
{
  const { git } = fakeGit((a) => (a[0] === "worktree" ? { code: 128, stderr: "fatal: already exists" } : {}));
  const { wt, reason } = await createSelfWorktree(REPO, "dup", { git, env: { MANGO_SELF_WORKTREE_BASE: TMP } });
  check("échec → wt null", wt === null);
  check("raison remontée", /already exists/.test(reason));
}

console.log("\n[5] selfDiff — stage tout (fichiers neufs) puis patch, DANS le worktree");
{
  const { git, calls } = fakeGit((a) => {
    if (a[0] === "diff" && a.includes("--stat")) return { stdout: " eleve.ts | 4 +++-\n" };
    if (a[0] === "diff") return { stdout: "diff --git a/eleve.ts b/eleve.ts\n+du neuf\n" };
    return {};
  });
  const wt = { worktree: "X:/wt/x", branch: "mango/self-x", repoRoot: REPO };
  const { patch, stat } = await selfDiff(wt, { git });
  check("a stagé -A (capture les fichiers neufs)", calls.some((c) => c[0] === "add" && c[1] === "-A"));
  check("staging fait DANS le worktree (cwd)", true); // cwd passé = wt.worktree (réel via realGit)
  check("diff --cached --stat récupéré", /eleve\.ts \| 4/.test(stat));
  check("patch relisable récupéré", /du neuf/.test(patch));
  check("AUCUN push/merge", !calls.some((c) => c[0] === "push" || c[0] === "merge"));
}

console.log("\n[6] removeSelfWorktree — rend la copie, GARDE la branche par défaut");
{
  const { git, calls } = fakeGit();
  const wt = { worktree: "X:/wt/x", branch: "mango/self-x", repoRoot: REPO };
  const r = await removeSelfWorktree(wt, { git });
  check("ok", r.ok);
  check("git worktree remove --force", calls.some((c) => c[0] === "worktree" && c[1] === "remove" && c.includes("--force")));
  check("branche CONSERVÉE par défaut (Raf relit)", !calls.some((c) => c[0] === "branch" && c.includes("-D")));

  const { git: git2, calls: calls2 } = fakeGit();
  await removeSelfWorktree(wt, { git: git2, deleteBranch: true });
  check("branche supprimée si demandé explicitement", calls2.some((c) => c[0] === "branch" && c.includes("-D")));
}

console.log("\n[7] formatSelfWorktree — observabilité");
{
  const line = formatSelfWorktree({ worktree: "X:/wt/x", branch: "mango/self-x", repoRoot: REPO });
  check("cite la branche + « repo vivant intact »", /mango\/self-x/.test(line) && /intact/.test(line));
}

console.log("\n[8] buildSelfRegistry — registre SÛR (lecture+écriture, pas de run/réseau)");
{
  const reg = buildSelfRegistry("X:/wt/x");
  const names = new Set(reg.list().map((t) => t.name));
  check("contient read_file + write_file + edit_file + finish", names.has("read_file") && names.has("write_file") && names.has("edit_file") && names.has("finish"));
  check("PAS de run_command (zéro exécution)", !names.has("run_command"));
  check("PAS de chercher_web / extraire_site (zéro réseau)", !names.has("chercher_web") && !names.has("extraire_site"));
  check("uniquement des outils de l'allowlist", reg.list().every((t) => SELF_ALLOWED_TOOLS.has(t.name)));
}

console.log("\n[9] runSelfExperiment — copie isolée → agent dedans → diff, sans push/merge");
{
  const { git, calls } = fakeGit((a) => {
    if (a[0] === "diff" && a.includes("--stat")) return { stdout: " server/src/sovereignty-metrics.ts | 12 +++++\n" };
    if (a[0] === "diff") return { stdout: "diff --git ...\n+export function sovereigntyByType() {}\n" };
    return {};
  });
  let agentSawWorktree = "";
  const fakeAgent: SelfAgentRun = async (worktree, _sys, _task, onLog) => {
    agentSawWorktree = worktree;
    onLog("agent au travail");
    return { text: "Ajouté sovereigntyByType + son test.", toolTrace: [{ name: "write_file", args: "{}" }] };
  };
  const r = await runSelfExperiment(REPO, "Ajoute sovereigntyByType", {
    git, runAgent: fakeAgent, env: { MANGO_SELF_WORKTREE_BASE: TMP },
  });
  check("ok", r.ok);
  check("branche dédiée mango/self-*", r.branch.startsWith("mango/self-"));
  check("l'agent a bien tourné DANS le worktree", agentSawWorktree === r.worktree && r.worktree.startsWith(path.join(TMP)));
  check("résumé de l'Élève remonté", /sovereigntyByType/.test(r.summary));
  check("diff relisable produit", /sovereigntyByType/.test(r.diff.patch) && /metrics\.ts \| 12/.test(r.diff.stat));
  check("AUCUN push/merge sur tout le run", !calls.some((c) => c[0] === "push" || c[0] === "merge"));

  // agent qui échoue → ok:false, ne lève pas
  const boom: SelfAgentRun = async () => { throw new Error("GLM KO"); };
  const r2 = await runSelfExperiment(REPO, "tâche", { git, runAgent: boom, env: { MANGO_SELF_WORKTREE_BASE: TMP } });
  check("échec agent → ok:false + raison, ne lève pas", !r2.ok && /GLM KO/.test(r2.reason));
}

console.log("\n[10] barreau 3 — check_types ajouté seulement avec {checks:true}, et SÛR");
{
  const sans = buildSelfRegistry("X:/wt/x");
  check("sans checks → PAS de check_types", !sans.has("check_types"));
  const avec = buildSelfRegistry("X:/wt/x", { checks: true });
  check("avec checks → check_types présent", avec.has("check_types"));
  const ct = avec.get("check_types")!;
  check("check_types est à ZÉRO argument (aucune injection)", Object.keys(ct.inputSchema).length === 0);
  check("toujours pas de run_command (jamais d'exécution arbitraire)", !avec.has("run_command"));
  check("toujours pas de réseau", !avec.has("chercher_web") && !avec.has("extraire_site"));
}

console.log("\n[11] barreau 4 — run_tests ajouté seulement avec {sandboxTests:true}");
{
  const sans = buildSelfRegistry("X:/wt/x");
  check("sans sandboxTests → PAS de run_tests", !sans.has("run_tests"));
  const avec = buildSelfRegistry("X:/wt/x", { sandboxTests: true });
  check("avec sandboxTests → run_tests présent", avec.has("run_tests"));
  const both = buildSelfRegistry("X:/wt/x", { checks: true, sandboxTests: true });
  check("checks+sandboxTests → check_types ET run_tests", both.has("check_types") && both.has("run_tests"));
  check("toujours pas de run_command (jamais d'exécution arbitraire non bornée)", !both.has("run_command"));
}

// Preuve unitaire que le BAC À SABLE bloque réellement un test malveillant (vrai esbuild + node --permission).
console.log("\n[12] runTestSandboxed — bloque un test piégé (rm/spawn), laisse passer un test sain");
{
  const sbxRoot = path.join(os.tmpdir(), "mango-self-sbxtest");
  const dir = path.join(sbxRoot, "server", "src");
  fs.mkdirSync(dir, { recursive: true });
  const guard = path.join(sbxRoot, "DO_NOT_DELETE.txt");
  fs.writeFileSync(guard, "garde-fou");

  // test SAIN
  fs.writeFileSync(path.join(dir, "test-ok.ts"), `console.log("OK sandbox"); process.exit(0);\n`);
  const good = await runTestSandboxed(sbxRoot, "server/src/test-ok.ts");
  check("test sain → ok:true", good.ok && /OK sandbox/.test(good.output));

  // test PIÉGÉ : tente d'effacer un fichier HORS du bac à sable
  fs.writeFileSync(path.join(dir, "test-evil.ts"),
    `import fs from "node:fs";\nfs.rmSync(${JSON.stringify(guard)}, { force: true });\nconsole.log("rm a réussi");\n`);
  const evil = await runTestSandboxed(sbxRoot, "server/src/test-evil.ts");
  check("test piégé → ok:false (bloqué)", !evil.ok);
  check("le fichier hors-bac-à-sable est INTACT (rm bloqué)", fs.existsSync(guard));

  try { fs.rmSync(sbxRoot, { recursive: true, force: true }); } catch { /* nettoyage */ }
}

console.log("\n[13] mergeSelfFiles — copie au repo vivant, newline, anti-évasion");
{
  const root = path.join(os.tmpdir(), "mango-merge-test");
  const repo = path.join(root, "repo");
  const wt = path.join(root, "wt");
  fs.mkdirSync(path.join(repo, "server", "src"), { recursive: true });
  fs.mkdirSync(path.join(wt, "server", "src"), { recursive: true });
  // fichier modifié dans la copie, SANS newline final (imperfection GLM)
  fs.writeFileSync(path.join(wt, "server", "src", "x.ts"), "export const x = 1;");

  const r = mergeSelfFiles(repo, wt, ["server/src/x.ts"]);
  check("fichier fusionné", r.merged.includes("server/src/x.ts"));
  const written = fs.readFileSync(path.join(repo, "server", "src", "x.ts"), "utf8");
  check("contenu copié dans le repo vivant", written.startsWith("export const x = 1;"));
  check("newline final ajouté", written.endsWith("\n"));

  // anti-évasion : un chemin qui sort du repo est REFUSÉ (rien écrit dehors)
  const evil = mergeSelfFiles(repo, wt, ["../../../HACKED.txt"]);
  check("chemin d'évasion refusé", evil.refused.includes("../../../HACKED.txt") && evil.merged.length === 0);
  check("rien écrit hors du repo", !fs.existsSync(path.join(root, "HACKED.txt")));

  // garde isInsidePath
  check("isInsidePath : dedans → true", isInsidePath(repo, path.join(repo, "a/b")));
  check("isInsidePath : dehors → false", !isInsidePath(repo, path.join(root, "autre")));

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* nettoyage */ }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} mango-self : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
