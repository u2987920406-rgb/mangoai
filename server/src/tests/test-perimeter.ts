// #180 É1 — Test de preuve du noyau de périmètre (perimeter.ts).
// 100 % pur/local : workspace temp jetable, flags INJECTÉS, zéro réseau, zéro env.
// Prouve : (1) confinement `../` inviolable même avec coffres ; (2) le périmètre
// suit le pilote (D4) — coffre rw accessible en interactif, refusé en autonome
// tant que les 3 garde-fous ne sont pas TOUS armés (3 combinaisons OFF testées) ;
// (3) grant révoqué → re-refusé ; (4) NON-RÉGRESSION byte-identique à resolveInside.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveInsideAny,
  resolvePerimeter,
  perimeterRoots,
  addGrant,
  revokeGrant,
  listGrants,
  loadGrants,
  saveGrants,
  addGrantToFile,
  revokeGrantFromFile,
  type Grant,
  type PerimeterFlags,
} from "../perimeter.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}
function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

// Copie LOCALE du resolveInside canonique du repo (executor.ts / eleve-tools.ts),
// référence d'or pour prouver la non-régression byte-à-byte.
function resolveInsideRef(root: string, rel: string): string {
  const base = path.resolve(root);
  const abs = path.resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error(`chemin hors du projet : ${rel}`);
  }
  return abs;
}

const ALL_ON: PerimeterFlags = { stopAuthority: true, budgetHard: true, qaBus: true };

function run() {
  // Racines normalisées par l'OS, comme le fait le vrai code au boot.
  const WS = path.resolve(os.tmpdir(), "mango-perim-ws");
  const VAULT = path.resolve(os.tmpdir(), "mango-perim-vault");
  const grantsRW: Grant[] = [{ path: VAULT, mode: "rw", ts: 1 }];

  console.log("[1] resolveInsideAny — confinement (généralisation de resolveInside)");
  {
    // Union vide → tout est refusé (fail-safe).
    check("union vide refuse tout", throws(() => resolveInsideAny([], "a.txt")));
    // Chemin simple dans le workspace.
    check("fichier dans le workspace accepté", resolveInsideAny([WS], "src/App.jsx") === path.resolve(WS, "src/App.jsx"));
    check("racine elle-même acceptée", resolveInsideAny([WS], ".") === path.resolve(WS));
    // `../` refusé — le cœur de la barrière — MÊME avec plusieurs racines actives.
    check("../ refusé (une racine)", throws(() => resolveInsideAny([WS], "../evil.txt")));
    check("../ refusé MÊME avec coffres actifs", throws(() => resolveInsideAny([WS, VAULT], "../../etc/passwd")));
    check("../ enchaîné refusé", throws(() => resolveInsideAny([WS, VAULT], "sub/../../out.txt")));
    // Chemin ABSOLU hors de toute racine → refusé.
    const outside = path.resolve(os.tmpdir(), "mango-perim-elsewhere", "x.txt");
    check("chemin absolu hors racines refusé", throws(() => resolveInsideAny([WS, VAULT], outside)));
    // Confinement DANS chaque racine : un rel qui s'échappe des DEUX bases est
    // refusé (le test startsWith est appliqué à chaque base séparément, jamais
    // globalement — pas de « fuite » par juxtaposition de racines).
    check("rel échappant les deux bases refusé", throws(() => resolveInsideAny([WS, VAULT], "../../mango-perim-outside/steal.txt")));
    // Un fichier réellement dans le coffre est accepté par l'union.
    check("fichier dans le coffre accepté par l'union", resolveInsideAny([WS, VAULT], "note.md") === path.resolve(WS, "note.md"));
    // (l'union teste WS en premier → note.md tombe sous WS ; on vérifie l'accès
    //  spécifique au coffre via un chemin qui n'existe QUE sous VAULT)
    check("accès résolu sous la 1ère racine correspondante", resolveInsideAny([VAULT, WS], "note.md") === path.resolve(VAULT, "note.md"));
  }

  console.log("\n[2] NON-RÉGRESSION — resolveInsideAny([root]) ≡ resolveInside(root)");
  {
    const cases = ["a.txt", "src/App.jsx", "./x", ".", "deep/nested/file.ts", "../escape", "sub/../ok.txt", "sub/../../escape.txt"];
    let allAccept = true;
    let allReject = true;
    for (const rel of cases) {
      const refThrew = throws(() => resolveInsideRef(WS, rel));
      const anyThrew = throws(() => resolveInsideAny([WS], rel));
      // Même verdict (accepté/refusé) ET même valeur quand accepté.
      if (refThrew !== anyThrew) { allReject = false; }
      if (!refThrew && !anyThrew) {
        if (resolveInsideRef(WS, rel) !== resolveInsideAny([WS], rel)) allAccept = false;
      }
    }
    check("verdict accept/reject identique sur tous les cas", allReject);
    check("valeur retournée byte-identique quand accepté", allAccept);
    // Cas explicites lisibles.
    check("byte-identique : fichier simple", resolveInsideAny([WS], "a.txt") === resolveInsideRef(WS, "a.txt"));
    check("byte-identique : ../ refusé des deux côtés", throws(() => resolveInsideAny([WS], "../x")) && throws(() => resolveInsideRef(WS, "../x")));
  }

  console.log("\n[3] resolvePerimeter — interactif (Raf présent, palier large)");
  {
    const p = resolvePerimeter("interactive", { workspace: WS, grants: grantsRW, flags: { stopAuthority: false, budgetHard: false, qaBus: false } });
    check("interactif : workspace + coffre présents", p.roots.length === 2);
    check("interactif : jamais downgraded", p.downgraded === false);
    check("interactif : coffre rw conserve son mode", p.roots.some((r) => r.path === VAULT && r.mode === "rw"));
    check("interactif : flags IGNORÉS (large même 3 OFF)", p.roots.some((r) => r.path === VAULT));
    // Écriture dans le coffre rw ACCEPTÉE en interactif.
    const writeRoots = perimeterRoots(p, "write");
    check("interactif : écriture dans le coffre rw acceptée", resolveInsideAny(writeRoots, "note.md") !== "" && writeRoots.includes(VAULT));
  }

  console.log("\n[4] resolvePerimeter — autonome, 3 garde-fous ARMÉS (cas nominal sûr)");
  {
    const p = resolvePerimeter("autonomous", { workspace: WS, grants: grantsRW, flags: ALL_ON });
    check("autonome armé : coffre accessible (dans les roots)", p.roots.some((r) => r.path === VAULT));
    check("autonome armé : pas de downgrade", p.downgraded === false);
    check("autonome armé : coffre rabaissé en RO (jamais rw)", p.roots.every((r) => r.path !== VAULT || r.mode === "ro"));
    // Lecture OK dans le coffre…
    check("autonome armé : LECTURE du coffre autorisée", perimeterRoots(p, "read").includes(VAULT));
    // …mais ÉCRITURE refusée (coffre en ro → hors des racines d'écriture).
    check("autonome armé : ÉCRITURE dans le coffre refusée (ro)", !perimeterRoots(p, "write").includes(VAULT));
    check("autonome armé : écriture workspace toujours OK", perimeterRoots(p, "write").includes(WS));
    check("autonome armé : chemin coffre refusé en écriture", throws(() => resolveInsideAny(perimeterRoots(p, "write"), path.join(VAULT, "x.md"))));
  }

  console.log("\n[5] resolvePerimeter — autonome FAIL-SAFE : chaque garde-fou OFF isolément");
  {
    const combos: Array<[string, PerimeterFlags]> = [
      ["MANGOQA_STOP_AUTHORITY OFF", { stopAuthority: false, budgetHard: true, qaBus: true }],
      ["NOCTURNAL_BUDGET_HARD OFF", { stopAuthority: true, budgetHard: false, qaBus: true }],
      ["NOCTURNAL_QA_BUS OFF", { stopAuthority: true, budgetHard: true, qaBus: false }],
    ];
    for (const [label, flags] of combos) {
      const p = resolvePerimeter("autonomous", { workspace: WS, grants: grantsRW, flags });
      check(`${label} → workspace-only (1 racine)`, p.roots.length === 1 && p.roots[0].path === WS);
      check(`${label} → coffre ABSENT des racines`, !p.roots.some((r) => r.path === VAULT));
      check(`${label} → downgraded:true (coffre existait)`, p.downgraded === true);
      check(`${label} → chemin coffre REFUSÉ (read compris)`, throws(() => resolveInsideAny(perimeterRoots(p, "read"), path.join(VAULT, "x.md"))));
    }
    // Contraste net : le MÊME chemin coffre est accepté en interactif, refusé en autonome non-armé.
    const pi = resolvePerimeter("interactive", { workspace: WS, grants: grantsRW, flags: { stopAuthority: false, budgetHard: false, qaBus: false } });
    const pa = resolvePerimeter("autonomous", { workspace: WS, grants: grantsRW, flags: { stopAuthority: true, budgetHard: true, qaBus: false } });
    check("même coffre : accepté interactif / refusé autonome non-armé", perimeterRoots(pi, "read").includes(VAULT) && !perimeterRoots(pa, "read").includes(VAULT));
  }

  console.log("\n[6] resolvePerimeter — sans coffres : autonome non-armé n'est PAS 'downgraded'");
  {
    const p = resolvePerimeter("autonomous", { workspace: WS, grants: [], flags: { stopAuthority: false, budgetHard: false, qaBus: false } });
    check("aucun coffre + non-armé : workspace-only", p.roots.length === 1);
    check("aucun coffre : downgraded=false (rien n'a été restreint)", p.downgraded === false);
  }

  console.log("\n[7] Registre de grants — couche PURE (add/revoke/list)");
  {
    let g: Grant[] = [];
    g = addGrant(g, VAULT, "rw", 100);
    check("addGrant ajoute un coffre", g.length === 1 && g[0].mode === "rw");
    check("addGrant normalise le chemin (absolu)", g[0].path === path.resolve(VAULT));
    // Re-grant du même dossier → remplace, pas de doublon.
    g = addGrant(g, VAULT, "ro", 200);
    check("re-grant remplace le mode (pas de doublon)", g.length === 1 && g[0].mode === "ro" && g[0].ts === 200);
    // Ajout d'un second coffre distinct.
    const V2 = path.resolve(os.tmpdir(), "mango-perim-vault2");
    g = addGrant(g, V2, "rw", 300);
    check("second coffre distinct ajouté", g.length === 2);
    // Révocation.
    const revoked = revokeGrant(g, VAULT);
    check("revokeGrant retire le bon coffre", revoked.length === 1 && revoked[0].path === V2);
    check("revokeGrant est PUR (n'altère pas l'entrée)", g.length === 2);
    // listGrants filtre les entrées corrompues (fail-safe).
    const dirty = listGrants([{ path: VAULT, mode: "rw", ts: 1 }, { path: "", mode: "rw", ts: 1 }, { path: V2, mode: "bad", ts: 1 }, null, { mode: "rw" }, "x"]);
    check("listGrants écarte les entrées corrompues", dirty.length === 1 && dirty[0].path === path.resolve(VAULT));
  }

  console.log("\n[8] Grant révoqué → chemin re-refusé immédiatement (bout-en-bout décision)");
  {
    let g: Grant[] = addGrant([], VAULT, "rw", 1);
    const before = resolvePerimeter("interactive", { workspace: WS, grants: g, flags: ALL_ON });
    check("avant révocation : écriture coffre acceptée", perimeterRoots(before, "write").includes(VAULT) && !throws(() => resolveInsideAny(perimeterRoots(before, "write"), path.join(VAULT, "f.txt"))));
    g = revokeGrant(g, VAULT);
    const after = resolvePerimeter("interactive", { workspace: WS, grants: g, flags: ALL_ON });
    check("après révocation : coffre absent des racines", !after.roots.some((r) => r.path === VAULT));
    check("après révocation : chemin coffre REFUSÉ", throws(() => resolveInsideAny(perimeterRoots(after, "write"), path.join(VAULT, "f.txt"))));
  }

  console.log("\n[9] Registre de grants — couche I/O atomique (fichier temp injecté)");
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-grants-io-"));
    const file = path.join(dir, "desktop-grants.json");
    try {
      // Fichier absent → [] (fail-safe).
      check("loadGrants sur fichier absent → []", loadGrants(file).length === 0);
      // add persiste atomiquement + relit.
      addGrantToFile(VAULT, "rw", file, 42);
      check("addGrantToFile écrit le fichier", fs.existsSync(file));
      const reloaded = loadGrants(file);
      check("relecture rend le coffre persisté", reloaded.length === 1 && reloaded[0].path === path.resolve(VAULT) && reloaded[0].mode === "rw");
      // JSON corrompu → [] (jamais une ouverture d'accès sur fichier douteux).
      fs.writeFileSync(file, "{ pas du json");
      check("JSON corrompu → [] (fail-safe)", loadGrants(file).length === 0);
      // Réécriture propre puis révocation persistée.
      saveGrants([{ path: VAULT, mode: "ro", ts: 7 }], file);
      revokeGrantFromFile(VAULT, file);
      check("revokeGrantFromFile persiste la révocation", loadGrants(file).length === 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log(`\n──────── PERIMETER : ${pass} ✓ / ${fail} ✗ ────────`);
  if (fail > 0) process.exitCode = 1;
}

run();
