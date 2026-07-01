// Relance ciblée de la maquette #07 (Lottie/cartoon) — tronquee au 1er run car GLM
// a produit un JSON Lottie inline trop verbeux. Brief allege : richesse en SVG/CSS,
// Lottie reduit a un tout petit accent. 100% GLM.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { askLLM } from "./llm-engine.js";
import { getBrain } from "./brain-registry.js";

const KIT = readFileSync("D:/IA/MangoOS/workspace/toeic-mockups/_kit.md", "utf8");
const OUT = "D:/IA/MangoOS/workspace/toeic-mockups-glm/07-lottie-react-cartoon.html";
const brain = getBrain("codeur");
console.log(`MODELE ELEVE = ${brain.provider}/${brain.model}`);

const SYSTEM =
  "Tu es un developpeur front-end expert et tres createur. Tu produis des maquettes d'interface HTML AUTONOMES (un seul fichier), soignees, TRES dynamiques et interactives. Tu respectes scrupuleusement le brief. Tu reponds UNIQUEMENT avec le code du fichier HTML complet — aucune explication, aucun texte avant ou apres, PAS de balises markdown.";

const brief =
  "Stack: React 18 (UMD unpkg) + Babel standalone (script type=text/babel) + lottie-web 5.12.2 (cdnjs) + Tailwind Play CDN.\n" +
  "Registre: Ludique.\n" +
  "Direction: Cartoon Duolingo++ — illustre rond et joyeux, couleurs vives, gros boutons rebondissants, mascotte tres expressive et animee, feedback ultra positif.\n" +
  "IMPORTANT (contrainte de taille) : NE genere PAS de gros JSON Lottie inline (ca a fait deborder le budget de tokens la derniere fois). La mascotte, la scene de bureau et les decors doivent etre des SVG animes en CSS (riches, expressifs). Utilise lottie-web pour UN SEUL petit accent, via un JSON Lottie inline TRES COURT (moins de 20 lignes, ex. une etoile ou un cercle qui pulse). Priorise la richesse via SVG/CSS. Le fichier DOIT etre complet et se terminer par </html>.";

function clean(raw: string): string {
  let t = (raw ?? "").trim();
  const m = t.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```\s*$/);
  if (m) t = m[1].trim();
  else t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "").trim();
  const i = t.indexOf("<!DOCTYPE");
  const j = i >= 0 ? i : t.indexOf("<html");
  if (j > 0) t = t.slice(j);
  return t.trim();
}

(async () => {
  const user =
    `${KIT}\n\n=== TA MAQUETTE (produis-la MAINTENANT) ===\n${brief}\n\n` +
    "Rappel: fichier HTML autonome COMPLET, 2 ecrans (Accueil + Quiz) + toggle, feedback anime au clic (bonne reponse = C), mascotte Mango reactive, responsive, palette Mango, placeholders CSS/SVG (aucune vraie image). Reponds UNIQUEMENT avec le code HTML complet.";
  const t0 = Date.now();
  try {
    const raw = await askLLM(SYSTEM, user, {
      provider: brain.provider,
      model: brain.model,
      baseUrl: (brain as any).baseUrl,
      apiKeyEnv: (brain as any).apiKeyEnv,
      maxTokens: 18000,
      timeoutMs: 300_000,
    });
    const html = clean(raw);
    const ok = html.includes("</html>");
    writeFileSync(OUT, html, "utf8");
    const secs = Math.round((Date.now() - t0) / 1000);
    console.log(ok ? `OK 07 — ${html.length} car (complet) (${secs}s)` : `!! 07 encore TRONQUE — ${html.length} car (${secs}s)`);
  } catch (e: any) {
    console.log(`X 07 — ERREUR: ${e?.message ?? e}`);
  }
})();
