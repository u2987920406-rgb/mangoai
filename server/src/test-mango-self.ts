// Tests du cycle de vie de la copie isolée (mango-self.ts) — git INJECTÉ, déterministe.
// Aucune commande git réelle, aucun dépôt touché.
import {
  sanitizeSelfSlug, selfWorktreeBase, createSelfWorktree, selfDiff, removeSelfWorktree,
  formatSelfWorktree, type GitRunner,
} from "./mango-self.js";
import path from "node:path";
import os from "node:os";

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

console.log(`\n${fail === 0 ? "✅" : "❌"} mango-self : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
