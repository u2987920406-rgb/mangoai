// Tests du backoff/retry du transport Élève (eleve-retry.ts). Pur, déterministe.

import { isRetryableStatus, eleveRetryDelayMs, eleveMaxRetries } from "../eleve-retry.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("\n[1] isRetryableStatus — 429/503 oui, le reste non");
{
  check("429 retryable", isRetryableStatus(429));
  check("503 retryable", isRetryableStatus(503));
  check("500 NON (peut être un runner local cassé)", !isRetryableStatus(500));
  check("400 NON", !isRetryableStatus(400));
  check("401 NON (auth)", !isRetryableStatus(401));
  check("200 NON", !isRetryableStatus(200));
}

console.log("\n[2] eleveRetryDelayMs — backoff exponentiel borné");
{
  check("429 attempt0 → 2000ms", eleveRetryDelayMs(429, 0, null) === 2000);
  check("429 attempt1 → 4000ms", eleveRetryDelayMs(429, 1, null) === 4000);
  check("429 attempt2 → 8000ms", eleveRetryDelayMs(429, 2, null) === 8000);
  check("429 attempt3 → 16000ms", eleveRetryDelayMs(429, 3, null) === 16000);
  check("borné à 20000ms (attempt élevé clampé)", eleveRetryDelayMs(503, 10, null, 99) === 20000);
}

console.log("\n[3] eleveRetryDelayMs — budget épuisé → null");
{
  check("attempt == maxRetries → null (stop)", eleveRetryDelayMs(429, 4, null, 4) === null);
  check("attempt > maxRetries → null", eleveRetryDelayMs(429, 5, null, 4) === null);
  check("dernier essai autorisé (3 < 4) → délai", eleveRetryDelayMs(429, 3, null, 4) === 16000);
}

console.log("\n[4] eleveRetryDelayMs — code non transitoire → null même au 1ᵉʳ essai");
{
  check("500 → null (pas de retry)", eleveRetryDelayMs(500, 0, null) === null);
  check("401 → null", eleveRetryDelayMs(401, 0, null) === null);
}

console.log("\n[5] eleveRetryDelayMs — respecte Retry-After (secondes)");
{
  check("Retry-After: 3 → 3000ms", eleveRetryDelayMs(429, 0, "3") === 3000);
  check("Retry-After prioritaire sur le backoff", eleveRetryDelayMs(429, 2, "1") === 1000);
  check("Retry-After borné à 30000ms", eleveRetryDelayMs(429, 0, "120") === 30000);
  check("Retry-After invalide → backoff", eleveRetryDelayMs(429, 0, "abc") === 2000);
  check("Retry-After vide → backoff", eleveRetryDelayMs(429, 1, "  ") === 4000);
}

console.log("\n[6] eleveMaxRetries — défaut + env + bornes");
{
  check("défaut 4", eleveMaxRetries({}) === 4);
  check("env 2", eleveMaxRetries({ ELEVE_RETRY_MAX: "2" }) === 2);
  check("env 0 autorisé (pas de retry)", eleveMaxRetries({ ELEVE_RETRY_MAX: "0" }) === 0);
  check("borné à 8", eleveMaxRetries({ ELEVE_RETRY_MAX: "999" }) === 8);
  check("invalide → 4", eleveMaxRetries({ ELEVE_RETRY_MAX: "x" }) === 4);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-retry : ${pass}/${pass + fail} (échecs : ${fail})`);
if (fail > 0) process.exit(1);
