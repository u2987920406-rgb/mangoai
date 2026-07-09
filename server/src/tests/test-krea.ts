// Tests du service Krea (krea.ts) — transport injecté, zéro réseau.
import { generateKreaImage, kreaErrorMessage, kreaEnabled, type KreaDeps } from "../krea.js";

let passed = 0;
let failed = 0;
function assert(label: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
}

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown>; arrayBuffer: () => Promise<ArrayBuffer> };
function res(status: number, body: unknown, bytes?: Uint8Array): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => (bytes ?? new Uint8Array([1, 2, 3])).buffer as ArrayBuffer,
  };
}

/** Deps factices : rejoue une séquence de réponses, sleep instantané. */
function fakeDeps(sequence: FakeResponse[]): { deps: KreaDeps; calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  return {
    calls,
    deps: {
      fetchFn: (async (url: string) => {
        calls.push(String(url));
        return (sequence[Math.min(i++, sequence.length - 1)] as unknown) as Response;
      }) as typeof fetch,
      sleep: async () => {},
    },
  };
}

async function main() {
  process.env.KREA_API_KEY = "test-key";
  delete process.env.KREA_API_URL;

  console.log("— flux nominal —");
  {
    const png = new Uint8Array([137, 80, 78, 71]);
    const { deps, calls } = fakeDeps([
      res(200, { job_id: "j1" }),
      res(200, { status: "processing" }),
      res(200, { status: "completed", result: { urls: ["https://cdn.krea.ai/x.png"] } }),
      res(200, {}, png),
    ]);
    const r = await generateKreaImage({ prompt: "a mango" }, deps);
    assert("ok = true", r.ok === true);
    assert("bytes téléchargés", r.ok === true && r.bytes.length === 4 && r.bytes[0] === 137);
    assert("sourceUrl remontée", r.ok === true && r.sourceUrl.includes("cdn.krea.ai"));
    assert("création puis polling puis download", calls.length === 4 && calls[0].includes("/generate/image/krea/krea-2/medium") && calls[1].includes("/jobs/j1"));
  }

  console.log("— erreurs API —");
  {
    const { deps } = fakeDeps([res(402, { message: "top up" })]);
    const r = await generateKreaImage({ prompt: "x" }, deps);
    assert("402 → solde à recharger", r.ok === false && r.error.includes("recharge") && r.status === 402);
  }
  {
    const { deps } = fakeDeps([res(401, {})]);
    const r = await generateKreaImage({ prompt: "x" }, deps);
    assert("401 → clé invalide", r.ok === false && r.error.includes("invalide"));
  }
  {
    const { deps } = fakeDeps([res(429, {})]);
    const r = await generateKreaImage({ prompt: "x" }, deps);
    assert("429 → limite", r.ok === false && r.error.includes("limite"));
  }
  {
    const { deps } = fakeDeps([res(200, {})]);
    const r = await generateKreaImage({ prompt: "x" }, deps);
    assert("réponse sans job_id → erreur propre", r.ok === false && r.error.includes("job_id"));
  }
  {
    const { deps } = fakeDeps([res(200, { job_id: "j2" }), res(200, { status: "failed" })]);
    const r = await generateKreaImage({ prompt: "x" }, deps);
    assert("job failed → erreur propre", r.ok === false && r.error.includes("échec"));
  }
  {
    const { deps } = fakeDeps([res(200, { job_id: "j3" }), res(200, { status: "processing" })]);
    const r = await generateKreaImage({ prompt: "x", timeoutMs: 1 }, deps);
    assert("timeout borné → erreur délai", r.ok === false && r.error.includes("délai"));
  }
  {
    const deps: KreaDeps = { fetchFn: (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch, sleep: async () => {} };
    const r = await generateKreaImage({ prompt: "x" }, deps);
    assert("réseau mort → injoignable (ne lève jamais)", r.ok === false && r.error.includes("injoignable"));
  }

  console.log("— garde-fous d'entrée —");
  {
    const { deps } = fakeDeps([]);
    const r = await generateKreaImage({ prompt: "   " }, deps);
    assert("prompt vide refusé", r.ok === false && r.error.includes("prompt"));
  }
  {
    const old = process.env.KREA_API_KEY;
    delete process.env.KREA_API_KEY;
    const { deps } = fakeDeps([]);
    const r = await generateKreaImage({ prompt: "x" }, deps);
    assert("clé absente → message .env", r.ok === false && r.error.includes("KREA_API_KEY"));
    assert("kreaEnabled false sans clé", kreaEnabled() === false);
    process.env.KREA_API_KEY = old;
    assert("kreaEnabled true avec clé", kreaEnabled() === true);
  }
  {
    const png = new Uint8Array([1]);
    const { deps, calls } = fakeDeps([
      res(200, { job_id: "j4" }),
      res(200, { status: "completed", result: { urls: ["https://u"] } }),
      res(200, {}, png),
    ]);
    await generateKreaImage({ prompt: "x", aspectRatio: "nimporte", resolution: "8K" as string }, deps);
    assert("aspect/résolution inconnus → défauts sûrs (pas d'injection)", calls.length === 3);
  }

  console.log("— messages —");
  assert("kreaErrorMessage inclut le message du corps", kreaErrorMessage(500, { message: "boom" }).includes("boom"));

  console.log(`\n${passed} passés · ${failed} échoués`);
  process.exit(failed ? 1 : 0);
}

main();
