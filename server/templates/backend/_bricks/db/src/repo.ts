// Repository SQLite. createSqliteUserStore implémente EXACTEMENT le contrat UserStore de la brique 'auth'
// (mêmes signatures) → brancher l'auth sur la base se fait sans toucher au code d'auth :
//   createAuthRouter({ secret, store: createSqliteUserStore(db) })
// La brique 'db' reste autonome : ce type est redéclaré ici pour ne PAS dépendre de la brique auth.
import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: { email: string; passwordHash: string }): Promise<UserRecord>;
}

function rowToUser(row: unknown): UserRecord | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    email: String(r.email),
    passwordHash: String(r.password_hash),
    createdAt: Number(r.created_at),
  };
}

export function createSqliteUserStore(db: Db): UserStore {
  return {
    async findByEmail(email) {
      return rowToUser(db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()));
    },
    async findById(id) {
      return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
    },
    async create({ email, passwordHash }) {
      const rec: UserRecord = {
        id: randomUUID(),
        email: email.toLowerCase(),
        passwordHash,
        createdAt: Date.now(),
      };
      db.prepare(
        "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
      ).run(rec.id, rec.email, rec.passwordHash, rec.createdAt);
      return rec;
    },
  };
}
