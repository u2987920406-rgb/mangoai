// Test e2e #104 — Mango Agent Factory (circuit complet)
// Usage : npx tsx src/test-agent-factory-e2e.ts
import http from "node:http";

const BASE = "http://localhost:3000";
let passed = 0;
let failed = 0;

function ok(label: string, value: boolean, detail = ""): void {
  if (value) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function get(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, (res) => {
      let data = "";
      res.on("data", (c: Buffer) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    }).on("error", reject);
  });
}

function post(path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request(BASE + path, {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = "";
      res.on("data", (c: Buffer) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function del(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + path, { method: "DELETE" }, (res) => {
      let data = "";
      res.on("data", (c: Buffer) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// Crée un agent via SSE et renvoie le résultat final
function createAgentSSE(body: unknown): Promise<{ agentId?: string; ok?: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(BASE + "/api/agents", {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (res) => {
      let result: { agentId?: string; ok?: boolean; error?: string } = {};
      let buf = "";
      res.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim()) as { type: string; agentId?: string; ok?: boolean; message?: string };
            if (evt.type === "result") result = { agentId: evt.agentId, ok: evt.ok };
            if (evt.type === "error")  result = { error: evt.message };
          } catch { /* ignore */ }
        }
      });
      res.on("end", () => resolve(result));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🥭 Test e2e — Mango Agent Factory (#104)\n");
  const createdIds: string[] = [];

  // ── 1. Backend vivant ─────────────────────────────────────────────────────
  console.log("── 1. Backend ─────────────────────────────────────────────");
  const list = await get("/api/agents") as { agents?: unknown[]; runtime?: { activeCount: number } };
  ok("GET /api/agents répond", Array.isArray(list?.agents));
  ok("runtime.activeCount présent", typeof list?.runtime?.activeCount === "number");

  // ── 2. Création d'un agent collecteur simple ──────────────────────────────
  console.log("\n── 2. Création agent collecteur ───────────────────────────");
  const created = await createAgentSSE({
    name:        "Horloge Test",
    category:    "collecteur",
    description: "Logue l'heure courante à chaque tick. Agent de test e2e.",
    intervalMs:  5000,
  });
  ok("SSE génération terminée", created.ok === true, JSON.stringify(created));
  ok("agentId retourné", typeof created.agentId === "string");

  const agentId = created.agentId!;
  if (agentId) createdIds.push(agentId);

  // ── 3. Détail de l'agent créé ──────────────────────────────────────────────
  console.log("\n── 3. Détail agent ────────────────────────────────────────");
  const detail = await get(`/api/agents/${agentId}`) as { agent?: { name: string; category: string }; state?: { status: string } };
  ok("GET /api/agents/:id répond", !!detail?.agent);
  ok("Nom correct", detail?.agent?.name === "Horloge Test");
  ok("Catégorie collecteur", detail?.agent?.category === "collecteur");
  ok("État initial idle", detail?.state?.status === "idle");

  // ── 4. Démarrage de l'agent ────────────────────────────────────────────────
  console.log("\n── 4. Démarrage ───────────────────────────────────────────");
  const started = await post(`/api/agents/${agentId}/start`) as { ok: boolean; pid?: number; error?: string };
  ok("POST /start répond ok", started.ok === true, started.error ?? "");
  ok("PID retourné", typeof started.pid === "number");

  // Attendre le premier tick LLM (appel Claude peut prendre 10-15s)
  await sleep(20000);

  // ── 5. Statut + heartbeat ─────────────────────────────────────────────────
  console.log("\n── 5. Statut & heartbeat ──────────────────────────────────");
  const status = await get(`/api/agents/${agentId}/status`) as { status: string; lastHeartbeat?: string; taskCount?: number };
  ok("Statut running", status?.status === "running", `statut = ${status?.status}`);
  ok("Heartbeat présent", !!status?.lastHeartbeat);
  ok("Au moins 1 tâche effectuée", (status?.taskCount ?? 0) >= 1, `taskCount = ${status?.taskCount}`);

  // ── 6. Logs en live ───────────────────────────────────────────────────────
  console.log("\n── 6. Logs ────────────────────────────────────────────────");
  const logs = await get(`/api/agents/${agentId}/logs`) as { lines: string[] };
  ok("GET /logs répond", Array.isArray(logs?.lines));
  ok("Au moins 1 ligne de log", (logs?.lines?.length ?? 0) >= 1, `${logs?.lines?.length ?? 0} lignes`);
  const hasStartLog = logs?.lines?.some((l) => l.includes("démarré"));
  ok("Log de démarrage présent", !!hasStartLog);

  // ── 7. Envoi d'un message dans l'inbox ────────────────────────────────────
  console.log("\n── 7. Inbox ───────────────────────────────────────────────");
  const msgResult = await post("/api/agents/messages", {
    from:    "__test__",
    to:      agentId,
    type:    "task",
    payload: { instruction: "test e2e message" },
  }) as { ok: boolean; msgId?: string };
  ok("POST /messages répond ok", msgResult?.ok === true);
  ok("msgId retourné", typeof msgResult?.msgId === "string");

  // Laisser le tick consommer le message (intervalMs=5000 + LLM ~5s)
  await sleep(12000);

  const status2 = await get(`/api/agents/${agentId}/status`) as { taskCount?: number };
  ok("taskCount a augmenté après le message", (status2?.taskCount ?? 0) >= 1, `taskCount = ${status2?.taskCount}`);

  // ── 8. Arrêt propre ───────────────────────────────────────────────────────
  console.log("\n── 8. Arrêt ───────────────────────────────────────────────");
  const stopped = await post(`/api/agents/${agentId}/stop`) as { ok: boolean };
  ok("POST /stop répond ok", stopped.ok === true);

  await sleep(1000);
  const statusAfterStop = await get(`/api/agents/${agentId}/status`) as { status: string };
  ok("Statut stopped", statusAfterStop?.status === "stopped", `statut = ${statusAfterStop?.status}`);

  // ── 9. Coordinateur — mission sur 2 agents ────────────────────────────────
  console.log("\n── 9. Coordinateur (mission 2 agents) ─────────────────────");

  // Créer un agent processeur subordonné
  const sub1 = await createAgentSSE({
    name: "Analyseur Test", category: "processeur",
    description: "Analyse un texte et renvoie un résumé court.", intervalMs: 0,
  });
  ok("Sous-agent 1 créé", sub1.ok === true, sub1.error ?? "");
  if (sub1.agentId) createdIds.push(sub1.agentId);

  const sub2 = await createAgentSSE({
    name: "Validateur Test", category: "processeur",
    description: "Valide qu'un résultat est correct et retourne OK ou KO.", intervalMs: 0,
  });
  ok("Sous-agent 2 créé", sub2.ok === true, sub2.error ?? "");
  if (sub2.agentId) createdIds.push(sub2.agentId);

  // Créer le coordinateur
  const coord = await createAgentSSE({
    name: "Coordinateur Test", category: "coordinateur",
    description: "Orchestre une pipeline d'analyse et de validation.",
    intervalMs: 0,
    subordinates: [sub1.agentId!, sub2.agentId!].filter(Boolean),
  });
  ok("Coordinateur créé", coord.ok === true, coord.error ?? "");
  if (coord.agentId) createdIds.push(coord.agentId);

  // Lancer une mission
  const missionResult = await post(`/api/agents/${coord.agentId}/mission`, {
    goal: "Analyse le texte 'MangoOS est un builder IA local-first' et valide le résultat.",
  }) as { ok?: boolean; missionId?: string; summary?: string; error?: string };
  ok("Mission lancée sans erreur", missionResult?.ok === true, missionResult?.error ?? "");
  ok("missionId retourné", typeof missionResult?.missionId === "string");
  ok("Résumé de mission présent", typeof missionResult?.summary === "string" && missionResult.summary.length > 0);

  // ── 10. Nettoyage ─────────────────────────────────────────────────────────
  console.log("\n── 10. Nettoyage ──────────────────────────────────────────");
  for (const id of createdIds) {
    const r = await del(`/api/agents/${id}`) as { ok: boolean };
    ok(`Agent ${id.slice(0, 20)}… supprimé`, r.ok === true);
  }

  // Vérifier que le registry est vide
  const finalList = await get("/api/agents") as { agents?: unknown[] };
  ok("Registry vide après nettoyage", finalList?.agents?.length === 0, `${finalList?.agents?.length} agents restants`);

  // ── Résultat ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(56)}`);
  console.log(`Résultat : ${passed} ✅ passé(s)  ${failed} ❌ échoué(s)`);
  if (failed === 0) {
    console.log("🎉 Tous les tests e2e sont verts — Agent Factory opérationnel !");
  } else {
    console.log("⚠️  Des tests ont échoué — voir les détails ci-dessus.");
    process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error("Erreur fatale :", err.message);
  process.exit(1);
});
