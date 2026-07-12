// Tests de eleve-compaction.ts (2026-07-13) — compaction de contexte pour l'Élève,
// même IDÉE que le /compact de Claude (résumé structuré par un cerveau) mais sans
// session SDK, et avec l'ÉLÈVE LUI-MÊME comme résumeur. Déterministe, ZÉRO réseau :
// `ask` (le cerveau) injecté ; le disque n'est utilisé QUE pour le cache de résumé
// (workspace temporaire réel), les entrées sont passées directement (découplé de
// history.ts — l'Accueil n'a pas d'historique fichier, cf. eleve-compaction.ts).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEleveContext, SUMMARY_FILE_NAME, type CompactableEntry } from "../eleve-compaction.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); }
}

function mkEntries(n: number, charsEach: number, startSeq: number): CompactableEntry[] {
  const out: CompactableEntry[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? "user" : "agent",
      text: `tour ${i} `.padEnd(charsEach, "x"),
      ts: String(startSeq + i).padStart(8, "0"),
    });
  }
  return out;
}

async function run(): Promise<void> {
  console.log("\n[1] Historique vide → contexte vide, aucun appel au cerveau");
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-compact-"));
    let askCalled = false;
    const ctx = await buildEleveContext(dir, [], async () => { askCalled = true; return "résumé"; }, 100_000);
    check("contexte vide", ctx === "");
    check("cerveau jamais appelé", !askCalled);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n[2] Historique COURT (sous le seuil) → pas de compaction, texte brut renvoyé");
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-compact-"));
    let askCalled = false;
    const ctx = await buildEleveContext(dir, mkEntries(4, 20, 0), async () => { askCalled = true; return "résumé"; }, 100_000);
    check("cerveau jamais appelé (sous le seuil)", !askCalled);
    check("contexte contient les tours bruts", ctx.includes("tour 0") && ctx.includes("tour 3"));
    check("aucun fichier de résumé créé", !fs.existsSync(path.join(dir, SUMMARY_FILE_NAME)));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n[3] Historique LONG (dépasse le seuil) → compaction déclenchée, résumé persisté");
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-compact-"));
    let askCalls = 0;
    let receivedPrompt = "";
    const ctx = await buildEleveContext(dir, mkEntries(20, 500, 0), async (_sys, user) => { askCalls++; receivedPrompt = user; return "RÉSUMÉ COMPACT : sujet X, décision Y."; }, 2_000);
    check("cerveau appelé exactement 1 fois", askCalls === 1);
    check("le prompt envoyé au cerveau contient les vieux tours", receivedPrompt.includes("tour 0"));
    check("le contexte retourné contient le résumé", ctx.includes("RÉSUMÉ COMPACT"));
    check("les derniers tours restent INTACTS (pas résumés)", ctx.includes("tour 19"));
    check("fichier de résumé créé sur disque", fs.existsSync(path.join(dir, SUMMARY_FILE_NAME)));
    const saved = JSON.parse(fs.readFileSync(path.join(dir, SUMMARY_FILE_NAME), "utf8"));
    check("résumé sauvegardé correspond", saved.summary === "RÉSUMÉ COMPACT : sujet X, décision Y.");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n[4] Après compaction : nouveaux tours COURTS → cache réutilisé, pas de re-compaction");
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-compact-"));
    const initial = mkEntries(20, 500, 0);
    // 1ère compaction (forcée par un petit window).
    await buildEleveContext(dir, initial, async () => "résumé initial", 2_000);
    // 2 nouveaux tours COURTS après les 20 premiers — résumé + ces 2 tours reste sous le seuil.
    const nouveaux = mkEntries(2, 20, 100).map((e, i) => ({ ...e, text: `nouveau ${i}` }));
    let askCalls = 0;
    const ctx = await buildEleveContext(dir, [...initial, ...nouveaux], async () => { askCalls++; return "ne devrait pas être appelé"; }, 2_000);
    check("cerveau PAS rappelé (cache + nouveaux tours courts suffisent)", askCalls === 0);
    check("contexte contient le résumé initial", ctx.includes("résumé initial"));
    check("contexte contient les nouveaux tours", ctx.includes("nouveau 0") && ctx.includes("nouveau 1"));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n[5] Fail-open — le cerveau échoue (throw) → repli sur le texte brut, jamais de crash");
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-compact-"));
    const ctx = await buildEleveContext(dir, mkEntries(20, 500, 0), async () => { throw new Error("Ollama injoignable"); }, 2_000);
    check("pas de throw remonté, contexte brut renvoyé", ctx.includes("tour 0") && ctx.includes("tour 19"));
    check("aucun résumé persisté (l'échec n'écrit rien)", !fs.existsSync(path.join(dir, SUMMARY_FILE_NAME)));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n[6] Fail-open — le cerveau renvoie une réponse vide → repli sur le texte brut");
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-compact-"));
    const ctx = await buildEleveContext(dir, mkEntries(20, 500, 0), async () => "   ", 2_000);
    check("réponse vide → repli brut (pas de résumé vide utilisé)", ctx.includes("tour 0"));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-compaction : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
