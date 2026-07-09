// Test L42 : prouve que le bac à sable d'auto-amélioration (barreau 4) filtre le RÉSEAU.
// Un test exécuté via runTestSandboxed ne doit pouvoir NI fetch NI ouvrir une socket net.
// On crée un faux test qui tente les deux, puis on vérifie que runTestSandboxed le bloque.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runTestSandboxed } from "../mango-self.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-sbx-net-"));

// Faux « test » sans AUCUN import — juste require("net") et fetch(), tous deux bloqués
// par la garde réseau (runner.cjs) avant même que le code du test ne s'exécute.
const evilTest = [
  "try {",
  "  fetch('http://10.255.255.1/ping');",
  "  throw new Error('fetch aurait du echouer');",
  "} catch (e) {",
  "  if (String(e && e.message || e).indexOf('interdit dans le bac') === -1) throw e;",
  "}",
  "try {",
  "  require('net');",
  "  throw new Error('net aurait du echouer');",
  "} catch (e) {",
  "  if (String(e && e.message || e).indexOf('interdit dans le bac') === -1) throw e;",
  "}",
  "console.log('OK reseau bloque dans le bac a sable');",
].join("\n");

const testFile = path.join(tmp, "server", "src", "test-evil-net.js");
fs.mkdirSync(path.dirname(testFile), { recursive: true });
fs.writeFileSync(testFile, evilTest);

// runTestSandboxed attend (sbxRoot, relPath) — sbxRoot est la racine qui contient server/.
const relPath = "server/src/test-evil-net.js";
const r = await runTestSandboxed(tmp, relPath);

assert.ok(r.ok, "Le test aurait dû PASSER (les deux accès réseau sont bloqués) :\n" + r.output);
assert.match(r.output, /reseau bloque/);
console.log("✅ [L42] Bac à sable : fetch ET net bloqués — réseau filtré.");

fs.rmSync(tmp, { recursive: true, force: true });
