// Tests de concept-registry.ts (boucle de vérification contextuelle, Étape 1).
// Déterministe, zéro réseau réel (embed injecté), Blackboard en mémoire isolé.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Blackboard } from "./kernel-blackboard.js";
import { MemoryStore } from "./kernel-blackboard-store.js";
import {
  searchConcept,
  recordConceptGap,
  loadConceptGaps,
  listOpenConceptGaps,
  validateConceptGap,
  dismissConceptGap,
  CONCEPT_SCOPE,
} from "./concept-registry.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function tmpGapsFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-concept-gaps-"));
  return path.join(dir, "concept-gaps.json");
}

// Faux embedding déterministe : vecteur one-hot selon des mots-clés connus,
// pour distinguer "formation" (sens cours) de "formation" (sens géologique)
// sans dépendre d'un vrai modèle.
function fakeEmbed(vocab: Record<string, number[]>): (t: string) => Promise<number[]> {
  return async (t: string) => {
    const lower = t.toLowerCase();
    for (const [kw, vec] of Object.entries(vocab)) {
      if (lower.includes(kw)) return vec;
    }
    return [0, 0, 1]; // vecteur "neutre", loin de tout
  };
}

async function main() {
  // ── recordConceptGap : dédup par signature (mot+contexte) ───────────────────
  {
    process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
    const g1 = recordConceptGap({ mot: "formation", definitionCandidate: "cours en ligne", contexteDeValidite: "app éducative" });
    check("nouvelle lacune : hits=1", g1.hits === 1);
    check("nouvelle lacune : status proposed", g1.status === "proposed");
    const g2 = recordConceptGap({ mot: "formation", definitionCandidate: "cours en ligne (redite)", contexteDeValidite: "app éducative" });
    check("même mot+contexte : dédup, hits=2", g2.hits === 2 && g2.id === g1.id);
    const g3 = recordConceptGap({ mot: "formation", definitionCandidate: "roches sédimentaires", contexteDeValidite: "géologie" });
    check("même mot, contexte DIFFÉRENT : nouvelle entrée", g3.id !== g1.id);
    check("2 lacunes distinctes au total", loadConceptGaps().length === 2);
  }

  // ── listOpenConceptGaps : triées par hits desc, seulement "proposed" ────────
  {
    process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
    recordConceptGap({ mot: "dashboard", definitionCandidate: "tableau de bord", contexteDeValidite: "app pro" });
    recordConceptGap({ mot: "crm", definitionCandidate: "gestion clients", contexteDeValidite: "app pro" });
    recordConceptGap({ mot: "crm", definitionCandidate: "gestion clients (redite)", contexteDeValidite: "app pro" });
    const open = listOpenConceptGaps();
    check("triées par hits desc", open[0]!.mot === "crm" && open[0]!.hits === 2);
    check("2 lacunes ouvertes", open.length === 2);
  }

  // ── validateConceptGap : promeut dans le Blackboard, marque validated ───────
  {
    process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
    const bb = new Blackboard(new MemoryStore());
    const gap = recordConceptGap({
      mot: "formation",
      definitionCandidate: "un cours structuré qui enseigne AVANT de tester",
      contexteDeValidite: "app éducative",
    });
    const entry = await validateConceptGap(gap.id, {}, { bb, embed: async () => [] });
    check("validation renvoie une entrée", entry !== null);
    check("entrée : définition reprise de la candidate", entry?.definitionValidee === gap.definitionCandidate);
    check("entrée : source raf, confiance 1", entry?.source === "raf" && entry?.confiance === 1);
    check("déposée dans le Blackboard (clé = mot)", bb.has(CONCEPT_SCOPE, "formation"));
    check("la lacune n'est plus ouverte", listOpenConceptGaps().length === 0);
    check("le statut de la lacune est validated", loadConceptGaps()[0]!.status === "validated");

    // Validation avec définition finale RÉÉCRITE par Raf (pas juste la candidate).
    const gap2 = recordConceptGap({ mot: "dashboard", definitionCandidate: "brouillon", contexteDeValidite: "app pro" });
    const entry2 = await validateConceptGap(
      gap2.id,
      { definitionFinale: "vue synthétique de métriques clés", exemplesPositifs: ["KPI ventes"], exemplesNegatifs: ["formulaire de saisie"] },
      { bb, embed: async () => [] },
    );
    check("définition finale = celle fournie par Raf, pas la candidate", entry2?.definitionValidee === "vue synthétique de métriques clés");
    check("exemples positifs/négatifs conservés", entry2?.exemplesPositifs.length === 1 && entry2?.exemplesNegatifs.length === 1);

    // id inconnu → null, ne lève pas.
    const none = await validateConceptGap("id-inexistant", {}, { bb });
    check("id inconnu → null", none === null);
  }

  // ── dismissConceptGap ────────────────────────────────────────────────────────
  {
    process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
    const gap = recordConceptGap({ mot: "widget", definitionCandidate: "?", contexteDeValidite: "?" });
    const dismissed = dismissConceptGap(gap.id);
    check("rejet : status dismissed", dismissed?.status === "dismissed");
    check("rejet : n'apparaît plus dans les lacunes ouvertes", listOpenConceptGaps().length === 0);
  }

  // ── searchConcept : correspondance EXACTE (clé = mot), zéro embedding requis ─
  {
    const bb = new Blackboard(new MemoryStore());
    process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
    const gap = recordConceptGap({ mot: "formation", definitionCandidate: "cours structuré", contexteDeValidite: "app éducative" });
    await validateConceptGap(gap.id, {}, { bb, embed: async () => [] });

    const found = await searchConcept("formation", "je construis une app éducative", { bb, embed: async () => { throw new Error("ne devrait jamais être appelé"); } });
    check("correspondance exacte : trouvé sans appeler embed", found !== null && found.entry.mot === "formation");
    check("correspondance exacte : viaEmbedding=false", found?.viaEmbedding === false);
  }

  // ── searchConcept : chemin sémantique (embedding), et le SEUIL est respecté ──
  {
    const bb = new Blackboard(new MemoryStore());
    const embedFixed = fakeEmbed({ cours: [1, 0, 0], geologie: [0, 1, 0] });
    // On dépose SOUS UNE AUTRE CLÉ (pas "formation" exactement) pour forcer le
    // chemin sémantique — simulé ici via un mot légèrement différent au dépôt,
    // recherché par un mot proche.
    await import("./concept-registry.js").then(async (m) => {
      // Dépose directement dans le scope pour contrôler l'embedding déposé.
      bb.put(m.CONCEPT_SCOPE, "cursus", {
        mot: "cursus", definitionValidee: "cours structuré", contexteDeValidite: "app éducative",
        exemplesPositifs: [], exemplesNegatifs: [], source: "raf", confiance: 1, hits: 0,
        createdAt: "t", updatedAt: "t",
      }, [1, 0, 0]);
    });
    const found = await searchConcept("cours", "app éducative", { bb, embed: embedFixed, seuil: 0.9 });
    check("chemin sémantique : trouvé au-dessus du seuil", found !== null && found.viaEmbedding === true);

    const notFound = await searchConcept("geologie", "roches", { bb, embed: embedFixed, seuil: 0.9 });
    check("chemin sémantique : vecteur orthogonal → rien trouvé (seuil respecté)", notFound === null);
  }

  // ── searchConcept : aucun concept connu → null (jamais d'exception) ─────────
  {
    const bb = new Blackboard(new MemoryStore());
    const found = await searchConcept("inconnu", "contexte", { bb, embed: async () => [] });
    check("aucun concept connu → null", found === null);
  }

  // ── searchConcept : embed qui throw → fail-open (null, pas d'exception) ─────
  {
    const bb = new Blackboard(new MemoryStore());
    let threw = false;
    let result;
    try {
      result = await searchConcept("x", "y", { bb, embed: async () => { throw new Error("réseau"); } });
    } catch { threw = true; }
    check("embed qui throw → fail-open (pas d'exception)", !threw && result === null);
  }

  delete process.env.CONCEPT_GAPS_FILE;
  console.log(`\n${fail === 0 ? "✅" : "❌"} concept-registry : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();
