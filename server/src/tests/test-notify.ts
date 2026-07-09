// Tests du push ntfy (notify.ts) — fetch injecté, zéro réseau.

import { notifyNtfy, asciiHeader, type NotifyDeps } from "../notify.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

interface Call { url: string; method: string; headers: Record<string, string>; body: string; }
function recorder(ok = true, status = 200): { deps: NotifyDeps; calls: Call[] } {
  const calls: Call[] = [];
  const deps: NotifyDeps = {
    fetch: async (url, init) => { calls.push({ url, ...init }); return { ok, status }; },
  };
  return { deps, calls };
}

// ── no-op sans topic ──
{
  const { deps, calls } = recorder();
  const r = await notifyNtfy("", "Titre", "msg", "http://x", deps);
  check("no-op si topic vide (sent:false, reason:no-topic)", r.sent === false && r.reason === "no-topic");
  check("no-op = aucune requête réseau", calls.length === 0);
  const r2 = await notifyNtfy(undefined, "T", "m", undefined, deps);
  check("no-op si topic undefined", r2.sent === false && r2.reason === "no-topic");
}

// ── envoi nominal ──
{
  const { deps, calls } = recorder();
  const r = await notifyNtfy("mango-test", "3 variantes à valider", "Goût en attente", "http://192.168.1.10:3000/taste/review", deps);
  check("envoi ok (sent:true)", r.sent === true && r.status === 200);
  check("URL = ntfy.sh/<topic>", calls[0].url === "https://ntfy.sh/mango-test");
  check("POST avec body = message", calls[0].method === "POST" && calls[0].body === "Goût en attente");
  check("en-tête Click = URL LAN", calls[0].headers["Click"] === "http://192.168.1.10:3000/taste/review");
  check("en-tête Title présent", typeof calls[0].headers["Title"] === "string");
}

// ── en-tête ASCII (ntfy refuse l'UTF-8 dans Title) ──
check("asciiHeader retire les accents", asciiHeader("goût à valider") === "gout a valider");
check("asciiHeader réduit à de l'ASCII imprimable", /^[\x20-\x7e]*$/.test(asciiHeader("éàü★ç")));
{
  const { deps, calls } = recorder();
  await notifyNtfy("t", "café à 5★", "x", undefined, deps);
  check("Title envoyé est ASCII pur", /^[\x20-\x7e]*$/.test(calls[0].headers["Title"]));
}

// ── erreurs : ne lève jamais ──
{
  const { deps } = recorder(false, 503);
  const r = await notifyNtfy("t", "T", "m", undefined, deps);
  check("statut non-ok → sent:false reason:error", r.sent === false && r.reason === "error" && r.status === 503);
}
{
  const throwing: NotifyDeps = { fetch: async () => { throw new Error("network down"); } };
  let threw = false;
  let r;
  try { r = await notifyNtfy("t", "T", "m", undefined, throwing); } catch { threw = true; }
  check("fetch qui throw → ne lève jamais, sent:false", !threw && r?.sent === false && r?.reason === "error");
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
