// Contrat de stockage utilisateur. Le store mémoire ci-dessous est le défaut $0 ;
// la brique 'db' (Drizzle/Prisma) fournira une implémentation du MÊME interface
// → createAuthRouter({ store }) suffit à basculer, auth.ts ne change pas.
import { randomUUID } from "node:crypto";

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

export function createMemoryUserStore(): UserStore {
  const byId = new Map<string, UserRecord>();
  const byEmail = new Map<string, UserRecord>();
  return {
    async findByEmail(email) {
      return byEmail.get(email.toLowerCase()) ?? null;
    },
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async create({ email, passwordHash }) {
      const rec: UserRecord = {
        id: randomUUID(),
        email: email.toLowerCase(),
        passwordHash,
        createdAt: Date.now(),
      };
      byId.set(rec.id, rec);
      byEmail.set(rec.email, rec);
      return rec;
    },
  };
}
