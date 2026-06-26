// Balayage des aperçus orphelins au boot du backend.
//
// LE PROBLÈME — Les aperçus sont des serveurs Vite lancés comme process ENFANTS
// du backend (preview.ts → spawn("npm run dev")), et le pool qui les pilote vit
// EN MÉMOIRE dans le process backend. Quand le backend est tué brutalement
// (Stop-Process -Force, crash, fermeture du terminal), ses Vite enfants ne
// reçoivent pas le `taskkill /T` gracieux de `stopThis()` : ils deviennent
// ORPHELINS et continuent de squatter les ports 5174+ jusqu'au reboot machine.
// À chaque redémarrage du backend ils s'ACCUMULENT (46 comptés en une session) :
// le nouveau Vite doit grimper par-dessus la plage squattée, et l'iframe risque
// de tomber sur un orphelin qui sert une VIEILLE app périmée → « la preview
// marche plus ».
//
// LA PARADE — Au boot, le pool d'aperçus est forcément VIDE : donc TOUT listener
// node sur la plage d'aperçu est nécessairement un orphelin d'une session morte.
// On les balaie. Même esprit que le check anti-orphelin du port 3000 (CLAUDE.md),
// appliqué à la plage 5174+.
//
// GARDE-FOUS : (1) plage BORNÉE [base, base+span) — 5173 (UI Mango) est sous la
// base, donc jamais touché ; (2) jamais notre propre PID ni notre parent ;
// (3) UNIQUEMENT des process « node » (on ne tue jamais un service tiers qui
// passerait par là) ; (4) opt-out `PREVIEW_SWEEP=off` ; (5) best-effort, ne lève
// jamais, ne bloque pas le démarrage.
//
// Les fonctions de parsing/sélection sont PURES (testables sans process réel) ;
// l'accès système (netstat/tasklist/taskkill, lsof) est injectable via SweepDeps.
import { execFileSync } from "node:child_process";

const PREVIEW_PORT_BASE = Number(process.env.PREVIEW_PORT ?? 5174);
// Largeur de la plage balayée au-dessus de la base. Vite grimpe d'un port à
// chaque aperçu/orphelin ; on a observé jusqu'à ~5260. 120 couvre très large
// sans jamais redescendre vers 5173 (UI) ni vers 3000 (backend).
const SWEEP_SPAN = Math.max(1, Number(process.env.PREVIEW_SWEEP_SPAN ?? 120));

/** Un listener TCP repéré : port local + PID propriétaire. */
export interface Listener {
  port: number;
  pid: number;
}

/**
 * Parse la sortie de `netstat -ano` (Windows) → listeners TCP en écoute.
 * Tolère IPv4 et IPv6 ; ne retient que les lignes LISTENING avec un PID valide.
 * Format attendu d'une ligne : `  TCP    127.0.0.1:5174    0.0.0.0:0    LISTENING    3708`
 */
export function parseNetstatListeners(output: string): Listener[] {
  const out: Listener[] = [];
  for (const line of output.split(/\r?\n/)) {
    const t = line.trim();
    if (!/^TCP\b/i.test(t) || !/LISTENING/i.test(t)) continue;
    const cols = t.split(/\s+/);
    // cols: [TCP, local, remote, LISTENING, pid]
    if (cols.length < 5) continue;
    const local = cols[1] ?? "";
    const pid = Number(cols[cols.length - 1]);
    // Le port est après le DERNIER ':' (gère [::1]:5174 comme 127.0.0.1:5174).
    const portStr = local.slice(local.lastIndexOf(":") + 1);
    const port = Number(portStr);
    if (Number.isInteger(port) && port > 0 && Number.isInteger(pid) && pid > 0) {
      out.push({ port, pid });
    }
  }
  return out;
}

/**
 * Parse `tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH` → set des PID node.
 * Chaque ligne CSV : `"node.exe","3708","Console","1","123 456 Ko"`.
 * Si tasklist ne trouve rien il imprime un message d'INFO (pas de CSV) → set vide.
 */
export function parseTasklistNodePids(csv: string): Set<number> {
  const pids = new Set<number>();
  for (const line of csv.split(/\r?\n/)) {
    const m = line.match(/^"[^"]*node[^"]*","(\d+)"/i);
    if (m) pids.add(Number(m[1]));
  }
  return pids;
}

/**
 * Sélection PURE des process à tuer : listeners dont le port est dans
 * [base, base+span), exclus les PID protégés (self, parent, et tout ce que
 * l'appelant veut préserver). Dédupliqué. Avec `requireNode` (Windows), on ne
 * retient QUE les PID dont l'image est node (`nodePids`) ; sans (POSIX, où l'on
 * a déjà borné par port via lsof et où aucun tasklist universel n'existe), tout
 * PID de la plage est candidat.
 */
export function selectVictims(
  listeners: Listener[],
  nodePids: Set<number>,
  opts: { base: number; span: number; exclude: number[]; requireNode?: boolean },
): number[] {
  const requireNode = opts.requireNode !== false; // défaut : strict (Windows)
  const protectedPids = new Set(opts.exclude.filter((p) => Number.isInteger(p) && p > 0));
  const victims = new Set<number>();
  for (const { port, pid } of listeners) {
    if (port < opts.base || port >= opts.base + opts.span) continue;
    if (requireNode && !nodePids.has(pid)) continue; // uniquement des process node
    if (protectedPids.has(pid)) continue; // jamais nous-mêmes / parent
    victims.add(pid);
  }
  return [...victims];
}

/** Accès système injectable (pour tester l'orchestration sans process réel). */
export interface SweepDeps {
  /** Liste les listeners TCP en écoute de la machine. */
  listListeners: () => Listener[];
  /** Set des PID dont l'image est « node ». */
  nodePids: () => Set<number>;
  /** Tue un arbre de process par PID (best-effort, ne lève pas). */
  kill: (pid: number) => void;
  /** Plateforme courante (pour le no-op POSIX informatif). */
  platform?: NodeJS.Platform;
}

/** Implémentation Windows réelle des accès système. */
const windowsDeps: SweepDeps = {
  listListeners: () => {
    const out = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 8000,
    });
    return parseNetstatListeners(out);
  },
  nodePids: () => {
    const out = execFileSync(
      "tasklist",
      ["/FI", "IMAGENAME eq node.exe", "/FO", "CSV", "/NH"],
      { encoding: "utf8", windowsHide: true, timeout: 8000 },
    );
    return parseTasklistNodePids(out);
  },
  kill: (pid) => {
    // /T tue l'arbre (npm a spawné vite en enfant), /F force.
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 8000,
    });
  },
  platform: process.platform,
};

/** Implémentation POSIX best-effort (lsof par port) — l'atelier est Windows-first. */
const posixDeps: SweepDeps = {
  listListeners: () => {
    const out: Listener[] = [];
    for (let port = PREVIEW_PORT_BASE; port < PREVIEW_PORT_BASE + SWEEP_SPAN; port++) {
      try {
        const res = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
          encoding: "utf8",
          timeout: 4000,
        });
        for (const l of res.split(/\r?\n/)) {
          const pid = Number(l.trim());
          if (Number.isInteger(pid) && pid > 0) out.push({ port, pid });
        }
      } catch {
        /* port libre → lsof sort en erreur, on ignore */
      }
    }
    return out;
  },
  // Sur POSIX on cible déjà les listeners de la plage par port ; on ne restreint
  // pas à « node » faute d'un tasklist universel → tous les PID sont candidats.
  nodePids: () => new Set<number>(),
  kill: (pid) => {
    try { process.kill(pid, "SIGTERM"); } catch { /* déjà mort */ }
  },
  platform: process.platform,
};

/**
 * Balaie les aperçus Vite orphelins de la plage [PREVIEW_PORT_BASE, +span).
 * À appeler UNE FOIS au boot (le pool est vide → tout listener de la plage est un
 * orphelin). Best-effort : ne lève jamais, n'empêche jamais le serveur de démarrer.
 * Retourne le bilan { scanned, killed } (killed = PID tués) pour le log.
 */
export function sweepOrphanPreviews(deps?: Partial<SweepDeps>): { scanned: number; killed: number[] } {
  if ((process.env.PREVIEW_SWEEP ?? "").toLowerCase() === "off") {
    return { scanned: 0, killed: [] };
  }
  const platform = deps?.platform ?? process.platform;
  const base = platform === "win32" ? windowsDeps : posixDeps;
  const d: SweepDeps = { ...base, ...deps };

  try {
    const listeners = d.listListeners();
    const nodePids = d.nodePids();
    // Sur Windows on filtre par image (node) ; sur POSIX nodePids() est vide et
    // les listeners sont déjà bornés au port par lsof → on accepte tout PID.
    const requireNode = platform === "win32";
    const exclude = [process.pid, ...(typeof process.ppid === "number" ? [process.ppid] : [])];

    const victims = selectVictims(listeners, nodePids, {
      base: PREVIEW_PORT_BASE,
      span: SWEEP_SPAN,
      exclude,
      requireNode,
    });

    const killed: number[] = [];
    for (const pid of victims) {
      try { d.kill(pid); killed.push(pid); } catch { /* déjà mort / refus → on continue */ }
    }
    return { scanned: listeners.length, killed };
  } catch {
    // netstat/tasklist absents ou en échec → on n'empêche jamais le boot.
    return { scanned: 0, killed: [] };
  }
}
