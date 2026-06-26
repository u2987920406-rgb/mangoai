// Tests de l'apprentissage Stratège Phase 2 (stratege-learn.ts) — distille → rappelle.
// Déterministe : embed injecté à null → relevantProcedures retombe sur le matching mots-clés.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  distillProcedure,
  recallProcedure,
  learnedHint,
  strategeSlug,
} from "./stratege-learn.js";
import { loadProcedure, listProcedures, saveProcedure, type ProcedureDeps } from "./procedures.js";
import type { Diagnosis, BlockerClass } from "./stratege-signals.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}
const diag = (blocker: BlockerClass, cause = "c"): Diagnosis => ({ blocker, cause, evidence: "e", remedy: "r" });
const NOW = "2026-06-27T00:00:00.000Z";
const noEmbed: ProcedureDeps = { embed: async () => null }; // → repli mots-clés déterministe

const ws = fs.mkdtempSync(path.join(os.tmpdir(), "stratege-learn-"));

async function run() {
  console.log("[1] distille une procédure après un déblocage réussi");
  {
    const d = diag("missing-dependency", "dépendance « gsap » non installée");
    const res = await distillProcedure(ws, d, "installe gsap", "proj1", NOW, noEmbed);
    check("saved=true", res.saved && res.slug === "debloquer-missing-dependency");
    const entry = loadProcedure(ws, strategeSlug(d));
    check("procédure persistée", !!entry);
    check("tags = stratege + classe", !!entry && entry.meta.tags.includes("stratege") && entry.meta.tags.includes("missing-dependency"));
    check("corps cite le remède", !!entry && /installe gsap/.test(entry.body));
    check("usedIn = proj1", !!entry && entry.meta.usedIn.includes("proj1"));
  }

  console.log("\n[2] rappelle la procédure au MÊME type de blocage (déjà vu ?)");
  {
    const hit = await recallProcedure(ws, diag("missing-dependency", "dépendance « three » non installée"), noEmbed);
    check("recall trouve la procédure de la classe", !!hit && hit.slug === "debloquer-missing-dependency");
    check("learnedHint pointe vers la procédure", !!hit && /debloquer-missing-dependency/.test(learnedHint(hit)));
  }

  console.log("\n[3] PAS de rappel pour une AUTRE classe de blocage");
  {
    const miss = await recallProcedure(ws, diag("wandering"), noEmbed);
    check("classe différente → aucun rappel", miss === null);
  }

  console.log("\n[4] idempotent : un 2ᵉ déblocage met à jour usedIn, ne duplique pas");
  {
    const d = diag("missing-dependency", "dépendance « leaflet » non installée");
    await distillProcedure(ws, d, "installe leaflet", "proj2", NOW, noEmbed);
    const all = listProcedures(ws).filter((m) => m.slug === "debloquer-missing-dependency");
    check("toujours UNE seule procédure pour la classe", all.length === 1);
    const entry = loadProcedure(ws, "debloquer-missing-dependency");
    check("usedIn cumule proj1 + proj2", !!entry && entry.meta.usedIn.includes("proj1") && entry.meta.usedIn.includes("proj2"));
  }

  console.log("\n[5] le rappel IGNORE les procédures #75 non-Stratège");
  {
    saveProcedure(ws, {
      meta: { slug: "wandering-autre", name: "Autre", problem: "Blocage « wandering » — autre", tags: ["divers"], usedIn: [], createdAt: NOW, updatedAt: NOW },
      body: "x",
    });
    const miss = await recallProcedure(ws, diag("wandering"), noEmbed);
    check("procédure non taguée stratege → ignorée", miss === null);
  }

  fs.rmSync(ws, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? "✅" : "❌"} stratege-learn : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}
run().catch((e) => { console.error(e); process.exit(1); });
