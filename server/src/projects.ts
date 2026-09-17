// Project lifecycle: create from template, list, resolve paths.
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const WORKSPACE_DIR = path.resolve(process.env.MANGOAI_WORKSPACE || path.join(ROOT, "workspace"));
const TEMPLATE_DIR = path.join(ROOT, "server", "template");
const TEMPLATES_DIR = path.join(ROOT, "server", "templates");

// « Dernière activité » d'un projet, pour trier du plus récent au moins récent
// (demande de Raf). On prend le mtime le plus récent entre `.chat-history.json`
// (réécrit à CHAQUE tour de chat → vrai signal d'activité) et le dossier lui-même
// (couvre un projet tout neuf sans encore d'historique). Best-effort : un stat qui
// échoue compte 0. Pur (lecture fs), bon marché (quelques dizaines de projets).
function projectActivityMs(name: string): number {
  const dir = path.join(WORKSPACE_DIR, name);
  let best = 0;
  for (const f of [".chat-history.json", ""]) {
    try {
      best = Math.max(best, fs.statSync(f ? path.join(dir, f) : dir).mtimeMs);
    } catch {
      /* fichier/dossier absent → ignoré */
    }
  }
  return best;
}

/** Tri PUR (testable) : du plus récemment actif au moins récent ; à activité
 * égale, le nom départage (ordre stable et déterministe). */
export function orderByRecency(items: { name: string; ts: number }[]): string[] {
  return [...items]
    .sort((a, b) => b.ts - a.ts || a.name.localeCompare(b.name))
    .map((x) => x.name);
}

/** Projets du workspace, triés du PLUS RÉCEMMENT actif au moins récent. */
export function listProjects(): string[] {
  if (!fs.existsSync(WORKSPACE_DIR)) return [];
  const items = fs
    .readdirSync(WORKSPACE_DIR, { withFileTypes: true })
    // hidden dirs (.skills, ...) are workspace internals, not projects
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ name: e.name, ts: projectActivityMs(e.name) }));
  return orderByRecency(items);
}

export function projectDir(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
  if (!safe) throw new Error("Invalid project name");
  return path.join(WORKSPACE_DIR, safe);
}

export function projectExists(name: string): boolean {
  return fs.existsSync(path.join(projectDir(name), "package.json"));
}

export function deleteProject(name: string): void {
  const dir = projectDir(name);
  if (!fs.existsSync(dir)) throw new Error(`Project "${name}" not found`);
  // maxRetries/retryDelay : sur Windows un fichier que vient de lâcher le dev
  // server reste verrouillé quelques ms (EBUSY/EPERM) — rmSync réessaie au lieu
  // d'échouer du premier coup.
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}

/** Starter templates: each dir under server/templates/ overlays the base template. */
export function listTemplates(): string[] {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/** Copies the base template (+ optional starter overlay) and installs dependencies. */
export async function createProject(name: string, template?: string): Promise<string> {
  const dir = projectDir(name);
  // The dir may pre-exist with only .assets/ in it (attachments uploaded with
  // the very first message) — only a scaffolded project blocks creation.
  if (projectExists(name)) throw new Error(`Project "${name}" already exists`);
  if (template && !listTemplates().includes(template)) {
    throw new Error(`Unknown template "${template}"`);
  }
  fs.cpSync(TEMPLATE_DIR, dir, { recursive: true });
  if (template) {
    const tplDir = path.join(TEMPLATES_DIR, template);
    // Overlay every template file EXCEPT package.json. A wholesale copy of the
    // template's package.json used to clobber the base one — dropping base deps
    // like @tailwindcss/vite/tailwindcss while the inherited vite.config still
    // imports them → vite crashed at boot (the F4 family of broken templates).
    fs.cpSync(tplDir, dir, {
      recursive: true,
      force: true,
      filter: (src) => path.basename(src) !== "package.json",
    });
    // ...then deep-merge the template's package.json ONTO the base one, so the
    // base toolchain (tailwind v4 vite plugin, react…) always survives while the
    // template's deps/scripts are added (template versions win on conflicts).
    const tplPkgPath = path.join(tplDir, "package.json");
    if (fs.existsSync(tplPkgPath)) {
      const basePkgPath = path.join(dir, "package.json");
      const basePkg = JSON.parse(fs.readFileSync(basePkgPath, "utf8")) as PackageJson;
      const tplPkg = JSON.parse(fs.readFileSync(tplPkgPath, "utf8")) as PackageJson;
      fs.writeFileSync(basePkgPath, JSON.stringify(mergePackageJson(basePkg, tplPkg), null, 2) + "\n");
    }
  }
  await run("npm", ["install"], dir);
  return dir;
}

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [k: string]: unknown;
};

/**
 * Deep-merges a template's package.json onto the base one. Base name/version are
 * kept; scripts/dependencies/devDependencies are merged with the template winning
 * on key conflicts; any other top-level template field overrides. Crucially the
 * base deps (@tailwindcss/vite, tailwindcss, react…) are never dropped — this is
 * the root-cause fix for templates that ship their own package.json (F4).
 */
export function mergePackageJson(base: PackageJson, tpl: PackageJson): PackageJson {
  return {
    ...base,
    ...tpl,
    name: base.name ?? tpl.name,
    version: (base.version as string) ?? (tpl.version as string),
    scripts: { ...base.scripts, ...tpl.scripts },
    dependencies: { ...base.dependencies, ...tpl.dependencies },
    devDependencies: { ...base.devDependencies, ...tpl.devDependencies },
  };
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`)),
    );
    proc.on("error", reject);
  });
}
