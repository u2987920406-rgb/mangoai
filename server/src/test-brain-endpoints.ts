// C1-P0 — Cerveau de l'Élève rebranchable EN UNE LIGNE du registre
// (server/data/brain-registry.json : BrainConfig.baseUrl/apiKeyEnv). Ce test prouve
// la fonction PURE de résolution d'endpoint (eleve.ts:openAiEndpoint) : absence de
// endpoint → comportement IDENTIQUE à aujourd'hui (repli ELEVE_API_URL/ELEVE_API_KEY
// de .env) ; présence → l'endpoint custom prime, la clé se résout au DERNIER moment
// via process.env[apiKeyEnv] — jamais threadée en clair ailleurs. Zéro réseau.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── ENV déterministe AVANT import : ELEVE_API_URL/ELEVE_API_KEY sont capturés en
// const au CHARGEMENT du module eleve.ts — il faut les poser avant le premier import,
// et effacer tout résidu ambiant (DEEPSEEK_API_KEY…) pour un test 100% reproductible.
delete process.env.DEEPSEEK_API_KEY;
delete process.env.MISTRAL_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.NOPE_VAR_ABSENTE;
process.env.ELEVE_API_URL = "https://elevetest.example/v1";
process.env.ELEVE_API_KEY = "today-key-unchanged";

const { openAiEndpoint, completionsUrl } = await import("./eleve.js");
const { globalFallback, resolveBinding } = await import("./brain-runtime.js");

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function run() {
  console.log("\n[1] Champ endpoint ABSENT → résolution IDENTIQUE à aujourd'hui (repli .env)");
  {
    const today = { url: completionsUrl(process.env.ELEVE_API_URL!), key: process.env.ELEVE_API_KEY! };

    const r = openAiEndpoint("openai");
    check("url = repli .env normalisé", r.url === today.url);
    check("url exacte attendue (…/chat/completions)", r.url === "https://elevetest.example/v1/chat/completions");
    check("clé = ELEVE_API_KEY", r.key === today.key);

    const r2 = openAiEndpoint("openai", undefined);
    check("endpoint=undefined explicite → égalité STRICTE avec le repli", r2.url === today.url && r2.key === today.key);

    const r3 = openAiEndpoint("openai", {});
    check("endpoint={} (champs absents) → égalité STRICTE avec le repli", r3.url === today.url && r3.key === today.key);
  }

  console.log("\n[2] Endpoint custom fourni ({baseUrl, apiKeyEnv}) → prime sur le repli .env");
  {
    process.env.TEST_KEY_X = "secret123";
    const r = openAiEndpoint("openai", { baseUrl: "http://fake:9999/v1", apiKeyEnv: "TEST_KEY_X" });
    check("url vise l'endpoint custom normalisé", r.url === "http://fake:9999/v1/chat/completions");
    check("clé résolue via process.env[apiKeyEnv]", r.key === "secret123");
  }

  console.log("\n[3] apiKeyEnv pointant une variable ABSENTE → repli fail-open, jamais de crash");
  {
    let threw = false;
    let r: { url: string; key: string } | null = null;
    try {
      r = openAiEndpoint("openai", { baseUrl: "http://fake:9999/v1", apiKeyEnv: "NOPE_VAR_ABSENTE" });
    } catch { threw = true; }
    check("ne lève jamais", !threw);
    check("clé retombe sur ELEVE_API_KEY (fail-open)", r?.key === "today-key-unchanged");

    // baseUrl ET apiKeyEnv absents de l'environnement → repli COMPLET = chemin actuel.
    const r2 = openAiEndpoint("openai", { apiKeyEnv: "NOPE_VAR_ABSENTE" });
    check(
      "baseUrl absent + apiKeyEnv non résolu → url ET clé = repli .env actuel",
      r2.url === "https://elevetest.example/v1/chat/completions" && r2.key === "today-key-unchanged",
    );
  }

  console.log("\n[4] Presets (deepseek) et litellm : branche NON touchée par C1-P0, endpoint absent");
  {
    const r = openAiEndpoint("deepseek");
    check("deepseek : url = preset dédié (≠ repli ELEVE_API_URL)", r.url !== completionsUrl(process.env.ELEVE_API_URL!));
    check("deepseek : DEEPSEEK_API_KEY absent → clé retombe sur ELEVE_API_KEY (repli actuel inchangé)", r.key === "today-key-unchanged");
  }

  console.log("\n[5] SÉCURITÉ — le NOM de la variable (apiKeyEnv) est threadé, JAMAIS la valeur en clair");
  {
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mango-brain-endpoints-"));
    const REG = path.join(TMP, "brain-registry.json");
    const prevReg = process.env.BRAIN_REGISTRY_FILE;
    process.env.TEST_KEY_SECURE = "sekrit-value-999";
    try {
      // Le registre (server/data/brain-registry.json en prod) ne porte QUE le nom
      // de la variable — jamais la clé. On simule cette « une ligne » ici.
      fs.writeFileSync(REG, JSON.stringify({
        codeur: { provider: "openai", model: "mon-codeur:1b", baseUrl: "http://example.test/v1", apiKeyEnv: "TEST_KEY_SECURE" },
      }));
      process.env.BRAIN_REGISTRY_FILE = REG;

      const g = globalFallback();
      check("globalFallback porte le NOM apiKeyEnv (pas la valeur)", g.apiKeyEnv === "TEST_KEY_SECURE");
      check("globalFallback porte le baseUrl du registre", g.baseUrl === "http://example.test/v1");
      check("la valeur secrète n'apparaît JAMAIS dans globalFallback()", !JSON.stringify(g).includes("sekrit-value-999"));

      const b = resolveBinding("construire"); // pas de routage par intention → repli global
      check("resolveBinding (repli) porte le NOM apiKeyEnv", b.apiKeyEnv === "TEST_KEY_SECURE");
      check("la valeur secrète n'apparaît JAMAIS dans resolveBinding()", !JSON.stringify(b).includes("sekrit-value-999"));

      // Seule openAiEndpoint (dernier maillon) lit process.env[apiKeyEnv].
      const r = openAiEndpoint(b.provider, { baseUrl: b.baseUrl, apiKeyEnv: b.apiKeyEnv });
      check("la clé n'est résolue qu'au DERNIER moment, correctement", r.key === "sekrit-value-999");
      check("l'URL custom du registre est atteinte", r.url === "http://example.test/v1/chat/completions");
    } finally {
      if (prevReg === undefined) delete process.env.BRAIN_REGISTRY_FILE; else process.env.BRAIN_REGISTRY_FILE = prevReg;
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} brain-endpoints : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
