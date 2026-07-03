// Tests A1.2/B1.3 (2026-07-03) — rappel mémoire dans la boucle.
// 100 % pur : embed + search FACTICES (zéro réseau, zéro Blackboard réel).
// Prouve : filtrage par score, cap de la section, fail-open (embed null / search
// qui lève), résumé défensif de valeurs de shapes variés, outil memoire_rappel.
import {
  rappelerSouvenirs,
  formatSouvenirs,
  memoireSection,
  buildMemoireTool,
  resumeValeur,
  MEMOIRE_SECTION_MAX_CHARS,
  type MemoireDeps,
} from "./eleve-memoire.js";
import type { SearchHit } from "./kernel-blackboard-store.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// Deps factices paramétrables.
function deps(hits: SearchHit[], opts: { embedNull?: boolean; searchThrows?: boolean } = {}): MemoireDeps {
  return {
    embed: async () => (opts.embedNull ? null : [0.1, 0.2, 0.3]),
    search: async () => {
      if (opts.searchThrows) throw new Error("blackboard KO");
      return hits;
    },
  };
}

async function run() {
  console.log("─".repeat(60));
  console.log("test-eleve-memoire (A1.2/B1.3)");
  console.log("─".repeat(60));

  console.log("\n[1] resumeValeur — défensif sur shapes variés");
  {
    check("string → tronquée", resumeValeur("k", "une palette chaleureuse") === "une palette chaleureuse");
    check("objet {label,colors}", resumeValeur("k", { label: "Sombre premium", colors: ["#0a0a0c", "#d4af37"] }).includes("Sombre premium"));
    check("objet {name,tags}", resumeValeur("k", { name: "SearchBar", tags: ["ui", "form"] }).includes("SearchBar"));
    check("null → clé", resumeValeur("ma-cle", null) === "ma-cle");
    check("objet vide → clé", resumeValeur("ma-cle", {}) === "ma-cle");
  }

  console.log("\n[2] rappelerSouvenirs — filtre par score");
  {
    const hits: SearchHit[] = [
      { key: "a", score: 0.9, value: { label: "Palette A" } },
      { key: "b", score: 0.6, value: { label: "Palette B" } },
      { key: "c", score: 0.3, value: { label: "Bruit C" } }, // sous le seuil
    ];
    const sv = await rappelerSouvenirs("palette sombre", deps(hits), { k: 5 });
    check("garde les >= seuil (0.55) → 2", sv.length === 2);
    check("jette le bruit sous seuil", !sv.some((s) => s.key === "c"));
    check("triés/portés tels quels (a en tête)", sv[0].key === "a");
  }

  console.log("\n[3] Fail-open : embed null / search qui lève / sujet vide");
  {
    check("embed null → []", (await rappelerSouvenirs("x", deps([], { embedNull: true }))).length === 0);
    check("search lève → [] (jamais throw)", (await rappelerSouvenirs("x", deps([], { searchThrows: true }))).length === 0);
    check("sujet vide → []", (await rappelerSouvenirs("   ", deps([{ key: "a", score: 1, value: "x" }]))).length === 0);
  }

  console.log("\n[4] formatSouvenirs — borné + libellé prudent");
  {
    check("aucun souvenir → ''", formatSouvenirs([]) === "");
    const many = Array.from({ length: 50 }, (_, i) => ({ key: `k${i}`, score: 0.9, resume: `souvenir assez long numero ${i} avec du texte` }));
    const sec = formatSouvenirs(many);
    check("section bornée au cap", sec.length <= MEMOIRE_SECTION_MAX_CHARS);
    check("mentionne 'indicatifs' (prudence)", /indicatif/i.test(sec));
  }

  console.log("\n[5] memoireSection — bout en bout");
  {
    const hits: SearchHit[] = [{ key: "a", score: 0.8, value: { label: "Grille de cartes" } }];
    const sec = await memoireSection("liste de produits", deps(hits));
    check("contient le souvenir", sec.includes("Grille de cartes"));
    const secVide = await memoireSection("x", deps([], { embedNull: true }));
    check("indispo → section vide", secVide === "");
  }

  console.log("\n[6] Outil memoire_rappel");
  {
    const [tool] = buildMemoireTool(deps([{ key: "a", score: 0.77, value: { label: "Palette océan" } }]));
    check("nom de l'outil", tool.name === "memoire_rappel");
    const r = await tool.handler({ sujet: "palette bleue" });
    check("renvoie le souvenir avec score", r.text.includes("Palette océan") && r.text.includes("0.77"));
    const rVide = await tool.handler({ sujet: "" });
    check("sujet vide → isError", rVide.isError === true);
    const [tool2] = buildMemoireTool(deps([]));
    const rAucun = await tool2.handler({ sujet: "inconnu" });
    check("aucun souvenir → message neutre, pas d'erreur", !rAucun.isError && /aucun souvenir/i.test(rAucun.text));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-memoire : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void run();
