// Test de preuve — savoir-store.ts (#177 plan D2/É2).
//   npx tsx src/test-savoir-store.ts
// Zéro réseau, zéro dépendance externe : bases SQLite sur fichier temporaire
// (node:sqlite). Pose un mini-corpus (2 vidéos, 8 segments, 6 claims dont 2
// clairement opposés) et vérifie les requêtes cardinales du plan : claims
// canon d'un sujet, groupes en désaccord, provenance horodatée, promotion/rejet
// journalisés, migration v1→v2 factice avec backup vérifié.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SavoirStore, runMigrations, planMigrations, tableHasColumn, type Migration } from "../savoir/savoir-store.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-savoir-"));
const dbPath = path.join(dir, "savoir.db");
const store = new SavoirStore(dbPath);

// ── Mini-corpus : 2 vidéos, 8 segments, 6 claims dont 2 opposés ─────────────
const v1 = store.insertVideo({
  youtubeId: "AAAA111",
  titre: "Réglages portrait 2021",
  chaine: "PhotoChaine",
  dureeS: 600,
  publieeLe: "2021-03-01",
  transcriptSource: "subs-manuels",
  langue: "fr",
  statut: "extraite",
});
const v2 = store.insertVideo({
  youtubeId: "BBBB222",
  titre: "ISO moderne 2024",
  chaine: "PhotoChaine2",
  dureeS: 500,
  publieeLe: "2024-06-01",
  transcriptSource: "subs-auto",
  langue: "fr",
  statut: "extraite",
});

check("insertVideo renvoie un id", v1 > 0 && v2 > 0 && v1 !== v2);
check("getVideoByYoutubeId", store.getVideoByYoutubeId("AAAA111")?.id === v1);

const segIds: number[] = [];
for (let i = 0; i < 4; i++) {
  segIds.push(
    store.insertSegment({
      videoId: v1,
      tStartS: i * 60,
      tEndS: i * 60 + 55,
      texte: `Segment v1 numéro ${i} — parlons ISO et ouverture.`,
      embedding: [1, 0, i / 10],
    }),
  );
}
for (let i = 0; i < 4; i++) {
  segIds.push(
    store.insertSegment({
      videoId: v2,
      tStartS: i * 50,
      tEndS: i * 50 + 45,
      texte: `Segment v2 numéro ${i} — l'ISO auto est devenu fiable.`,
      embedding: [0, 1, i / 10],
    }),
  );
}
check("8 segments insérés", segIds.length === 8);
check("getSegmentsByVideo v1", store.getSegmentsByVideo(v1).length === 4);
check("getSegmentsByVideo v2", store.getSegmentsByVideo(v2).length === 4);

const isoEntite = store.resolveEntite("ISO");
store.addEntiteAlias(isoEntite.id, "sensibilité");
const isoParAlias = store.resolveEntite("Sensibilité"); // casse différente, alias
check("resolveEntite tolère les alias", isoParAlias.id === isoEntite.id);
const isoNouveau = store.resolveEntite("nouveau-concept-inexistant");
check("resolveEntite crée une entité neuve si absente", isoNouveau.id !== isoEntite.id);

// 6 claims : 4 concordants + 2 clairement OPPOSÉS sur le sujet "ISO"
const claimA = store.insertClaim({
  enonce: "Toujours régler l'ISO à 100 pour la meilleure qualité.",
  sujet: "ISO",
  type: "recommandation",
  videoId: v1,
  tStartS: 60,
  segmentId: segIds[1],
  extrait: "parlons ISO et ouverture",
  embedding: [1, 0, 0.5],
});
const claimB = store.insertClaim({
  enonce: "L'ISO auto est devenu fiable, on peut le laisser en automatique.",
  sujet: "ISO",
  type: "opinion",
  videoId: v2,
  tStartS: 50,
  segmentId: segIds[5],
  extrait: "l'ISO auto est devenu fiable",
  embedding: [0, 1, 0.5],
});
const claimC = store.insertClaim({
  enonce: "En portrait, ouvrir à f/1.8.",
  sujet: "ouverture",
  type: "reglage",
  conditions: "en portrait",
  videoId: v1,
  tStartS: 0,
  segmentId: segIds[0],
  extrait: "parlons ISO et ouverture",
});
const claimD = store.insertClaim({
  enonce: "En paysage, fermer à f/8.",
  sujet: "ouverture",
  type: "reglage",
  conditions: "en paysage",
  videoId: v1,
  tStartS: 120,
  segmentId: segIds[2],
  extrait: "parlons ISO et ouverture",
});
const claimE = store.insertClaim({
  enonce: "Toujours shooter en RAW.",
  sujet: "format",
  type: "recommandation",
  videoId: v2,
  tStartS: 0,
  segmentId: segIds[4],
  extrait: "l'ISO auto est devenu fiable",
});
const claimF = store.insertClaim({
  enonce: "Le JPEG suffit pour la plupart des usages.",
  sujet: "format",
  type: "opinion",
  videoId: v2,
  tStartS: 100,
  segmentId: segIds[6],
  extrait: "l'ISO auto est devenu fiable",
});
check("6 claims insérés", [claimA, claimB, claimC, claimD, claimE, claimF].every((id) => id > 0));

// ── Requête : "claims canon du sujet X" (avant promotion, aucun canon encore) ─
check("aucun claim canon avant promotion", store.getClaimsBySujet("ISO", "canon").length === 0);
check("getClaimsBySujet retourne tous statuts si non filtré", store.getClaimsBySujet("ISO").length === 2);

// ── Promotion (consensus/canon) et rejet, journalisés avant/après ──────────
const journalBefore = store.getJournal().length;
store.promoteClaim(claimC, { statut: "canon", poids: 1.5 });
store.promoteClaim(claimD, { statut: "canon", poids: 1.5 });
check("claims canon du sujet ouverture", store.getClaimsBySujet("ouverture", "canon").length === 2);

const groupeDesaccordId = store.insertGroupe({
  sujet: "ISO",
  resume: "Deux écoles : ISO fixe à 100 (2021) vs ISO auto fiable (2024).",
  verdict: "desaccord",
  arbitrage: "La différence tient à l'évolution du matériel entre 2021 et 2024.",
});
store.promoteClaim(claimA, { statut: "conteste", poids: 1.0, groupeId: groupeDesaccordId });
store.promoteClaim(claimB, { statut: "conteste", poids: 1.2, groupeId: groupeDesaccordId });

check("groupes en désaccord — 1 trouvé", store.getGroupesByVerdict("desaccord").length === 1);
check("les DEUX claims opposés restent (aucune suppression)", store.getClaimsByGroupe(groupeDesaccordId).length === 2);
check(
  "les deux claims opposés sont bien 'conteste', pas 'rejete'",
  store.getClaim(claimA)?.statut === "conteste" && store.getClaim(claimB)?.statut === "conteste",
);

store.rejectClaim(claimF, "hors-sujet : ne parle pas réellement de format RAW/JPEG");
check("rejectClaim change le statut", store.getClaim(claimF)?.statut === "rejete");

const journalAfter = store.getJournal().length;
check("journal a grandi (promotions + rejet)", journalAfter > journalBefore);
const lastEntries = store.getJournal(10);
const rejectEntry = lastEntries.find((e) => e.op === "reject_claim");
check("journal contient reject_claim avec avant/après", !!rejectEntry);
if (rejectEntry) {
  const detail = rejectEntry.detail as { before: { statut: string }; after: { statut: string } };
  check("journal reject_claim : avant='candidat'", detail.before.statut === "candidat");
  check("journal reject_claim : après='rejete'", detail.after.statut === "rejete");
}
const promoteEntry = lastEntries.find((e) => e.op === "promote_groupe" || e.op === "promote_claim");
check("journal contient au moins une entrée promote_*", !!promoteEntry);

// ── Provenance : URL horodatée exacte ────────────────────────────────────────
const url = store.claimProvenanceUrl(claimA);
check("provenance claim A → URL horodatée exacte", url === "https://www.youtube.com/watch?v=AAAA111&t=60s");
const url2 = store.claimProvenanceUrl(claimB);
check("provenance claim B → URL horodatée exacte", url2 === "https://www.youtube.com/watch?v=BBBB222&t=50s");
check("provenance claim inexistant → undefined", store.claimProvenanceUrl(999999) === undefined);

// ── Recherche cosinus ────────────────────────────────────────────────────────
const hits = store.searchClaims([1, 0, 0.5], 3);
check("searchClaims retourne des résultats", hits.length > 0);
check("searchClaims meilleur match ~ claimA", hits[0].key === String(claimA));

store.close();

// ── Migration v1→v2 factice : ajoute une colonne bidon, backup vérifié ─────
{
  const migDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-savoir-migrate-"));
  const migDbPath = path.join(migDir, "savoir.db");

  // Base v1 posée à la main (comme une vraie base existante sur disque).
  const raw = new DatabaseSync(migDbPath);
  raw.exec("CREATE TABLE videos (id INTEGER PRIMARY KEY, youtube_id TEXT NOT NULL UNIQUE)");
  raw.exec("INSERT INTO videos (id, youtube_id) VALUES (1, 'ZZZZ999')");
  raw.exec("PRAGMA user_version = 1");
  raw.close();

  const fakeMigration: Migration = {
    to: 2,
    up: (db) => {
      if (!tableHasColumn(db, "videos", "colonne_bidon")) {
        db.exec("ALTER TABLE videos ADD COLUMN colonne_bidon TEXT DEFAULT 'v2'");
      }
    },
  };

  check("planMigrations v1→v2 : 1 migration à jouer", planMigrations(1, [fakeMigration]).length === 1);
  check("planMigrations déjà en v2 : rien à jouer", planMigrations(2, [fakeMigration]).length === 0);

  const db2 = new DatabaseSync(migDbPath);
  const finalVersion = runMigrations(db2, migDbPath, 1, [fakeMigration]);
  check("runMigrations atteint v2", finalVersion === 2);
  check("colonne bidon ajoutée", tableHasColumn(db2, "videos", "colonne_bidon"));
  const row = db2.prepare("SELECT colonne_bidon FROM videos WHERE id = 1").get() as { colonne_bidon: string };
  check("colonne bidon a la valeur par défaut", row.colonne_bidon === "v2");
  const uv = (db2.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  check("PRAGMA user_version = 2 après migration", uv === 2);
  db2.close();

  check("backup .bak-v1 créé avant la migration", fs.existsSync(`${migDbPath}.bak-v1`));
  const backupDb = new DatabaseSync(`${migDbPath}.bak-v1`);
  const backupCols = (backupDb.prepare("PRAGMA table_info(videos)").all() as Array<{ name: string }>).map((c) => c.name);
  backupDb.close();
  check("backup NE contient PAS encore la colonne bidon (pris avant up())", !backupCols.includes("colonne_bidon"));

  fs.rmSync(migDir, { recursive: true, force: true });
}

fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n[savoir-store] ${passed} ✅  ${failed ? failed + " ❌" : "0 ❌"}  (${passed + failed} assertions)`);
if (failed > 0) process.exit(1);
