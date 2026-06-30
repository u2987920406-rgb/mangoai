// Coffre-fort de secrets (#170) — cœur PUR. Propriété de sécurité CRITIQUE : la VALEUR d'un secret
// ne doit jamais toucher la couche LLM (ni prompt, ni texte de retour, ni fichier généré). L'Élève
// manipule une RÉFÉRENCE `secret://namespace/clé` ; la résolution se fait côté serveur au dernier moment.
// Backend par défaut : fichier CHIFFRÉ AES-256-GCM (node:crypto, ZÉRO dépendance). Bitwarden/age = upgrades.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// ── Références ────────────────────────────────────────────────────────────────

const REF_RE = /^secret:\/\/([a-z0-9][a-z0-9_-]*)\/([a-z0-9][a-z0-9_-]*)$/i;

export interface SecretRef {
  namespace: string;
  key: string;
}

export function parseSecretRef(ref: string): SecretRef | null {
  const m = REF_RE.exec((ref ?? "").trim());
  return m ? { namespace: m[1].toLowerCase(), key: m[2].toLowerCase() } : null;
}

export function isSecretRef(s: string): boolean {
  return parseSecretRef(s) !== null;
}

// ── Chiffrement (AES-256-GCM, clé dérivée par scrypt) ─────────────────────────

export function encryptJSON(obj: unknown, masterKey: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(masterKey, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", salt.toString("base64"), iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

export function decryptJSON(blob: string, masterKey: string): unknown | null {
  try {
    const [v, saltB, ivB, tagB, ctB] = blob.split(".");
    if (v !== "v1") return null;
    const key = scryptSync(masterKey, Buffer.from(saltB, "base64"), 32);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]);
    return JSON.parse(pt.toString("utf8"));
  } catch {
    return null; // mauvaise clé / blob corrompu → l'auth tag GCM échoue
  }
}

// ── Backend ───────────────────────────────────────────────────────────────────

export interface SecretBackend {
  get(namespace: string, key: string): Promise<string | null>;
}

export interface VaultIO {
  read(path: string): string | null;
  write(path: string, data: string): void;
}

export interface EncryptedFileBackend extends SecretBackend {
  put(namespace: string, key: string, value: string): void;
  remove(namespace: string, key: string): void;
  list(): string[]; // "namespace/clé" (jamais les valeurs)
}

export function createEncryptedFileBackend(opts: { filePath: string; masterKey: string; io: VaultIO }): EncryptedFileBackend {
  const load = (): Record<string, string> => {
    const raw = opts.io.read(opts.filePath);
    if (!raw) return {};
    const dec = decryptJSON(raw, opts.masterKey);
    return dec && typeof dec === "object" ? (dec as Record<string, string>) : {};
  };
  const save = (d: Record<string, string>) => opts.io.write(opts.filePath, encryptJSON(d, opts.masterKey));
  const k = (ns: string, key: string) => `${ns.toLowerCase()}/${key.toLowerCase()}`;
  return {
    async get(ns, key) {
      return load()[k(ns, key)] ?? null;
    },
    put(ns, key, value) {
      const d = load();
      d[k(ns, key)] = value;
      save(d);
    },
    remove(ns, key) {
      const d = load();
      delete d[k(ns, key)];
      save(d);
    },
    list() {
      return Object.keys(load()).sort();
    },
  };
}

export async function resolveSecret(ref: string, backend: SecretBackend): Promise<string | null> {
  const p = parseSecretRef(ref);
  if (!p) return null;
  return backend.get(p.namespace, p.key);
}

// ── Garde de rédaction (défense en profondeur) ────────────────────────────────

/** Remplace toute occurrence d'une valeur de secret par « «secret» » avant qu'un texte
 * ne puisse atteindre le LLM ou les logs. Les valeurs < 4 caractères sont ignorées (bruit). */
export function redact(text: string, values: Array<string | null | undefined>): string {
  let out = text;
  for (const v of values) {
    if (!v || v.length < 4) continue;
    out = out.split(v).join("«secret»");
  }
  return out;
}
