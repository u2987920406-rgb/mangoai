// Test déterministe pour le contrat de langage (idée #45). Aucun appel réseau :
// les cerveaux de generateLexique sont injectés (deps mockés). On vérifie les
// parties PURES + l'idempotence.
//
// Lancer :  npx tsx src/test-lexique.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadLexique,
  saveLexique,
  lexiquePromptSection,
  resolveNaturalTerm,
  parseLexiqueRows,
  generateLexique,
  LEXIQUE_FILE_NAME,
} from "../lexique.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

const SAMPLE = `# Contrat de langage

| Terme naturel (humain) | Terme technique (domaine) | Composant / fichier | Description |
|---|---|---|---|
| barre de vie | HealthPoints | HealthBar.jsx — HUD/ | Jauge des points de vie du joueur |
| panier | Cart | CartDrawer.jsx — shop/ | Tiroir listant les articles ajoutés |
| facture | Invoice | InvoiceTable.jsx — billing/ | Tableau des factures émises |
`;

(async () => {
  line("═");
  console.log("Contrat de langage (#45) — tests déterministes");
  line();

  // ── [1] Plafond de caractères load/save ────────────────────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-lex-"));
  try {
    console.log("\n  [1] Plafond de caractères (load/save) :");
    const big = "x".repeat(5000);
    saveLexique(tmp, big);
    check("le fichier .lexique.md est bien écrit", fs.existsSync(path.join(tmp, LEXIQUE_FILE_NAME)));
    const loaded = loadLexique(tmp);
    check("loadLexique tronque à ~3000 chars", loaded.length < 3200 && loaded.includes("tronqué"));

    // ── [2] lexiquePromptSection vide → "" ───────────────────────────────
    console.log("\n  [2] lexiquePromptSection :");
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "mango-lex-e-"));
    try {
      check("retourne '' quand pas de contrat", lexiquePromptSection(empty) === "");
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
    saveLexique(tmp, SAMPLE);
    const section = lexiquePromptSection(tmp);
    check("injecte le contrat quand présent", section.includes("HealthBar.jsx"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ── [3] parseLexiqueRows ────────────────────────────────────────────────
  console.log("\n  [3] parseLexiqueRows :");
  const rows = parseLexiqueRows(SAMPLE);
  check("parse 3 lignes (en-tête + séparateur ignorés)", rows.length === 3);
  check("1ʳᵉ ligne : terme naturel = 'barre de vie'", rows[0]?.natural === "barre de vie");
  check("1ʳᵉ ligne : composant = HealthBar.jsx", rows[0]?.component.includes("HealthBar.jsx"));

  // ── [4] resolveNaturalTerm — retour flou → bonne ligne ──────────────────
  console.log("\n  [4] resolveNaturalTerm :");
  const hits = resolveNaturalTerm(SAMPLE, "la barre de vie est trop petite");
  check("trouve au moins une ligne", hits.length >= 1);
  check("meilleure correspondance = HealthBar.jsx", hits[0]?.component.includes("HealthBar.jsx"));
  const cartHits = resolveNaturalTerm(SAMPLE, "rends le panier plus grand");
  check("résout 'panier' → CartDrawer.jsx", cartHits[0]?.component.includes("CartDrawer.jsx"));
  const offTopic = resolveNaturalTerm(SAMPLE, "change la couleur du ciel nuageux");
  check("phrase hors-sujet → aucune ligne", offTopic.length === 0);
  check("contrat vide → aucune ligne", resolveNaturalTerm("", "barre de vie").length === 0);

  // ── [5] Idempotence de generateLexique (deps mockés) ────────────────────
  console.log("\n  [5] generateLexique — idempotence (deps mockés) :");
  const gen1 = fs.mkdtempSync(path.join(os.tmpdir(), "mango-lex-g1-"));
  try {
    let askCalls = 0;
    let webCalls = 0;
    const deps = {
      ask: async () => {
        askCalls++;
        return SAMPLE;
      },
      webResearch: async () => {
        webCalls++;
        return "termes de domaine factices";
      },
    };

    // Intention spécialisée et longue → doit déclencher la recherche web puis ask.
    await generateLexique(
      gen1,
      "plateforme de gestion de pharmacie hospitalière avec dispensation nominative et traçabilité des lots",
      deps,
    );
    check("ask appelé 1 fois (contrat absent)", askCalls === 1);
    check("recherche web déclenchée (domaine spécialisé)", webCalls === 1);
    check("contrat .lexique.md écrit", loadLexique(gen1).includes("HealthBar.jsx"));

    // 2ᵉ appel : le contrat existe → ne rappelle PAS le cerveau.
    await generateLexique(gen1, "même projet relancé", deps);
    check("2ᵉ appel : ask NON rappelé (idempotent)", askCalls === 1);
    check("2ᵉ appel : webResearch NON rappelé", webCalls === 1);
  } finally {
    fs.rmSync(gen1, { recursive: true, force: true });
  }

  // ── [6] generateLexique — domaine générique n'appelle pas la recherche web ─
  console.log("\n  [6] generateLexique — domaine générique (pas de recherche web) :");
  const gen2 = fs.mkdtempSync(path.join(os.tmpdir(), "mango-lex-g2-"));
  try {
    let askCalls = 0;
    let webCalls = 0;
    const deps = {
      ask: async () => {
        askCalls++;
        return SAMPLE;
      },
      webResearch: async () => {
        webCalls++;
        return "";
      },
    };
    await generateLexique(gen2, "une todo app simple", deps);
    check("ask appelé 1 fois", askCalls === 1);
    check("recherche web NON déclenchée (domaine courant)", webCalls === 0);
  } finally {
    fs.rmSync(gen2, { recursive: true, force: true });
  }

  line("═");
  if (failures === 0) {
    console.log("✅ Toutes les assertions passent.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} vérification(s) en échec.`);
    process.exit(1);
  }
})();
