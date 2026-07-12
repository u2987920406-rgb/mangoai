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

  console.log("\n[7] Transcript long → PAGINATION (2026-07-12 suite, cerveau local $0)");
  {
    const long: TranscriptResult = {
      ...OK_RESULT,
      segments: Array.from({ length: 3000 }, (_, i) => ({ tStartS: i, tEndS: i + 1, texte: `phrase numéro ${i} bla bla bla` })),
    };
    const tools = buildEleveYoutubeTools({ fetch: async () => long });
    const tool = tools.find((t) => t.name === "lis_video_youtube")!;

    const p1 = await tool.handler({ url: "https://youtu.be/abc123" });
    check("partie 1 : pas d'erreur", !p1.isError);
    check("partie 1 : numérotée « partie 1/N »", /partie 1\/\d+/.test(p1.text));
    check("partie 1 : invite à demander la suite", /partie:2/.test(p1.text));
    check("partie 1 : taille bornée (~20k + marge d'en-tête)", p1.text.length < 21_000);

    const p2 = await tool.handler({ url: "https://youtu.be/abc123", partie: 2 });
    check("partie 2 : pas d'erreur", !p2.isError);
    check("partie 2 : numérotée « partie 2/N »", /partie 2\/\d+/.test(p2.text));
    check("partie 2 : contenu DIFFÉRENT de la partie 1", p2.text !== p1.text);

    // Partie hors bornes → repli sur la dernière partie existante (jamais d'erreur).
    const pOOB = await tool.handler({ url: "https://youtu.be/abc123", partie: 999 });
    check("partie hors bornes : pas d'erreur (repli sur la dernière)", !pOOB.isError);
    check("partie hors bornes : dernière partie, pas d'invite « suite »", !/partie:\d+ pour lire la suite/.test(pOOB.text));
  }

  console.log("\n[8] Transcript court → une seule partie, jamais de mention de pagination");
  {
    const tools = buildEleveYoutubeTools({ fetch: async () => OK_RESULT });
    const r = await tools.find((t) => t.name === "lis_video_youtube")!.handler({ url: "https://youtu.be/abc123" });
    check("mention « partie 1/1 »", r.text.includes("partie 1/1"));
    check("pas d'invite à lire la suite (vidéo courte)", !r.text.includes("pour lire la suite"));
  }

  console.log("\n[9] Consigne de citation des timestamps (2026-07-12 suite, référence rapide à la vidéo)");
  {
    const tools = buildEleveYoutubeTools({ fetch: async () => OK_RESULT });
    const r = await tools.find((t) => t.name === "lis_video_youtube")!.handler({ url: "https://youtu.be/abc123" });
    check("consigne de citer les timestamps présente", r.text.includes("cite le timestamp"));
    check("patron de lien direct vers un instant présent", r.text.includes("youtube.com/watch?v=abc123&t=SECONDESs"));
  }

  console.log("\n[10] Chapitres → liens directs cliquables vers l'instant précis");
  {
    const withChapters: TranscriptResult = {
      ...OK_RESULT,
      meta: { ...OK_RESULT.meta, chapitres: [{ t: 0, titre: "Introduction" }, { t: 90, titre: "Le piston" }] },
    };
    const tools = buildEleveYoutubeTools({ fetch: async () => withChapters });
    const r = await tools.find((t) => t.name === "lis_video_youtube")!.handler({ url: "https://youtu.be/abc123" });
    check("chapitre avec lien direct (t=90s)", r.text.includes("youtube.com/watch?v=abc123&t=90s"));
    check("titre du chapitre présent", r.text.includes("Le piston"));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-youtube-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
