// Manages the Vite dev server of the currently previewed generated project.
// One preview at a time, on a FRESH free port each start (see startPreview).
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// Base of the scan range. We never bind this port blindly: findFreePort() walks
// up from here to the first genuinely free port (see the bug note in startPreview).
const PREVIEW_PORT_BASE = Number(process.env.PREVIEW_PORT ?? 5174);

let current: { projectDir: string; proc: ChildProcess; url: string; port: number; configHash: string } | null = null;

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

export function previewStatus() {
  return {
    running: current !== null && current.proc.exitCode === null,
    projectDir: current?.projectDir ?? null,
    url: current?.url ?? null,
  };
}

export async function startPreview(projectDir: string): Promise<{ url: string }> {
  // Fast path: same project, SAME config, process alive AND the server still
  // answers. The health check matters — a process can be alive but its server
  // dead/zombied; without it we'd hand back a URL that renders nothing. The
  // config-hash check matters too: a project regenerated in-place with another
  // framework keeps the same dir but a different vite.config/package.json, and
  // the running server still holds the OLD config in memory → stale preview.
  const fp = configFingerprint(projectDir);
  const configChangedInPlace = current?.projectDir === projectDir && current.configHash !== fp;
  if (
    current &&
    current.projectDir === projectDir &&
    current.proc.exitCode === null &&
    current.configHash === fp
  ) {
    if (await serverAlive(current.url)) return { url: current.url };
  }
  await stopPreview();

  // Framework/deps changed in the same project folder → drop the stale Vite
  // dep-bundle cache so the fresh server doesn't reuse deps for the old framework.
  if (configChangedInPlace) purgeViteCache(projectDir);

  if (!fs.existsSync(path.join(projectDir, "package.json"))) {
    throw new Error(`No package.json in ${projectDir}`);
  }

  // This is the fix for the "preview frozen on the wrong project" bug. The old
  // code pinned a fixed port with --strictPort; when an orphaned preview from a
  // previous backend session (one this process can't kill, and bound on the
  // localhost/IPv6 side where a naive free-port check doesn't see it) kept
  // holding the port, the new vite died on --strictPort while waitForServer was
  // fooled by the orphan's 200 — so the iframe stayed on the old project, for
  // every project, forever.
  //
  // Now we let vite pick its OWN free port (no --strictPort → it walks past any
  // squatted port) and we read the REAL url straight from its stdout. No port
  // guessing, no interface/IPv4-vs-IPv6 mismatch: vite tells us where it landed.
  const proc = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--port", String(PREVIEW_PORT_BASE), "--host", "127.0.0.1"],
    { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" },
  );
  // url is filled in from vite's stdout below.
  current = { projectDir, proc, url: "", port: 0, configHash: fp };

  proc.on("exit", (code) => {
    console.log(`[preview] dev server exited (code ${code})`);
    if (current?.proc === proc) current = null;
  });

  const url = await readViteUrl(proc, 30_000);
  if (current?.proc === proc) {
    const port = Number(new URL(url).port) || PREVIEW_PORT_BASE;
    current = { projectDir, proc, url, port, configHash: fp };
  }
  // A final health check: vite announced the url, make sure it actually serves.
  await waitForServerOrExit(url, proc, 15_000);
  return { url };
}

export async function stopPreview(): Promise<void> {
  if (!current) return;
  const { proc } = current;
  current = null;
  // Best-effort kill — correctness no longer depends on it (the next start uses
  // a different port), this only avoids leaking processes within our own session.
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
