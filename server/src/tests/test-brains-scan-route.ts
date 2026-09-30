// POST /api/brains/scan existe enfin côté serveur (audit dormant #36) : l'UI l'appelait, la route avait disparu.
// Ollama est simulé (aucun modèle réel, aucun coût).
import assert from "node:assert/strict";
import http from "node:http";

const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: { role: "assistant", content: "je ne sais pas" }, done: true }));
  });
});
await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
process.env.OLLAMA_URL = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;

const express = (await import("express")).default;
const { registerSystemRoutes } = await import("../routes/system-routes.js");
const app = express();
registerSystemRoutes(app);
const srv = app.listen(0, "127.0.0.1");
await new Promise((r) => srv.once("listening", r));
const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
const post = (body: unknown) => fetch(`${base}/api/brains/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

assert.equal((await post({})).status, 400, "modèle manquant");
assert.equal((await post({ model: "x", provider: "openai" })).status, 400, "cloud refusé (coûterait à chaque clic)");
const ok = await post({ model: "qwen-fake", provider: "ollama" });
assert.equal(ok.status, 200);
const d = (await ok.json()) as { card: { verdict: string }; summary: string };
assert.match(d.card.verdict, /^(agentic|contract|discuss|reject)$/);
assert.ok(d.summary.length > 0);

const gates = await (await fetch(`${base}/api/gates`)).json() as { caps: Array<{ finite: boolean }> };
assert.ok(gates.caps.every((c) => c.finite), "/api/gates répond et aucun plafond n'est illimité");

srv.close(); fake.close();
console.log("✓ test-brains-scan-route");
process.exit(0);
