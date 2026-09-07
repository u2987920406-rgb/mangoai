// Test du bug shortModelLabel : un tag NON-quant (latest, v1, free) ne doit
// PAS être enveloppé dans des parenthèses comme s'il était une quantification.
// Style « check() maison » du repo (pas de jest).
import { shortModelLabel } from "../brain/brain-registry.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("─".repeat(60));
console.log("test-short-model-label (bug tag non-quant)");
console.log("─".repeat(60));

console.log("\n[1] tag non-quant ne doit PAS être parenthésé");
{
  check('glm-5.3:latest → "glm 5.3 latest"',
    shortModelLabel("glm-5.3:latest") === "glm 5.3 latest");
  check('deepseek-v4-flash:free → "deepseek v4 flash free"',
    shortModelLabel("deepseek-v4-flash:free") === "deepseek v4 flash free");
  check('model:v1 → "model v1"',
    shortModelLabel("model:v1") === "model v1");
}

console.log("\n[2] tag quant réel reste parenthésé (régression)");
{
  check('Qwythos-9B-v2-GGUF:Q6_K → "Qwythos 9B v2 (Q6)"',
    shortModelLabel("hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q6_K") === "Qwythos 9B v2 (Q6)");
  check('model:q4_0 → "model (Q4)"',
    shortModelLabel("model:q4_0") === "model (Q4)");
}

console.log("\n[3] sans tag → nom nettoyé seul");
{
  check('glm-5.3 → "glm 5.3"',
    shortModelLabel("glm-5.3") === "glm 5.3");
  check('null → null', shortModelLabel(null) === null);
  check('undefined → null', shortModelLabel(undefined) === null);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} short-model-label : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
