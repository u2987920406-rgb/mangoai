// Tests des mappers de transport Ollama tool-calling (eleve.ts, Phase E4).
// PURS, sans réseau : on prouve la traduction OpenAI⇄Ollama (arguments objet↔string,
// id généré, tool_calls). C'est ce qui permet à un modèle LOCAL de piloter la MÊME
// boucle agentique (souveraineté).

import { toOllamaMessages, fromOllamaResponse } from "./eleve.js";
import type { ChatMessage } from "./eleve-runtime.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function run() {
  console.log("\n[1] toOllamaMessages : arguments d'outil string → OBJET");
  {
    const msgs: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "fais X" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", function: { name: "write_file", arguments: '{"path":"a.js","content":"x"}' } }] },
      { role: "tool", tool_call_id: "c1", content: "écrit" },
    ];
    const out = toOllamaMessages(msgs);
    check("system/user/tool conservés (role+content)", out[0].role === "system" && out[1].content === "fais X" && out[3].role === "tool");
    const tc = out[2].tool_calls?.[0];
    check("assistant tool_calls présents", !!tc && tc.function.name === "write_file");
    check("arguments désérialisés en OBJET", typeof tc?.function.arguments === "object" && (tc!.function.arguments as Record<string, unknown>).path === "a.js");
  }

  console.log("\n[2] toOllamaMessages : arguments invalides → objet vide (jamais de crash)");
  {
    const out = toOllamaMessages([{ role: "assistant", content: "", tool_calls: [{ id: "c", function: { name: "f", arguments: "pas du json" } }] }]);
    check("arguments illisibles → {}", JSON.stringify(out[0].tool_calls?.[0].function.arguments) === "{}");
  }

  console.log("\n[3] fromOllamaResponse : tool_calls OBJET → notre forme (string + id)");
  {
    const data = { message: { content: "", tool_calls: [{ function: { name: "read_file", arguments: { path: "src/App.jsx" } } }] } };
    const r = fromOllamaResponse(data);
    check("toolCalls remontés", r.toolCalls?.length === 1);
    check("name conservé", r.toolCalls?.[0].function.name === "read_file");
    check("arguments re-stringifiés (JSON)", r.toolCalls?.[0].function.arguments === '{"path":"src/App.jsx"}');
    check("id généré (Ollama n'en fournit pas)", typeof r.toolCalls?.[0].id === "string" && r.toolCalls![0].id.length > 0);
  }

  console.log("\n[4] fromOllamaResponse : arguments déjà string (tolérance) + pas de tool_calls");
  {
    const r1 = fromOllamaResponse({ message: { content: "", tool_calls: [{ function: { name: "f", arguments: '{"a":1}' } }] } });
    check("arguments string laissés tels quels", r1.toolCalls?.[0].function.arguments === '{"a":1}');
    const r2 = fromOllamaResponse({ message: { content: "réponse finale" } });
    check("sans tool_calls → content seul, toolCalls absent", r2.content === "réponse finale" && r2.toolCalls === undefined);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-ollama-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
