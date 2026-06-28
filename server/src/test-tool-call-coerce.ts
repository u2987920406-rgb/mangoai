// Tests du fallback de tool-calling (tool-call-coerce.ts). Pur, déterministe.

import { coerceTextToolCall } from "./tool-call-coerce.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const TOOLS = ["read_file", "write_file", "edit_file", "check_types", "finish"];

console.log("\n[1] Cas réel qwen2.5-coder : JSON {name, arguments} en content");
{
  const c = coerceTextToolCall('{\n  "name": "read_file",\n  "arguments": {\n    "path": "src/App.jsx"\n  }\n}', TOOLS);
  check("appel reconnu", c?.name === "read_file");
  check("arguments sérialisés en JSON", c?.arguments === '{"path":"src/App.jsx"}');
}

console.log("\n[2] Fences markdown ```json … ```");
{
  const c = coerceTextToolCall('```json\n{"name":"write_file","arguments":{"path":"a.js","content":"x"}}\n```', TOOLS);
  check("fence retiré + reconnu", c?.name === "write_file" && /"path":"a.js"/.test(c?.arguments ?? ""));
}

console.log("\n[3] Balise <tool_call> (format Qwen)");
{
  const c = coerceTextToolCall('<tool_call>{"name":"check_types","arguments":{}}</tool_call>', TOOLS);
  check("balise retirée + reconnu", c?.name === "check_types" && c?.arguments === "{}");
}

console.log("\n[4] Texte autour du JSON (préambule du modèle)");
{
  const c = coerceTextToolCall('Je vais lire le fichier.\n{"name":"read_file","arguments":{"path":"x.ts"}}', TOOLS);
  check("1er objet JSON extrait malgré le préambule", c?.name === "read_file" && /x\.ts/.test(c?.arguments ?? ""));
}

console.log("\n[5] Champs alternatifs (tool/parameters)");
{
  const c = coerceTextToolCall('{"tool":"edit_file","parameters":{"find":"a","replace":"b"}}', TOOLS);
  check("tool/parameters acceptés", c?.name === "edit_file" && /"find":"a"/.test(c?.arguments ?? ""));
}

console.log("\n[6] arguments en STRING (déjà sérialisés)");
{
  const c = coerceTextToolCall('{"name":"read_file","arguments":"{\\"path\\":\\"y.ts\\"}"}', TOOLS);
  check("arguments string conservés", c?.name === "read_file" && /y\.ts/.test(c?.arguments ?? ""));
}

console.log("\n[7] Refus : outil INCONNU (jamais inventer un outil hors registre)");
{
  const c = coerceTextToolCall('{"name":"rm_rf","arguments":{"path":"/"}}', TOOLS);
  check("outil hors registre → null", c === null);
}

console.log("\n[8] Refus : pas un appel d'outil (prose / JSON non-conforme)");
{
  check("prose pure → null", coerceTextToolCall("La tâche est terminée, tout est bon.", TOOLS) === null);
  check("JSON sans name → null", coerceTextToolCall('{"resultat":"ok"}', TOOLS) === null);
  check("vide → null", coerceTextToolCall("", TOOLS) === null);
  check("JSON cassé → null", coerceTextToolCall('{"name":"read_file", arguments:', TOOLS) === null);
}

console.log("\n[9] Objet imbriqué avec accolades dans une string");
{
  const c = coerceTextToolCall('{"name":"write_file","arguments":{"path":"a.js","content":"const o = { a: 1 };"}}', TOOLS);
  check("équilibrage des accolades correct (string avec {})", c?.name === "write_file" && /const o = \{ a: 1 \}/.test(c?.arguments ?? ""));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} tool-call-coerce : ${pass}/${pass + fail} (échecs : ${fail})`);
if (fail > 0) process.exit(1);
