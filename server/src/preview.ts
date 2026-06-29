// Manages the Vite dev servers of previewed generated projects.
//
// #138-P2 — APERÇUS SIMULTANÉS : ce module gérait UN seul aperçu à la fois
// (singleton `current`). Pour que l'OS d'apps montre deux apps côte à côte qui se
// synchronisent en live, on tient désormais un POOL borné (`pool`, clé = dossier
// projet résolu), plafonné à MAX_PREVIEWS avec éviction LRU. Chaque app a son
// process Vite sur son PROPRE port (vite marche jusqu'au 1er port libre, pas de
// --strictPort → pas de collision). Le flux mono-aperçu du workspace est inchangé :
// `startPreview(dir)` rend toujours `{url}` ; il n'arrête simplement plus les autres.
//
// Le lancement Vite (spawn + lecture d'URL + health-check) est injectable
// (`PreviewDeps.launch`) pour que la logique du pool soit testable sans process réel.
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// Base of the scan range. We never bind this port blindly: vite walks up from here
// to the first genuinely free port (see the bug note in defaultLaunch).
const PREVIEW_PORT_BASE = Number(process.env.PREVIEW_PORT ?? 5174);
// Combien d'aperçus Vite simultanés au maximum (chacun = un process lourd). Au-delà,
// on évince le moins récemment utilisé (LRU). Borne le coût machine.
const MAX_PREVIEWS = Math.max(1, Number(process.env.MAX_PREVIEWS ?? 3));

/** Un serveur Vite vivant du pool. */
interface LiveServer {
  projectDir: string;
  url: string;
  port: number;
  configHash: string;
  lastUsed: number;
  isAlive: () => Promise<boolean>;
  stop: () => Promise<void>;
}

/** Lanceur d'un serveur Vite : injectable pour les tests (sans spawn réel). */
export type Launcher = (projectDir: string, configHash: string) => Promise<Omit<LiveServer, "lastUsed">>;
export interface PreviewDeps {
  launch?: Launcher;
}

// Le pool, clé = chemin projet résolu (canonique).
const pool = new Map<string, LiveServer>();
const keyOf = (projectDir: string): string => path.resolve(projectDir);

// Fingerprint of the files that decide how Vite behaves. When a project is
// regenerated IN-PLACE with a different framework (e.g. plugin-svelte →
// plugin-vue), vite.config.* and package.json change. The running dev server
// holds the OLD config in memory, so reusing it (fast path) would serve a stale
// preview even though the fresh build is green. Comparing this hash lets us
// detect the change and restart instead. Pure (reads files) → testable.
export function configFingerprint(projectDir: string): string {
  const parts: string[] = [];
  for (const f of ["vite.config.js", "vite.config.ts", "vite.config.mjs", "package.json"]) {
    try {
      parts.push(`${f}:${fs.readFileSync(path.join(projectDir, f), "utf8")}`);
    } catch {
      /* fichier absent → ignoré (un projet n'a pas forcément les deux configs) */
    }
  }
  return crypto.createHash("sha1").update(parts.join("\n")).digest("hex");
}

// Removes Vite's dependency pre-bundle cache. Needed when the framework/deps
// change in-place: even with a fresh process, a stale node_modules/.vite would
// hand back deps optimised for the OLD framework.
function purgeViteCache(projectDir: string): void {
  try {
    fs.rmSync(path.join(projectDir, "node_modules", ".vite"), { recursive: true, force: true });
  } catch {
    /* best effort — absence/erreur de purge ne doit jamais casser le lancement */
  }
}

// ANSI SGR escape codes vite wraps its banner in (color/bold) — stripped before
// we parse the Local url out of stdout.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/** L'aperçu le plus récemment utilisé (rétro-compat : l'ancien `current`). */
function mru(): LiveServer | null {
  let best: LiveServer | null = null;
  for (const s of pool.values()) if (!best || s.lastUsed > best.lastUsed) best = s;
  return best;
}

/** Statut de l'aperçu « actif » (MRU) — forme historique pour les consommateurs existants. */
export function previewStatus() {
  const s = mru();
  return { running: s !== null, projectDir: s?.projectDir ?? null, url: s?.url ?? null };
}

/** Tous les aperçus vivants (pour la surface « aperçus simultanés »). */
export function previewList(): { projectDir: string; url: string; port: number }[] {
  return [...pool.values()]
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .map((s) => ({ projectDir: s.projectDir, url: s.url, port: s.port }));
}

/** Un aperçu tourne-t-il déjà pour ce projet ? (garde-fous suppression/agent occupé). */
export function isPreviewing(projectDir: string): boolean {
  return pool.has(keyOf(projectDir));
}

/** Évince le moins récemment utilisé tant que le pool est plein (en faisant de la place). */
async function evictToFit(): Promise<void> {
  while (pool.size >= MAX_PREVIEWS) {
    let victimKey: string | null = null;
    let oldest = Infinity;
    for (const [k, s] of pool) {
      if (s.lastUsed < oldest) { oldest = s.lastUsed; victimKey = k; }
    }
    if (victimKey === null) break;
    const victim = pool.get(victimKey)!;
    pool.delete(victimKey);
    await victim.stop();
  }
}

export async function startPreview(projectDir: string, deps: PreviewDeps = {}): Promise<{ url: string }> {
  const launch = deps.launch ?? defaultLaunch;
  const key = keyOf(projectDir);
  const fp = configFingerprint(projectDir);
  const existing = pool.get(key);

  // Fast path : même projet, MÊME config, process vivant ET le serveur répond
  // encore. Le health-check compte (un process vivant peut héberger un serveur
  // mort/zombi) ; le hash de config compte aussi (projet régénéré en place avec un
  // autre framework → même dossier mais vite.config/package.json différents → le
  // serveur en cours tient l'ANCIENNE config en mémoire → aperçu périmé).
  if (existing && existing.configHash === fp && (await existing.isAlive())) {
    existing.lastUsed = Date.now();
    return { url: existing.url };
  }

  // Entrée présente mais inutilisable (config changée en place, ou serveur mort) :
  // on l'arrête et, si la config a changé, on purge le cache de deps Vite périmé.
  if (existing) {
    pool.delete(key);
    await existing.stop();
    if (existing.configHash !== fp) purgeViteCache(projectDir);
  }

  // Fait de la place AVANT de lancer (n'évince jamais l'app qu'on relance, déjà retirée).
  await evictToFit();

  const server = await launch(projectDir, fp);
  pool.set(key, { ...server, lastUsed: Date.now() });
  return { url: server.url };
}

/** Arrête UN aperçu (par dossier) ou TOUS (sans argument — « repartir propre »). */
export async function stopPreview(projectDir?: string): Promise<void> {
  if (projectDir !== undefined) {
    const key = keyOf(projectDir);
    const s = pool.get(key);
    if (!s) return;
    pool.delete(key);
    await s.stop();
    return;
  }
  const all = [...pool.values()];
  pool.clear();
  await Promise.all(all.map((s) => s.stop()));
}

// ─── Lanceur Vite réel (par défaut) ──────────────────────────────────────────

/** Le binaire `vite` est-il installé localement ? (node_modules/.bin/vite[.cmd]) */
function viteInstalled(projectDir: string): boolean {
  const bin = path.join(projectDir, "node_modules", ".bin", "vite");
  return fs.existsSync(bin) || fs.existsSync(bin + ".cmd");
}

// Dédoublonnage + sérialisation des installs. Effacer les node_modules (pour la place)
// puis ouvrir plusieurs projets d'un coup déclencherait plusieurs `npm install`
// concurrents qui se corrompent l'un l'autre (TAR_ENTRY_ERROR → node_modules cassé).
// On garantit : (1) un projet n'est jamais installé deux fois en parallèle (dédup par
// clé), (2) un seul `npm install` tourne à la fois sur toute la machine (chaîne globale).
const installInFlight = new Map<string, Promise<void>>();
let installChain: Promise<void> = Promise.resolve();

/** Lance réellement `npm install` dans un projet. Best-effort, ne rejette jamais. */
function runNpmInstall(projectDir: string, timeoutMs: number): Promise<void> {
  console.log(`[preview] node_modules absent → npm install dans ${path.basename(projectDir)} …`);
  return new Promise((resolve) => {
    const proc = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"], {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    proc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[preview:install] ${d}`));
    proc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[preview:install] ${d}`));
    const timer = setTimeout(() => {
      if (proc.pid) {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
        else proc.kill("SIGKILL");
      }
    }, timeoutMs);
    const finish = () => { clearTimeout(timer); resolve(); };
    proc.on("error", finish);
    proc.on("exit", (code) => { console.log(`[preview] npm install terminé (code ${code})`); finish(); });
  });
}

/**
 * Installe les dépendances si elles manquent (node_modules/vite absent), à la 1ʳᵉ
 * ouverture du projet — DÉDUPLIQUÉ par projet et SÉRIALISÉ globalement (jamais deux
 * installs en même temps → plus de corruption TAR). Opt-out PREVIEW_AUTO_INSTALL=off.
 */
function ensurePreviewDeps(projectDir: string, timeoutMs = 180_000): Promise<void> {
  if (process.env.PREVIEW_AUTO_INSTALL === "off") return Promise.resolve();
  if (viteInstalled(projectDir)) return Promise.resolve();
  if (!fs.existsSync(path.join(projectDir, "package.json"))) return Promise.resolve();

  const key = keyOf(projectDir);
  const inFlight = installInFlight.get(key);
  if (inFlight) return inFlight; // même projet déjà en cours → on attend le même install

  // On s'accroche à la chaîne globale : un seul npm install à la fois sur la machine.
  const p = installChain
    .catch(() => {}) // un échec précédent ne bloque jamais la file
    .then(() => {
      if (viteInstalled(projectDir)) return; // installé entre-temps par un autre appel
      return runNpmInstall(projectDir, timeoutMs);
    })
    .finally(() => { installInFlight.delete(key); });
  installInFlight.set(key, p);
  installChain = p;
  return p;
}

const defaultLaunch: Launcher = async (projectDir, configHash) => {
  if (!fs.existsSync(path.join(projectDir, "package.json"))) {
    throw new Error(`No package.json in ${projectDir}`);
  }

  // Deps absentes (purge nocturne) → réinstalle avant de lancer Vite, sinon
  // `npm run dev` échoue (« vite introuvable ») et l'aperçu reste blanc.
  await ensurePreviewDeps(projectDir);

  // This is the fix for the "preview frozen on the wrong project" bug. The old
  // code pinned a fixed port with --strictPort; when an orphaned preview from a
  // previous backend session kept holding the port, the new vite died on
  // --strictPort while waitForServer was fooled by the orphan's 200. Now we let
  // vite pick its OWN free port (no --strictPort → it walks past any squatted
  // port) and we read the REAL url straight from its stdout. This is ALSO what
  // makes simultaneous previews work: a 2nd vite started at the same base port
  // walks up to the next free one on its own.
  const proc = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--port", String(PREVIEW_PORT_BASE), "--host", "127.0.0.1"],
    { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" },
  );

  // Si le process meurt, retirer son entrée du pool (par identité, pour ne pas
  // évincer un remplaçant relancé entre-temps sur la même clé).
  const key = keyOf(projectDir);
  proc.on("exit", (code) => {
    console.log(`[preview] dev server exited (code ${code})`);
    const s = pool.get(key);
    if (s && s.stop === stopThis) pool.delete(key);
  });

  const url = await readViteUrl(proc, 30_000);
  const port = Number(new URL(url).port) || PREVIEW_PORT_BASE;
  // A final health check: vite announced the url, make sure it actually serves.
  await waitForServerOrExit(url, proc, 15_000);

  async function stopThis(): Promise<void> {
    if (proc.exitCode === null) {
      if (process.platform === "win32" && proc.pid) {
        // Kill the whole tree on Windows (npm spawns vite as a child).
        spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        proc.kill("SIGTERM");
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    projectDir,
    url,
    port,
    configHash,
    isAlive: async () => proc.exitCode === null && (await serverAlive(url)),
    stop: stopThis,
  };
};

// Reads the actual dev-server url from vite's stdout (the "➜  Local: http://…"
// line), forwarding every line to our log meanwhile. This is the source of
// truth for where the preview really is — whatever port vite picked after
// walking past any squatted ones. Rejects if vite dies or stays silent.
function readViteUrl(proc: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    // Vite colorizes its output AND splits the port digits with escape codes
    // (e.g. "http://127.0.0.1:\x1b[1m5175\x1b[22m/"), so we accumulate the raw
    // stream and strip ANSI off the whole buffer before matching — robust to
    // escape codes straddling chunk boundaries.
    let raw = "";
    const onChunk = (d: Buffer) => {
      const s = d.toString();
      process.stdout.write(`[preview] ${s}`);
      raw += s;
      const clean = raw.replace(ANSI, "");
      const m = clean.match(/Local:\s+(https?:\/\/[^\s/]+)/i);
      if (m) finish(() => resolve(m[1]));
    };
    proc.stdout?.on("data", onChunk);
    proc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[preview] ${d}`));
    proc.once("exit", (code) =>
      finish(() => reject(new Error(`Preview server exited before announcing its url (code ${code})`))),
    );
    const timer = setTimeout(
      () => finish(() => reject(new Error(`Preview server gave no url within ${timeoutMs / 1000}s`))),
      timeoutMs,
    );
  });
}

async function serverAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// Polls `url` until it answers, but aborts the moment the child process exits —
// so a vite that fails to boot surfaces as an error in ~instant time instead of
// a 30 s wait that might be fooled by a leftover server.
async function waitForServerOrExit(
  url: string,
  proc: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`Preview server exited before becoming ready (code ${proc.exitCode})`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Preview server did not start within ${timeoutMs / 1000}s`);
}
