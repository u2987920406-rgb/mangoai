// Connexion base de données — SQLite via node:sqlite (INTÉGRÉ à Node 22+, ZÉRO dépendance native).
// L'interface Db est minimale et DRIVER-AGNOSTIQUE : pour passer en prod/serverless,
// remplacer openDatabase par un client better-sqlite3 / libsql qui expose le même Db (voir RECIPE.md).
import { DatabaseSync } from "node:sqlite";

export interface Stmt {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface Db {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
  close(): void;
}

export function openDatabase(path: string = process.env.DATABASE_PATH ?? "./data.db"): Db {
  // DatabaseSync expose déjà exec/prepare/close compatibles avec l'interface Db.
  return new DatabaseSync(path) as unknown as Db;
}
