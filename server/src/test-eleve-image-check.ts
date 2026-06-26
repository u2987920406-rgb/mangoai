// Tests du contrôle-qualité images (eleve-image-check) — la compétence MANAGER de
// Mango : vérifier et réparer les URLs d'images du livrable. Déterministe : projet
// temporaire réel + fetch INJECTÉ (zéro réseau). On prouve : détection des mortes,
// réparation Pexels par re-dérivation de l'URL canonique (l'id est bon), non-réparable
// hors-Pexels, indéterminé (réseau) NON flaggé, et l'édition réelle du fichier.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractImageUrls,
  pexelsIdOf,
  checkAndRepairImages,
  formatImageCheck,
  buildImageRepairNudge,
} from "./eleve-image-check.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`  ❌ ${label}`); }
}

const DEAD = "https://images.pexels.com/photos/39351/purple-grapes-WRONG-slug-39351.jpeg?auto=compress&cs=tinysrgb&w=900";
const CANON = "https://images.pexels.com/photos/39351/purple-grapes-real-39351.jpeg?auto=compress&cs=tinysrgb&h=650&w=940";
const LIVE = "https://images.pexels.com/photos/1277181/pexels-photo-1277181.jpeg?auto=compress&cs=tinysrgb&w=1920";
const DEAD_OTHER = "https://example.com/assets/missing-photo.png";
const NETERR = "https://images.pexels.com/photos/55555/x-55555.jpeg?auto=compress";

/** fetch faux : mappe chaque URL/endpoint à une réponse. NETERR lève (réseau coupé). */
const fakeFetch = (async (input: RequestInfo | URL) => {
  const u = String(input);
  if (u.includes("api.pexels.com/v1/photos/")) {
    const id = u.split("/").pop();
    if (id === "39351") return new Response(JSON.stringify({ src: { large2x: CANON } }), { status: 200 });
    return new Response("", { status: 404 });
  }
  if (u.startsWith(NETERR)) throw new Error("ECONNRESET");
  if (u.startsWith(DEAD) || u.startsWith(DEAD_OTHER)) return new Response(null, { status: 404 });
  if (u.startsWith(CANON) || u.startsWith(LIVE)) return new Response(null, { status: 200 });
  return new Response(null, { status: 200 });
}) as unknown as typeof fetch;

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-imgchk-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src", "App.jsx"),
    `const HERO = "${LIVE}";\nconst GRAPES = "${DEAD}";\nexport default function App(){ return <img src={HERO}/>; }\n`,
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "src", "data.js"), `export const LOGO = "${DEAD_OTHER}";\nexport const X = "${NETERR}";\n`, "utf8");
  return dir;
}

async function run() {
  // ── helpers purs ───────────────────────────────────────────────────────────
  check("pexelsIdOf extrait l'id", pexelsIdOf(DEAD) === "39351");
  check("pexelsIdOf hors-Pexels → null", pexelsIdOf(DEAD_OTHER) === null);

  const proj = mkProject();
  const urls = extractImageUrls(proj);
  check("extractImageUrls trouve les 4 URLs externes", urls.size === 4 && urls.has(DEAD) && urls.has(LIVE) && urls.has(DEAD_OTHER) && urls.has(NETERR));
  check("extractImageUrls relie l'URL à son fichier", (urls.get(DEAD) ?? []).some((f) => f.endsWith("App.jsx")));

  // ── le cœur : check + repair ─────────────────────────────────────────────────
  const r = await checkAndRepairImages(proj, { fetchImpl: fakeFetch, pexelsKey: "TESTKEY" });

  check("mortes détectées : DEAD + DEAD_OTHER (pas LIVE, pas NETERR indéterminé)", r.dead.includes(DEAD) && r.dead.includes(DEAD_OTHER) && !r.dead.includes(LIVE) && !r.dead.includes(NETERR));
  check("Pexels morte RÉPARÉE → URL canonique re-dérivée de l'id", r.repaired.length === 1 && r.repaired[0].from === DEAD && r.repaired[0].to === CANON);
  check("hors-Pexels morte → non réparable (renvoi ouvrier)", r.unrepairable.includes(DEAD_OTHER) && !r.unrepairable.includes(DEAD));
  check("réseau indéterminé (NETERR) JAMAIS flaggé (pas de faux positif)", !r.dead.includes(NETERR) && !r.unrepairable.includes(NETERR));

  // ── l'édition réelle du fichier ─────────────────────────────────────────────
  const appAfter = fs.readFileSync(path.join(proj, "src", "App.jsx"), "utf8");
  check("le fichier porte maintenant l'URL canonique", appAfter.includes(CANON) && !appAfter.includes(DEAD));
  check("l'URL vivante (LIVE) est intacte", appAfter.includes(LIVE));

  // ── formateurs ───────────────────────────────────────────────────────────────
  check("formatImageCheck résume morte/réparée/non-réparable", /1 réparée/.test(formatImageCheck(r)) && /1 non réparable/.test(formatImageCheck(r)));
  check("buildImageRepairNudge cible les non-réparables + consigne URL exacte", buildImageRepairNudge(r).includes(DEAD_OTHER) && /URL EXACTE/i.test(buildImageRepairNudge(r)));
  check("buildImageRepairNudge vide si tout réparé", buildImageRepairNudge({ checked: 1, dead: [DEAD], repaired: [{ from: DEAD, to: CANON }], unrepairable: [] }) === "");

  // ── sans clé Pexels : détecte mais ne répare pas ────────────────────────────
  const proj2 = mkProject();
  const r2 = await checkAndRepairImages(proj2, { fetchImpl: fakeFetch, pexelsKey: "" });
  check("sans clé : Pexels morte détectée mais NON réparée", r2.dead.includes(DEAD) && r2.repaired.length === 0 && r2.unrepairable.includes(DEAD));

  // ── projet sans images → rapport vide, ne lève pas ──────────────────────────
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-imgchk-empty-"));
  const r3 = await checkAndRepairImages(empty, { fetchImpl: fakeFetch });
  check("projet sans image → checked 0, rien à signaler", r3.checked === 0 && formatImageCheck(r3) === "");

  fs.rmSync(proj, { recursive: true, force: true });
  fs.rmSync(proj2, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-image-check : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
