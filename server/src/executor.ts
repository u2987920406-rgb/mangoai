// Coque Rigide — face EXÉCUTION (Phase Ultime, Jalon D).
//
// parseContract() (contract.ts) a transformé la sortie d'un modèle en une liste
// d'Action validées. executeContract() les APPLIQUE au disque, dans le périmètre
// strict du projet. Le modèle a PROPOSÉ ; ici MangoOS EXÉCUTE — c'est le seul
// endroit qui touche les fichiers, donc le seul point à sécuriser.
//
// Principe d'arrêt : à la PREMIÈRE action qui échoue, on stoppe. Un plan dont une
// étape casse laisse le projet dans un état partiel — mieux vaut s'arrêter net et
// (Jalon D) escalader vers le Maître que d'empiler sur une base bancale.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { atomicWriteFileSync } from "./safe-io.js";
import { resolveEdit } from "./edit-match.js";
import type { Action } from "./contract.js";

export type ActionOutcome =
  | { action: Action; status: "done"; detail: string }
  | { action: Action; status: "failed"; error: string };

export interface ExecResult {
  ok: boolean; // true seulement si TOUTES les actions ont réussi
  applied: number; // nombre d'actions effectivement appliquées
  outcomes: ActionOutcome[];
}

export interface ExecOptions {
  /** Délai max d'une commande <run> (défaut 120 s). */
  runTimeoutMs?: number;
  /** Couper toute exécution de <run> (mode purement fichiers). */
  allowRun?: boolean;
}

/** Défense en profondeur : parseContract a déjà filtré les chemins, mais on
 * re-confirme que le chemin résolu reste DANS le projet avant toute écriture.
 * Deux barrières valent mieux qu'une quand un modèle faible est aux commandes. */
function resolveInside(projectDir: string, rel: string): string {
  const root = path.resolve(projectDir);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`chemin hors du projet : ${rel}`);
  }
  return abs;
}

// Liste noire des commandes irréversibles ou hors-bac-à-sable. Le contrat sert à
// rendre un modèle FAIBLE sûr : une commande destructrice ne doit jamais passer,
// même si le modèle l'a « bien formatée ». git est exclu (le backend versionne).
const FORBIDDEN_RUN =
  /\b(rm\s+-rf\s+[~/]|del\s+\/|rd\s+\/s|format|mkfs|shutdown|reboot|git|npm\s+publish|curl[^\n]*\|\s*(sh|bash)|:\(\)\s*\{)/i;

function killTree(pid: number): void {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* déjà mort */
    }
  }
}

function runCommand(
  projectDir: string,
  command: string,
  timeoutMs: number,
): Promise<{ code: number; out: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const proc = spawn(command, {
      cwd: projectDir,
      shell: true,
      windowsHide: true,
      detached: process.platform !== "win32", // groupe de process tuable sous *nix
    });
    let out = "";
    const cap = (d: Buffer) => {
      out += d.toString();
      if (out.length > 8000) out = out.slice(-8000); // garde la fin (les erreurs)
    };
    proc.stdout?.on("data", cap);
    proc.stderr?.on("data", cap);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (proc.pid) killTree(proc.pid);
    }, timeoutMs);

    proc.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out: `${out}\n${e.message}`, timedOut });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, timedOut });
    });
  });
}

/** Applique un plan d'actions au projet. S'arrête à la première erreur. */
export async function executeContract(
  actions: Action[],
  projectDir: string,
  opts: ExecOptions = {},
): Promise<ExecResult> {
  const runTimeout = opts.runTimeoutMs ?? 120_000;
  const allowRun = opts.allowRun ?? true;
  const outcomes: ActionOutcome[] = [];

  for (const action of actions) {
    try {
      if (action.kind === "write") {
        const abs = resolveInside(projectDir, action.path);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        atomicWriteFileSync(abs, action.content);
        outcomes.push({ action, status: "done", detail: `${action.content.length} car. écrits` });
      } else if (action.kind === "edit") {
        const abs = resolveInside(projectDir, action.path);
        if (!fs.existsSync(abs)) throw new Error("fichier introuvable");
        const before = fs.readFileSync(abs, "utf8");
        // Matching tolérant aux fins de ligne (CRLF↔LF) : un `find` en LF d'un modèle doit
        // matcher un fichier CRLF (Windows/worktree). Gardes introuvable/ambigu conservées.
        const res = resolveEdit(before, action.find, action.replace);
        if (!res.ok) {
          throw new Error(res.reason === "ambigu" ? "extrait <find> ambigu (plusieurs occurrences)" : "extrait <find> introuvable");
        }
        atomicWriteFileSync(abs, res.after);
        outcomes.push({ action, status: "done", detail: res.aligned ? "remplacement appliqué (fins de ligne alignées)" : "remplacement appliqué" });
      } else {
        if (!allowRun) throw new Error("commandes <run> désactivées");
        if (FORBIDDEN_RUN.test(action.command)) {
          throw new Error(`commande interdite : ${action.command}`);
        }
        const { code, out, timedOut } = await runCommand(projectDir, action.command, runTimeout);
        if (timedOut) throw new Error(`délai dépassé (${runTimeout / 1000}s)`);
        if (code !== 0) throw new Error(`exit ${code} — ${out.slice(-300).trim()}`);
        outcomes.push({ action, status: "done", detail: "exit 0" });
      }
    } catch (e) {
      outcomes.push({ action, status: "failed", error: (e as Error).message });
      return { ok: false, applied: outcomes.filter((o) => o.status === "done").length, outcomes };
    }
  }

  return { ok: true, applied: outcomes.length, outcomes };
}

// ── Primitives unitaires sûres (Élève agentique #146 Phase 2) ────────────────
//
// Les outils d'action de l'Élève (eleve-action-tools.ts) ont besoin d'écrire /
// éditer / exécuter UNE action à la fois. Plutôt que de redéclarer la sécurité,
// chaque primitive délègue à executeContract avec un Action[] d'UNE action :
// resolveInside (confinement), FORBIDDEN_RUN (blacklist), timeout + killTree, et
// la garde d'ambiguïté du <find> sont réutilisés TELS QUELS. Renvoie le détail en
// cas de succès, LÈVE avec le message d'erreur exact sinon (réinjecté au modèle
// pour qu'il se corrige).

async function applyOne(action: Action, projectDir: string, opts?: ExecOptions): Promise<string> {
  const res = await executeContract([action], projectDir, opts);
  const outcome = res.outcomes[0];
  if (!res.ok || !outcome || outcome.status !== "done") {
    throw new Error(outcome && outcome.status === "failed" ? outcome.error : "échec inconnu");
  }
  return outcome.detail;
}

/** Écrit/écrase un fichier complet (chemin relatif, confiné au projet). */
export function applyWrite(projectDir: string, filePath: string, content: string): Promise<string> {
  return applyOne({ kind: "write", path: filePath, content }, projectDir);
}

/** Remplace un extrait UNIQUE d'un fichier (le <find> doit exister et être non ambigu). */
export function applyEdit(projectDir: string, filePath: string, find: string, replace: string): Promise<string> {
  return applyOne({ kind: "edit", path: filePath, find, replace }, projectDir);
}

/** Lance une commande shell dans le projet (FORBIDDEN_RUN + timeout appliqués). */
export function applyRun(projectDir: string, command: string, timeoutMs?: number): Promise<string> {
  return applyOne({ kind: "run", command }, projectDir, { runTimeoutMs: timeoutMs });
}
