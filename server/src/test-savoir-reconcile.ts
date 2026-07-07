// Test de preuve — savoir-reconcile.ts (#177 plan D3/É4), volet PUR/SCRIPTÉ.
//   npx tsx src/test-savoir-reconcile.ts
// Zéro réseau : le juge (`dispatch`) est scripté (injecté). Base SQLite temporaire.
//
// Ce que ce test PROUVE :
//   1. clusterClaims (PUR) : 2 claims OPPOSÉS de même sujet sont clusterisés
//      ENSEMBLE ; deux sujets distincts → deux groupes ; embeddings similaires
//      (cosine ≥ seuil) regroupent, dissemblables séparent.
//   2. juge scripté `desaccord` → les DEUX claims passent `conteste` avec un poids,
//      RIEN n'est supprimé (les deux subsistent en base).
//   3. juge scripté `conditionnel` → conditions enrichies, claims `canon`.
//   4. juge MUET → verdict `isole`, fail-open (aucune exception, claims `canon` faible).
//   + parseJugeVerdict tolérant, canonicalSujet (alias).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SavoirStore } from "./savoir-store.js";
import {
  clusterClaims,
  canonicalSujet,
  parseJugeVerdict,
  reconcileCorpus,
  clusterSeuil,
  type ClaimLike,
  type ReconcileDeps,
} from "./savoir-reconcile.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

/** dispatch scripté : renvoie toujours la même prose (verdict fixe). */
function scriptedJuge(prose: string, status = "ok"): ReconcileDeps["dispatch"] {
  return async () => ({ status, summary: prose });
}

/** Store frais avec 2 vidéos + 2 claims OPPOSÉS sur un même sujet (candidat). */
function freshStoreOpposed(sujet = "ouverture"): { store: SavoirStore; claimIds: number[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-savoir-rec-"));
  const store = new SavoirStore(path.join(dir, "savoir.db"));
  const v1 = store.insertVideo({ youtubeId: "VID_A", titre: "École RAW 2021", chaine: "A", transcriptSource: "subs-manuels", publieeLe: "2021-01-01", statut: "extraite" });
  const v2 = store.insertVideo({ youtubeId: "VID_B", titre: "École JPEG 2024", chaine: "B", transcriptSource: "subs-manuels", publieeLe: "2024-01-01", statut: "extraite" });
  const s1 = store.insertSegment({ videoId: v1, tStartS: 10, tEndS: 20, texte: "Il faut toujours ouvrir grand en portrait." });
  const s2 = store.insertSegment({ videoId: v2, tStartS: 30, tEndS: 40, texte: "Il faut au contraire fermer le diaphragme même en portrait." });
  const c1 = store.insertClaim({ enonce: "Toujours ouvrir grand (f/1.8) en portrait", sujet, type: "recommandation", videoId: v1, tStartS: 10, segmentId: s1, extrait: "Il faut toujours ouvrir grand en portrait." });
  const c2 = store.insertClaim({ enonce: "Fermer le diaphragme (f/8) même en portrait", sujet, type: "recommandation", videoId: v2, tStartS: 30, segmentId: s2, extrait: "Il faut au contraire fermer le diaphragme même en portrait." });
  return { store, claimIds: [c1, c2] };
}

async function main(): Promise<void> {
  // ── Fonctions pures ────────────────────────────────────────────────────────
  check("clusterSeuil défaut 0.78", clusterSeuil({} as NodeJS.ProcessEnv) === 0.78);
  check("clusterSeuil lit l'env", clusterSeuil({ SAVOIR_CLUSTER_MIN: "0.9" } as unknown as NodeJS.ProcessEnv) === 0.9);

  check("canonicalSujet résout un alias", canonicalSujet("diaphragme", [{ id: 1, nom: "ouverture", alias: ["diaphragme", "f-stop"], type: "concept", embedding: null }]) === "ouverture");
  check("canonicalSujet garde le sujet inconnu", canonicalSujet("bokeh", []) === "bokeh");

  // clusterClaims : 2 claims opposés, même sujet, sans embedding → 1 cluster de 2.
  {
    const claims: ClaimLike[] = [
      { id: 1, sujet: "ouverture", enonce: "ouvrir grand", videoId: 1, tStartS: 0 },
      { id: 2, sujet: "Ouverture", enonce: "fermer", videoId: 2, tStartS: 0 }, // casse ≠ → même clé
    ];
    const cl = clusterClaims(claims, [], 0.78);
    check("clusterClaims : 2 opposés même sujet → 1 cluster", cl.length === 1 && cl[0].claims.length === 2);
  }
  // clusterClaims : deux sujets distincts → 2 clusters.
  {
    const claims: ClaimLike[] = [
      { id: 1, sujet: "ouverture", enonce: "a", videoId: 1, tStartS: 0 },
      { id: 2, sujet: "iso", enonce: "b", videoId: 2, tStartS: 0 },
    ];
    check("clusterClaims : 2 sujets distincts → 2 clusters", clusterClaims(claims, [], 0.78).length === 2);
  }
  // clusterClaims : embeddings similaires regroupent, dissemblables séparent.
  {
    const near: ClaimLike[] = [
      { id: 1, sujet: "iso", enonce: "a", videoId: 1, tStartS: 0, embedding: [1, 0, 0] },
      { id: 2, sujet: "iso", enonce: "b", videoId: 2, tStartS: 0, embedding: [0.99, 0.14, 0] },
    ];
    check("clusterClaims : embeddings proches → 1 cluster", clusterClaims(near, [], 0.78).length === 1);
    const far: ClaimLike[] = [
      { id: 1, sujet: "iso", enonce: "a", videoId: 1, tStartS: 0, embedding: [1, 0, 0] },
      { id: 2, sujet: "iso", enonce: "b", videoId: 2, tStartS: 0, embedding: [0, 1, 0] },
    ];
    check("clusterClaims : embeddings éloignés (même sujet) → 2 clusters", clusterClaims(far, [], 0.78).length === 2);
  }

  // parseJugeVerdict tolérant.
  {
    const v = parseJugeVerdict("VERDICT: desaccord\nRESUME: deux écoles\nARBITRAGE: rien");
    check("parseJugeVerdict : verdict desaccord", v.verdict === "desaccord");
    check("parseJugeVerdict : NEGATIF arbitrage → vide", v.arbitrage === "");
    check("parseJugeVerdict : muet → isole (fail-open)", parseJugeVerdict("").verdict === "isole");
    check("parseJugeVerdict : accents (désaccord/résumé)", parseJugeVerdict("Verdict : désaccord\nRésumé : x").verdict === "desaccord");
    check("parseJugeVerdict : verdict lisible → parsed:true", v.parsed === true);
    check("parseJugeVerdict : prose hors-format → parsed:false (2026-07-07)", parseJugeVerdict("aucun format ici").parsed === false);
  }

  // ── Test DÉSACCORD : les DEUX conservés, statut conteste, rien supprimé ─────
  {
    const { store } = freshStoreOpposed();
    const juge = scriptedJuge("VERDICT: desaccord\nRESUME: Deux écoles : ouvrir grand vs fermer.\nARBITRAGE: aucune donnée ne tranche.");
    const res = await reconcileCorpus(store, { dispatch: juge });
    check("DÉSACCORD : 2 claims considérés", res.claims === 2);
    check("DÉSACCORD : 1 cluster jugé", res.judged === 1);
    check("DÉSACCORD : verdict desaccord compté", res.verdicts.desaccord === 1);
    const claims = store.getClaimsBySujet("ouverture");
    check("DÉSACCORD : les 2 claims subsistent (rien supprimé)", claims.length === 2);
    check("DÉSACCORD : les 2 en statut conteste", claims.every((c) => c.statut === "conteste"));
    check("DÉSACCORD : poids ≥ 1 et pondéré par la récence (la vidéo récente pèse plus)", claims.every((c) => c.poids >= 1) && claims.some((c) => c.poids > 1));
    check("DÉSACCORD : rattachés à un groupe", claims.every((c) => c.groupe_id !== null));
    const g = store.getGroupesByVerdict("desaccord");
    check("DÉSACCORD : groupe desaccord écrit avec les 2 écoles", g.length === 1 && /écoles|ouvrir|fermer/i.test(g[0].resume));
    check("DÉSACCORD : journalisé (promote_claim + reconcile_pass)", store.getJournal(50).some((j) => j.op === "promote_claim") && store.getJournal(50).some((j) => j.op === "reconcile_pass"));
    store.close();
  }

  // ── Test CONDITIONNEL : conditions enrichies, canon ────────────────────────
  {
    const { store } = freshStoreOpposed();
    const juge = scriptedJuge("VERDICT: conditionnel\nRESUME: Faux désaccord : dépend du sujet photographié.\nARBITRAGE: en portrait on ouvre, en paysage on ferme");
    const res = await reconcileCorpus(store, { dispatch: juge });
    check("CONDITIONNEL : verdict conditionnel compté", res.verdicts.conditionnel === 1);
    const claims = store.getClaimsBySujet("ouverture");
    check("CONDITIONNEL : claims en canon", claims.every((c) => c.statut === "canon"));
    check("CONDITIONNEL : conditions enrichies de l'arbitrage", claims.every((c) => /portrait on ouvre/i.test(c.conditions)));
    store.close();
  }

  // ── Test JUGE MUET : isole, fail-open ──────────────────────────────────────
  {
    const { store } = freshStoreOpposed();
    const juge = scriptedJuge("", "ok"); // réponse vide → muet
    let threw = false;
    let res;
    try {
      res = await reconcileCorpus(store, { dispatch: juge });
    } catch {
      threw = true;
    }
    check("MUET : ne lève jamais (fail-open)", !threw);
    check("MUET : judgeSilent = 1", res?.judgeSilent === 1);
    check("MUET : verdict isole", res?.verdicts.isole === 1);
    const claims = store.getClaimsBySujet("ouverture");
    check("MUET : claims en canon faible (source unique)", claims.every((c) => c.statut === "canon" && c.poids <= 0.5));
    store.close();
  }

  // ── Juge qui LÈVE : fail-open aussi ────────────────────────────────────────
  {
    const { store } = freshStoreOpposed();
    const juge: ReconcileDeps["dispatch"] = async () => {
      throw new Error("juge injoignable");
    };
    let threw = false;
    let res;
    try {
      res = await reconcileCorpus(store, { dispatch: juge });
    } catch {
      threw = true;
    }
    check("JUGE LÈVE : ne remonte jamais l'exception", !threw);
    check("JUGE LÈVE : traité comme muet (isole)", res?.judgeSilent === 1 && res?.verdicts.isole === 1);
    store.close();
  }

  // ── Juge RÉPOND mais hors-format (2026-07-07) : jamais un "isole" décidé ──
  {
    const { store } = freshStoreOpposed();
    // Réponse non vide, AUCUNE ligne VERDICT: lisible → parsed:false.
    const juge = scriptedJuge("Je pense que c'est globalement cohérent, sans plus de détail.", "ok");
    let res;
    try {
      res = await reconcileCorpus(store, { dispatch: juge });
    } catch { /* ne doit jamais lever */ }
    check("HORS-FORMAT : ne lève jamais (fail-open)", res !== undefined);
    check("HORS-FORMAT : judgeUnparsed = 1 (pas judgeSilent, le juge a répondu)", res?.judgeUnparsed === 1 && res?.judgeSilent === 0);
    check("HORS-FORMAT : verdicts.isole PAS incrémenté (ce n'est pas un vrai classement)", res?.verdicts.isole === 0);
    store.close();
  }

  console.log(`\nsavoir-reconcile (pur) : ${passed}/${passed + failed} checks OK${failed ? ` — ${failed} ÉCHEC(S)` : ""}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("Erreur inattendue:", e);
  process.exit(1);
});
