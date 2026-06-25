// Tests de l'outil chercher_artefact de l'Élève (#156) — « réutiliser > regénérer ».
// Déterministe, sans réseau ni Blackboard réel : on injecte des deps (search/list)
// scriptées et on invoque directement le handler. On exerce : recherche par palette,
// listing sans couleur, 0 résultat, hex invalide, bornes de n, échec gracieux, et
// le formatage (provenance / rôle cible|rendu / % de proximité).

import { buildEleveArtefactTools, type ArtefactDeps } from "./eleve-artefact-tools.js";
import type { ArtifactHit } from "./kernel-artifacts.js";
import type { SiteDossierHit } from "./site-artifacts.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

function hit(project: string, type: "design.reference" | "design.produced", colors: string[], score?: number): ArtifactHit {
  return { key: `${type}:${project}:x`, artifact: { type, project, colors, at: 1 }, score };
}

/** Construit l'outil avec des deps injectées + un mouchard sur les appels. */
function tool(deps: Partial<ArtefactDeps>) {
  const calls: { search: Array<{ colors: string[]; k: number }>; list: number } = { search: [], list: 0 };
  const full: ArtefactDeps = {
    search: (colors, k) => {
      calls.search.push({ colors, k });
      return deps.search ? deps.search(colors, k) : [];
    },
    list: () => {
      calls.list++;
      return deps.list ? deps.list() : [];
    },
  };
  const [t] = buildEleveArtefactTools("/tmp/proj", full);
  return { t, calls };
}

async function run() {
  console.log("\n[1] Forme de l'outil");
  {
    const { t } = tool({});
    check("nom = chercher_artefact", t.name === "chercher_artefact");
    check("schéma expose couleurs + n", "couleurs" in t.inputSchema && "n" in t.inputSchema);
    check("description mentionne réutiliser", /réutilis/i.test(t.description));
  }

  console.log("\n[2] Recherche par palette → résultats formatés");
  {
    const { t, calls } = tool({
      search: () => [
        hit("mango-cafe-ts", "design.reference", ["#1f2937", "#f59e0b"], 0.92),
        hit("mango-shop", "design.produced", ["#0ea5e9", "#111827", "#fafafa"], 0.71),
      ],
    });
    const r = await t.handler({ couleurs: ["#1f2937", "#f59e0b"] });
    check("pas d'erreur", r.isError !== true);
    check("search appelé avec les couleurs valides", calls.search.length === 1 && calls.search[0].colors.length === 2);
    check("provenance présente (mango-cafe-ts)", r.text.includes("mango-cafe-ts"));
    check("rôle 'cible' pour design.reference", /cible/.test(r.text));
    check("rôle 'rendu' pour design.produced", /rendu/.test(r.text));
    check("proximité en %", /~92% proche/.test(r.text));
    check("couleurs hex à copier listées", r.text.includes("#f59e0b"));
    check("incite à réutiliser", /réutilis/i.test(r.text));
  }

  console.log("\n[3] Recherche par palette → 0 résultat (pas une erreur)");
  {
    const { t } = tool({ search: () => [] });
    const r = await t.handler({ couleurs: ["#000000"] });
    check("0 hit n'est PAS isError (rien de proche est légitime)", r.isError !== true);
    check("message invite à créer une palette neuve", /neuve|vide/i.test(r.text));
  }

  console.log("\n[4] Sans couleur → listing des récents");
  {
    const { t, calls } = tool({
      list: () => [hit("proj-a", "design.produced", ["#abcdef"], undefined), hit("proj-b", "design.reference", ["#123456"])],
    });
    const r = await t.handler({});
    check("list appelé, search non appelé", calls.list === 1 && calls.search.length === 0);
    check("récents listés", r.text.includes("proj-a") && r.text.includes("proj-b"));
    check("pas d'erreur", r.isError !== true);
  }

  console.log("\n[5] Listing vide → message clair");
  {
    const { t } = tool({ list: () => [] });
    const r = await t.handler({});
    check("mémoire vide signalée, sans erreur", r.isError !== true && /vide/i.test(r.text));
  }

  console.log("\n[6] Couleurs invalides (non-hex) → erreur pédagogique");
  {
    const { t, calls } = tool({ search: () => [hit("x", "design.reference", ["#fff"])] });
    const r = await t.handler({ couleurs: ["rouge", "bleu nuit"] });
    check("isError quand aucune couleur n'est un hex valide", r.isError === true);
    check("message renvoie vers le format #rrggbb", /hex|#rrggbb/i.test(r.text));
    check("search NON appelé (rien à chercher)", calls.search.length === 0);
  }

  console.log("\n[7] Mélange hex valides + bruit → ne garde que les hex");
  {
    const { t, calls } = tool({ search: () => [hit("x", "design.reference", ["#fff"], 0.8)] });
    const r = await t.handler({ couleurs: ["#1f2937", "pas-une-couleur", "f59e0b"] });
    check("search appelé avec 2 hex valides (#1f2937 + f59e0b sans #)", calls.search.length === 1 && calls.search[0].colors.length === 2);
    check("pas d'erreur (au moins un hex valide)", r.isError !== true);
  }

  console.log("\n[8] Borne de n (max 8, défaut 5)");
  {
    const { t, calls } = tool({ search: () => [] });
    await t.handler({ couleurs: ["#000000"], n: 50 });
    check("n=50 ramené à 8", calls.search[0].k === 8);
    const r2 = tool({ search: () => [] });
    await r2.t.handler({ couleurs: ["#000000"] });
    check("n absent → défaut 5", r2.calls.search[0].k === 5);
    const r3 = tool({ search: () => [] });
    await r3.t.handler({ couleurs: ["#000000"], n: 0 });
    check("n=0 (invalide) → défaut 5", r3.calls.search[0].k === 5);
    const r4 = tool({ search: () => [] });
    await r4.t.handler({ couleurs: ["#000000"], n: -3 });
    check("n négatif ramené à 1 (min)", r4.calls.search[0].k === 1);
  }

  console.log("\n[10] #159 Phase 4 — les sites extraits remontent aussi");
  {
    const siteHit = (url: string, concept: string, palette: string[], score?: number): SiteDossierHit => ({
      key: url,
      artifact: {
        type: "site.dossier",
        url,
        project: url.replace(/^https?:\/\//, "").replace(/^www\./, ""),
        concept,
        publicCible: "",
        mecaniques: ["panier"],
        palette,
        typographies: [],
        ambiance: "",
        mood: "",
        tonEditorial: "",
        infosCles: [],
        at: 1,
      },
      score,
    });
    // Avec couleurs : palette + section sites
    const calls: { searchSites: number; listSites: number } = { searchSites: 0, listSites: 0 };
    const full: ArtefactDeps = {
      search: () => [hit("mango-cafe", "design.reference", ["#1f2937", "#f59e0b"], 0.9)],
      list: () => [],
      searchSites: () => {
        calls.searchSites++;
        return [siteHit("https://shop.com", "Boutique indé", ["#f59e0b"], 0.8)];
      },
      listSites: () => {
        calls.listSites++;
        return [siteHit("https://ref.com", "Site de référence", ["#111827"])];
      },
    };
    const [t] = buildEleveArtefactTools("/tmp/proj", full);

    const r1 = await t.handler({ couleurs: ["#f59e0b"] });
    check("avec couleurs : searchSites appelé", calls.searchSites === 1);
    check("section sites présente", /Sites déjà EXTRAITS/i.test(r1.text));
    check("concept du site affiché", r1.text.includes("Boutique indé"));
    check("palette + mécaniques du site affichées", r1.text.includes("#f59e0b") && r1.text.includes("panier"));

    const r2 = await t.handler({});
    check("sans couleur : listSites appelé", calls.listSites === 1);
    check("site récent listé", r2.text.includes("Site de référence"));
  }

  console.log("\n[9] Échec des deps → isError gracieux (ne lève jamais)");
  {
    const { t } = tool({
      search: () => {
        throw new Error("blackboard HS");
      },
    });
    let threw = false;
    let r;
    try {
      r = await t.handler({ couleurs: ["#1f2937"] });
    } catch {
      threw = true;
    }
    check("le handler ne lève pas", !threw);
    check("renvoie isError avec le motif", r?.isError === true && /blackboard HS/.test(r!.text));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-artefact-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
