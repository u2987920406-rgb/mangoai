// Tests du balayage anti-orphelin des aperçus (preview-sweep.ts).
// Parsing + sélection PURS ; orchestration testée via SweepDeps injectés (zéro process réel).
import {
  parseNetstatListeners,
  parseTasklistNodePids,
  selectVictims,
  sweepOrphanPreviews,
  type Listener,
} from "../preview-sweep.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("[1] parseNetstatListeners — IPv4, IPv6, bruit");
{
  const out = [
    "",
    "Connexions actives",
    "  Proto  Adresse locale      Adresse distante    État        PID",
    "  TCP    127.0.0.1:5174      0.0.0.0:0           LISTENING       3708",
    "  TCP    0.0.0.0:3000        0.0.0.0:0           LISTENING       25684",
    "  TCP    [::1]:5175          [::]:0              LISTENING       17428",
    "  TCP    127.0.0.1:5174      127.0.0.1:55012     ESTABLISHED     999",
    "  UDP    0.0.0.0:5353        *:*                                 1234",
  ].join("\r\n");
  const ls = parseNetstatListeners(out);
  check("3 listeners LISTENING retenus", ls.length === 3);
  check("port 5174 / pid 3708", ls.some((l) => l.port === 5174 && l.pid === 3708));
  check("IPv6 [::1]:5175 / pid 17428", ls.some((l) => l.port === 5175 && l.pid === 17428));
  check("ESTABLISHED ignoré", !ls.some((l) => l.pid === 999));
  check("UDP ignoré", !ls.some((l) => l.pid === 1234));
}

console.log("\n[2] parseTasklistNodePids — CSV + cas vide");
{
  const csv = [
    `"node.exe","3708","Console","1","123 456 Ko"`,
    `"node.exe","17428","Console","1","98 765 Ko"`,
    `"chrome.exe","555","Console","1","1 Ko"`,
  ].join("\r\n");
  const pids = parseTasklistNodePids(csv);
  check("node 3708 + 17428 captés", pids.has(3708) && pids.has(17428));
  check("chrome ignoré", !pids.has(555));
  const empty = parseTasklistNodePids("INFO: Aucune tâche en cours d'exécution.");
  check("message d'info → set vide", empty.size === 0);
}

console.log("\n[3] selectVictims — plage, image node, exclusions");
{
  const ls: Listener[] = [
    { port: 5173, pid: 13952 }, // UI Mango — SOUS la base, hors plage
    { port: 5174, pid: 3708 },  // orphelin node ✓
    { port: 5175, pid: 17428 }, // orphelin node ✓
    { port: 5180, pid: 42 },    // node mais protégé (self)
    { port: 5181, pid: 555 },   // dans la plage mais PAS node
    { port: 5300, pid: 9999 },  // node mais HORS plage (base+span dépassé)
  ];
  const nodePids = new Set([3708, 17428, 42, 9999]);
  const v = selectVictims(ls, nodePids, { base: 5174, span: 120, exclude: [42, -1] });
  check("retient 3708 + 17428", v.includes(3708) && v.includes(17428));
  check("UI 5173 hors plage → épargnée", !v.includes(13952));
  check("self 42 protégé", !v.includes(42));
  check("555 non-node → épargné", !v.includes(555));
  check("9999 hors plage (5300 ≥ 5174+120) → épargné", !v.includes(9999));
  check("exactement 2 victimes", v.length === 2);
}

console.log("\n[4] selectVictims requireNode=false (POSIX) — pas de filtre image");
{
  const ls: Listener[] = [{ port: 5174, pid: 3708 }, { port: 5175, pid: 555 }];
  const v = selectVictims(ls, new Set(), { base: 5174, span: 120, exclude: [], requireNode: false });
  check("tous les PID de la plage candidats", v.includes(3708) && v.includes(555) && v.length === 2);
}

console.log("\n[5] sweepOrphanPreviews — orchestration injectée (zéro process réel)");
{
  const killed: number[] = [];
  const res = sweepOrphanPreviews({
    platform: "win32",
    listListeners: () => [
      { port: 5174, pid: 3708 },
      { port: 5175, pid: 17428 },
      { port: 5173, pid: 13952 }, // UI — hors plage
    ],
    nodePids: () => new Set([3708, 17428, 13952]),
    kill: (pid) => { killed.push(pid); },
  });
  check("2 orphelins tués", res.killed.length === 2 && killed.length === 2);
  check("UI 5173 épargnée", !killed.includes(13952));
  check("scanned = 3 listeners", res.scanned === 3);
}

console.log("\n[6] sweepOrphanPreviews — kill qui lève n'interrompt pas le balayage");
{
  const killed: number[] = [];
  const res = sweepOrphanPreviews({
    platform: "win32",
    listListeners: () => [{ port: 5174, pid: 1 }, { port: 5175, pid: 2 }],
    nodePids: () => new Set([1, 2]),
    kill: (pid) => { if (pid === 1) throw new Error("refus"); killed.push(pid); },
  });
  check("le 2ᵉ est quand même tué malgré l'échec du 1er", killed.includes(2));
  check("killed ne compte que les réussis", res.killed.length === 1 && res.killed[0] === 2);
}

console.log("\n[7] sweepOrphanPreviews — opt-out PREVIEW_SWEEP=off");
{
  const prev = process.env.PREVIEW_SWEEP;
  process.env.PREVIEW_SWEEP = "off";
  let called = false;
  const res = sweepOrphanPreviews({
    platform: "win32",
    listListeners: () => { called = true; return []; },
    nodePids: () => new Set(),
    kill: () => {},
  });
  check("aucun listing quand off", !called && res.killed.length === 0);
  if (prev === undefined) delete process.env.PREVIEW_SWEEP; else process.env.PREVIEW_SWEEP = prev;
}

console.log("\n[8] sweepOrphanPreviews — listListeners qui lève → boot jamais cassé");
{
  const res = sweepOrphanPreviews({
    platform: "win32",
    listListeners: () => { throw new Error("netstat absent"); },
    nodePids: () => new Set(),
    kill: () => {},
  });
  check("retourne un bilan vide, ne lève pas", res.killed.length === 0 && res.scanned === 0);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} preview-sweep : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
