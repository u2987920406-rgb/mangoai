// Test de preuve #177 É1 — savoir-transcript.ts
//
// [1]-[3] : PURS / sans réseau (fixtures VTT, runner scripté) — le socle qui doit
//           rester vert dans n'importe quel environnement (CI compris).
// [4]     : PREUVE LIVE — vrai réseau + vrai yt-dlp installé sur cette machine.
//           Récupère les 3 vidéos réelles demandées, corpus "agentic-harness",
//           vérifie qu'un cache disque horodaté est bien écrit. Si une vidéo n'a
//           pas de sous-titres, c'est documenté honnêtement (source:"absent") —
//           ça ne bloque pas les deux autres.

import {
  parseVtt,
  fetchTranscript,
  listChannelVideos,
  defaultDataDir,
  realRunner,
  type CommandRunner,
  type TranscriptDeps,
} from "./savoir-transcript.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

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

function tmpCacheRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "savoir-test-"));
}

async function run() {
  console.log("[1] parseVtt — fixtures PURES, sans réseau");
  {
    const vttSimple = `WEBVTT

00:00:01.000 --> 00:00:03.000
Bonjour à tous

00:00:03.000 --> 00:00:05.500
Aujourd'hui on parle photo
`;
    const segs = parseVtt(vttSimple);
    check("2 segments parsés", segs.length === 2);
    check("premier segment horodaté correctement", segs[0].tStartS === 1 && segs[0].tEndS === 3 && segs[0].texte === "Bonjour à tous");
    check("second segment horodaté correctement", segs[1].tStartS === 3 && segs[1].tEndS === 5.5);

    // Cues dupliquées (piège des sous-titres auto YouTube : chaque ligne répétée,
    // avec balises de timing inline <00:00:xx.xxx>).
    const vttAuto = `WEBVTT
Kind: captions
Language: fr

00:00:00.000 --> 00:00:02.000
<c>Bonjour</c> à tous

00:00:01.500 --> 00:00:03.500
Bonjour à tous

00:00:02.000 --> 00:00:04.000
Bonjour à tous et bienvenue

00:00:04.000 --> 00:00:06.000
Bonjour à tous et bienvenue
`;
    const segsAuto = parseVtt(vttAuto);
    // Fix L78-1 : la dédup fenêtre-glissante n'émet QUE les mots nouveaux d'une cue
    // qui étend/recouvre la précédente. Les 4 cues (dont 2 exactes + 1 extension)
    // donnent 2 segments : « Bonjour à tous » puis SEULEMENT le delta « et bienvenue »
    // (recollé en « Bonjour à tous et bienvenue » par resegmentCues en aval, sans
    // aucune répétition). C'est ce delta-only qui tue le verbatim « X X X » triplé.
    check("dédup fenêtre-glissante (4 cues → 2 segments)", segsAuto.length === 2);
    check("texte du 1er segment nettoyé (balises retirées)", segsAuto[0].texte === "Bonjour à tous");
    check("texte du 2e segment = SEULEMENT le delta (pas la reprise)", segsAuto[1].texte === "et bienvenue");
    const joinAuto = segsAuto.map((s) => s.texte).join(" ");
    check("recollé sans répétition = « Bonjour à tous et bienvenue »", joinAuto === "Bonjour à tous et bienvenue");

    // Rolling window RÉEL (style sous-titres auto anglais) : extension pure PUIS
    // recouvrement partiel de queue. Le défaut L78 produisait « X X X » triplé.
    const vttRolling = `WEBVTT

00:00:00.000 --> 00:00:02.000
It is not the case that these agents

00:00:02.000 --> 00:00:04.000
It is not the case that these agents don't know how

00:00:04.000 --> 00:00:06.000
these agents don't know how to write software
`;
    const rolled = parseVtt(vttRolling);
    const joined = rolled.map((s) => s.texte).join(" ");
    check(
      "rolling : recollé = phrase propre SANS répétition",
      joined === "It is not the case that these agents don't know how to write software",
    );
    // heuristique du mandat : aucun chunk de ≥6 mots ne se répète dans le texte recollé
    const w = joined.split(/\s+/);
    let repeat6 = false;
    for (let i = 0; i + 6 <= w.length && !repeat6; i++) {
      const gram = w.slice(i, i + 6).join(" ").toLowerCase();
      if (w.slice(i + 6).join(" ").toLowerCase().includes(gram)) repeat6 = true;
    }
    check("rolling : aucun 6-gramme répété (anti « X X X »)", !repeat6);

    check("VTT vide → aucun segment, pas de throw", parseVtt("").length === 0);
    check("texte garbage → aucun segment, pas de throw", parseVtt("n'importe quoi\npas du VTT du tout").length === 0);
  }

  console.log("\n[2] fetchTranscript — runner scripté « yt-dlp absent » → source:absent honnête, jamais de throw");
  {
    const dataDir = tmpCacheRoot();
    const runAbsent: CommandRunner = async () => ({ stdout: "", stderr: "python: module yt_dlp non trouvé", code: 127 });
    const deps: TranscriptDeps = { run: runAbsent, corpus: "test-absent", dataDir };
    const r = await fetchTranscript("dQw4w9WgXcQ", deps);
    check("source === absent", r.source === "absent");
    check("segments vides", r.segments.length === 0);
    check("raison honnête présente (pas d'invention)", typeof r.raison === "string" && r.raison.length > 0);
    check("videoId conservé", r.videoId === "dQw4w9WgXcQ");

    // Deuxième appel : doit lire le CACHE (pas re-frapper le runner).
    let calls = 0;
    const countingRun: CommandRunner = async () => {
      calls++;
      return { stdout: "", stderr: "", code: 127 };
    };
    const deps2: TranscriptDeps = { run: countingRun, corpus: "test-absent", dataDir };
    await fetchTranscript("videoX", deps2);
    const callsAfterFirst = calls;
    await fetchTranscript("videoX", deps2);
    check("cache disque évite un second appel runner", calls === callsAfterFirst);

    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  console.log("\n[3] fetchTranscript — runner scripté « yt-dlp présent avec sous-titres » → segments horodatés, cache écrit");
  {
    const dataDir = tmpCacheRoot();
    const metaJson = JSON.stringify({
      title: "Réglages ISO en argentique",
      uploader: "Chaîne Photo Test",
      duration: 600,
      upload_date: "20240115",
      chapters: [{ start_time: 0, title: "Intro" }],
    });
    const scriptedRun: CommandRunner = async (cmd, args) => {
      if (args.includes("-J") && !args.includes("--flat-playlist")) {
        return { stdout: metaJson, stderr: "", code: 0 };
      }
      if (args.includes("--write-subs")) {
        // Simule yt-dlp qui ÉCRIT un fichier VTT réel (side-effect attendu par le module).
        const outIdx = args.indexOf("-o");
        const outTmpl = args[outIdx + 1];
        const dir = path.dirname(outTmpl);
        const vttPath = path.join(dir, "video1.fr.vtt");
        fs.writeFileSync(
          vttPath,
          "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nToujours ISO 100 en extérieur\n\n00:00:02.000 --> 00:00:04.000\nSauf en basse lumière\n",
          "utf-8",
        );
        return { stdout: "", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "commande inattendue", code: 1 };
    };
    const deps: TranscriptDeps = { run: scriptedRun, corpus: "test-ok", dataDir };
    const r = await fetchTranscript("video1", deps);
    check("source === subs-manuels", r.source === "subs-manuels");
    check("2 segments horodatés", r.segments.length === 2 && r.segments[0].tStartS === 0);
    check("métadonnées portées (titre, chaîne, durée)", r.meta.titre.includes("ISO") && r.meta.chaine === "Chaîne Photo Test" && r.meta.dureeS === 600);
    check("date publication ISO", r.meta.publieeLe === "2024-01-15");
    check("chapitres portés", Array.isArray(r.meta.chapitres) && r.meta.chapitres.length === 1);

    const cachePath = path.join(dataDir, "test-ok", "transcripts", "video1.json");
    check("cache disque écrit", fs.existsSync(cachePath));
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    check("cache contient les segments", cached.segments.length === 2);

    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  console.log("\n[4] PREUVE LIVE — vrai réseau + vrai yt-dlp, 3 vidéos réelles, corpus agentic-harness");
  {
    const dataDir = defaultDataDir();
    const corpus = "agentic-harness";
    const urls = [
      "https://youtu.be/RaFC_oRBwF0",
      "https://www.youtube.com/watch?v=c8bE0cj7vHY",
      "https://www.youtube.com/watch?v=mQfTdNVCOB0",
    ];

    // realRunner = vrai spawn (child_process). CE test-ci, et lui seul, touche le réseau.
    const deps: TranscriptDeps = { run: realRunner, corpus, dataDir };

    for (const url of urls) {
      try {
        const r = await fetchTranscript(url, deps);
        console.log(
          `  -> ${url} : source=${r.source} segments=${r.segments.length} titre="${r.meta.titre}"` +
            (r.raison ? ` raison="${r.raison}"` : ""),
        );
        check(`${url} : ne lève jamais, résultat structuré reçu`, typeof r.source === "string");
        if (r.source !== "absent") {
          check(`${url} : segments horodatés non vides`, r.segments.length > 0 && r.segments.every((s) => s.tEndS >= s.tStartS));
          const cachePath = path.join(dataDir, corpus, "transcripts", `${r.videoId}.json`);
          check(`${url} : cache disque écrit`, fs.existsSync(cachePath));
        } else {
          console.log(`     (documenté honnêtement : transcript indisponible pour cette vidéo)`);
        }
      } catch (e) {
        // Ce test EST censé ne jamais throw (c'est la garantie du module) — si ça
        // arrive quand même, c'est un vrai défaut à signaler, pas à masquer.
        check(`${url} : fetchTranscript n'a PAS levé`, false);
        console.log(`     EXCEPTION (violation du contrat "ne lève jamais") : ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log("\n  -> listChannelVideos (best-effort, pas de chaîne fixée par le mandat — test structurel léger)");
    try {
      const vids = await listChannelVideos("https://www.youtube.com/@doesnotexist_probably_xyz123", { run: realRunner });
      check("listChannelVideos ne lève jamais (retourne un tableau, vide si échec)", Array.isArray(vids));
    } catch {
      check("listChannelVideos ne lève jamais", false);
    }
  }

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exitCode = 1;
}

run();
