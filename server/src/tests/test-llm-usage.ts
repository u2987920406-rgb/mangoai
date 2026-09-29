// D1 (audit 2026-09-28, constat B4) — preuve que le champ `usage` est LU et CUMULÉ.
//
// Quatre volets, aucun réseau réel, aucun appel modèle :
//   [A] `parseUsage` (PUR) : formats OpenAI-compat, Ollama natif, Anthropic-style,
//       et le cas « rien d'exploitable » (→ null, jamais une estimation) ;
//   [B] transport : un faux serveur HTTP local renvoie une réponse canonique AVEC
//       son `usage` → les trois briques (openAiChat, openAiChatTools, ollamaChat)
//       alimentent le compteur du run — valeur ATTENDUE vs valeur OBTENUE ;
//   [C] `askLLM` (llm-engine.ts, la porte d'entrée citée par l'audit) fait remonter
//       l'usage de bout en bout, sans changer sa valeur de retour (toujours le texte) ;
//   [D] honnêteté : un appel sans `usage` est compté NON MESURÉ, jamais estimé ; et
//       un nouveau run repart de zéro sans perdre le précédent.

import http from "node:http"
import {
  parseUsage,
  recordLLMUsage,
  startLLMRun,
  getLLMRun,
  resetLLMUsage,
} from "../llm/llm-usage.js"
import { openAiChat, openAiChatTools, ollamaChat } from "../llm/llm-transport.js"
import { askLLM } from "../llm/llm-engine.js"

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

/** Serveur local qui répond TOUJOURS `reply` (JSON) — le « faux client » du transport. */
function serve(reply: unknown): Promise<{ base: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.on("data", () => undefined)
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(reply))
      })
    })
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      resolve({ base: `http://127.0.0.1:${port}`, close: () => server.close() })
    })
  })
}

async function run() {
  // ── [A] parseUsage — PUR ─────────────────────────────────────────────────
  console.log("\n[A] parseUsage (pur)")
  const openai = parseUsage({ usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 } })
  check("OpenAI-compat : 1200 / 300 / 1500",
    openai?.promptTokens === 1200 && openai?.completionTokens === 300 && openai?.totalTokens === 1500)
  const sansTotal = parseUsage({ usage: { prompt_tokens: 10, completion_tokens: 5 } })
  check("total_tokens absent → somme (15)", sansTotal?.totalTokens === 15)
  const ollama = parseUsage({ message: { content: "x" }, prompt_eval_count: 40, eval_count: 7 })
  check("Ollama natif : prompt_eval_count/eval_count → 40 / 7 / 47",
    ollama?.promptTokens === 40 && ollama?.completionTokens === 7 && ollama?.totalTokens === 47)
  const anthropic = parseUsage({ usage: { input_tokens: 9, output_tokens: 2 } })
  check("Anthropic-style : input/output → 9 / 2", anthropic?.promptTokens === 9 && anthropic?.completionTokens === 2)
  check("réponse sans usage → null (jamais estimé)", parseUsage({ choices: [{ message: { content: "x" } }] }) === null)
  check("payload non-objet → null", parseUsage("texte") === null && parseUsage(null) === null)
  check("valeurs non numériques ignorées", parseUsage({ usage: { prompt_tokens: "beaucoup" } }) === null)

  // ── [B] transport : usage cumulé dans le run ─────────────────────────────
  console.log("\n[B] transport → compteur du run")
  resetLLMUsage()
  startLLMRun("test-transport")

  const sOpenAI = await serve({
    choices: [{ message: { content: "bonjour" } }],
    usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
  })
  const texte = await openAiChat("sys", "usr", { url: `${sOpenAI.base}/v1/chat/completions`, key: "k", model: "modele-x", timeoutMs: 5000 })
  sOpenAI.close()
  check("openAiChat renvoie toujours le TEXTE (valeur de retour inchangée)", texte === "bonjour")
  const apres1 = getLLMRun()!
  check(`après 1 appel : 1200 jetons cumulés (obtenu ${apres1.totalTokens})`, apres1.totalTokens === 1200)
  check(`prompt/complétion ventilés (obtenu ${apres1.promptTokens}/${apres1.completionTokens})`,
    apres1.promptTokens === 1000 && apres1.completionTokens === 200)
  check("ventilation par modèle : modele-x", apres1.byModel["modele-x"]?.totalTokens === 1200)

  const sTools = await serve({
    choices: [{ message: { content: "", tool_calls: [{ id: "1", function: { name: "read_file", arguments: "{}" } }] } }],
    usage: { prompt_tokens: 500, completion_tokens: 50, total_tokens: 550 },
  })
  const withTools = await openAiChatTools({ url: `${sTools.base}/v1/chat/completions`, key: "k", model: "modele-x", timeoutMs: 5000, messages: [{ role: "user", content: "go" }], tools: null })
  sTools.close()
  check("openAiChatTools renvoie toujours ses tool_calls", withTools.toolCalls?.length === 1)
  const apres2 = getLLMRun()!
  check(`chemin de l'Élève (tools) cumulé : 1200+550 = 1750 (obtenu ${apres2.totalTokens})`, apres2.totalTokens === 1750)
  check(`2 appels mesurés (obtenu ${apres2.calls})`, apres2.calls === 2)

  const sOllama = await serve({ message: { content: "salut" }, prompt_eval_count: 300, eval_count: 25 })
  const textOllama = await ollamaChat("sys", "usr", { baseUrl: sOllama.base, model: "modele-ollama", timeoutMs: 5000 })
  sOllama.close()
  check("ollamaChat renvoie toujours son texte", textOllama === "salut")
  const apres3 = getLLMRun()!
  check(`Ollama cumulé : 1750+325 = 2075 (obtenu ${apres3.totalTokens})`, apres3.totalTokens === 2075)
  check("ventilation par modèle : 2 modèles distincts", Object.keys(apres3.byModel).sort().join(",") === "modele-ollama,modele-x")

  // ── [C] askLLM (llm-engine.ts:191-220) de bout en bout ───────────────────
  console.log("\n[C] askLLM → compteur")
  resetLLMUsage()
  startLLMRun("test-askllm")
  const sEngine = await serve({
    choices: [{ message: { content: "réponse" } }],
    usage: { prompt_tokens: 77, completion_tokens: 23, total_tokens: 100 },
  })
  const prevKey = process.env.LLM_OPENAI_KEY
  process.env.LLM_OPENAI_KEY = "cle-de-test"
  const out = await askLLM("sys", "usr", { provider: "openai", model: "modele-engine", baseUrl: `${sEngine.base}/v1`, timeoutMs: 5000 })
  if (prevKey === undefined) delete process.env.LLM_OPENAI_KEY; else process.env.LLM_OPENAI_KEY = prevKey
  sEngine.close()
  check("askLLM renvoie toujours le texte", out === "réponse")
  const engineRun = getLLMRun()!
  check(`askLLM : 100 jetons comptés (obtenu ${engineRun.totalTokens})`, engineRun.totalTokens === 100)
  check("askLLM : attribué au bon modèle", engineRun.byModel["modele-engine"]?.calls === 1)

  // ── [D] honnêteté + isolation des runs ───────────────────────────────────
  console.log("\n[D] honnêteté (non mesuré) et isolation des runs")
  const sMuet = await serve({ choices: [{ message: { content: "sans usage" } }] })
  await openAiChat("sys", "usr", { url: `${sMuet.base}/v1/chat/completions`, key: "k", model: "modele-muet", timeoutMs: 5000 })
  sMuet.close()
  const muet = getLLMRun()!
  check(`appel sans usage : compté NON MESURÉ (obtenu ${muet.unmeasuredCalls})`, muet.unmeasuredCalls === 1)
  check("appel sans usage : total inchangé, aucune estimation", muet.totalTokens === 100 && muet.calls === 1)
  check("appel sans usage : pas d'entrée fantôme par modèle", muet.byModel["modele-muet"] === undefined)

  const premierRun = getLLMRun()!.runId
  const nouveau = startLLMRun("run-suivant")
  recordLLMUsage({ usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } }, { model: "m2" })
  check("nouveau run : compteur reparti de zéro (7)", getLLMRun()!.totalTokens === 7)
  check("run précédent conservé et inchangé (100)", getLLMRun(premierRun)?.totalTokens === 100)
  check("les deux runs ont des identités distinctes", nouveau !== premierRun)
  const copie = getLLMRun()!
  copie.totalTokens = 99999
  check("getLLMRun rend une COPIE (muter n'altère pas le compteur)", getLLMRun()!.totalTokens === 7)
  check("recordLLMUsage ne lève jamais (payload absurde)", recordLLMUsage(undefined, {}) === null)

  console.log(`\n${fail === 0 ? "✅" : "❌"} llm-usage : ${pass} pass, ${fail} fail`)
  if (fail > 0) process.exit(1)
}

run().catch((e) => { console.error(e); process.exit(1) })
