// Tests de lis_video_youtube (2026-07-12) — infra #177 (savoir-transcript.ts) câblée
// à un outil réel pour la première fois. Déterministe, ZÉRO réseau/process externe :
// fetchTranscript est REMPLACÉ par une deps injectée (le vrai fetchTranscript est
// déjà testé exhaustivement dans test-savoir-transcript.ts).
import { buildEleveYoutubeTools } from "../eleve-tools/eleve-youtube-tools.js";
import type { TranscriptResult } from "../savoir/savoir-transcript.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); }
}

const OK_RESULT: TranscriptResult = {
  videoId: "abc123",
  meta: { titre: "Comment fonctionne un moteur", chaine: "Chaîne Sciences", dureeS: 725, publieeLe: "2026-01-10" },
  source: "subs-manuels",
  langue: "fr",
  segments: [
    { tStartS: 0, tEndS: 5, texte: "Bienvenue dans cette vidéo sur les moteurs." },
    { tStartS: 5, tEndS: 12, texte: "Aujourd'hui on va voir comment fonctionne un moteur à combustion." },
  ],
};

const ABSENT_RESULT: TranscriptResult = {
  videoId: "xyz789",
  meta: { titre: "Titre inconnu", chaine: "Chaîne inconnue", dureeS: 0, description: "Une description de secours." },
  source: "absent",
  segments: [],
  raison: "yt-dlp introuvable ou en échec : pip install yt-dlp",
};

async function run(): Promise<void> {
  console.log("\n[1] Enregistrement + schéma");
  {
    const tools = buildEleveYoutubeTools({ fetch: async () => OK_RESULT });
    check("lis_video_youtube enregistré", tools.some((t) => t.name === "lis_video_youtube"));
  }

  console.log("\n[2] Cas nominal — transcript trouvé");
  {
    let capturedUrl = "";
    const tools = buildEleveYoutubeTools({
      fetch: async (url) => { capturedUrl = url; return OK_RESULT; },
    });
    const tool = tools.find((t) => t.name === "lis_video_youtube")!;
    const r = await tool.handler({ url: "https://www.youtube.com/watch?v=abc123" });
    check("pas d'erreur", !r.isError);
    check("titre présent", r.text.includes("Comment fonctionne un moteur"));
    check("chaîne présente", r.text.includes("Chaîne Sciences"));
    check("transcript présent", r.text.includes("moteur à combustion"));
    check("horodatage présent", /\[0m00s\]|\[0m/.test(r.text));
    check("bonne URL transmise", capturedUrl === "https://www.youtube.com/watch?v=abc123");
  }

  console.log("\n[3] Cas absent — repli honnête (pas d'invention)");
  {
    const tools = buildEleveYoutubeTools({ fetch: async () => ABSENT_RESULT });
    const r = await tools.find((t) => t.name === "lis_video_youtube")!.handler({ url: "https://youtu.be/xyz789" });
    check("pas d'erreur outil (source absente ≠ échec outil)", !r.isError);
    check("raison honnête surfacée", r.text.includes("yt-dlp introuvable"));
    check("description de secours utilisée", r.text.includes("Une description de secours"));
  }

  console.log("\n[4] Garde-fous");
  {
    const tools = buildEleveYoutubeTools({ fetch: async () => OK_RESULT });
    const r = await tools.find((t) => t.name === "lis_video_youtube")!.handler({ url: "" });
    check("URL vide → isError", r.isError === true);
  }

  console.log("\n[5] Budget (par tâche)");
  {
    process.env.ELEVE_YOUTUBE_BUDGET = "1";
    const tools = buildEleveYoutubeTools({ fetch: async () => OK_RESULT });
    const tool = tools.find((t) => t.name === "lis_video_youtube")!;
    const first = await tool.handler({ url: "https://youtu.be/abc123" });
    check("1er appel OK", !first.isError);
    const second = await tool.handler({ url: "https://youtu.be/abc123" });
    check("2e appel refusé (budget épuisé)", second.isError === true);
    delete process.env.ELEVE_YOUTUBE_BUDGET;
  }

  console.log("\n[6] Fail-open — jamais de throw même si fetch lève");
  {
    const tools = buildEleveYoutubeTools({ fetch: async () => { throw new Error("réseau injoignable"); } });
    const r = await tools.find((t) => t.name === "lis_video_youtube")!.handler({ url: "https://youtu.be/abc123" });
    check("échec → isError, pas de throw", r.isError === true);
  }

  console.log("\n[7] Transcript long tronqué proprement");
  {
    const long: TranscriptResult = {
      ...OK_RESULT,
      segments: Array.from({ length: 2000 }, (_, i) => ({ tStartS: i, tEndS: i + 1, texte: `phrase numéro ${i} bla bla bla` })),
    };
    const tools = buildEleveYoutubeTools({ fetch: async () => long });
    const r = await tools.find((t) => t.name === "lis_video_youtube")!.handler({ url: "https://youtu.be/abc123" });
    check("pas d'erreur", !r.isError);
    check("tronqué avec mention explicite", r.text.includes("tronqué"));
    check("taille bornée", r.text.length < 14_000);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-youtube-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
