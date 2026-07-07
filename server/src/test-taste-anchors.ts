// Test de preuve — corpus étalon gelé (É1, Loop Engineering 2026-07-07).
//   npx tsx src/test-taste-anchors.ts
// Vérifie que server/data/taste-anchors/etalon.json référence fidèlement les
// captures réelles de docs/nuit-2026-07-03/ (sha256 = détecte toute dérive du
// fichier source) et les notes humaines connues de Raf. Zéro réseau.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const ETALON_PATH = path.join(ROOT, "server", "data", "taste-anchors", "etalon.json");
const CAPTURES_DIR = path.join(ROOT, "docs", "nuit-2026-07-03");

function sha256(absPath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

interface Ancre {
  app: string;
  fichier: string;
  sha256: string;
  noteHumaine: number | null;
  role: "ancre" | "non-ancre";
  captureSecondaire?: { fichier: string; sha256: string };
}

function run() {
  const raw = JSON.parse(fs.readFileSync(ETALON_PATH, "utf8")) as {
    ancres: Ancre[];
    floor: { fichier: string; sha256: string } | null;
  };
  const ancres = raw.ancres;

  console.log("\n[1] Les 5 hash des ancres 5/5 et 4/5 correspondent au fichier réel sur disque");
  const notees = ancres.filter((a) => a.role === "ancre");
  check("5 apps notées trouvées", notees.length === 5);
  for (const a of notees) {
    const abs = path.join(CAPTURES_DIR, a.fichier);
    const exists = fs.existsSync(abs);
    check(`${a.app} : fichier ${a.fichier} existe`, exists);
    if (exists) check(`${a.app} : sha256 correspond au fichier réel`, sha256(abs) === a.sha256);
  }

  console.log("\n[2] Les 5 notes humaines réelles sont bien celles attendues");
  const attendu: Record<string, number> = {
    "abysse-vivante": 5, "festival-aurora": 4, "lumen-synesthesie": 5, "neon-drift": 5, "maison-onyx": 5,
  };
  for (const [app, note] of Object.entries(attendu)) {
    const a = ancres.find((x) => x.app === app);
    check(`${app} : présent`, !!a);
    check(`${app} : note humaine = ${note}`, a?.noteHumaine === note);
  }

  console.log("\n[3] mission-ares est bien non-ancre (jamais noté)");
  const ares = ancres.find((a) => a.app === "mission-ares");
  check("mission-ares présent", !!ares);
  check("mission-ares : role = non-ancre", ares?.role === "non-ancre");
  check("mission-ares : noteHumaine = null (jamais inventée)", ares?.noteHumaine === null);

  console.log("\n[4] onyx-scroll référencé comme capture secondaire, pas une ancre distincte");
  const onyx = ancres.find((a) => a.app === "maison-onyx");
  check("maison-onyx a une captureSecondaire", !!onyx?.captureSecondaire);
  if (onyx?.captureSecondaire) {
    const abs = path.join(CAPTURES_DIR, onyx.captureSecondaire.fichier);
    check("onyx-scroll.png : sha256 correspond au fichier réel", fs.existsSync(abs) && sha256(abs) === onyx.captureSecondaire.sha256);
  }
  check("aucune 7ᵉ entrée 'onyx-scroll' en ancre top-niveau", !ancres.some((a) => a.app === "onyx-scroll"));

  console.log("\n[5] floor.png rempli par É2 — ancre basse MESURÉE, pas inventée");
  check("floor présent", raw.floor !== null);
  if (raw.floor) {
    const abs = path.join(ROOT, "server", "data", "taste-anchors", raw.floor.fichier);
    check("floor.png existe sur disque", fs.existsSync(abs));
    check("floor.png : sha256 correspond au fichier réel", fs.existsSync(abs) && sha256(abs) === raw.floor.sha256);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} test-taste-anchors : ${pass} ✓ / ${fail} ✗`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
