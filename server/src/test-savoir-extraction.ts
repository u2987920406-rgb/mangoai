// Test de preuve — savoir-extraction.ts (#177 plan D5/É3).
//   npx tsx src/test-savoir-extraction.ts
// Zéro réseau : `ask` est scripté (injecté). Bases SQLite sur fichier temporaire.
//
// Ce que ce test PROUVE :
//   1. Des claims bien formés entrent `candidat` avec le timestamp RÉEL du
//      segment matché (le t_start_s annoncé par le LLM est ignoré au profit du
//      segment retrouvé).
//   2. LE test central : un claim dont l'`extrait` n'est PAS dans le segment
//      source est rejeté MÉCANIQUEMENT, jamais inséré.
//   3. JSON cassé → rien n'entre, rien ne lève (fail-open).
//   4. Une entité connue par alias ("agentic harness" → "harnais agentique")
//      est liée, pas dupliquée.
//   + fonctions pures : fenêtrage (chevauchement) et normalisation verbatim.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SavoirStore } from "./savoir-store.js";
import {
  extractClaimsForVideo,
  windowSegments,
  normalizeForMatch,
  findSourceSegment,
  isClaimType,
  type ExtractionDeps,
} from "./savoir-extraction.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

function freshStore(): { store: SavoirStore; videoId: number; segIds: number[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-savoir-extr-"));
  const store = new SavoirStore(path.join(dir, "savoir.db"));
  const videoId = store.insertVideo({
    youtubeId: "RaFC_oRBwF0",
    titre: "L'avenir des harnais agentiques",
    chaine: "IA-FR",
    dureeS: 120,
    transcriptSource: "subs-auto",
    langue: "fr",
    statut: "transcrite",
  });
  // Segments RÉELS de style (thème harnais agentiques / IA).
  const texts = [
    { t: 0, e: 30, texte: "Un harnais agentique permet à un modèle de langage d'utiliser des outils de façon autonome." },
    { t: 30, e: 60, texte: "Il faut toujours borner le nombre d'itérations pour éviter les boucles infinies." },
    { t: 60, e: 90, texte: "À mon avis, les modèles locaux ne sont pas encore prêts pour piloter une boucle complète." },
  ];
  const segIds = texts.map((s) => store.insertSegment({ videoId, tStartS: s.t, tEndS: s.e, texte: s.texte }));
  return { store, videoId, segIds };
}

/** ask scripté : renvoie toujours la même sortie, quel que soit l'appel. */
function scriptedAsk(output: string): ExtractionDeps["ask"] {
  return async () => output;
}

async function main(): Promise<void> {
  // ── Fonctions pures ────────────────────────────────────────────────────────
  check("isClaimType accepte les 6 valeurs", ["technique", "reglage", "recommandation", "fait", "opinion", "avertissement"].every(isClaimType));
  check("isClaimType rejette une valeur hors liste", !isClaimType("blabla") && !isClaimType(42));

  check(
    "normalizeForMatch tolère casse/accents/ponctuation",
    normalizeForMatch("Il FAUT, toujours : borner !") === normalizeForMatch("il faut toujours borner"),
  );

  const segsForWindow = Array.from({ length: 6 }, (_, i) => ({ id: i, tStartS: i * 10, tEndS: i * 10 + 9, texte: "x".repeat(1500) }));
  const wins = windowSegments(segsForWindow, 4000);
  check("windowSegments produit plusieurs fenêtres", wins.length >= 2);
  check(
    "windowSegments chevauche d'un segment",
    wins.length >= 2 && wins[0].segments[wins[0].segments.length - 1].id === wins[1].segments[0].id,
  );
  check("windowSegments couvre tous les segments", wins[wins.length - 1].segments.some((s) => s.id === 5));

  {
    const { store, videoId, segIds } = freshStore();
    const seg = store.getSegment(segIds[0])!;
    check("findSourceSegment trouve l'extrait tolérant", findSourceSegment("un HARNAIS agentique permet à un modèle", [{ id: seg.id, tStartS: seg.t_start_s, tEndS: seg.t_end_s, texte: seg.texte }]) !== null);
    check("findSourceSegment refuse un extrait absent", findSourceSegment("les agents doivent demander la permission", [{ id: seg.id, tStartS: seg.t_start_s, tEndS: seg.t_end_s, texte: seg.texte }]) === null);
    store.close();
  }

  // ── Test 1 : claims bien formés → candidat, timestamp réel ─────────────────
  {
    const { store, videoId } = freshStore();
    const output = JSON.stringify([
      {
        enonce: "Un harnais agentique laisse un LLM utiliser des outils en autonomie",
        sujet: "harnais agentique",
        type: "technique",
        conditions: "",
        t_start_s: 999, // MENSONGE volontaire : doit être écrasé par le segment réel (0)
        extrait: "Un harnais agentique permet à un modèle de langage d'utiliser des outils de façon autonome",
      },
      {
        enonce: "Borner le nombre d'itérations évite les boucles infinies",
        sujet: "itérations",
        type: "recommandation",
        conditions: "",
        t_start_s: 30,
        // casse + ponctuation différentes : le matching tolérant doit passer
        extrait: "il faut toujours BORNER le nombre d'itérations, pour éviter les boucles infinies",
      },
    ]);
    const res = await extractClaimsForVideo(store, videoId, { ask: scriptedAsk(output) });
    check("T1 : 2 claims proposés", res.proposed === 2);
    check("T1 : 2 claims insérés (candidat)", res.inserted === 2);
    check("T1 : 0 rejeté", res.rejected === 0);
    const claims = store.getClaimsBySujet("harnais agentique", "candidat");
    check("T1 : claim inséré en statut candidat", claims.length === 1);
    check("T1 : timestamp RÉEL du segment (0), pas le 999 annoncé", claims[0]?.t_start_s === 0);
    check("T1 : provenance URL horodatée correcte", store.claimProvenanceUrl(claims[0].id) === "https://www.youtube.com/watch?v=RaFC_oRBwF0&t=0s");
    const claims2 = store.getClaimsBySujet("itérations", "candidat");
    check("T1 : 2e claim ancré au segment t=30", claims2[0]?.t_start_s === 30);
    store.close();
  }

  // ── Test 2 (CENTRAL) : extrait halluciné → rejeté mécaniquement ────────────
  {
    const { store, videoId } = freshStore();
    const output = JSON.stringify([
      {
        enonce: "Les agents doivent toujours demander la permission avant d'agir",
        sujet: "sécurité agentique",
        type: "avertissement",
        conditions: "",
        t_start_s: 10,
        extrait: "les agents doivent toujours demander la permission avant d'agir", // ABSENT du transcript
      },
    ]);
    const res = await extractClaimsForVideo(store, videoId, { ask: scriptedAsk(output) });
    check("T2 : 1 claim proposé", res.proposed === 1);
    check("T2 : 0 inséré (garde-fou verbatim)", res.inserted === 0);
    check("T2 : 1 rejeté", res.rejected === 1);
    check("T2 : raison mentionne l'extrait introuvable", res.rejectedReasons.some((r) => r.includes("extrait introuvable")));
    check("T2 : aucun claim en base", store.getClaimsBySujet("sécurité agentique").length === 0);
    store.close();
  }

  // ── Test 3 : JSON cassé → rien n'entre, rien ne lève ───────────────────────
  {
    const { store, videoId } = freshStore();
    let threw = false;
    let res;
    try {
      res = await extractClaimsForVideo(store, videoId, { ask: scriptedAsk("```json\n[ { \"enonce\": \"cassé\" ,,, ") });
    } catch {
      threw = true;
    }
    check("T3 : ne lève jamais sur JSON cassé", !threw);
    check("T3 : 0 inséré", res?.inserted === 0);
    check("T3 : aucun claim en base", store.listVideos().length === 1 && store.getClaimsBySujet("cassé").length === 0);
    store.close();
  }

  // ── Test 4 : entité connue liée par alias, pas dupliquée ───────────────────
  {
    const { store, videoId } = freshStore();
    const ent = store.resolveEntite("harnais agentique");
    store.addEntiteAlias(ent.id, "agentic harness");
    const nEntitesAvant = store.listEntites().length; // 1
    const output = JSON.stringify([
      {
        enonce: "Un agentic harness pilote des outils de façon autonome",
        sujet: "agentic harness", // alias → doit résoudre vers "harnais agentique"
        type: "technique",
        conditions: "",
        t_start_s: 0,
        extrait: "Un harnais agentique permet à un modèle de langage d'utiliser des outils",
      },
    ]);
    const res = await extractClaimsForVideo(store, videoId, { ask: scriptedAsk(output) });
    check("T4 : 1 claim inséré", res.inserted === 1);
    const linked = store.getClaimsBySujet("harnais agentique", "candidat");
    check("T4 : claim rattaché au sujet canonique (pas l'alias)", linked.length === 1);
    check("T4 : aucun claim sous le nom d'alias", store.getClaimsBySujet("agentic harness").length === 0);
    check("T4 : aucune entité dupliquée créée", store.listEntites().length === nEntitesAvant);
    store.close();
  }

  console.log(`\nsavoir-extraction : ${passed}/${passed + failed} checks OK${failed ? ` — ${failed} ÉCHEC(S)` : ""}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("Erreur inattendue:", e);
  process.exit(1);
});
