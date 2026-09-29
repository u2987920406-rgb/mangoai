// Sonde : le fusible de boucle (ELEVE_BUDGET_*) est-il ARMÉ en environnement réel ?
//
// Exécution : cd server && set -a; . ./.env; set +a; npx tsx src/tests/probe-budget.ts
// Vérifie la chaîne complète : .env → process.env → forme du loopBudget que
// relay-agentic.ts câble dans runAgentic. Sans ça, D2 n'est qu'une intention.
import { flag, flagsSnapshot } from "../flags.js";

const chars = Number(process.env.ELEVE_BUDGET_PROMPT_CHARS ?? 0);
const calls = Number(process.env.ELEVE_BUDGET_TOOL_CALLS ?? 0);
const budget = chars > 0 || calls > 0
  ? { ...(chars > 0 ? { maxPromptChars: chars } : {}), ...(calls > 0 ? { maxToolCalls: calls } : {}) }
  : undefined;

console.log(`ELEVE_BUDGET_PROMPT_CHARS = ${process.env.ELEVE_BUDGET_PROMPT_CHARS ?? "(absent)"}`);
console.log(`ELEVE_BUDGET_TOOL_CALLS   = ${process.env.ELEVE_BUDGET_TOOL_CALLS ?? "(absent)"}`);
console.log(`loopBudget câblé          = ${JSON.stringify(budget)}`);
console.log(`ELEVE_AGENTIC_MAX_ITER    = ${process.env.ELEVE_AGENTIC_MAX_ITER ?? "(défaut 24)"}`);

// Le fusible doit être ARMÉ (défini) et COHÉRENT avec les autres bornes.
const armed = budget !== undefined;
let coherent = true;
if (armed) {
  const iter = Number(process.env.ELEVE_AGENTIC_MAX_ITER ?? 24);
  const ctxMax = Number(process.env.ELEVE_AGENTIC_CTX_MAX ?? 60_000);
  // maxToolCalls ne doit pas être atteint AVANT la limite d'itérations (sinon il
  // coupe des runs sains) ; maxPromptChars doit être un multiple raisonnable du
  // plafond de compaction, jamais en dessous.
  coherent = (budget.maxToolCalls === undefined || budget.maxToolCalls >= iter)
    && (budget.maxPromptChars === undefined || budget.maxPromptChars >= ctxMax);
}
console.log(`\nfusible armé : ${armed ? "OUI" : "NON"} — cohérent avec les bornes : ${coherent ? "OUI" : "NON"}`);
process.exit(armed && coherent ? 0 : 1);
