// Tests de l'outil lire_document de l'Élève (#157, étendu #158) — « pars de la VRAIE
// source ». Déterministe : projet temporaire avec de vrais fichiers + extracteurs
// injectés (zéro pdfjs/mammoth/officeparser réels). On exerce : confinement de chemin,
// introuvable, lecture texte (.md/.json), vide, format hérité non supporté, PDF
// (joint/par page/hors-limites/scanné/lève), Word .docx (mammoth), Excel .xlsx +
// PowerPoint .pptx (officeparser), Office vide/qui lève, et la troncature.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEleveDocumentTools, type DocumentDeps } from "./eleve-document-tools.js";

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-doc-"));
fs.mkdirSync(path.join(dir, ".assets"), { recursive: true });
fs.writeFileSync(path.join(dir, ".assets", "spec.md"), "# Cahier des charges\n\nL'app doit lister des recettes.\n");
fs.writeFileSync(path.join(dir, ".assets", "data.json"), '{"items":[1,2,3]}\n');
fs.writeFileSync(path.join(dir, ".assets", "vide.txt"), "   \n");
fs.writeFileSync(path.join(dir, ".assets", "enorme.md"), "A".repeat(60_000));
// Fichiers binaires factices : le contenu n'importe pas (les extracteurs sont injectés),
// mais le fichier doit EXISTER (le handler vérifie l'existence avant d'extraire).
for (const f of ["doc.pdf", "scan.pdf", "rapport.docx", "budget.xlsx", "deck.pptx", "vieux.doc"]) {
  fs.writeFileSync(path.join(dir, ".assets", f), "BINAIRE FACTICE");
}

/** Construit l'outil avec des extracteurs injectés (overridables) + mouchards d'appel. */
function tool(over: Partial<DocumentDeps> = {}) {
  const calls = { pdf: [] as string[], docx: [] as string[], office: [] as string[] };
  const [t] = buildEleveDocumentTools(dir, {
    extractPdf: async (p) => {
      calls.pdf.push(p);
      return over.extractPdf ? over.extractPdf(p) : [];
    },
    extractDocx: async (p) => {
      calls.docx.push(p);
      return over.extractDocx ? over.extractDocx(p) : "";
    },
    extractOffice: async (p) => {
      calls.office.push(p);
      return over.extractOffice ? over.extractOffice(p) : "";
    },
  });
  return { t, calls };
}

async function run() {
  console.log("\n[1] Forme + garde-fous d'entrée");
  {
    const { t } = tool();
    check("nom = lire_document", t.name === "lire_document");
    check("schéma expose chemin + page", "chemin" in t.inputSchema && "page" in t.inputSchema);
    check("description liste docx/xlsx/pptx", /docx/.test(t.description) && /xlsx/.test(t.description) && /pptx/.test(t.description));
    const empty = await t.handler({ chemin: "  " });
    check("chemin vide → isError", empty.isError === true);
    const escape = await t.handler({ chemin: "../secret.md" });
    check("chemin hors projet → isError (confinement)", escape.isError === true && /hors du projet/.test(escape.text));
    const missing = await t.handler({ chemin: ".assets/inconnu.pdf" });
    check("introuvable → isError + renvoie vers .assets", missing.isError === true && /\.assets/.test(missing.text));
  }

  console.log("\n[2] Lecture texte (.md / .json)");
  {
    const { t, calls } = tool();
    const md = await t.handler({ chemin: ".assets/spec.md" });
    check("md lu, pas d'erreur", md.isError !== true && md.text.includes("Cahier des charges"));
    check("aucun extracteur binaire appelé pour un .md", calls.pdf.length === 0 && calls.docx.length === 0 && calls.office.length === 0);
    const json = await t.handler({ chemin: ".assets/data.json" });
    check("json lu", json.isError !== true && json.text.includes('"items"'));
  }

  console.log("\n[3] Fichier vide + format hérité non supporté");
  {
    const { t } = tool();
    const vide = await t.handler({ chemin: ".assets/vide.txt" });
    check("fichier vide signalé (pas isError)", vide.isError !== true && /vide/.test(vide.text));
    const doc = await t.handler({ chemin: ".assets/vieux.doc" });
    check(".doc hérité non supporté → isError + suggère un export récent", doc.isError === true && /\.doc|export|non support/i.test(doc.text));
  }

  console.log("\n[4] PDF — texte joint page par page");
  {
    const { t, calls } = tool({
      extractPdf: async () => [
        { text: "Page un contenu.", pageNum: 1 },
        { text: "Page deux contenu.", pageNum: 2 },
      ],
    });
    const r = await t.handler({ chemin: ".assets/doc.pdf" });
    check("extractPdf appelé avec le chemin du pdf", calls.pdf.length === 1 && calls.pdf[0].endsWith("doc.pdf"));
    check("marqueurs de page présents", /── page 1 ──/.test(r.text) && /── page 2 ──/.test(r.text));
    check("contenu des deux pages présent", r.text.includes("Page un contenu.") && r.text.includes("Page deux contenu."));
    check("nombre de pages annoncé", /2 page\(s\)/.test(r.text));
  }

  console.log("\n[5] PDF — une page ciblée + hors limites");
  {
    const { t } = tool({
      extractPdf: async () => [
        { text: "Intro.", pageNum: 1 },
        { text: "Détails de la page deux.", pageNum: 2 },
        { text: "Fin.", pageNum: 3 },
      ],
    });
    const p2 = await t.handler({ chemin: ".assets/doc.pdf", page: 2 });
    check("page 2 isolée", p2.isError !== true && p2.text.includes("Détails de la page deux.") && !p2.text.includes("Intro."));
    check("en-tête page 2/3", /page 2\/3/.test(p2.text));
    const p9 = await t.handler({ chemin: ".assets/doc.pdf", page: 9 });
    check("page hors limites → isError", p9.isError === true && /hors limites/.test(p9.text));
  }

  console.log("\n[6] PDF scanné (aucun texte) → isError ; extraction qui lève → isError gracieux");
  {
    const { t } = tool({ extractPdf: async () => [{ text: "   ", pageNum: 1 }] });
    const r = await t.handler({ chemin: ".assets/scan.pdf" });
    check("PDF sans texte → isError", r.isError === true && /scann|extractible/i.test(r.text));

    const boom = tool({
      extractPdf: async () => {
        throw new Error("pdfjs HS");
      },
    });
    let threw = false;
    let rb;
    try {
      rb = await boom.t.handler({ chemin: ".assets/doc.pdf" });
    } catch {
      threw = true;
    }
    check("PDF qui lève : handler ne lève pas", !threw);
    check("PDF qui lève : isError + motif", rb?.isError === true && /pdfjs HS/.test(rb!.text));
  }

  console.log("\n[7] Word .docx (mammoth)");
  {
    const { t, calls } = tool({ extractDocx: async () => "Titre du cahier des charges Word.\nSection 1." });
    const r = await t.handler({ chemin: ".assets/rapport.docx" });
    check("extractDocx appelé (pas extractOffice/extractPdf)", calls.docx.length === 1 && calls.office.length === 0 && calls.pdf.length === 0);
    check("texte Word renvoyé", r.isError !== true && r.text.includes("Titre du cahier des charges Word."));
    check("étiquette 'Word .docx' présente", /Word \.docx/.test(r.text));
  }

  console.log("\n[8] Excel .xlsx + PowerPoint .pptx (officeparser)");
  {
    const xlsx = tool({ extractOffice: async () => "Feuille1\nProduit, Prix\nCafé, 3.50" });
    const rx = await xlsx.t.handler({ chemin: ".assets/budget.xlsx" });
    check("xlsx → extractOffice appelé", xlsx.calls.office.length === 1 && xlsx.calls.docx.length === 0);
    check("contenu tableur renvoyé + étiquette Excel", rx.isError !== true && rx.text.includes("Café, 3.50") && /Excel \.xlsx/.test(rx.text));

    const pptx = tool({ extractOffice: async () => "Diapo 1 : Vision\nDiapo 2 : Roadmap" });
    const rp = await pptx.t.handler({ chemin: ".assets/deck.pptx" });
    check("pptx → extractOffice appelé", pptx.calls.office.length === 1);
    check("contenu diapos renvoyé + étiquette PowerPoint", rp.isError !== true && rp.text.includes("Roadmap") && /PowerPoint \.pptx/.test(rp.text));
  }

  console.log("\n[9] Office vide + Office qui lève → isError gracieux");
  {
    const empty = tool({ extractDocx: async () => "   " });
    const re = await empty.t.handler({ chemin: ".assets/rapport.docx" });
    check("docx sans texte extractible → isError", re.isError === true && /extractible|vide/i.test(re.text));

    const boom = tool({
      extractOffice: async () => {
        throw new Error("officeparser HS");
      },
    });
    let threw = false;
    let rb;
    try {
      rb = await boom.t.handler({ chemin: ".assets/budget.xlsx" });
    } catch {
      threw = true;
    }
    check("Office qui lève : handler ne lève pas", !threw);
    check("Office qui lève : isError + motif", rb?.isError === true && /officeparser HS/.test(rb!.text));
  }

  console.log("\n[10] Troncature d'un gros document");
  {
    const { t } = tool();
    const r = await t.handler({ chemin: ".assets/enorme.md" });
    check("document > 40k tronqué", /tronqué/.test(r.text));
    check("texte renvoyé borné (< 41k)", r.text.length < 41_000);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-document-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
