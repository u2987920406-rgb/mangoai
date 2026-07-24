import fs from "node:fs";
import path from "node:path";

// Volet CONTENU du Gardien de clôture (#161) — #196 fault-finding, plan « cohérence
// de contenu », 2026-07-24.
//
// Le trou réel : `checkBiaisPosition` (eleve-gate-pedago.ts) détecte un biais
// STATISTIQUE de position (>50% sur ≥5 QCM) mais (a) ne vérifie jamais la justesse
// PAR ITEM — un quiz aux positions bien variées mais dont chaque réponse est
// individuellement fausse passerait au travers — et (b) ne tourne QUE sur les
// projets `formation.json` (jamais sur une app générique). La sonde réelle de la
// nuit précédente (probe-fault-corpus.ts, MangoQA) a prouvé ce gap sur un cas exact :
// un fichier `quiz-questions.ts` générique, `correctIndex:0` partout, jamais détecté
// par aucune branche MangoQA (qui audite le CODE, pas le CONTENU) ni par PÉDAGO
// (scopé formation).
//
// Portée VOLONTAIREMENT restreinte à l'AUTO-COHÉRENCE INTERNE (famille 1 du plan) :
// le juge relit CHAQUE entrée d'un tableau de données et vérifie qu'un champ
// correct/answer/correctIndex pointe RÉELLEMENT vers la bonne option listée DANS
// CETTE MÊME entrée — aucune connaissance du monde réel requise, donc pas le risque
// (documenté dans eleve-gate-pedago.ts::checkExactitude) d'un juge qui hallucine sur
// des FAITS externes. Fail-open comme tout le Gardien : ne lève JAMAIS.
//
// Gate `ELEVE_GATE_CONTENT` (flags.ts, défaut OFF) — contrairement à IMAGES/CONSTANTES
// (déjà 34+34 tests ET l'incident déclencheur exact derrière eux), ce volet est NEUF :
// reste opt-in plus longtemps, le temps d'un vrai retour d'usage (même logique de
// montée en confiance que ELEVE_GATE_TASTE_OBSERVE).

const DATA_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".json"]);
// Heuristique de chemin : dossiers/noms typiques d'une table de données/contenu
// généré (quiz, banques, constantes, catalogues) — reste PROPORTIONNÉ, n'audite pas
// tout le code (évite bruit/coût sur des fichiers purement logiques/UI). Limite
// honnête assumée : un tableau de quiz noyé dans un composant générique hors de ces
// chemins ne serait pas sélectionné (compromis coût/bruit, cf. plan).
const DATA_PATH_HINT = /(^|[\\/])(data|content|constants?|banks?|questions?|quiz|catalog|fixtures?)([\\/]|[-.])/i;

// Plafond de caractères injectés dans le prompt du juge (anti-saturation, même esprit
// que FILE_PAYLOAD_CAP côté MangoQA / MAX_TOTAL_CHARS côté eleve-judge.ts).
const MAX_FILE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 16_000;
const MAX_FILES = 6;

export interface DataFile {
  path: string;
  content: string;
}

export interface ContentDeps {
  /** Sélectionne les fichiers de données probables du projet (heuristique de chemin
   *  ci-dessus). Best-effort : dossier illisible → liste vide. Ne lève jamais. */
  readDataFiles: (projectDir: string) => Promise<DataFile[]>;
  /** Juge LLM (rôle "juge", même brain que eleve-judge.ts/checkExactitude). */
  judge: (system: string, user: string) => Promise<{ status: string; summary?: string }>;
}

export interface ContentVerdict {
  ok: boolean;
  /** false = aucun fichier de données détecté → volet neutre, ne pénalise pas. */
  applicable: boolean;
  coherenceOk: boolean;
  /** true = réponse du juge illisible/vide → neutre, ne pénalise pas. */
  sautee: boolean;
  raisons: string[];
}

function verdictNeutre(applicable: boolean, sautee = false): ContentVerdict {
  return { ok: true, applicable, coherenceOk: true, sautee, raisons: [] };
}

const CONTENT_SYSTEM = [
  "Tu vérifies l'AUTO-COHÉRENCE d'un tableau de données (quiz, catalogue, mapping).",
  "Pour CHAQUE entrée, relis la question/le libellé ET CHAQUE option listée DANS CETTE",
  "MÊME entrée, puis vérifie que le champ correct/answer/correctIndex pointe RÉELLEMENT",
  "vers la bonne option. Signal fort de défaut : la MÊME valeur d'index répétée sur",
  "TOUTES les entrées alors que la bonne réponse varie logiquement d'une entrée à",
  "l'autre. Ne juge QUE ce qui est vérifiable depuis le fichier lui-même — aucune",
  "connaissance du monde réel requise. En cas de doute sur une entrée, ne bloque pas.",
  "",
  "Réponds EXACTEMENT sur une ligne :",
  "COHERENCE: OK ou PROBLEME(<entrée précise concernée + pourquoi>)",
].join("\n");

/** Parse la réponse du juge (tolérant : un petit modèle peut varier le format — vérifié
 *  EN RÉEL, cf. Vérification globale du plan cohérence de contenu : le juge omet parfois
 *  le préfixe "COHERENCE:" et répond directement "PROBLEME(...)"/"OK", même quand le
 *  raisonnement lui-même est correct — le label reste optionnel dans le motif). */
export function parseContentVerdict(raw: string): { coherenceOk: boolean; detail: string; lisible: boolean } {
  const m = raw.match(/(?:COH[EÉ]RENCE\s*:?\s*)?(OK|PROBL[EÈ]ME)\s*\(?([^)\n]*)\)?/i);
  return {
    coherenceOk: !m || /^OK/i.test(m[1]),
    detail: (m?.[2] ?? "").trim(),
    lisible: Boolean(m),
  };
}

function buildUserPrompt(files: DataFile[]): string {
  let total = 0;
  const parts: string[] = [];
  for (const f of files.slice(0, MAX_FILES)) {
    const snip = f.content.length > MAX_FILE_CHARS ? f.content.slice(0, MAX_FILE_CHARS) + " …(tronqué)" : f.content;
    if (total + snip.length > MAX_TOTAL_CHARS) break;
    total += snip.length;
    parts.push(`--- ${f.path} ---\n${snip}`);
  }
  return `Fichiers de données à vérifier :\n${parts.join("\n\n")}`;
}

/** Exécute le volet CONTENU sur des fichiers déjà lus. PUR modulo l'appel au juge. */
export async function checkContent(
  files: DataFile[],
  judge: ContentDeps["judge"],
): Promise<ContentVerdict> {
  if (files.length === 0) return verdictNeutre(false);

  let res: { status: string; summary?: string };
  try {
    res = await judge(CONTENT_SYSTEM, buildUserPrompt(files));
  } catch {
    return verdictNeutre(true, true);
  }

  const parsed = parseContentVerdict(res.summary ?? "");
  if (!parsed.lisible) return verdictNeutre(true, true);

  if (!parsed.coherenceOk) {
    return {
      ok: false,
      applicable: true,
      coherenceOk: false,
      sautee: false,
      raisons: [
        `CONTENU — incohérence interne détectée dans une donnée générée : ${parsed.detail || "voir détail"}. ` +
          `Relis l'entrée citée et corrige la valeur qui ne correspond pas à ses propres options/libellé.`,
      ],
    };
  }
  return { ok: true, applicable: true, coherenceOk: true, sautee: false, raisons: [] };
}

/** Exécute le volet CONTENU pour un projet entier. Deps injectées, ne lève JAMAIS. */
export async function checkContentProjet(projectDir: string, deps: ContentDeps): Promise<ContentVerdict> {
  try {
    const files = await deps.readDataFiles(projectDir);
    return checkContent(files, deps.judge);
  } catch {
    return verdictNeutre(false);
  }
}

// ---------------------------------------------------------------------------
// Deps réelles — utilisées par eleve-gate.ts.
// ---------------------------------------------------------------------------

async function readDataFilesReel(projectDir: string): Promise<DataFile[]> {
  const out: DataFile[] = [];
  const MAX_WALK = 500_000; // borne anti-OOM, cohérent avec eleve-gate-constants.ts
  let total = 0;

  function walk(dir: string): void {
    if (total > MAX_WALK) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      const full = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (DATA_EXT.has(path.extname(name)) && DATA_PATH_HINT.test(full)) {
        try {
          const content = fs.readFileSync(full, "utf8");
          total += content.length;
          out.push({ path: path.relative(projectDir, full), content });
        } catch {
          /* skip */
        }
      }
    }
  }
  walk(path.join(projectDir, "src"));
  return out;
}

// Timeout du rôle "juge" étendu pour CE volet spécifiquement (pas touché au registre
// partagé) — vérifié EN RÉEL en construisant cette Partie 2 : qwen3.5:cloud en mode
// "thinking" dépasse régulièrement les 45s par défaut sur un prompt qui doit relire
// PLUSIEURS entrées d'un tableau (plus lourd qu'un "juge" à verdict court habituel).
// Même trouvaille que côté MangoQA la nuit précédente (QA_OLLAMA_TIMEOUT_MS 25s trop
// court) — ici scopée à ce seul appel via brainOverride, le reste de l'écosystème qui
// utilise le rôle "juge" garde son budget 45s inchangé.
const CONTENT_JUDGE_TIMEOUT_MS = 90_000;

async function dispatchReel(system: string, user: string): Promise<{ status: string; summary?: string }> {
  const { dispatch } = await import("./brain.js");
  const { getBrain } = await import("./brain/brain-registry.js");
  const brain = { ...getBrain("juge"), timeoutMs: CONTENT_JUDGE_TIMEOUT_MS };
  return dispatch("juge", system, user, { trustExternal: true, freeform: true, brainOverride: brain });
}

export const realContentDeps: ContentDeps = {
  readDataFiles: readDataFilesReel,
  judge: dispatchReel,
};

/** Fonction prête à brancher dans `GateDeps.checkContent` (eleve-gate.ts). */
export function checkContentReel(projectDir: string): Promise<ContentVerdict> {
  return checkContentProjet(projectDir, realContentDeps);
}
