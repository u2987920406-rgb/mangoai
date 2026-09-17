import { assertSourcesUnchanged } from "./publication-check.js";
// One-click deployment of a generated project to a static host (idea 18).
// Three interchangeable targets, all "build locally → push the dist":
//   - Cloudflare Pages  → https://<project>.pages.dev   (npx wrangler)
//   - Vercel            → https://<project>.vercel.app  (npx vercel)
//   - Netlify           → https://<project>.netlify.app (npx netlify-cli)
// Each target needs a one-time interactive login in server/ (browser OAuth):
//   npx wrangler login | npx vercel login | npx netlify login
// After that, the spawned deploys run non-interactively. No token is stored in
// .env — we lean on the CLI's own credential cache, like the Cloudflare path.
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SERVER_DIR = path.resolve(import.meta.dirname, "..");

export type DeployTarget = "cloudflare" | "vercel" | "netlify";
export const DEPLOY_TARGETS: readonly DeployTarget[] = ["cloudflare", "vercel", "netlify"];

export function isDeployTarget(x: unknown): x is DeployTarget {
  return typeof x === "string" && (DEPLOY_TARGETS as readonly string[]).includes(x);
}

// CI=true keeps the CLIs from opening an interactive browser login from a
// spawned process (they fail fast instead, and we map that to a clear message).
async function run(cmd: string, args: string[], cwd: string, timeoutMs = 180_000): Promise<string> {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd,
    timeout: timeoutMs,
    shell: process.platform === "win32",
    env: { ...process.env, CI: "true" },
    maxBuffer: 16 * 1024 * 1024,
  });
  return `${stdout}\n${stderr}`;
}

// Hosting project/site names: lowercase, alnum + dashes, trimmed, length-capped.
// Cloudflare caps at 58; Vercel/Netlify are looser but this is a safe common floor.
function sanitizeName(name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 58);
  if (!safe) throw new Error("Nom de projet invalide pour un déploiement");
  return safe;
}

// First absolute https URL in a blob of CLI output — Vercel and Netlify both
// print the live URL to stdout; this pulls it out deterministically.
export function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>]+/);
  return m ? m[0].replace(/[.,)]+$/, "") : null;
}

// Maps a raw CLI failure to a clear, actionable French message per target.
function friendly(err: unknown, target: DeployTarget): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const notAuthed =
    /not authenticated|not logged in|no existing credentials|in a non-interactive environment|please run|login|api token|unauthorized|10000/i;
  if (notAuthed.test(msg)) {
    const cmd = { cloudflare: "npx wrangler login", vercel: "npx vercel login", netlify: "npx netlify login" }[target];
    const label = { cloudflare: "Cloudflare", vercel: "Vercel", netlify: "Netlify" }[target];
    return new Error(
      `${label} non connecté — ouvre un terminal, exécute une fois « ${cmd} » dans le dossier server/, puis réessaie.`,
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

// npm run build → dist/, with a sanity check that it produced an entry point.
async function buildDist(dir: string, fingerprint?: string): Promise<string> {
  await run("npm", ["run", "build"], dir);
  const dist = path.join(dir, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    throw new Error("Le build n'a pas produit de dist/index.html");
  }
  if (fingerprint) assertSourcesUnchanged(dir, fingerprint);
  return dist;
}

async function deployCloudflare(dir: string, name: string, fingerprint?: string): Promise<{ url: string }> {
  const project = sanitizeName(name);
  const dist = await buildDist(dir, fingerprint);

  try {
    await run(
      "npx",
      ["wrangler", "pages", "project", "create", project, "--production-branch=main"],
      SERVER_DIR,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already exists/i.test(msg)) throw friendly(err, "cloudflare");
  }

  try {
    await run(
      "npx",
      ["wrangler", "pages", "deploy", dist, `--project-name=${project}`, "--branch=main", "--commit-dirty=true"],
      SERVER_DIR,
      300_000,
    );
  } catch (err) {
    throw friendly(err, "cloudflare");
  }

  return { url: `https://${project}.pages.dev` };
}

async function deployVercel(dir: string, name: string, fingerprint?: string): Promise<{ url: string }> {
  const project = sanitizeName(name);
  const dist = await buildDist(dir, fingerprint);

  // Deploy the prebuilt static dir straight to production. --yes accepts the
  // default project link non-interactively; the .vercel/ link persists in the
  // project dir so re-deploys target the same project. The prod URL is printed
  // to stdout. An optional VERCEL_TOKEN is honoured but never required.
  const args = ["vercel", "deploy", dist, "--prod", "--yes", "--name", project];
  if (process.env.VERCEL_TOKEN?.trim()) args.push("--token", process.env.VERCEL_TOKEN.trim());

  let out: string;
  try {
    out = await run("npx", args, dir, 300_000);
  } catch (err) {
    throw friendly(err, "vercel");
  }
  const url = extractFirstUrl(out);
  if (!url) throw new Error("Vercel n'a pas renvoyé d'URL de déploiement");
  return { url };
}

async function deployNetlify(dir: string, name: string, fingerprint?: string): Promise<{ url: string }> {
  sanitizeName(name); // validate early (Netlify picks the site name itself)
  const dist = await buildDist(dir, fingerprint);

  // --json gives a stable, parseable result ({ deploy_url, url, ... }). A linked
  // site is required: if absent, the CLI errors and friendly() points the user
  // to `npx netlify init`. NETLIFY_AUTH_TOKEN is read automatically if present.
  let out: string;
  try {
    out = await run("npx", ["netlify-cli", "deploy", "--prod", "--dir", dist, "--json"], dir, 300_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/site|link|init/i.test(msg) && !/login|auth|credential/i.test(msg)) {
      throw new Error(
        "Netlify : aucun site lié — exécute une fois « npx netlify init » dans le projet (ou « npx netlify link »), puis réessaie.",
      );
    }
    throw friendly(err, "netlify");
  }
  // The JSON blob is embedded in the CLI output; grab the URL field or fall back.
  const url =
    out.match(/"(?:deploy_)?url"\s*:\s*"(https?:\/\/[^"]+)"/)?.[1] ?? extractFirstUrl(out);
  if (!url) throw new Error("Netlify n'a pas renvoyé d'URL de déploiement");
  return { url };
}

const DEPLOYERS: Record<DeployTarget, (dir: string, name: string, fingerprint?: string) => Promise<{ url: string }>> = {
  cloudflare: deployCloudflare,
  vercel: deployVercel,
  netlify: deployNetlify,
};

export async function deployProject(
  dir: string,
  name: string,
  target: DeployTarget = "cloudflare",
  fingerprint?: string,
): Promise<{ url: string; target: DeployTarget }> {
  if (!isDeployTarget(target)) throw new Error(`Cible de déploiement inconnue : ${target}`);
  const { url } = await DEPLOYERS[target](dir, name, fingerprint);
  return { url, target };
}
