// Preuve déterministe de la mémoire procédurale (idée #75) : CRUD (meta+body),
// sécurité slug (anti path-traversal), snapshot, reindex (embedder mocké,
// idempotent), récupération sémantique + repli mots-clés, section injectée, et
// gating dans assembleSystemPrompt (présent dans les 5 scénarios, à côté de skills).
// fs en tmpdir, embedder injecté → zéro réseau Ollama.
//
// Lancer :  npx tsx src/test-procedures.ts

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  PROCEDURES_DIR_NAME,
  listProcedures,
  loadProcedure,
  saveProcedure,
  deleteProcedure,
  proceduresSnapshot,
  reindexProcedures,
  relevantProcedures,
  proceduresPromptSection,
  type ProcedureEntry,
  type ProcedureDeps,
} from "../procedures.js";
import { assembleSystemPrompt } from "../scenario.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const line = (c = "─") => console.log(c.repeat(64));
const mkdir = () => fs.mkdtempSync(path.join(os.tmpdir(), "proc-"));
const now = "2026-06-18T00:00:00.000Z";
const mkEntry = (over: Partial<ProcedureEntry["meta"]> = {}, body = "## Démarche\n…"): ProcedureEntry => ({
  meta: { slug: "pagination", name: "Pagination", problem: "paginer une longue liste", tags: ["liste"], usedIn: [], createdAt: now, updatedAt: now, ...over },
  body,
});

line("═");
console.log("procedures — mémoire procédurale (#75)");
line();

// 1) CRUD ─────────────────────────────────────────────────────────────────────
console.log("CRUD :");
const d1 = mkdir();
check("listProcedures vide → []", listProcedures(d1).length === 0);
check("loadProcedure inexistant → null", loadProcedure(d1, "pagination") === null);
saveProcedure(d1, mkEntry());
check("meta.json + PROCEDURE.md écrits", fs.existsSync(path.join(d1, PROCEDURES_DIR_NAME, "pagination", "meta.json")) && fs.existsSync(path.join(d1, PROCEDURES_DIR_NAME, "pagination", "PROCEDURE.md")));
const loaded = loadProcedure(d1, "pagination");
check("round-trip meta + body", loaded?.meta.name === "Pagination" && loaded?.body.includes("Démarche"));
saveProcedure(d1, mkEntry({ slug: "auth-supabase", name: "Auth Supabase", problem: "gérer la session" }));
check("listProcedures triée par nom (Auth avant Pagination)", listProcedures(d1).map((p) => p.name)[0] === "Auth Supabase" && listProcedures(d1).length === 2);
deleteProcedure(d1, "pagination");
check("delete → load null + liste -1", loadProcedure(d1, "pagination") === null && listProcedures(d1).length === 1);

// 2) Sécurité slug (anti path-traversal) ──────────────────────────────────────
line();
console.log("Sécurité slug :");
const d2 = mkdir();
saveProcedure(d2, mkEntry({ slug: "../evil", name: "Evil" }));
check("slug '../evil' sanitizé (pas de dossier hors .procedures)", !fs.existsSync(path.join(d2, "../evil")));
check("loadProcedure('../etc') → null", loadProcedure(d2, "../etc") === null);
check("loadProcedure('a/b') → null", loadProcedure(d2, "a/b") === null);

// 3) Snapshot ─────────────────────────────────────────────────────────────────
line();
console.log("Snapshot :");
const d3 = mkdir();
const s0 = proceduresSnapshot(d3);
saveProcedure(d3, mkEntry());
check("snapshot change après ajout", proceduresSnapshot(d3) !== s0);

// 4) reindexProcedures (embedder mocké) ───────────────────────────────────────
line();
console.log("reindexProcedures :");
const d4 = mkdir();
saveProcedure(d4, mkEntry({ slug: "pagination", name: "Pagination", problem: "paginer" }));
saveProcedure(d4, mkEntry({ slug: "auth", name: "Auth", problem: "login" }));
let embedCalls = 0;
const okEmbed: ProcedureDeps = { embed: async (t) => { embedCalls++; return t.toLowerCase().includes("paginer") ? [1, 0, 0] : [0, 1, 0]; } };
const r1 = await reindexProcedures(d4, okEmbed);
check("reindex indexe les 2 procédures", r1.indexed === 2 && r1.failed === 0);
check("embedding persisté dans meta.json", (loadProcedure(d4, "pagination")?.meta.embedding?.length ?? 0) === 3);
embedCalls = 0;
const r2 = await reindexProcedures(d4, okEmbed);
check("idempotent : 2e passe n'embed rien", r2.indexed === 0 && embedCalls === 0);
const d4b = mkdir();
saveProcedure(d4b, mkEntry({ slug: "x", name: "X", problem: "y" }));
const r3 = await reindexProcedures(d4b, { embed: async () => null });
check("embedder null → failed compté, pas de crash", r3.indexed === 0 && r3.failed === 1);

// 5) relevantProcedures : sémantique + repli mots-clés ────────────────────────
line();
console.log("relevantProcedures :");
// voie sémantique : embeddings persistés via okEmbed ; requête « paginer » proche de pagination
const top = await relevantProcedures(d4, "comment paginer ma liste", 1, okEmbed);
check("sémantique : 'paginer' → procédure pagination en tête", top.length === 1 && top[0].slug === "pagination");
// Seuil anti-bruit : une requête orthogonale à toutes les procédures (cosine 0) → aucune.
const orthoEmbed: ProcedureDeps = { embed: async (t) => (t.toLowerCase().includes("paginer") || t.toLowerCase().includes("login") ? null : [0, 0, 1]) };
// d4 a des embeddings [1,0,0]/[0,1,0] ; une requête → [0,0,1] (cosine 0 < seuil) → filtré.
const noise = await relevantProcedures(d4, "un sujet totalement hors champ", 2, orthoEmbed);
check("sémantique : requête hors-sujet (cosine < seuil) → aucune", noise.length === 0);
// repli mots-clés : dossier SANS embeddings
const d5 = mkdir();
saveProcedure(d5, mkEntry({ slug: "drag-drop", name: "Drag and drop", problem: "réordonner par glisser-déposer", tags: ["dnd"] }));
saveProcedure(d5, mkEntry({ slug: "pagination", name: "Pagination", problem: "paginer une liste", tags: ["liste"] }));
const kw = await relevantProcedures(d5, "ajouter une pagination", 2, { embed: async () => null });
check("repli mots-clés : 'pagination' trouvée", kw.some((p) => p.slug === "pagination"));
const none = await relevantProcedures(d5, "un jeu de plateforme arcade", 2, { embed: async () => null });
check("repli mots-clés : sujet hors-sujet → aucune", none.length === 0);

// 6) proceduresPromptSection ──────────────────────────────────────────────────
line();
console.log("proceduresPromptSection :");
const sec = await proceduresPromptSection(d5, "ajouter une pagination", 2, { embed: async () => null });
check("pertinente → bloc avec pointeur Read PROCEDURE.md", sec.includes("Procedural memory") && sec.includes("PROCEDURE.md") && sec.includes("Pagination"));
const empty = await proceduresPromptSection(mkdir(), "n'importe quoi", 2, { embed: async () => null });
check("aucune procédure → ''", empty === "");

// 7) Gating dans assembleSystemPrompt ─────────────────────────────────────────
line();
console.log("Gating (assembleSystemPrompt) :");
const MARK = "PROCEDURE-GATING-MARKER";
const base = { model: "sonnet", projectDir: mkdir(), proceduresSection: `\n${MARK}\n` } as const;
const has = (mode: "mvp" | "elite" | "finition" | "nocturne" | "esthetique") =>
  assembleSystemPrompt({ ...base, mode }).includes(MARK);
check("présent en elite", has("elite"));
check("présent en mvp", has("mvp"));
check("présent en finition", has("finition"));
check("présent en nocturne", has("nocturne"));
check("présent en esthetique", has("esthetique"));

// ── Bilan ─────────────────────────────────────────────────────────────────────
line("═");
if (failures === 0) {
  console.log("✅ procedures — toutes les assertions vertes");
} else {
  console.log(`❌ procedures — ${failures} assertion(s) en échec`);
  process.exitCode = 1;
}
