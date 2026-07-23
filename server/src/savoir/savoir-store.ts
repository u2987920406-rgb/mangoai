// MangoOS — Base de connaissance cross-vidéos (#177, plan D2/É2).
//
// Une SQLite DÉDIÉE par corpus (`server/data/savoir/<slug>/savoir.db`) — pas le
// Blackboard : un claim a besoin de colonnes réelles (statut, video_id,
// t_start_s, groupe_id) pour être requêté et joint (voir plan-177 D2, "scope
// Blackboard rejeté"). Le pattern de persistance est une COPIE DÉLIBÉRÉE de
// `kernel-blackboard-sqlite.ts` : PRAGMA user_version, migrations versionnées
// avec backup avant up(), WAL, fail-open, `tableHasColumn` idempotent — même
// geste que `bible-store` (#178 É1). Rien n'est réinventé ici : le différenciant
// de ce module est le SCHÉMA (D2), pas la mécanique de stockage.
//
// Module de stockage PUR : aucun comportement runtime propre à gater. Il ne sera
// appelé que par savoir-extraction.ts / savoir-reconcile.ts / savoir-query.ts
// (É3-É6), eux-mêmes derrière SAVOIR_*/ELEVE_SAVOIR (défaut off). Ouvrir une
// base ici est un no-op côté utilisateurs tant que rien n'appelle ce module.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "../safe-io.js";
import { cosine, rankByCosine, type SearchHit } from "../kernel/kernel-blackboard-store.js";

// ── Emplacement des bases (une par corpus) ──────────────────────────────────

/** Racine des corpus (`server/data/savoir/`). Ancré via `dataDir()` (safe-io.ts) —
 *  AVANT ce correctif (2026-07-23), ce fichier vivant dans `src/savoir/` (un
 *  sous-dossier) résolvait en réalité vers `server/src/data/savoir/`, contrairement
 *  à ce que ce commentaire affirmait déjà — le vrai corpus (transcripts vidéo,
 *  savoir-transcript.ts) vit depuis toujours dans `server/data/savoir/`, jamais
 *  atteint par ce module tant qu'aucun appelant réel n'existait (flags SAVOIR et
 *  ELEVE_SAVOIR, désactivés par défaut) — sans conséquence visible jusqu'ici, mais
 *  la même mine que `specialist-agents.json` en cas d'activation future. */
export function savoirDataDir(): string {
  return dataDir("savoir");
}

/** Chemin de la base SQLite d'un corpus (`server/data/savoir/<slug>/savoir.db`).
 *  Crée le dossier du corpus si absent (ne crée PAS le fichier .db lui-même —
 *  DatabaseSync s'en charge). */
export function savoirDbPath(slug: string): string {
  const dir = path.join(savoirDataDir(), slug);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "savoir.db");
}

// ── Versioning de schéma (même mécanique que kernel-blackboard-sqlite.ts) ───

export const SCHEMA_VERSION = 1;

/** Une migration de schéma : `to` = version cible, `up` = la DDL/DML (reçoit la
 *  connexion déjà ouverte, dans la transaction de runMigrations). */
export interface Migration {
  to: number;
  up: (db: DatabaseSync) => void;
}

/** Catalogue des migrations au-delà du schéma v1 (D2). Vide pour l'instant — la
 *  première vraie migration (ex. ajout d'une colonne, table `medias` du point
 *  d'extension D7) s'ajoute ici, jamais en modifiant le CREATE TABLE existant. */
export const MIGRATIONS: Migration[] = [];

/** Vrai si `table` possède la colonne `column` (fail-open : false en cas
 *  d'erreur). Rend les migrations idempotentes-safe. */
export function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
  } catch {
    return false;
  }
}

/** Pure, testable sans DB : quelles migrations appliquer, dans quel ordre. */
export function planMigrations(currentVersion: number, migrations: Migration[]): Migration[] {
  return migrations.filter((m) => m.to > currentVersion).sort((a, b) => a.to - b.to);
}

/**
 * Applique en séquence (une TRANSACTION par migration) les migrations dont
 * `to > currentVersion`. RÈGLE NON NÉGOCIABLE : backup du fichier .db en
 * `<dbPath>.bak-v<versionAvant>` AVANT tout up() (sauf `:memory:`, rien à
 * copier). Backup impossible → migration REPORTÉE, schéma courant conservé,
 * jamais de throw. Migration qui échoue après backup réussi → ROLLBACK de
 * cette migration, log, arrêt de la chaîne (ordre linéaire, pas de saut de
 * version). Retourne la version finale effectivement atteinte.
 */
export function runMigrations(db: DatabaseSync, dbPath: string, currentVersion: number, migrations: Migration[]): number {
  const plan = planMigrations(currentVersion, migrations);
  let version = currentVersion;
  for (const migration of plan) {
    if (dbPath !== ":memory:") {
      try {
        fs.copyFileSync(dbPath, `${dbPath}.bak-v${version}`);
      } catch (err) {
        console.warn("[savoir-store] migration REPORTÉE : backup impossible :", err);
        break;
      }
    }
    try {
      db.exec("BEGIN");
      migration.up(db);
      db.exec(`PRAGMA user_version = ${migration.to}`);
      db.exec("COMMIT");
      version = migration.to;
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* rien à annuler (l'échec peut précéder le BEGIN) */
      }
      console.warn("[savoir-store] migration:", err);
      break;
    }
  }
  return version;
}

// ── Types de lignes (schéma D2, verbatim) ───────────────────────────────────

export type TranscriptSource = "subs-manuels" | "subs-auto" | "scrape-maison" | "absent";
export type VideoStatut = "a_ingerer" | "transcrite" | "extraite" | "reconciliee" | "sans_transcript";
export type ClaimType = "technique" | "reglage" | "recommandation" | "fait" | "opinion" | "avertissement";
export type ClaimStatut = "candidat" | "canon" | "conteste" | "rejete";
export type GroupeVerdict = "consensus" | "conditionnel" | "desaccord" | "isole";

export interface VideoRow {
  id: number;
  youtube_id: string;
  titre: string;
  chaine: string;
  duree_s: number;
  publiee_le: string | null;
  transcript_source: TranscriptSource;
  langue: string | null;
  statut: VideoStatut;
  fetched_at: number | null;
}

export interface SegmentRow {
  id: number;
  video_id: number;
  t_start_s: number;
  t_end_s: number;
  texte: string;
  embedding: number[] | null;
}

export interface ClaimRow {
  id: number;
  enonce: string;
  sujet: string;
  type: ClaimType;
  conditions: string;
  video_id: number;
  t_start_s: number;
  segment_id: number;
  extrait: string;
  statut: ClaimStatut;
  groupe_id: number | null;
  poids: number;
  embedding: number[] | null;
}

export interface GroupeRow {
  id: number;
  sujet: string;
  resume: string;
  verdict: GroupeVerdict;
  arbitrage: string;
  embedding: number[] | null;
}

export interface EntiteRow {
  id: number;
  nom: string;
  alias: string[];
  type: string;
  embedding: number[] | null;
}

export interface JournalRow {
  id: number;
  ts: number;
  op: string;
  detail: unknown;
}

// ── Store ────────────────────────────────────────────────────────────────────

export class SavoirStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");

    // Schéma v1 (D2), verbatim — CREATE TABLE IF NOT EXISTS : une base FRAÎCHE
    // l'obtient dès l'ouverture, une base héritée n'est pas touchée (migrations
    // futures via MIGRATIONS/runMigrations).
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id          INTEGER PRIMARY KEY,
        youtube_id  TEXT NOT NULL UNIQUE,
        titre       TEXT NOT NULL,
        chaine      TEXT NOT NULL,
        duree_s     INTEGER NOT NULL DEFAULT 0,
        publiee_le  TEXT,
        transcript_source TEXT NOT NULL,
        langue      TEXT,
        statut      TEXT NOT NULL DEFAULT 'a_ingerer',
        fetched_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS segments (
        id         INTEGER PRIMARY KEY,
        video_id   INTEGER NOT NULL REFERENCES videos(id),
        t_start_s  INTEGER NOT NULL,
        t_end_s    INTEGER NOT NULL,
        texte      TEXT NOT NULL,
        embedding  TEXT
      );

      CREATE TABLE IF NOT EXISTS claims (
        id         INTEGER PRIMARY KEY,
        enonce     TEXT NOT NULL,
        sujet      TEXT NOT NULL,
        type       TEXT NOT NULL,
        conditions TEXT NOT NULL DEFAULT '',
        video_id   INTEGER NOT NULL REFERENCES videos(id),
        t_start_s  INTEGER NOT NULL,
        segment_id INTEGER NOT NULL REFERENCES segments(id),
        extrait    TEXT NOT NULL,
        statut     TEXT NOT NULL DEFAULT 'candidat',
        groupe_id  INTEGER REFERENCES groupes(id),
        poids      REAL NOT NULL DEFAULT 1.0,
        embedding  TEXT
      );

      CREATE TABLE IF NOT EXISTS groupes (
        id        INTEGER PRIMARY KEY,
        sujet     TEXT NOT NULL,
        resume    TEXT NOT NULL,
        verdict   TEXT NOT NULL,
        arbitrage TEXT NOT NULL DEFAULT '',
        embedding TEXT
      );

      CREATE TABLE IF NOT EXISTS entites (
        id     INTEGER PRIMARY KEY,
        nom    TEXT NOT NULL UNIQUE,
        alias  TEXT NOT NULL DEFAULT '[]',
        type   TEXT NOT NULL DEFAULT 'concept',
        embedding TEXT
      );

      CREATE TABLE IF NOT EXISTS savoir_journal (
        id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, op TEXT NOT NULL, detail TEXT NOT NULL
      );
    `);

    try {
      const row = this.db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
      let current = row?.user_version ?? 0;
      if (current === 0) {
        current = SCHEMA_VERSION;
        this.db.exec(`PRAGMA user_version = ${current}`);
      }
      runMigrations(this.db, dbPath, current, MIGRATIONS);
    } catch (err) {
      console.warn("[savoir-store] migration:", err);
    }
  }

  // ── videos ─────────────────────────────────────────────────────────────

  insertVideo(v: {
    youtubeId: string;
    titre: string;
    chaine: string;
    dureeS?: number;
    publieeLe?: string;
    transcriptSource: TranscriptSource;
    langue?: string;
    statut?: VideoStatut;
    fetchedAt?: number;
  }): number {
    const info = this.db
      .prepare(
        `INSERT INTO videos (youtube_id, titre, chaine, duree_s, publiee_le, transcript_source, langue, statut, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        v.youtubeId,
        v.titre,
        v.chaine,
        v.dureeS ?? 0,
        v.publieeLe ?? null,
        v.transcriptSource,
        v.langue ?? null,
        v.statut ?? "a_ingerer",
        v.fetchedAt ?? null,
      );
    return Number(info.lastInsertRowid);
  }

  getVideo(id: number): VideoRow | undefined {
    return this.db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as VideoRow | undefined;
  }

  getVideoByYoutubeId(youtubeId: string): VideoRow | undefined {
    return this.db.prepare("SELECT * FROM videos WHERE youtube_id = ?").get(youtubeId) as VideoRow | undefined;
  }

  updateVideoStatut(id: number, statut: VideoStatut): void {
    this.db.prepare("UPDATE videos SET statut = ? WHERE id = ?").run(statut, id);
  }

  listVideos(): VideoRow[] {
    return this.db.prepare("SELECT * FROM videos ORDER BY id").all() as unknown as VideoRow[];
  }

  // ── segments ───────────────────────────────────────────────────────────

  insertSegment(seg: { videoId: number; tStartS: number; tEndS: number; texte: string; embedding?: number[] }): number {
    const info = this.db
      .prepare(`INSERT INTO segments (video_id, t_start_s, t_end_s, texte, embedding) VALUES (?, ?, ?, ?, ?)`)
      .run(seg.videoId, seg.tStartS, seg.tEndS, seg.texte, seg.embedding ? JSON.stringify(seg.embedding) : null);
    return Number(info.lastInsertRowid);
  }

  getSegment(id: number): SegmentRow | undefined {
    const row = this.db.prepare("SELECT * FROM segments WHERE id = ?").get(id) as RawSegmentRow | undefined;
    return row ? parseSegmentRow(row) : undefined;
  }

  getSegmentsByVideo(videoId: number): SegmentRow[] {
    const rows = this.db.prepare("SELECT * FROM segments WHERE video_id = ? ORDER BY t_start_s").all(videoId) as unknown as RawSegmentRow[];
    return rows.map(parseSegmentRow);
  }

  /** Top-k segments par cosinus (couche d'appoint — D6 : "les groupes font
   *  autorité, les segments sont du contexte"). */
  searchSegments(queryEmbedding: number[], k: number): SearchHit[] {
    const rows = this.db.prepare("SELECT id, texte, embedding FROM segments WHERE embedding IS NOT NULL").all() as Array<{
      id: number;
      texte: string;
      embedding: string;
    }>;
    const entries = rows.map((r) => ({ key: String(r.id), value: r.texte, embedding: safeParseVec(r.embedding) ?? undefined }));
    return rankByCosine(entries, queryEmbedding, k);
  }

  // ── entites ────────────────────────────────────────────────────────────

  /** Résout un nom en entité EXISTANTE (match exact `nom` OU présence dans
   *  `alias`), sinon crée une entité neuve nommée `nom`. Tolérant à la casse
   *  et aux espaces superflus (même esprit que la liaison d'entités #178 É3). */
  resolveEntite(nom: string, type = "concept"): EntiteRow {
    const norm = nom.trim();
    const key = norm.toLowerCase();
    const rows = this.db.prepare("SELECT * FROM entites").all() as unknown as RawEntiteRow[];
    for (const r of rows) {
      if (r.nom.trim().toLowerCase() === key) return parseEntiteRow(r);
      const aliases = safeParseAlias(r.alias);
      if (aliases.some((a) => a.trim().toLowerCase() === key)) return parseEntiteRow(r);
    }
    const info = this.db.prepare("INSERT INTO entites (nom, alias, type) VALUES (?, '[]', ?)").run(norm, type);
    return { id: Number(info.lastInsertRowid), nom: norm, alias: [], type, embedding: null };
  }

  /** Toutes les entités connues du corpus (pour l'extraction #177 É3 : lister
   *  les entités déjà connues afin que l'extracteur LIE au lieu de dupliquer). */
  listEntites(): EntiteRow[] {
    const rows = this.db.prepare("SELECT * FROM entites ORDER BY id").all() as unknown as RawEntiteRow[];
    return rows.map(parseEntiteRow);
  }

  addEntiteAlias(entiteId: number, alias: string): void {
    const row = this.db.prepare("SELECT alias FROM entites WHERE id = ?").get(entiteId) as { alias: string } | undefined;
    if (!row) return;
    const aliases = safeParseAlias(row.alias);
    if (!aliases.includes(alias)) aliases.push(alias);
    this.db.prepare("UPDATE entites SET alias = ? WHERE id = ?").run(JSON.stringify(aliases), entiteId);
  }

  getEntiteByNom(nom: string): EntiteRow | undefined {
    const row = this.db.prepare("SELECT * FROM entites WHERE nom = ?").get(nom) as RawEntiteRow | undefined;
    return row ? parseEntiteRow(row) : undefined;
  }

  searchEntites(queryEmbedding: number[], k: number): SearchHit[] {
    const rows = this.db.prepare("SELECT id, nom, embedding FROM entites WHERE embedding IS NOT NULL").all() as Array<{
      id: number;
      nom: string;
      embedding: string;
    }>;
    const entries = rows.map((r) => ({ key: String(r.id), value: r.nom, embedding: safeParseVec(r.embedding) ?? undefined }));
    return rankByCosine(entries, queryEmbedding, k);
  }

  // ── claims ─────────────────────────────────────────────────────────────

  insertClaim(c: {
    enonce: string;
    sujet: string;
    type: ClaimType;
    conditions?: string;
    videoId: number;
    tStartS: number;
    segmentId: number;
    extrait: string;
    statut?: ClaimStatut;
    groupeId?: number;
    poids?: number;
    embedding?: number[];
  }): number {
    const info = this.db
      .prepare(
        `INSERT INTO claims (enonce, sujet, type, conditions, video_id, t_start_s, segment_id, extrait, statut, groupe_id, poids, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        c.enonce,
        c.sujet,
        c.type,
        c.conditions ?? "",
        c.videoId,
        c.tStartS,
        c.segmentId,
        c.extrait,
        c.statut ?? "candidat",
        c.groupeId ?? null,
        c.poids ?? 1.0,
        c.embedding ? JSON.stringify(c.embedding) : null,
      );
    return Number(info.lastInsertRowid);
  }

  getClaim(id: number): ClaimRow | undefined {
    const row = this.db.prepare("SELECT * FROM claims WHERE id = ?").get(id) as RawClaimRow | undefined;
    return row ? parseClaimRow(row) : undefined;
  }

  getClaimsBySujet(sujet: string, statut?: ClaimStatut): ClaimRow[] {
    const rows = statut
      ? (this.db.prepare("SELECT * FROM claims WHERE sujet = ? AND statut = ? ORDER BY id").all(sujet, statut) as unknown as RawClaimRow[])
      : (this.db.prepare("SELECT * FROM claims WHERE sujet = ? ORDER BY id").all(sujet) as unknown as RawClaimRow[]);
    return rows.map(parseClaimRow);
  }

  getClaimsByGroupe(groupeId: number): ClaimRow[] {
    const rows = this.db.prepare("SELECT * FROM claims WHERE groupe_id = ? ORDER BY id").all(groupeId) as unknown as RawClaimRow[];
    return rows.map(parseClaimRow);
  }

  /** Tous les claims du corpus (optionnellement filtrés par statut). Client
   *  nommé : la passe de réconciliation globale (#177 D3/D4) charge l'ensemble
   *  des `candidat` pour les regrouper cross-vidéos. */
  listClaims(statut?: ClaimStatut): ClaimRow[] {
    const rows = statut
      ? (this.db.prepare("SELECT * FROM claims WHERE statut = ? ORDER BY id").all(statut) as unknown as RawClaimRow[])
      : (this.db.prepare("SELECT * FROM claims ORDER BY id").all() as unknown as RawClaimRow[]);
    return rows.map(parseClaimRow);
  }

  searchClaims(queryEmbedding: number[], k: number): SearchHit[] {
    const rows = this.db.prepare("SELECT id, enonce, embedding FROM claims WHERE embedding IS NOT NULL").all() as Array<{
      id: number;
      enonce: string;
      embedding: string;
    }>;
    const entries = rows.map((r) => ({ key: String(r.id), value: r.enonce, embedding: safeParseVec(r.embedding) ?? undefined }));
    return rankByCosine(entries, queryEmbedding, k);
  }

  /** Provenance d'un claim → URL YouTube horodatée (D2 : "cliquable, format
   *  sources:[url…]"). undefined si le claim ou sa vidéo sont introuvables. */
  claimProvenanceUrl(claimId: number): string | undefined {
    const claim = this.getClaim(claimId);
    if (!claim) return undefined;
    const video = this.getVideo(claim.video_id);
    if (!video) return undefined;
    return `https://www.youtube.com/watch?v=${video.youtube_id}&t=${claim.t_start_s}s`;
  }

  /** Promeut un claim (statut/poids/rattachement à un groupe) — journalisé
   *  avant/après dans `savoir_journal` (audit + undo, D3). */
  promoteClaim(claimId: number, changes: { statut?: ClaimStatut; poids?: number; groupeId?: number; conditions?: string }): void {
    const before = this.getClaim(claimId);
    if (!before) return;
    const statut = changes.statut ?? before.statut;
    const poids = changes.poids ?? before.poids;
    const groupeId = changes.groupeId ?? before.groupe_id ?? null;
    const conditions = changes.conditions ?? before.conditions;
    this.db
      .prepare("UPDATE claims SET statut = ?, poids = ?, groupe_id = ?, conditions = ? WHERE id = ?")
      .run(statut, poids, groupeId, conditions, claimId);
    const after = this.getClaim(claimId);
    this.journal("promote_claim", { claimId, before, after });
  }

  /** Rejette un claim (défectueux : extraction cassée, hors-sujet — JAMAIS un
   *  claim perdant d'un débat, cf. D3). Journalisé avant/après avec raison. */
  rejectClaim(claimId: number, raison: string): void {
    const before = this.getClaim(claimId);
    if (!before) return;
    this.db.prepare("UPDATE claims SET statut = 'rejete' WHERE id = ?").run(claimId);
    const after = this.getClaim(claimId);
    this.journal("reject_claim", { claimId, raison, before, after });
  }

  // ── groupes ────────────────────────────────────────────────────────────

  insertGroupe(g: { sujet: string; resume: string; verdict: GroupeVerdict; arbitrage?: string; embedding?: number[] }): number {
    const info = this.db
      .prepare("INSERT INTO groupes (sujet, resume, verdict, arbitrage, embedding) VALUES (?, ?, ?, ?, ?)")
      .run(g.sujet, g.resume, g.verdict, g.arbitrage ?? "", g.embedding ? JSON.stringify(g.embedding) : null);
    return Number(info.lastInsertRowid);
  }

  getGroupe(id: number): GroupeRow | undefined {
    const row = this.db.prepare("SELECT * FROM groupes WHERE id = ?").get(id) as RawGroupeRow | undefined;
    return row ? parseGroupeRow(row) : undefined;
  }

  getGroupesByVerdict(verdict: GroupeVerdict): GroupeRow[] {
    const rows = this.db.prepare("SELECT * FROM groupes WHERE verdict = ? ORDER BY id").all(verdict) as unknown as RawGroupeRow[];
    return rows.map(parseGroupeRow);
  }

  getGroupesBySujet(sujet: string): GroupeRow[] {
    const rows = this.db.prepare("SELECT * FROM groupes WHERE sujet = ? ORDER BY id").all(sujet) as unknown as RawGroupeRow[];
    return rows.map(parseGroupeRow);
  }

  searchGroupes(queryEmbedding: number[], k: number): SearchHit[] {
    const rows = this.db.prepare("SELECT id, resume, embedding FROM groupes WHERE embedding IS NOT NULL").all() as Array<{
      id: number;
      resume: string;
      embedding: string;
    }>;
    const entries = rows.map((r) => ({ key: String(r.id), value: r.resume, embedding: safeParseVec(r.embedding) ?? undefined }));
    return rankByCosine(entries, queryEmbedding, k);
  }

  /** Promeut un groupe (verdict/résumé/arbitrage posé par le juge, D3) —
   *  journalisé avant/après. */
  promoteGroupe(groupeId: number, changes: { resume?: string; verdict?: GroupeVerdict; arbitrage?: string }): void {
    const before = this.getGroupe(groupeId);
    if (!before) return;
    const resume = changes.resume ?? before.resume;
    const verdict = changes.verdict ?? before.verdict;
    const arbitrage = changes.arbitrage ?? before.arbitrage;
    this.db.prepare("UPDATE groupes SET resume = ?, verdict = ?, arbitrage = ? WHERE id = ?").run(resume, verdict, arbitrage, groupeId);
    const after = this.getGroupe(groupeId);
    this.journal("promote_groupe", { groupeId, before, after });
  }

  // ── journal (append-only, audit + undo) ───────────────────────────────────

  journal(op: string, detail: unknown): void {
    this.db.prepare("INSERT INTO savoir_journal (ts, op, detail) VALUES (?, ?, ?)").run(Math.floor(Date.now() / 1000), op, JSON.stringify(detail ?? null));
  }

  getJournal(limit = 100): JournalRow[] {
    const rows = this.db.prepare("SELECT * FROM savoir_journal ORDER BY id DESC LIMIT ?").all(limit) as Array<{
      id: number;
      ts: number;
      op: string;
      detail: string;
    }>;
    return rows.map((r) => ({ id: r.id, ts: r.ts, op: r.op, detail: safeParseJson(r.detail) }));
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* déjà fermée */
    }
  }
}

// ── Parsing des lignes brutes (embedding TEXT JSON → number[]) ─────────────

interface RawSegmentRow {
  id: number;
  video_id: number;
  t_start_s: number;
  t_end_s: number;
  texte: string;
  embedding: string | null;
}
function parseSegmentRow(r: RawSegmentRow): SegmentRow {
  return { ...r, embedding: r.embedding ? safeParseVec(r.embedding) ?? null : null };
}

interface RawClaimRow {
  id: number;
  enonce: string;
  sujet: string;
  type: ClaimType;
  conditions: string;
  video_id: number;
  t_start_s: number;
  segment_id: number;
  extrait: string;
  statut: ClaimStatut;
  groupe_id: number | null;
  poids: number;
  embedding: string | null;
}
function parseClaimRow(r: RawClaimRow): ClaimRow {
  return { ...r, embedding: r.embedding ? safeParseVec(r.embedding) ?? null : null };
}

interface RawGroupeRow {
  id: number;
  sujet: string;
  resume: string;
  verdict: GroupeVerdict;
  arbitrage: string;
  embedding: string | null;
}
function parseGroupeRow(r: RawGroupeRow): GroupeRow {
  return { ...r, embedding: r.embedding ? safeParseVec(r.embedding) ?? null : null };
}

interface RawEntiteRow {
  id: number;
  nom: string;
  alias: string;
  type: string;
  embedding: string | null;
}
function parseEntiteRow(r: RawEntiteRow): EntiteRow {
  return { id: r.id, nom: r.nom, alias: safeParseAlias(r.alias), type: r.type, embedding: r.embedding ? safeParseVec(r.embedding) ?? null : null };
}

function safeParseVec(s: string | null): number[] | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as number[]) : null;
  } catch {
    return null;
  }
}

function safeParseAlias(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// cosine ré-exporté pour les modules aval (savoir-reconcile.ts, D3) qui auront
// besoin de comparer des embeddings hors table (clustering).
export { cosine };
