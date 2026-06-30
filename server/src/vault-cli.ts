// CLI du coffre-fort — UNIQUEMENT pour que Raf peuple/inspecte le coffre (jamais l'Élève).
// Usage (MANGO_VAULT_KEY + MANGO_VAULT_FILE requis dans l'environnement) :
//   npx tsx src/vault-cli.ts put <namespace> <clé> <valeur>
//   npx tsx src/vault-cli.ts list
//   npx tsx src/vault-cli.ts remove <namespace> <clé>
// La commande `list` n'affiche QUE les références (namespace/clé), jamais les valeurs.
import fs from "node:fs";
import { createEncryptedFileBackend, type VaultIO } from "./secret-vault.js";

const io: VaultIO = {
  read: (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null),
  write: (p, data) => fs.writeFileSync(p, data),
};

function main() {
  const file = process.env.MANGO_VAULT_FILE;
  const key = process.env.MANGO_VAULT_KEY;
  if (!file || !key) {
    console.error("MANGO_VAULT_FILE et MANGO_VAULT_KEY doivent être définis dans l'environnement.");
    process.exit(1);
  }
  const vault = createEncryptedFileBackend({ filePath: file, masterKey: key, io });
  const [cmd, ns, k, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "put": {
      if (!ns || !k || rest.length === 0) {
        console.error("Usage : put <namespace> <clé> <valeur>");
        process.exit(1);
      }
      vault.put(ns, k, rest.join(" "));
      console.log(`✓ secret://${ns.toLowerCase()}/${k.toLowerCase()} enregistré (chiffré).`);
      break;
    }
    case "remove": {
      if (!ns || !k) {
        console.error("Usage : remove <namespace> <clé>");
        process.exit(1);
      }
      vault.remove(ns, k);
      console.log(`✓ secret://${ns.toLowerCase()}/${k.toLowerCase()} retiré.`);
      break;
    }
    case "list": {
      const refs = vault.list();
      if (!refs.length) console.log("(coffre vide)");
      else console.log(refs.map((r) => `secret://${r}`).join("\n"));
      break;
    }
    default:
      console.error("Commandes : put | list | remove");
      process.exit(1);
  }
}

main();
