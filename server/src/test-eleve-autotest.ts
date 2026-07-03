// Tests de la compétence auto-test (eleve-autotest-tools.ts) — deps injectées, zéro navigateur.
import { buildEleveAutotestTools, type AutotestToolDeps, type AutotestSpec } from "./eleve-autotest-tools.js";
import type { ParcoursReport } from "./eleve-parcours.js";

let passed = 0, failed = 0;
function assert(label: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
}

const okReport = (): ParcoursReport => ({ ok: true, etapes: [{ ok: true, messages: ["✓"] }] as never, consoleErrors: [] });
const koReport = (): ParcoursReport => ({ ok: false, etapes: [{ ok: false, messages: ["✗ texte absent"] }] as never, consoleErrors: [] });

/** Store en mémoire + moteur factice → aucun navigateur, aucun disque. */
function makeDeps(overrides: Partial<AutotestToolDeps> = {}): { deps: AutotestToolDeps; store: Map<string, AutotestSpec> } {
  const store = new Map<string, AutotestSpec>();
  const deps: AutotestToolDeps = {
    startPreview: async () => ({ url: "http://localhost:5174" }),
    runParcours: async () => okReport(),
    readSpecs: () => [...store.entries()].map(([slug, spec]) => ({ slug, spec })),
    writeSpec: (_dir, slug, spec) => { store.set(slug, spec); },
    ...overrides,
  };
  return { deps, store };
}

const etapes = [{ description: "Ouvrir Contact", actions: [{ clickText: "Contact" }], attendu: { texte: "Nous écrire" } }];

async function main() {
  console.log("— ecris_test —");
  {
    const { deps, store } = makeDeps();
    const [ecris] = buildEleveAutotestTools("proj", deps);
    const r = await ecris.handler({ nom: "Nav Contact", etapes });
    assert("écrit sans erreur", !r.isError);
    assert("slug propre dérivé du nom", store.has("nav-contact"));
    assert("spec conserve le nom + étapes", store.get("nav-contact")?.nom === "Nav Contact" && store.get("nav-contact")?.etapes.length === 1);
  }
  {
    const { deps } = makeDeps();
    const [ecris] = buildEleveAutotestTools("proj", deps);
    assert("nom vide refusé", (await ecris.handler({ nom: "  ", etapes })).isError === true);
    assert("étapes vides refusées", (await ecris.handler({ nom: "x", etapes: [] })).isError === true);
  }

  console.log("— lance_tests : suite verte —");
  {
    const { deps } = makeDeps();
    const [ecris, lance] = buildEleveAutotestTools("proj", deps);
    await ecris.handler({ nom: "a", etapes });
    await ecris.handler({ nom: "b", etapes });
    const r = await lance.handler({});
    assert("2 tests, aucune erreur", !r.isError && r.text.includes("2 ✓ / 0 ✗"));
  }

  console.log("— lance_tests : régression détectée —");
  {
    const { deps, store } = makeDeps({ runParcours: async () => (store.size ? koReport() : okReport()) });
    const [ecris, lance] = buildEleveAutotestTools("proj", deps);
    await ecris.handler({ nom: "casse", etapes });
    const r = await lance.handler({});
    assert("isError quand un test échoue", r.isError === true);
    assert("le détail du ✗ est remonté", r.text.includes("✗ casse") && r.text.includes("texte absent"));
  }

  console.log("— lance_tests : suite vide (informatif, pas d'erreur) —");
  {
    const { deps } = makeDeps();
    const [, lance] = buildEleveAutotestTools("proj", deps);
    const r = await lance.handler({});
    assert("message clair, pas isError", !r.isError && /Aucun test enregistré/.test(r.text));
  }

  console.log("— lance_tests : filtre par nom —");
  {
    const { deps } = makeDeps();
    const [ecris, lance] = buildEleveAutotestTools("proj", deps);
    await ecris.handler({ nom: "un", etapes });
    await ecris.handler({ nom: "deux", etapes });
    const r = await lance.handler({ nom: "deux" });
    assert("ne rejoue qu'un test", r.text.includes("Suite de 1 test"));
    const rInconnu = await lance.handler({ nom: "inexistant" });
    assert("nom inconnu → message ciblé, pas isError", !rInconnu.isError && /Aucun test « inexistant »/.test(rInconnu.text));
  }

  console.log("— robustesse —");
  {
    const { deps } = makeDeps({ startPreview: async () => { throw new Error("Vite mort"); } });
    const [ecris, lance] = buildEleveAutotestTools("proj", deps);
    await ecris.handler({ nom: "x", etapes });
    const r = await lance.handler({});
    assert("aperçu KO → isError propre (ne lève pas)", r.isError === true && r.text.includes("Aperçu indisponible"));
  }
  {
    const { deps } = makeDeps({ runParcours: async () => { throw new Error("boom"); } });
    const [ecris, lance] = buildEleveAutotestTools("proj", deps);
    await ecris.handler({ nom: "x", etapes });
    const r = await lance.handler({});
    assert("runParcours qui plante → test ✗ propre (ne lève pas)", r.isError === true && r.text.includes("✗ x"));
  }
  {
    // cap MAX_REPLAY = 12 : 15 tests → 12 rejoués + note.
    const { deps } = makeDeps();
    const [ecris, lance] = buildEleveAutotestTools("proj", deps);
    for (let i = 0; i < 15; i++) await ecris.handler({ nom: `t${i}`, etapes });
    const r = await lance.handler({});
    assert("cap de 12 specs respecté (+3 non rejoués)", r.text.includes("Suite de 12") && r.text.includes("+3 non rejoué"));
  }

  console.log(`\n${passed} passés · ${failed} échoués`);
  process.exit(failed ? 1 : 0);
}

main();
