// Tests de l'outil HTTP de l'Élève (#166) — fetch INJECTÉ, mais vrai isCloneableUrl.
import { buildEleveHttpTools, sanitizeHeaders, type HttpDeps, type HttpResponse } from "./eleve-http-tools.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

/** Deps factices : enregistrent l'appel, renvoient une réponse programmable. */
function fakeHttp(resp: Partial<HttpResponse> = {}) {
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body?: string } }[] = [];
  const deps: HttpDeps = {
    httpFetch: async (url, init) => {
      calls.push({ url, init });
      return { status: resp.status ?? 200, contentType: resp.contentType ?? "application/json", body: resp.body ?? "{\"ok\":true}", truncated: resp.truncated ?? false };
    },
  };
  return { deps, calls };
}
const tool = (deps: HttpDeps) => buildEleveHttpTools("x", deps)[0];

console.log("[1] GET — appelle l'URL, renvoie le corps");
{
  const { deps, calls } = fakeHttp({ body: "{\"temp\":21}" });
  const r = await tool(deps).handler({ url: "https://api.exemple.com/meteo" });
  check("appel GET émis", calls.length === 1 && calls[0].init.method === "GET");
  check("corps renvoyé", /temp/.test(r.text) && /200/.test(r.text));
  check("pas d'erreur", !r.isError);
}

console.log("\n[2] POST — envoie le corps + content-type json");
{
  const { deps, calls } = fakeHttp();
  await tool(deps).handler({ url: "https://api.exemple.com/x", methode: "POST", corps: "{\"a\":1}" });
  check("méthode POST", calls[0].init.method === "POST");
  check("corps transmis", calls[0].init.body === "{\"a\":1}");
  check("content-type json par défaut", calls[0].init.headers["content-type"] === "application/json");
}

console.log("\n[3] anti-SSRF — refuse localhost / IP privées (vrai isCloneableUrl)");
{
  const { deps, calls } = fakeHttp();
  for (const bad of ["http://localhost:3000/x", "http://127.0.0.1/x", "http://169.254.169.254/latest/meta-data", "http://192.168.1.10/x"]) {
    const r = await tool(deps).handler({ url: bad });
    check(`refusé : ${bad}`, !!r.isError && /SSRF|publique/i.test(r.text));
  }
  check("aucun fetch émis vers une cible interne", calls.length === 0);
}

console.log("\n[4] garde-fous d'entrée");
{
  const { deps } = fakeHttp();
  check("URL vide → erreur", !!(await tool(deps).handler({ url: "" })).isError);
  const r = await tool(deps).handler({ url: "https://api.x.com", methode: "DELETE" as unknown as "GET" });
  check("méthode DELETE → refusée (GET/POST seulement)", !!r.isError && /GET ou POST/.test(r.text));
}

console.log("\n[5] ne lève jamais — un fetch en échec devient isError");
{
  const deps: HttpDeps = { httpFetch: async () => { throw new Error("ECONNREFUSED"); } };
  let threw = false; let r: { text: string; isError?: boolean } = { text: "" };
  try { r = await tool(deps).handler({ url: "https://api.x.com" }); } catch { threw = true; }
  check("pas de throw, renvoie isError", !threw && !!r.isError && /échou/i.test(r.text));
}

console.log("\n[6] sanitizeHeaders — borné, sûr");
{
  check("paires string→string conservées", sanitizeHeaders({ Authorization: "Bearer x" }).Authorization === "Bearer x");
  check("Host interdit retiré", sanitizeHeaders({ Host: "evil", "X-Ok": "1" }).Host === undefined);
  check("valeur vide ignorée", sanitizeHeaders({ A: "" }).A === undefined);
  check("borné à 12 en-têtes", Object.keys(sanitizeHeaders(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`H${i}`, "v"])))).length === 12);
  check("non-objet → {}", Object.keys(sanitizeHeaders("nope")).length === 0);
}

console.log("\n[7] getOnly (mode Discuter) — GET marche, POST refusé, schéma sans corps");
{
  const getTool = (deps: HttpDeps) => buildEleveHttpTools("x", deps, { getOnly: true })[0];
  const { deps, calls } = fakeHttp({ body: "{\"ok\":1}" });
  const r = await getTool(deps).handler({ url: "https://api.exemple.com/data" });
  check("GET autorisé en getOnly", !r.isError && calls.length === 1 && calls[0].init.method === "GET");
  const r2 = await getTool(deps).handler({ url: "https://api.exemple.com/x", methode: "POST" as "GET", corps: "{\"a\":1}" });
  check("POST refusé en getOnly", !!r2.isError && /GET/.test(r2.text));
  check("aucun POST émis", !calls.some((c) => c.init.method === "POST"));
  check("schéma getOnly : pas de champ 'corps'", !("corps" in getTool(deps).inputSchema));
  check("schéma normal : champ 'corps' présent", "corps" in tool(deps).inputSchema);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-http-tools : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
