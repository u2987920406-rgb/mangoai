// Hash de mot de passe — scrypt intégré (node:crypto, ZÉRO dépendance) par défaut.
// Pour passer à argon2 (recommandé en prod) : `npm i argon2` puis AUTH_HASH=argon2.
// Si argon2 est demandé mais absent, on retombe sur scrypt sans jamais casser.
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export interface Hasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

// Format stocké : "scrypt$<saltHex>$<hashHex>"
export const scryptHasher: Hasher = {
  async hash(password) {
    const salt = randomBytes(16);
    const dk = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
    return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
  },
  async verify(password, stored) {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    if (expected.length === 0) return false;
    const dk = (await scryptAsync(password, salt, expected.length)) as Buffer;
    return dk.length === expected.length && timingSafeEqual(dk, expected);
  },
};

// Sélection à l'exécution : argon2 si demandé ET installé, sinon scrypt.
export async function getHasher(): Promise<Hasher> {
  if (process.env.AUTH_HASH === "argon2") {
    try {
      // import dynamique : ne charge argon2 que si réellement choisi + présent
      const argon2: any = await import("argon2");
      return {
        hash: (pw) => argon2.hash(pw),
        verify: (pw, stored) => argon2.verify(stored, pw).catch(() => false),
      };
    } catch {
      // argon2 non installé → repli scrypt (ne casse jamais)
    }
  }
  return scryptHasher;
}
