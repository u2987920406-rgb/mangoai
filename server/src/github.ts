// One-click "push this project to GitHub" (idea 16).
// The user provides a personal access token (GITHUB_TOKEN in .env, "repo"
// scope); the owner login is read from the API so nothing else is needed.
// The project already has a per-turn git history (versions.ts) — here we just
// make sure a matching GitHub repo exists and push the local history without overwriting remote commits to
// it (local is the source of truth, like the Cloudflare deploy). The token is
// never written to .git/config: we push through an inline authenticated URL
// and leave a clean, token-less "origin" remote behind for "Open on GitHub".
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureRepo } from "./versions.js";

const execFileAsync = promisify(execFile);
const API = "https://api.github.com";

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN?.trim());
}

function token(): string {
  const t = process.env.GITHUB_TOKEN?.trim();
  if (!t) {
    throw new Error(
      "GitHub non configuré — ajoute GITHUB_TOKEN=<ton token> (scope « repo ») dans server/.env, puis réessaie.",
    );
  }
  return t;
}

// GitHub repo names allow letters, digits, "-", "_" and "." — map anything
// else to a dash, like the Cloudflare Pages sanitizer.
function sanitizeRepoName(name: string): string {
  const safe = name
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  if (!safe) throw new Error("Nom de projet invalide pour un dépôt GitHub");
  return safe;
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "MangoOS",
      ...(init?.headers ?? {}),
    },
  });
}

async function currentUser(): Promise<string> {
  const res = await api("/user");
  if (res.status === 401) {
    throw new Error("Token GitHub invalide ou expiré — vérifie GITHUB_TOKEN dans server/.env.");
  }
  if (!res.ok) throw new Error(`GitHub /user a répondu ${res.status}`);
  const data = (await res.json()) as { login?: string };
  if (!data.login) throw new Error("Impossible de lire le compte GitHub (login absent)");
  return data.login;
}

/** Creates the repo if it doesn't exist yet (private by default). Returns the
 * owner login. Idempotent: an existing repo is reused. */
async function ensureRemoteRepo(repo: string, isPrivate: boolean): Promise<string> {
  const owner = await currentUser();
  const existing = await api(`/repos/${owner}/${repo}`);
  if (existing.ok) return owner;
  if (existing.status !== 404) {
    throw new Error(`GitHub a répondu ${existing.status} en vérifiant le dépôt`);
  }
  const created = await api("/user/repos", {
    method: "POST",
    body: JSON.stringify({ name: repo, private: isPrivate, auto_init: false }),
  });
  if (created.status === 403) {
    throw new Error("Le token GitHub n'a pas le scope « repo » (création de dépôt refusée).");
  }
  if (!created.ok) {
    const detail = await created.text().catch(() => "");
    throw new Error(`Création du dépôt GitHub impossible (${created.status}) ${detail.slice(0, 120)}`);
  }
  return owner;
}

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: dir, timeout: 120_000 });
  return stdout;
}

/** Pushes the project's full git history to GitHub, creating the repo if
 * needed. Returns the repo's web URL.
 * @param targetRepo  Optional override for the GitHub repo name (e.g. "Projet-valid-").
 *                    If omitted, the repo is named after the project. */
export async function pushToGitHub(
  dir: string,
  name: string,
  isPrivate = true,
  targetRepo?: string,
): Promise<{ url: string; repo: string }> {
  // User-supplied targetRepo is used as-is (only illegal chars replaced, no
  // leading/trailing hyphen strip — GitHub allows names ending with "-").
  const repo = targetRepo
    ? targetRepo.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100)
    : sanitizeRepoName(name);
  // The project must have at least one commit to push.
  await ensureRepo(dir);
  const owner = await ensureRemoteRepo(repo, isPrivate);

  // Push through an inline authenticated URL so the token is never persisted
  // in .git/config; "main" is GitHub's default branch.
  const authUrl = `https://x-access-token:${token()}@github.com/${owner}/${repo}.git`;
  try {
    await git(dir, ["push", authUrl, "HEAD:refs/heads/main"]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Never leak the token if it appears in an error message.
    throw new Error(`Push GitHub échoué : ${msg.replaceAll(token(), "***").split("\n")[0]}`);
  }

  // Leave a clean (token-less) origin so the user can pull/manage it normally.
  const cleanUrl = `https://github.com/${owner}/${repo}.git`;
  await git(dir, ["remote", "remove", "origin"]).catch(() => {});
  await git(dir, ["remote", "add", "origin", cleanUrl]).catch(() => {});

  return { url: `https://github.com/${owner}/${repo}`, repo };
}
