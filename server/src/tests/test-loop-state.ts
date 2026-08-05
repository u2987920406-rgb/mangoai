// Tests B0.3 — Snapshot de reprise (loop-state.ts), ÉCRITURE SEULE + intégration
// dans buildAgentic sous le gate ELEVE_RESUME. La restauration reste hors périmètre
// (= B1.4) : ces tests ne prouvent que l'écriture/lecture/suppression du fichier
// et son câblage aux frontières d'itération de la boucle.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { ToolRegistry } from "../kernel/kernel-mcp.js";
import { buildAgentic, type PostFn, type ToolCall } from "../eleve-runtime.js";
import { saveSnapshot, loadSnapshot, clearSnapshot, SNAPSHOT_FILE, type LoopSnapshot, type LoopStateDeps } from "../loop-state.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function call(name: string, args: object): ToolCall {
  return { id: `c_${name}_${Math.random().toString(36).slice(2, 6)}`, function: { name, arguments: JSON.stringify(args) } };
}

/** Faux disque en mémoire (Map) — prouve que les deps injectées sont bien utilisées
 * (pas de dépendance cachée au vrai fs) et rend les tests instantanés. */
function fakeDeps(): { deps: LoopStateDeps; store: Map<string, string> } {
  const store = new Map<string, string>();
  const deps: LoopStateDeps = {
    writeFile: (f, d) => { store.set(f, d); },
    readFile: (f) => {
      const v = store.get(f);
      if (v === undefined) throw new Error("ENOENT");
      return v;
    },
    exists: (f) => store.has(f),
    remove: (f) => { store.delete(f); },
  };
  return { deps, store };
}

function baseSnap(overrides: Partial<LoopSnapshot> = {}): LoopSnapshot {
  return {
    version: 2,
    ts: Date.now(),
    iter: 2,
    user: "u",
    hasWritten: true,
    messages: [{ role: "system", content: "sys" }, { role: "user", content: "u" }],
    toolTrace: [{ name: "write_file", args: '{"path":"a.js"}' }],
    ...overrides,
  };
}

async function run() {
  console.log("\n[1] save/load : round-trip fidèle (deps en mémoire)");
  {
    const { deps } = fakeDeps();
    const snap = baseSnap();
    saveSnapshot("/proj", snap, deps);
    const loaded = loadSnapshot("/proj", 2 * 3600 * 1000, deps);
    check("round-trip non-null", loaded !== null);
    check("contenu identique (deep)", JSON.stringify(loaded) === JSON.stringify(snap));
  }

  console.log("\n[2] loadSnapshot : périmé (ts vieux + now injecté) → null");
  {
    const { deps } = fakeDeps();
    const ttlMs = 2 * 3600 * 1000;
    const oldTs = 1_000_000;
    saveSnapshot("/proj", baseSnap({ ts: oldTs }), deps);
    const stillFresh = loadSnapshot("/proj", ttlMs, { ...deps, now: () => oldTs + ttlMs - 1 });
    check("juste SOUS le TTL → encore valide", stillFresh !== null);
    const expired = loadSnapshot("/proj", ttlMs, { ...deps, now: () => oldTs + ttlMs + 1 });
    check("juste AU-DESSUS du TTL → null", expired === null);
  }

  console.log("\n[3] loadSnapshot : corrompu (JSON invalide) → null (fail-open, ne lève jamais)");
  {
    const { deps, store } = fakeDeps();
    store.set(path.join("/proj", SNAPSHOT_FILE), "{ ceci n'est pas du JSON valide");
    let threw = false;
    let result: LoopSnapshot | null = null;
    try { result = loadSnapshot("/proj", 2 * 3600 * 1000, deps); } catch { threw = true; }
    check("ne lève jamais", !threw);
    check("renvoie null", result === null);
  }

  console.log("\n[4] loadSnapshot : version inconnue (legacy OU future) → null");
  {
    const { deps, store } = fakeDeps();
    const future = { ...baseSnap(), version: 3 };
    store.set(path.join("/proj", SNAPSHOT_FILE), JSON.stringify(future));
    check("version 3 (future) → null", loadSnapshot("/proj", 2 * 3600 * 1000, deps) === null);
    // v1 legacy (sans champ `user`) : ignoré aussi — on préfère perdre une reprise
    // que d'en faire une fausse (garde « même tâche » impossible sans `user`).
    const legacy = { ...baseSnap(), version: 1 } as Record<string, unknown>;
    delete legacy.user;
    store.set(path.join("/proj", SNAPSHOT_FILE), JSON.stringify(legacy));
    check("version 1 (legacy sans user) → null", loadSnapshot("/proj", 2 * 3600 * 1000, deps) === null);
    // v2 sans `user` (corrompu) : rejeté par la validation de forme.
    const noUser = { ...baseSnap() } as Record<string, unknown>;
    delete noUser.user;
    store.set(path.join("/proj", SNAPSHOT_FILE), JSON.stringify(noUser));
    check("v2 sans champ user → null", loadSnapshot("/proj", 2 * 3600 * 1000, deps) === null);
  }

  console.log("\n[5] loadSnapshot : absent → null (pas d'erreur)");
  {
    const { deps } = fakeDeps();
    const result = loadSnapshot("/proj", 2 * 3600 * 1000, deps);
    check("aucun fichier écrit → null", result === null);
  }

  console.log("\n[6] clearSnapshot : supprime le fichier ; fail-open si déjà absent");
  {
    const { deps, store } = fakeDeps();
    saveSnapshot("/proj", baseSnap(), deps);
    check("présent avant clear", store.size === 1);
    clearSnapshot("/proj", deps);
    check("absent après clear", store.size === 0);
    let threw = false;
    try { clearSnapshot("/proj", deps); } catch { threw = true; } // 2e clear : fichier déjà absent
    check("clear sur fichier déjà absent ne lève pas", !threw);
  }

  console.log("\n[7] save/load : round-trip avec le VRAI disque (mkdtemp + safe-io atomique)");
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loopstate-io-"));
    const snap = baseSnap();
    saveSnapshot(dir, snap);
    check("fichier .eleve-run.json créé sur disque", fs.existsSync(path.join(dir, SNAPSHOT_FILE)));
    check("aucun .tmp résiduel (écriture atomique)", !fs.existsSync(path.join(dir, `${SNAPSHOT_FILE}.tmp`)));
    const loaded = loadSnapshot(dir);
    check("relu depuis le vrai disque, contenu fidèle", JSON.stringify(loaded) === JSON.stringify(snap));
    clearSnapshot(dir);
    check("supprimé du vrai disque", !fs.existsSync(path.join(dir, SNAPSHOT_FILE)));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n[8] buildAgentic — gate ON (ELEVE_RESUME=on) : snapshot existe PENDANT, supprimé APRÈS finish");
  {
    const prevEnv = process.env.ELEVE_RESUME;
    process.env.ELEVE_RESUME = "on";
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loopstate-bg-on-"));
    try {
      const reg = new ToolRegistry();
      reg.register({ name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() }, handler: (a) => ({ text: `écrit ${a.path}` }) });
      reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
      const snapFile = path.join(tmpDir, SNAPSHOT_FILE);
      const steps: Array<{ toolCalls: ToolCall[] }> = [
        { toolCalls: [call("write_file", { path: "a.js", content: "x" })] },
        { toolCalls: [call("finish", { summary: "fini" })] },
      ];
      let i = 0;
      let sawDuring = false;
      const post: PostFn = async () => {
        if (i >= 1) sawDuring = sawDuring || fs.existsSync(snapFile);
        const step = steps[Math.min(i, steps.length - 1)];
        i++;
        return { content: "", toolCalls: step.toolCalls };
      };
      const r = await buildAgentic("sys", "x", reg, { post, maxIterations: 10, projectDir: tmpDir });
      check("finished === true", r.finished === true);
      check("le snapshot a existé PENDANT la boucle", sawDuring);
      check("le snapshot est supprimé APRÈS finish (sortie propre)", !fs.existsSync(snapFile));
    } finally {
      if (prevEnv === undefined) delete process.env.ELEVE_RESUME; else process.env.ELEVE_RESUME = prevEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log("\n[9] buildAgentic — gate OFF (défaut) : AUCUN fichier écrit, jamais");
  {
    const prevEnv = process.env.ELEVE_RESUME;
    delete process.env.ELEVE_RESUME; // gate off = défaut explicite
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loopstate-bg-off-"));
    try {
      const reg = new ToolRegistry();
      reg.register({ name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() }, handler: (a) => ({ text: `écrit ${a.path}` }) });
      reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
      const snapFile = path.join(tmpDir, SNAPSHOT_FILE);
      const steps: Array<{ toolCalls: ToolCall[] }> = [
        { toolCalls: [call("write_file", { path: "a.js", content: "x" })] },
        { toolCalls: [call("finish", { summary: "fini" })] },
      ];
      let i = 0;
      let sawAny = false;
      const post: PostFn = async () => {
        sawAny = sawAny || fs.existsSync(snapFile);
        const step = steps[Math.min(i, steps.length - 1)];
        i++;
        return { content: "", toolCalls: step.toolCalls };
      };
      const r = await buildAgentic("sys", "x", reg, { post, maxIterations: 10, projectDir: tmpDir });
      check("finished === true (comportement inchangé)", r.finished === true);
    } finally {
      if (prevEnv === undefined) delete process.env.ELEVE_RESUME; else process.env.ELEVE_RESUME = prevEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log("\n[10] buildAgentic — gate ON mais SANS projectDir : pas de throw, aucun fichier (nulle part où écrire)");
  {
    const prevEnv = process.env.ELEVE_RESUME;
    process.env.ELEVE_RESUME = "on";
    try {
      const reg = new ToolRegistry();
      reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
      const post: PostFn = async () => ({ content: "", toolCalls: [call("finish", { summary: "fini" })] });
      const r = await buildAgentic("sys", "x", reg, { post, maxIterations: 10 }); // pas de projectDir
      check("aucune exception, la boucle termine normalement", r.finished === true);
    } finally {
      if (prevEnv === undefined) delete process.env.ELEVE_RESUME; else process.env.ELEVE_RESUME = prevEnv;
    }
  }

  console.log("\n[B1.4] Reprise inter-session : restauration du snapshot dans buildAgentic");
  {
    const prevEnv = process.env.ELEVE_RESUME;
    process.env.ELEVE_RESUME = "on";
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-"));
    try {
      const snap: LoopSnapshot = {
        version: 2, ts: Date.now(), iter: 5, user: "construis la todo app", hasWritten: true,
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "construis la todo app" },
          { role: "assistant", content: "j'ai écrit src/App.jsx" },
        ],
        toolTrace: [{ name: "write_file", args: '{"path":"src/App.jsx"}' }],
      };
      fs.writeFileSync(path.join(tmpDir, SNAPSHOT_FILE), JSON.stringify(snap));

      const reg = new ToolRegistry();
      reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
      let firstMessagesLen = 0;
      let sawResumeNudge: boolean = false;
      const post: PostFn = async (messages) => {
        if (firstMessagesLen === 0) {
          firstMessagesLen = messages.length;
          sawResumeNudge = messages.some((m) => m.role === "user" && /REPRISE après interruption/.test(m.content));
        }
        return { content: "", toolCalls: [call("finish", { summary: "repris et fini" })] };
      };
      const r = await buildAgentic("sys", "construis la todo app", reg, { post, projectDir: tmpDir, maxIterations: 30 });
      check("historique restauré (system+user+assistant+nudge > 3)", firstMessagesLen > 3);
      check("nudge de RE-VÉRIFICATION injecté", sawResumeNudge);
      check("trace du run précédent conservée (write_file)", r.toolTrace.some((t) => t.name === "write_file"));
      check("le run reprend et finit", r.finished === true);
      check("snapshot supprimé après finish", !fs.existsSync(path.join(tmpDir, SNAPSHOT_FILE)));
    } finally {
      if (prevEnv === undefined) delete process.env.ELEVE_RESUME; else process.env.ELEVE_RESUME = prevEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log("\n[B1.4] Tâche DIFFÉRENTE → pas de reprise (run neuf)");
  {
    const prevEnv = process.env.ELEVE_RESUME;
    process.env.ELEVE_RESUME = "on";
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume2-"));
    try {
      const snap: LoopSnapshot = {
        version: 2, ts: Date.now(), iter: 3, user: "ANCIENNE tâche", hasWritten: true,
        messages: [{ role: "system", content: "sys" }, { role: "user", content: "ANCIENNE tâche" }],
        toolTrace: [{ name: "write_file", args: "{}" }],
      };
      fs.writeFileSync(path.join(tmpDir, SNAPSHOT_FILE), JSON.stringify(snap));
      const reg = new ToolRegistry();
      reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
      let sawResumeNudge: boolean = false;
      const post: PostFn = async (messages) => {
        sawResumeNudge = sawResumeNudge || messages.some((m) => /REPRISE après interruption/.test(m.content));
        return { content: "", toolCalls: [call("finish", { summary: "neuf" })] };
      };
      const r = await buildAgentic("sys", "NOUVELLE tâche différente", reg, { post, projectDir: tmpDir, maxIterations: 10 });
      check("tâche différente → aucun nudge de reprise", !sawResumeNudge);
      check("trace de l'ancien run NON héritée", !r.toolTrace.some((t) => t.name === "write_file"));
    } finally {
      if (prevEnv === undefined) delete process.env.ELEVE_RESUME; else process.env.ELEVE_RESUME = prevEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log("\n[B1.4] Gate OFF → jamais de reprise (identique)");
  {
    const prevEnv = process.env.ELEVE_RESUME;
    delete process.env.ELEVE_RESUME;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume3-"));
    try {
      const snap: LoopSnapshot = {
        version: 2, ts: Date.now(), iter: 4, user: "t", hasWritten: true,
        messages: [{ role: "system", content: "sys" }, { role: "user", content: "t" }],
        toolTrace: [{ name: "write_file", args: "{}" }],
      };
      fs.writeFileSync(path.join(tmpDir, SNAPSHOT_FILE), JSON.stringify(snap));
      const reg = new ToolRegistry();
      reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
      let sawResumeNudge: boolean = false;
      const post: PostFn = async (messages) => {
        sawResumeNudge = sawResumeNudge || messages.some((m) => /REPRISE après interruption/.test(m.content));
        return { content: "", toolCalls: [call("finish", { summary: "off" })] };
      };
      const r = await buildAgentic("sys", "t", reg, { post, projectDir: tmpDir, maxIterations: 10 });
    } finally {
      if (prevEnv === undefined) delete process.env.ELEVE_RESUME; else process.env.ELEVE_RESUME = prevEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} loop-state : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
