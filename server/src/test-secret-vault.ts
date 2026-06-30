// Tests du coffre-fort de secrets (#170) — node:crypto, aucune écriture disque réelle, aucun réseau réel.
// Prouve la propriété CRITIQUE : la valeur d'un secret ne sort JAMAIS vers la couche LLM.
import {
  parseSecretRef,
  isSecretRef,
  encryptJSON,
  decryptJSON,
  createEncryptedFileBackend,
  createBwsBackend,
  chainBackends,
  resolveSecret,
  redact,
  type VaultIO,
  type CommandRunner,
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

  console.log("\n[6] backend Bitwarden (bws) — runner injecté (sans bws installé)");
  {
    // Faux runner qui simule `bws secret list --output json`.
    const bwsJson = JSON.stringify([
      { key: "stripe/secret_key", value: SECRET },
      { key: "pexels/api_key", value: "px_key_123456" },
    ]);
    let sawToken = "";
    const fakeRun: CommandRunner = async (cmd, args, opts) => {
      sawToken = opts?.env?.BWS_ACCESS_TOKEN ?? "";
      if (cmd === "bws" && args[0] === "secret" && args[1] === "list") return { stdout: bwsJson, code: 0 };
      return { stdout: "", code: 1 };
    };
    const bws = createBwsBackend({ accessToken: "tok_abc", run: fakeRun });
    check("résout via bws secret list", (await bws.get("stripe", "secret_key")) === SECRET);
    check("le token d'accès a été passé à la CLI", sawToken === "tok_abc");
    check("clé inconnue → null", (await bws.get("stripe", "absent")) === null);

    const failRun: CommandRunner = async () => ({ stdout: "", code: 127 }); // bws absent
    const bwsAbsent = createBwsBackend({ run: failRun });
    check("bws absent (code 127) → null, ne casse pas", (await bwsAbsent.get("stripe", "secret_key")) === null);

    const badJson: CommandRunner = async () => ({ stdout: "pas du json", code: 0 });
    check("sortie illisible → null", (await createBwsBackend({ run: badJson }).get("a", "b")) === null);
  }

  console.log("\n[7] chainBackends — bws → fichier chiffré (premier hit gagne)");
  {
    const { io } = memIO();
    const fileVault = createEncryptedFileBackend({ filePath: "/v", masterKey: "mk", io });
    fileVault.put("local", "only", "valeur_locale");
    fileVault.put("shared", "key", "valeur_FICHIER");

    const bwsRun: CommandRunner = async () => ({ stdout: JSON.stringify([{ key: "shared/key", value: "valeur_BWS" }]), code: 0 });
    const bws = createBwsBackend({ run: bwsRun });

    const chain = chainBackends(bws, fileVault);
    check("hit bws prioritaire sur le fichier", (await resolveSecret("secret://shared/key", chain)) === "valeur_BWS");
    check("repli fichier si bws ne l'a pas", (await resolveSecret("secret://local/only", chain)) === "valeur_locale");
    check("aucun backend ne l'a → null", (await resolveSecret("secret://nulle/part", chain)) === null);
    check("chaîne ignore un backend nul", (await chainBackends(null, fileVault).get("local", "only")) === "valeur_locale");
  }

  console.log("\n[8] utilise_secret via une chaîne bws → la valeur ne sort jamais");
  {
    const bwsRun: CommandRunner = async () => ({ stdout: JSON.stringify([{ key: "api/token", value: SECRET }]), code: 0 });
    const chain = chainBackends(createBwsBackend({ run: bwsRun }));
    let sentAuth = "";
    const fakeFetch = (async (_url: string, init?: { headers?: Record<string, string> }) => {
      sentAuth = init?.headers?.["Authorization"] ?? "";
      return { status: 200, text: async () => `{"echo":"${sentAuth}"}` };
    }) as unknown as typeof fetch;
    const [tool] = buildEleveVaultTools("/proj", { backend: chain, fetchFn: fakeFetch });
    const used = await tool.handler({ ref: "secret://api/token", url: "https://api.exemple.com/me" });
    check("secret bws injecté dans l'appel", sentAuth === `Bearer ${SECRET}`);
    check("⭐ réponse rédigée (secret absent de la sortie)", !used.isError && !used.text.includes(SECRET) && used.text.includes("«secret»"));
  }

  console.log(`\n=== secret-vault : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
