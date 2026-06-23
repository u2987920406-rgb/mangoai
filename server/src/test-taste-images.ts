// Tests de la source d'images (taste-images.ts) — fetch FAUX, déterministe.
import { fetchPexelsImage, imageForDirection, loremflickrUrl, pexelsConfigured } from "./taste-images.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const fakeOk = ((async () => ({
  ok: true,
  json: async () => ({ photos: [
    { src: { large2x: "https://img/a-2x.jpg", large: "https://img/a.jpg" } },
    { src: { large2x: "https://img/b-2x.jpg" } },
    { src: { large: "https://img/c.jpg" } },
  ] }),
})) as unknown) as typeof fetch;
const fakeEmpty = ((async () => ({ ok: true, json: async () => ({ photos: [] }) })) as unknown) as typeof fetch;
const fake401 = ((async () => ({ ok: false, json: async () => ({}) })) as unknown) as typeof fetch;
const fakeThrow = ((async () => { throw new Error("réseau"); }) as unknown) as typeof fetch;

check("loremflickr : mots-clés normalisés + graine", loremflickrUrl("coffee, dark", 1234).includes("/coffee,dark") && loremflickrUrl("x", 1234).includes("lock=234"));
check("pexelsConfigured suit la clé injectée", pexelsConfigured({ apiKey: "k" }) === true && pexelsConfigured({ apiKey: "" }) === false);

check("Pexels : sans clé → null", (await fetchPexelsImage("café", {})) === null);
check("Pexels : préfère large2x", (await fetchPexelsImage("café", { index: 0, deps: { apiKey: "k", fetchImpl: fakeOk } })) === "https://img/a-2x.jpg");
check("Pexels : index choisit une autre photo (unicité)", (await fetchPexelsImage("café", { index: 1, deps: { apiKey: "k", fetchImpl: fakeOk } })) === "https://img/b-2x.jpg");
check("Pexels : index boucle (modulo)", (await fetchPexelsImage("café", { index: 4, deps: { apiKey: "k", fetchImpl: fakeOk } })) === "https://img/b-2x.jpg");
check("Pexels : repli large/original si pas de large2x", (await fetchPexelsImage("café", { index: 2, deps: { apiKey: "k", fetchImpl: fakeOk } })) === "https://img/c.jpg");
check("Pexels : 0 résultat → null", (await fetchPexelsImage("zzz", { deps: { apiKey: "k", fetchImpl: fakeEmpty } })) === null);
check("Pexels : 401 → null (pas de throw)", (await fetchPexelsImage("café", { deps: { apiKey: "k", fetchImpl: fake401 } })) === null);
check("Pexels : réseau KO → null (fail-open)", (await fetchPexelsImage("café", { deps: { apiKey: "k", fetchImpl: fakeThrow } })) === null);

check("imageForDirection : Pexels si dispo", (await imageForDirection("coffee dark", 0, { apiKey: "k", fetchImpl: fakeOk })) === "https://img/a-2x.jpg");
check("imageForDirection : repli loremflickr sans clé", (await imageForDirection("coffee dark", 7)).includes("loremflickr.com"));

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
