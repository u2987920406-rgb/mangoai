// Défi de Raf : MangoOS 100% via GLM génère 8 maquettes TOEIC — mêmes directions
// que 8 des 10 maquettes de Claude, MÊME format (HTML autonome), pour comparer 1-1.
// 100% GLM : on route via le cerveau de l'Élève (getBrain("codeur") = glm-5.2:cloud),
// askLLM one-shot par maquette, maxTokens élevé. Aucun Claude dans la boucle.
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { askLLM } from "./llm-engine.js";
import { getBrain } from "./brain-registry.js";

const KIT_PATH = "D:/IA/MangoOS/workspace/toeic-mockups/_kit.md";
const OUT = "D:/IA/MangoOS/workspace/toeic-mockups-glm";
const KIT = readFileSync(KIT_PATH, "utf8");
mkdirSync(OUT, { recursive: true });

const brain = getBrain("codeur"); // l'Élève = GLM cloud
console.log(`MODELE ELEVE = ${brain.provider}/${brain.model}`);

const SYSTEM =
  "Tu es un developpeur front-end expert et tres createur. Tu produis des maquettes d'interface HTML AUTONOMES (un seul fichier), soignees, TRES dynamiques et interactives. Tu respectes scrupuleusement le brief. Tu reponds UNIQUEMENT avec le code du fichier HTML complet — aucune explication, aucun texte avant ou apres, PAS de balises markdown.";

const STYLES: { file: string; brief: string }[] = [
  { file: "01-react-motionone-soft.html", brief:
    "Stack: React 18 (UMD unpkg) + Babel standalone (script type=text/babel) + Motion One (window.Motion via https://cdn.jsdelivr.net/npm/motion@10.18.0/dist/motion.umd.js) + Tailwind Play CDN.\nRegistre: Premium.\nDirection: Soft UI epure — fond creme, cartes blanches a ombres tres douces, coins tres arrondis, transitions ressort douces (Motion One), mango en accent. Apaisant, haut de gamme." },
  { file: "02-vue-gsap-candy.html", brief:
    "Stack: Vue 3 (build global vue.global.js) + GSAP 3 (cdnjs) + Tailwind Play CDN.\nRegistre: Ludique.\nDirection: Candy pop — couleurs vives, gros arrondis, ombres colorees, rebonds elastic/back.out (GSAP), confetti GSAP sur bonne reponse, boutons chunky facon Duolingo. Fun, energique." },
  { file: "04-threejs-immersif.html", brief:
    "Stack: Three.js 0.160 en ESM via importmap (script type=module) + vanilla JS pour l'UI + Tailwind Play CDN.\nRegistre: Premium.\nDirection: Immersif 3D — un canvas Three.js plein ecran EN FOND, anime (aurora par shader OU particules 3D flottantes), UI en glassmorphism (verre depoli) par-dessus. Sombre-chaud, profond. Geometrie procedurale, aucun asset externe. requestAnimationFrame + resize geres." },
  { file: "05-gsap-scroll-editorial.html", brief:
    "Stack: GSAP 3 + ScrollTrigger (cdnjs) + vanilla + CSS.\nRegistre: Premium.\nDirection: Editorial magazine — grande typo serif display (Playfair Display ou Fraunces, Google Fonts), grille asymetrique, gros chiffres, revelation elegante au scroll (ScrollTrigger) sur l'accueil. Creme + charcoal + mango. Sophistique, revue de luxe." },
  { file: "06-tsparticles-gaming-neon.html", brief:
    "Stack: tsParticles v3 (bundle https://cdn.jsdelivr.net/npm/@tsparticles/all@3/tsparticles.all.bundle.min.js, window.tsParticles) + vanilla + Tailwind Play CDN.\nRegistre: Ludique.\nDirection: Gaming neon — fond tres sombre (#0a0a0f), particules neon (cyan/magenta) en fond, glow partout, HUD gamer, angles coupes (clip-path), police Orbitron/Rajdhani (Google Fonts), barre XP electric, feedback flash neon. Energie e-sport." },
  { file: "07-lottie-react-cartoon.html", brief:
    "Stack: React 18 (UMD) + Babel standalone + lottie-web 5.12.2 (cdnjs) + Tailwind Play CDN.\nRegistre: Ludique.\nDirection: Cartoon Duolingo++ — illustre rond et joyeux, mascotte SVG tres animee (CSS), lottie-web pour un accent anime via un PETIT JSON Lottie inline (ex. etoiles/confetti), gros boutons rebondissants. Feedback ultra positif." },
  { file: "09-vue-threejs-glass.html", brief:
    "Stack: Vue 3 (global vue.global.js) pour l'UI + Three.js 0.160 (ESM importmap) pour un fond 3D + CSS.\nRegistre: Premium.\nDirection: Glassmorphism aurora — fond Three.js anime (aurora shader ou spheres floues) sur un canvas fixe, UI Vue en verre depoli (backdrop-filter blur), pastel-mango sur sombre. Aerien, moderne. Vue gere la reactivite, Three le fond (independants)." },
  { file: "10-react-gsap-lottie-festif.html", brief:
    "Stack: React 18 (UMD) + Babel standalone + GSAP 3 (cdnjs) + lottie-web 5.12.2 (cdnjs) + Tailwind Play CDN.\nRegistre: Ludique.\nDirection: Festif gamifie — le plus VIVANT : transitions GSAP riches entre ecrans, barre d'XP qui se remplit en animation, badges qui brillent, celebration spectaculaire sur bonne reponse (burst de confetti GSAP + etoile Lottie via JSON inline + mascotte qui saute). Energie maximale." },
];

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

async function genOne(s: { file: string; brief: string }) {
  const user =
    `${KIT}\n\n=== TA MAQUETTE (produis-la MAINTENANT) ===\n${s.brief}\n\n` +
    "Rappel: fichier HTML autonome COMPLET, 2 ecrans (Accueil + Quiz) + toggle, feedback anime au clic (bonne reponse = C), mascotte Mango reactive, responsive, palette Mango, placeholders CSS/SVG (aucune vraie image). Reponds UNIQUEMENT avec le code HTML complet.";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await askLLM(SYSTEM, user, {
        provider: brain.provider,
        model: brain.model,
        baseUrl: (brain as any).baseUrl,
        apiKeyEnv: (brain as any).apiKeyEnv,
        maxTokens: 16000,
        timeoutMs: 300_000,
      });
      const html = clean(raw);
      const ok = html.includes("</html>");
      writeFileSync(`${OUT}/${s.file}`, html, "utf8");
      return { file: s.file, len: html.length, ok, attempt };
    } catch (e: any) {
      if (attempt === 2) return { file: s.file, len: 0, ok: false, error: e?.message ?? String(e) };
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  return { file: s.file, len: 0, ok: false, error: "unreachable" };
}

(async () => {
  console.log(`=== GLM genere ${STYLES.length} maquettes TOEIC -> ${OUT} ===`);
  const results: any[] = [];
  for (const s of STYLES) {
    const t0 = Date.now();
    const r = await genOne(s);
    const secs = Math.round((Date.now() - t0) / 1000);
    results.push(r);
    console.log(
      r.error
        ? `X ${r.file} — ERREUR: ${r.error} (${secs}s)`
        : `OK ${r.file} — ${r.len} car ${r.ok ? "(complet)" : "!! TRONQUE (pas de </html>)"} essai ${r.attempt} (${secs}s)`,
    );
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log(`=== FINI : ${okCount}/${STYLES.length} completes ===`);
})();
