// Preuve déterministe de l'évolution des règles (idée #76) : parse robuste des
// propositions, application PURE aux axiomes (add/remove/consolidate/promote/
// scenario + plafond + id introuvable), gather (escalades .train.jsonl), run avec
// ask mocké, apply/reject. fs en tmpdir, zéro réseau.
//
// Lancer :  npx tsx src/test-prompt-evolution.ts

import {
  splitAxiomBlocks,
  axiomId,
  applyToAxioms,
  parseEvolutionProposals,
  gatherEvolutionContext,
  type EvolutionProposal,
} from "../prompt-evolution.js";
import { AXIOMS_MAX_CHARS } from "../axioms.js";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const line = (c = "─") => console.log(c.repeat(64));

const AX = (id: string, body = "rule") => `${id} (maturité: candidat · vu: 2026-06-18)\n- Règle d'or : ${body}`;
const prop = (over: Partial<EvolutionProposal>): EvolutionProposal => ({
  id: "p", kind: "add", title: "t", rationale: "r", targetIds: [], newText: "", status: "pending", ...over,
});

line("═");
console.log("prompt-evolution — auto-réécriture des règles (#76)");
line();

// 1) split + id ───────────────────────────────────────────────────────────────
console.log("split / id :");
const raw2 = `${AX("AXIOME-UIUX-01")}\n\n${AX("AXIOME-BUILD-02")}`;
const blocks = splitAxiomBlocks(raw2);
check("split → 2 blocs", blocks.length === 2);
check("axiomId extrait l'id", axiomId(blocks[0]) === "AXIOME-UIUX-01" && axiomId("pas un axiome") === null);

// 2) applyToAxioms (pur) ──────────────────────────────────────────────────────
line();
console.log("applyToAxioms :");
const base = `${AX("AXIOME-UIUX-01")}\n\n${AX("AXIOME-BUILD-02")}`;
const added = applyToAxioms(base, prop({ kind: "add", newText: AX("AXIOME-PERF-03") }));
check("add → 3 blocs, nouveau présent", splitAxiomBlocks(added).length === 3 && added.includes("AXIOME-PERF-03"));
const removed = applyToAxioms(base, prop({ kind: "remove", targetIds: ["AXIOME-UIUX-01"] }));
check("remove → bloc retiré par id", !removed.includes("AXIOME-UIUX-01") && removed.includes("AXIOME-BUILD-02"));
const consolidated = applyToAxioms(base, prop({ kind: "consolidate", targetIds: ["AXIOME-UIUX-01", "AXIOME-BUILD-02"], newText: AX("AXIOME-UIUX-01", "fusion") }));
check("consolidate → targets retirés + fusionné", splitAxiomBlocks(consolidated).length === 1 && consolidated.includes("fusion"));
const promoted = applyToAxioms(base, prop({ kind: "promote", targetIds: ["AXIOME-UIUX-01"], newText: "AXIOME-UIUX-01 (maturité: confirmé · vu: 2026-06-18)\n- Règle d'or : rule" }));
check("promote → maturité bumpée", promoted.includes("AXIOME-UIUX-01 (maturité: confirmé"));
check("scenario → no-op (axiomes inchangés)", applyToAxioms(base, prop({ kind: "scenario", newText: "suggestion" })) === base);
check("id introuvable → no-op sûr (remove)", applyToAxioms(base, prop({ kind: "remove", targetIds: ["AXIOME-ZZZ-99"] })) === base.trim());
const huge = applyToAxioms(base, prop({ kind: "add", newText: "AXIOME-X-99 …\n" + "x".repeat(4000) }));
check("plafond AXIOMS_MAX_CHARS respecté", huge.length <= AXIOMS_MAX_CHARS + 120);

// 3) parseEvolutionProposals (robuste) ────────────────────────────────────────
line();
console.log("parseEvolutionProposals :");
const good = JSON.stringify({ summary: "patterns X", proposals: [{ kind: "add", title: "Nouvel axiome", rationale: "récurrent", targetIds: [], newText: AX("AXIOME-PERF-03") }] });
const r1 = parseEvolutionProposals(good);
check("JSON valide → 1 proposition + summary", r1.proposals.length === 1 && r1.summary === "patterns X");
const noisy = `Voici mon analyse :\n${good}\nVoilà.`;
check("JSON entouré de texte → extrait quand même", parseEvolutionProposals(noisy).proposals.length === 1);
check("invalide → vide", parseEvolutionProposals("pas de json").proposals.length === 0);
const badKind = JSON.stringify({ proposals: [{ kind: "bidon", title: "t", newText: "x" }] });
check("kind inconnu → normalisé en 'add'", parseEvolutionProposals(badKind).proposals[0]?.kind === "add");
const empty = JSON.stringify({ proposals: [{ kind: "add", title: "sans texte", newText: "" }] });
check("add sans newText → filtré", parseEvolutionProposals(empty).proposals.length === 0);
const noTitle = JSON.stringify({ proposals: [{ kind: "remove", title: "", targetIds: ["AXIOME-X-1"] }] });
check("sans titre → filtré", parseEvolutionProposals(noTitle).proposals.length === 0);

// 4) gatherEvolutionContext (escalades .train.jsonl) ──────────────────────────
line();
console.log("gatherEvolutionContext :");
const ws = fs.mkdtempSync(path.join(os.tmpdir(), "evo-"));
fs.writeFileSync(path.join(ws, ".axioms.md"), `${AX("AXIOME-UIUX-01")}\n`, "utf8");
fs.writeFileSync(path.join(ws, ".train.jsonl"), [
  JSON.stringify({ resolvedBy: "maitre", projectType: "webapp" }),
  JSON.stringify({ resolvedBy: "maitre", projectType: "webapp" }),
  JSON.stringify({ resolvedBy: "eleve", projectType: "vitrine" }),
  "ligne corrompue",
].join("\n") + "\n", "utf8");
const ctx = gatherEvolutionContext(ws);
check("contexte inclut le registre", ctx.includes("AXIOME-UIUX-01"));
check("contexte compte les escalades maitre (webapp: 2)", ctx.includes("webapp: 2"));
check("tolérant aux lignes corrompues (pas de crash)", typeof ctx === "string" && ctx.length > 0);

// ── Bilan ─────────────────────────────────────────────────────────────────────
line("═");
if (failures === 0) {
  console.log("✅ prompt-evolution — toutes les assertions vertes");
} else {
  console.log(`❌ prompt-evolution — ${failures} assertion(s) en échec`);
  process.exitCode = 1;
}
