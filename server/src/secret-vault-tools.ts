// Outil « utilise_secret » de l'Élève (#170, slice 1) — gaté ELEVE_VAULT=on.
// L'Élève donne une RÉFÉRENCE secret://ns/clé ; le serveur la résout au dernier moment et
// l'injecte dans un appel HTTP autorisé. La VALEUR n'est JAMAIS renvoyée (ni dans le texte, ni
// dans la réponse : elle est rédigée). Anti-SSRF réutilisé (isCloneableUrl) + sanitizeExternal.
import { z } from "zod";
import fs from "node:fs";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";
import { isCloneableUrl } from "./vision.js";
import { sanitizeExternal } from "./agent-contract.js";
import {
  parseSecretRef,
  resolveSecret,
  redact,
  createEncryptedFileBackend,
  type SecretBackend,
  type VaultIO,
} from "./secret-vault.js";

export interface VaultToolDeps {
  backend: SecretBackend | null; // null = coffre non configuré
  fetchFn: typeof fetch;
}

const realVaultIO: VaultIO = {
  read: (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null),
  write: (p, data) => fs.writeFileSync(p, data),
};

/** Backend réel = fichier chiffré (MANGO_VAULT_FILE) déverrouillé par MANGO_VAULT_KEY. null si non configuré. */
export function realBackend(): SecretBackend | null {
  const file = process.env.MANGO_VAULT_FILE;
  const key = process.env.MANGO_VAULT_KEY;
  if (!file || !key) return null;
  return createEncryptedFileBackend({ filePath: file, masterKey: key, io: realVaultIO });
}

function realDeps(): VaultToolDeps {
  return { backend: realBackend(), fetchFn: fetch };
}

export function buildEleveVaultTools(_projectDir: string, deps: VaultToolDeps = realDeps()): KernelTool[] {
  const utiliseSecret: KernelTool = {
    name: "utilise_secret",
    description:
      "Utilise un secret du COFFRE-FORT sans jamais le voir. Tu donnes une RÉFÉRENCE `secret://namespace/clé` (jamais la valeur). Sans `url` : vérifie si le secret est disponible. Avec `url` : le serveur résout le secret et l'injecte dans l'en-tête de l'appel HTTP (défaut Authorization: Bearer …), puis te rend la réponse AVEC LE SECRET MASQUÉ. La valeur réelle ne t'est JAMAIS renvoyée. Sert à appeler une API protégée par clé sans manipuler la clé.",
    inputSchema: {
      ref: z.string().describe("Référence du secret, format secret://namespace/clé (ex. secret://stripe/secret_key)"),
      url: z.string().optional().describe("URL HTTP(S) publique à appeler en injectant le secret (omettre = juste vérifier la disponibilité)"),
      entete: z.string().optional().describe("Nom de l'en-tête où injecter le secret (défaut « Authorization »)"),
      prefixe: z.string().optional().describe("Préfixe devant le secret dans l'en-tête (défaut « Bearer »)"),
      methode: z.string().optional().describe("Méthode HTTP (défaut GET)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const ref = String(args.ref ?? "").trim();
      if (!parseSecretRef(ref)) {
        return { text: "Référence invalide. Format attendu : secret://namespace/clé (minuscules, chiffres, - et _).", isError: true };
      }
      if (!deps.backend) {
        return { text: "Coffre-fort non configuré (MANGO_VAULT_KEY / MANGO_VAULT_FILE manquants côté serveur).", isError: true };
      }

      let value: string | null;
      try {
        value = await resolveSecret(ref, deps.backend);
      } catch {
        value = null;
      }
      if (!value) {
        return { text: `Secret ${ref} introuvable dans le coffre (la valeur n'est jamais révélée de toute façon).`, isError: true };
      }

      const url = args.url ? String(args.url).trim() : "";
      if (!url) {
        return { text: `Le secret ${ref} est disponible dans le coffre. (Valeur jamais révélée — donne une \`url\` pour l'utiliser.)` };
      }
      if (!isCloneableUrl(url)) {
        return { text: "URL non autorisée (localhost / IP privée / protocole non HTTP interdits). Donne une URL publique http(s).", isError: true };
      }

      const entete = args.entete ? String(args.entete) : "Authorization";
      const prefixe = args.prefixe !== undefined ? String(args.prefixe) : "Bearer";
      const headerValue = prefixe ? `${prefixe} ${value}` : value;
      const methode = (args.methode ? String(args.methode) : "GET").toUpperCase();

      try {
        const res = await deps.fetchFn(url, { method: methode, headers: { [entete]: headerValue } });
        const raw = (await res.text()).slice(0, 4000);
        // DOUBLE garde : on rédige la valeur PUIS on sanitize (le secret ne sort jamais).
        const safe = sanitizeExternal(redact(raw, [value, headerValue]));
        return { text: `Appel ${methode} ${url} effectué (statut ${res.status}). Réponse (secret masqué) :\n${safe}` };
      } catch (e) {
        // Le message d'erreur pourrait théoriquement contenir l'URL mais jamais le secret (non injecté dedans).
        return { text: `Appel impossible : ${redact(e instanceof Error ? e.message : String(e), [value])}`, isError: true };
      }
    },
  };

  return [utiliseSecret];
}
