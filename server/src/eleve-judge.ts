// Juge d'INTENTION (#161) — « est-ce la BONNE tâche ? ».
//
// Le build vert dit « ça compile », jamais « ça répond à la demande ». Ce juge
// compare la DEMANDE de l'utilisateur à ce que l'Élève a LIVRÉ (son résumé de
// finish + les extraits des fichiers qu'il a écrits) et renvoie un verdict
// d'ADÉQUATION (couverture + manques). SOUVERAIN : routé vers le cerveau `juge`
// (qwen3.5:cloud, $0), DISTINCT de l'exécutant GLM → pas d'auto-jugement biaisé.
//
// Ne lève JAMAIS : un juge indisponible → verdict NEUTRE (couverture 100), pour
// ne jamais bloquer à tort (la fermeté est convergente, pas un mur). Deps injectables.

import fs from "node:fs";
import path from "node:path";
import { dispatch as realDispatch } from "./brain-dispatch.js";
import { sanitizeExternal } from "./agent-contract.js";
import { detectOutOfScope } from "./capabilities.js";
import { gitFileDiff } from "./judge-diff.js";

export interface IntentVerdict {
  couverture: number; // 0-100 : à quel point le livré couvre la demande
  manques: string[]; // ce qui manque vs la demande
  note: string; // prose brute (traçabilité)
}

export interface JudgeDeps {
  dispatch: (
    agentId: "juge",
    system: string,
    user: string,
    opts: { trustExternal?: boolean; freeform?: boolean },
  ) => Promise<{ status: string; summary?: string }>;
  readFile: (projectDir: string, rel: string) => string | null;
  /** L21 — vrai diff vs HEAD d'un fichier modifié (null = nouveau/inchangé/pas de dépôt). */
  diff: (projectDir: string, rel: string) => string | null;
}

const MAX_FILES = 8;
const MAX_FILE_CHARS = 1500;
const MAX_TOTAL_CHARS = 8000;

/** Lit un fichier CONFINÉ au projet (anti-évasion). null si hors-projet/absent/illisible. */
function safeRead(projectDir: string, rel: string): string | null {
  try {
    const root = path.resolve(projectDir);
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

const realDeps: JudgeDeps = { dispatch: realDispatch, readFile: safeRead, diff: (d, r) => gitFileDiff(d, r) };

const JUDGE_SYSTEM =
  "Tu es le JUGE de clôture de Mango. On te donne la DEMANDE d'un utilisateur et ce qu'un agent a CONSTRUIT " +
  "(son résumé + les CHANGEMENTS : diff des fichiers modifiés et contenu des fichiers nouveaux). Évalue UNIQUEMENT l'ADÉQUATION : le livré couvre-t-il la " +
  "demande ? (pas le style, pas le goût — juste : a-t-il fait CE qui était demandé ?). Réponds EXACTEMENT dans " +
  "ce format, rien d'autre :\nCOUVERTURE: <0-100>\nMANQUES:\n- <un point demandé mais absent>\n- <…ou « rien » si " +
  "tout est couvert>\nSois strict mais factuel : un élément demandé et absent du livré = un manque. Ne pénalise " +
  "JAMAIS ce qui n'était pas demandé. Réponds en français.";

const NEGATIF = /^(rien|aucun|n\/?a|néant|aucune|ras)\b/i;

/** Parse la prose étiquetée du juge → verdict. PUR, tolérant. Défaut neutre (100). */
export function parseIntentVerdict(prose: string): IntentVerdict {
  const text = (prose ?? "").trim();
  const cov = text.match(/couverture\s*[:：]?\s*(\d{1,3})/i);
  const couverture = cov ? Math.max(0, Math.min(100, parseInt(cov[1], 10))) : 100;

  const manques: string[] = [];
  let inManques = false;
  for (const line of text.split(/\r?\n/)) {
    const labelM = line.match(/^\s*manques?\s*[:：]\s*(.*)$/i);
    if (labelM) {
      inManques = true;
      const after = labelM[1].trim();
      if (after && !/^[<(]/.test(after) && !NEGATIF.test(after)) manques.push(after);
      continue;
    }
    if (!inManques) continue;
    const b = line.match(/^\s*[-*•]\s*(.+)$/);
    if (b) {
      const v = b[1].trim();
      if (v && !/^[<(]/.test(v) && !NEGATIF.test(v)) manques.push(v);
    } else if (line.trim() && !/couverture/i.test(line)) {
      inManques = false; // une ligne non-puce clôt la liste
    }
  }
  return { couverture, manques: manques.slice(0, 8), note: text.slice(0, 400) };
}

/**
 * GARDE DE CADRE (L40) — déterministe, sans LLM. Si la DEMANDE dérive vers une techno
 * HORS périmètre (Unity, natif iOS/Android, Flutter…), le livré web NE PEUT PAS la couvrir,
 * quoi qu'en dise le juge LLM (cas pétanque : 100/100 sur une app web alors qu'on voulait
 * Unity/natif). On plafonne alors la couverture et on ajoute le manque de cadre. PUR.
 *
 * Atout clé : ça mord MÊME quand le juge cloud est indisponible (verdict neutre 100) —
 * le mismatch de cadre est détecté sans aucun appel réseau. Opt-out `JUDGE_SCOPE_GUARD=off`.
 */
export const SCOPE_MISMATCH_CAP = 40;

export function applyScopeGuard(
  verdict: IntentVerdict,
  task: string,
  env: NodeJS.ProcessEnv = process.env,
): IntentVerdict {
  if (String(env.JUDGE_SCOPE_GUARD ?? "on").toLowerCase() === "off") return verdict;
  // (Phase 3a) Unity/Godot ne sont plus une dérive quand leur domaine est actif.
  const allow: string[] = [];
  if (String(env.ELEVE_UNITY ?? "").toLowerCase() === "on") allow.push("unity");
  if (String(env.ELEVE_GODOT ?? "").toLowerCase() === "on") allow.push("godot natif");
  const families = detectOutOfScope(task, allow);
  if (families.length === 0) return verdict;
  const manque = `Cadre demandé hors périmètre (${families.join(", ")}) : MangoOS livre une app WEB (React/Three.js/PWA), pas du natif/moteur de jeu — le livré ne peut pas répondre au cadre demandé.`;
  const couverture = Math.min(verdict.couverture, SCOPE_MISMATCH_CAP);
  const manques = [manque, ...verdict.manques.filter((m) => m !== manque)].slice(0, 8);
  return { couverture, manques, note: verdict.note };
}

/**
 * Juge l'adéquation demande↔livré. `files` = chemins relatifs écrits par l'agent
 * (dérivés de la trace). Ne lève jamais : échec → verdict neutre (couverture 100).
 * La garde de cadre (L40) s'applique à TOUS les chemins de sortie, y compris le neutre.
 */
export async function judgeIntention(
  task: string,
  summary: string,
  files: string[],
  projectDir: string,
  deps: JudgeDeps = realDeps,
): Promise<IntentVerdict> {
  // La garde de cadre (L40) s'applique au verdict neutre AUSSI : un mismatch de cadre est
  // détecté sans LLM, donc même juge indisponible on ne renvoie pas un faux « 100 couvert ».
  const neutral = (why: string): IntentVerdict =>
    applyScopeGuard({ couverture: 100, manques: [], note: `(juge indisponible : ${why})` }, task);

  // (L21) Ce qui a CHANGÉ (bornés ; contenu = DONNÉE potentiellement hostile).
  // Pour un fichier MODIFIÉ d'un projet existant → le DIFF vs HEAD (montre exactement
  // la modif). Pour un fichier NOUVEAU (pas de diff) → son contenu. Bien plus net pour
  // juger l'adéquation qu'un dump intégral systématique.
  let extraits = "";
  let total = 0;
  for (const rel of files.slice(0, MAX_FILES)) {
    const d = deps.diff(projectDir, rel);
    const isDiff = !!d;
    const raw = d ?? deps.readFile(projectDir, rel);
    if (!raw) continue;
    const snip = raw.length > MAX_FILE_CHARS ? raw.slice(0, MAX_FILE_CHARS) + " …" : raw;
    if (total + snip.length > MAX_TOTAL_CHARS) break;
    total += snip.length;
    extraits += `\n--- ${rel} ${isDiff ? "(diff)" : "(nouveau fichier)"} ---\n${snip}\n`;
  }

  // La DEMANDE est la référence (de l'utilisateur) ; le RÉSUMÉ et les FICHIERS sont
  // de la donnée potentiellement manipulée → sanitizeExternal.
  const user =
    `DEMANDE de l'utilisateur :\n${task}\n\n` +
    `RÉSUMÉ de l'agent (ce qu'il dit avoir fait) :\n${sanitizeExternal(summary || "(aucun résumé)")}\n\n` +
    `CHANGEMENTS (diff des fichiers modifiés · contenu des fichiers nouveaux) :${extraits ? "\n" + sanitizeExternal(extraits) : " (aucun)"}\n\n` +
    "La demande est-elle COUVERTE ? Donne COUVERTURE puis MANQUES.";

  let r: { status: string; summary?: string };
  try {
    r = await deps.dispatch("juge", JUDGE_SYSTEM, user, { trustExternal: true, freeform: true });
  } catch (e) {
    return neutral(e instanceof Error ? e.message.split("\n")[0] : String(e));
  }
  if (r.status !== "ok" || !r.summary?.trim()) return neutral(r.summary || r.status);
  return applyScopeGuard(parseIntentVerdict(r.summary), task);
}
