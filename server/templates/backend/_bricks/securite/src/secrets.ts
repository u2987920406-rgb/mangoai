// Garde « secrets hors-code » + branchement sur le COFFRE-FORT (#170). ZÉRO dépendance.
// requireEnv refuse de démarrer si un secret obligatoire manque (échec rapide au boot).
// Si une valeur est une RÉFÉRENCE `secret://ns/clé` ET qu'un resolver est fourni, elle est
// résolue côté serveur (coffre chiffré local par défaut, Bitwarden/age en upgrade) → la valeur
// du secret n'est jamais posée en clair dans l'environnement ni le code.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";

const REF_RE = /^secret:\/\/([a-z0-9][a-z0-9_-]*)\/([a-z0-9][a-z0-9_-]*)$/i;

export function isSecretRef(s: string | undefined): boolean {
  return REF_RE.test((s ?? "").trim());
}

export interface SecretResolver {
  resolve(ref: string): string | null;
}

// ── Coffre chiffré local (AES-256-GCM) — MÊME format que le coffre MangoOS (#170) ─────────────

/** Chiffre un dictionnaire {"ns/clé": valeur} → blob "v1.salt.iv.tag.ct". Sert à peupler le coffre. */
export function encryptSecrets(record: Record<string, string>, masterKey: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(masterKey, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(record), "utf8")), cipher.final()]);
  return ["v1", salt.toString("base64"), iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

/** Résolveur depuis un fichier chiffré (MANGO_VAULT_FILE) déverrouillé par MANGO_VAULT_KEY. */
export function createEncryptedVault(opts: { filePath: string; masterKey: string; readFile?: (p: string) => string | null }): SecretResolver {
  const read = opts.readFile ?? ((p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null));
  const load = (): Record<string, string> => {
    const raw = read(opts.filePath);
    if (!raw) return {};
    try {
      const [v, saltB, ivB, tagB, ctB] = raw.split(".");
      if (v !== "v1") return {};
      const key = scryptSync(opts.masterKey, Buffer.from(saltB, "base64"), 32);
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
      d.setAuthTag(Buffer.from(tagB, "base64"));
      const pt = Buffer.concat([d.update(Buffer.from(ctB, "base64")), d.final()]);
      const obj = JSON.parse(pt.toString("utf8"));
      return obj && typeof obj === "object" ? (obj as Record<string, string>) : {};
    } catch {
      return {}; // mauvaise clé / blob corrompu → l'auth tag GCM échoue
    }
  };
  return {
    resolve(ref) {
      const m = REF_RE.exec((ref ?? "").trim());
      if (!m) return null;
      return load()[`${m[1].toLowerCase()}/${m[2].toLowerCase()}`] ?? null;
    },
  };
}

/** Résolveur basé sur l'environnement (référence non résolue → null) — repli par défaut. */
export const envResolver: SecretResolver = { resolve: () => null };

// ── requireEnv ────────────────────────────────────────────────────────────────

export interface RequireEnvOptions {
  env?: NodeJS.ProcessEnv;
  /** Résout les valeurs `secret://…` (coffre). Omis → les références ne sont pas résolues. */
  resolve?: (ref: string) => string | null;
}

export function requireEnv(names: string[], opts: RequireEnvOptions = {}): Record<string, string> {
  const env = opts.env ?? process.env;
  const out: Record<string, string> = {};
  const missing: string[] = [];

  for (const n of names) {
    let v: string | undefined = env[n];
    // Une valeur en référence de coffre est résolue au dernier moment (jamais posée en clair).
    if (v && isSecretRef(v)) {
      const resolved = opts.resolve ? opts.resolve(v) : null;
      v = resolved ?? undefined;
    }
    if (!v || String(v).trim() === "") missing.push(n);
    else out[n] = String(v);
  }

  if (missing.length) {
    throw new Error(`Secrets/variables d'environnement manquants ou non résolus : ${missing.join(", ")}`);
  }
  return out;
}
