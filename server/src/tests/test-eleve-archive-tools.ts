// Tests de l'outil ARCHIVE de l'Élève (lire_archive) — projet temporaire réel + un
// VRAI zip construit avec fflate (preuve bout-en-bout), deps rar injectées.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { buildEleveArchiveTools, type ArchiveDeps } from "../eleve-tools/eleve-archive-tools.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-archive-"));
fs.mkdirSync(path.join(dir, ".assets"), { recursive: true });

// Un VRAI zip : un fichier texte + un "binaire" (octet NUL).
const zipBytes = zipSync({
  "notes.md": strToU8("# Titre\nbonjour mango"),
  "data/config.json": strToU8('{"a":1}'),
  "img.bin": new Uint8Array([0, 1, 2, 0, 255]),
});
fs.writeFileSync(path.join(dir, ".assets", "projet.zip"), zipBytes);

const tool = buildEleveArchiveTools(dir)[0]; // realDeps → vrai fflate pour le zip

async function run() {
  console.log("[1] zip RÉEL — liste le contenu (sans `fichier`)");
  {
    const r = await tool.handler({ chemin: ".assets/projet.zip" });
    check("liste sans erreur", !r.isError);
    check("cite notes.md", /notes\.md/.test(r.text));
    check("cite data/config.json", /data\/config\.json/.test(r.text));
  }

  console.log("\n[2] zip RÉEL — lit un fichier texte interne");
  {
    const r = await tool.handler({ chemin: ".assets/projet.zip", fichier: "notes.md" });
    check("lecture sans erreur", !r.isError);
    check("contenu du fichier renvoyé", /bonjour mango/.test(r.text));
  }

  console.log("\n[3] zip RÉEL — fichier interne binaire → isError pédagogique");
  {
    const r = await tool.handler({ chemin: ".assets/projet.zip", fichier: "img.bin" });
    check("binaire → isError", r.isError === true && /BINAIRE/.test(r.text));
  }

  console.log("\n[4] garde-fous");
  {
    check("chemin vide → isError", !!(await tool.handler({ chemin: "" })).isError);
    check("archive introuvable → isError", !!(await tool.handler({ chemin: ".assets/absent.zip" })).isError);
    check("hors projet → isError", !!(await tool.handler({ chemin: "../evil.zip" })).isError);
    // type non supporté
    fs.writeFileSync(path.join(dir, ".assets", "x.7z"), "nope");
    check("format non supporté (.7z) → isError", !!(await tool.handler({ chemin: ".assets/x.7z" })).isError);
    // fichier interne inexistant
    const r = await tool.handler({ chemin: ".assets/projet.zip", fichier: "n-existe-pas.txt" });
    check("fichier interne absent → isError", r.isError === true && /introuvable/.test(r.text));
  }

  console.log("\n[5] rar — deps INJECTÉES (liste + lecture)");
  {
    const fakeRar: ArchiveDeps = {
      listZip: async () => [], readZip: async () => undefined,
      listRar: async () => [{ name: "readme.txt", size: 12, dir: false }, { name: "sub/", size: 0, dir: true }],
      readRar: async (_b, name) => (name === "readme.txt" ? strToU8("contenu rar") : undefined),
    };
    fs.writeFileSync(path.join(dir, ".assets", "a.rar"), Buffer.from([0x52, 0x61, 0x72, 0x21])); // "Rar!" magic, contenu factice
    const rarTool = buildEleveArchiveTools(dir, fakeRar)[0];
    const list = await rarTool.handler({ chemin: ".assets/a.rar" });
    check("rar : liste le fichier (dossier filtré)", !list.isError && /readme\.txt/.test(list.text) && !/sub\//.test(list.text));
    const read = await rarTool.handler({ chemin: ".assets/a.rar", fichier: "readme.txt" });
    check("rar : lit le fichier interne", !read.isError && /contenu rar/.test(read.text));
  }

  console.log("\n[6] ne lève jamais — une dep qui throw devient isError");
  {
    const boom: ArchiveDeps = {
      listZip: async () => { throw new Error("corrompu"); }, readZip: async () => undefined,
      listRar: async () => [], readRar: async () => undefined,
    };
    const t = buildEleveArchiveTools(dir, boom)[0];
    let threw = false; let r: { isError?: boolean; text: string } = { text: "" };
    try { r = await t.handler({ chemin: ".assets/projet.zip" }); } catch { threw = true; }
    check("dep qui throw → pas de throw, isError", !threw && r.isError === true && /illisible/i.test(r.text));
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-archive-tools : ${pass} ok, ${fail} ko`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
