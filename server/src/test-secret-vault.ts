// Tests du coffre-fort de secrets (#170) — node:crypto, aucune écriture disque réelle, aucun réseau réel.
// Prouve la propriété CRITIQUE : la valeur d'un secret ne sort JAMAIS vers la couche LLM.
import {
  parseSecretRef,
  isSecretRef,
  encryptJSON,
  decryptJSON,
  createEncryptedFileBackend,
  resolveSecret,
  redact,
  type VaultIO,
} from "./secret-vault.js";
import { buildEleveVaultTools, type VaultToolDeps } from "./secret-vault-tools.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const SECRET = "sk_live_SUPERSECRET_0123456789";

// VaultIO en mémoire (aucun fichier réel)
function memIO(): { io: VaultIO; store: Map<string, string> } {
  const store = new Map<string, string>();
  return { store, io: { read: (p) => store.get(p) ?? null, write: (p, d) => { store.set(p, d); } } };
}

async function run() {
  console.log("[1] références secret://");
  {
    check("ref valide parse ns+clé", JSON.stringify(parseSecretRef("secret://stripe/secret_key")) === JSON.stringify({ namespace: "stripe", key: "secret_key" }));
    check("normalisée en minuscules", parseSecretRef("secret://Stripe/API_Key")?.namespace === "stripe");
    check("sans scheme → null", parseSecretRef("stripe/key") === null);
    check("chemin profond → null", parseSecretRef("secret://a/b/c") === null);
    check("caractère interdit → null", parseSecretRef("secret://a b/c") === null);
    check("isSecretRef", isSecretRef("secret://x/y") && !isSecretRef("http://x"));
  }

  console.log("\n[2] chiffrement AES-256-GCM");
  {
    const blob = encryptJSON({ "stripe/secret_key": SECRET }, "master-key");
    check("blob versionné v1 à 5 segments", blob.startsWith("v1.") && blob.split(".").length === 5);
    check("blob ne contient PAS le secret en clair", !blob.includes(SECRET));
    const dec = decryptJSON(blob, "master-key") as Record<string, string>;
    check("déchiffrement restitue la valeur", dec["stripe/secret_key"] === SECRET);
    check("mauvaise clé → null (auth tag GCM)", decryptJSON(blob, "mauvaise-cle") === null);
    check("blob corrompu → null", decryptJSON("v1.aaa.bbb.ccc.ddd", "master-key") === null);
  }

  console.log("\n[3] backend fichier chiffré");
  {
    const { io, store } = memIO();
    const vault = createEncryptedFileBackend({ filePath: "/vault", masterKey: "mk", io });
    vault.put("stripe", "secret_key", SECRET);
    check("le fichier sur 'disque' est chiffré (pas le secret)", !(store.get("/vault") ?? "").includes(SECRET));
    check("get résout la valeur", (await vault.get("stripe", "secret_key")) === SECRET);
    check("get insensible à la casse", (await vault.get("STRIPE", "Secret_Key")) === SECRET);
    check("get inconnu → null", (await vault.get("stripe", "absent")) === null);
    check("list ne renvoie que les références", JSON.stringify(vault.list()) === JSON.stringify(["stripe/secret_key"]));
    vault.remove("stripe", "secret_key");
    check("remove efface", (await vault.get("stripe", "secret_key")) === null);
    check("resolveSecret via référence", (() => true)());
    vault.put("stripe", "secret_key", SECRET);
    check("resolveSecret(ref) OK", (await resolveSecret("secret://stripe/secret_key", vault)) === SECRET);
    check("resolveSecret(ref invalide) → null", (await resolveSecret("pas-une-ref", vault)) === null);
  }

  console.log("\n[4] redact — la valeur est masquée");
  {
    const t = `réponse {"authorized": "${SECRET}", "ok": true}`;
    const r = redact(t, [SECRET]);
    check("la valeur disparaît", !r.includes(SECRET) && r.includes("«secret»"));
    check("valeurs triviales (<4) ignorées", redact("abc", ["ab"]) === "abc");
  }

  console.log("\n[5] KernelTool utilise_secret — LA VALEUR NE SORT JAMAIS");
  {
    const { io } = memIO();
    const vault = createEncryptedFileBackend({ filePath: "/v", masterKey: "mk", io });
    vault.put("api", "token", SECRET);

    // Faux fetch : une API qui RENVOIE EN ÉCHO l'en-tête Authorization (cas le pire).
    let seenAuthHeader = "";
    const fakeFetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
      seenAuthHeader = init?.headers?.["Authorization"] ?? "";
      return {
        status: 200,
        text: async () => `{"you_sent": "${seenAuthHeader}"}`, // l'API renvoie le secret en écho
      };
    }) as unknown as typeof fetch;

    const deps: VaultToolDeps = { backend: vault, fetchFn: fakeFetch };
    const [tool] = buildEleveVaultTools("/proj", deps);
    check("outil nommé utilise_secret", tool.name === "utilise_secret");

    const invalid = await tool.handler({ ref: "pas-une-ref" });
    check("référence invalide → isError, pas de valeur", invalid.isError === true && !invalid.text.includes(SECRET));

    const avail = await tool.handler({ ref: "secret://api/token" });
    check("sans url → disponibilité confirmée SANS la valeur", !avail.isError && /disponible/.test(avail.text) && !avail.text.includes(SECRET));

    const absent = await tool.handler({ ref: "secret://api/absent" });
    check("secret absent → isError sans valeur", absent.isError === true && !absent.text.includes(SECRET));

    const priv = await tool.handler({ ref: "secret://api/token", url: "http://localhost:3000/x" });
    check("URL privée → refusée (anti-SSRF)", priv.isError === true && /non autorisée/.test(priv.text));

    const used = await tool.handler({ ref: "secret://api/token", url: "https://api.exemple.com/me" });
    check("le secret A ÉTÉ injecté dans l'appel (Bearer)", seenAuthHeader === `Bearer ${SECRET}`);
    check("⭐ la réponse écho NE CONTIENT PAS le secret (rédigé)", !used.isError && !used.text.includes(SECRET) && used.text.includes("«secret»"));

    // backend non configuré
    const [tool2] = buildEleveVaultTools("/proj", { backend: null, fetchFn: fakeFetch });
    const novault = await tool2.handler({ ref: "secret://api/token" });
    check("coffre non configuré → message clair", novault.isError === true && /non configuré/.test(novault.text));
  }

  console.log(`\n=== secret-vault : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
