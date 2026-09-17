#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runtimeConfig } from './runtime-config.mjs';
const cfg = runtimeConfig();
let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
}
const [major, minor] = process.versions.node.split('.').map(Number);
check('Node', major > 22 || (major === 22 && minor >= 18), process.version + ' (22.18 minimum)');
const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
check('Git', git.status === 0, git.status === 0 ? git.stdout.trim() : 'installer Git pour les versions des projets');
for (const file of ['server/node_modules/tsx/package.json', 'ui/dist/index.html']) check(file, fs.existsSync(path.join(cfg.root, file)), 'npm run setup');
check('MangoQA', !cfg.qaEnabled || fs.existsSync(path.join(cfg.qa, 'node_modules/tsx/package.json')), cfg.qaEnabled ? cfg.qa : 'désactivé explicitement — créations non auditées');
for (const [name, dir] of [['Projets', cfg.workspace], ['Réglages', cfg.data]]) {
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); check(name, true, dir); }
  catch { check(name, false, 'dossier non accessible en écriture'); }
}
try {
  const { chromium } = await import(pathToFileURL(path.join(cfg.root, 'server/node_modules/playwright/index.mjs')).href);
  const browser = await chromium.launch({ headless: true, timeout: 10000, ...(process.env.MANGO_BROWSER_EXECUTABLE ? {executablePath: process.env.MANGO_BROWSER_EXECUTABLE} : {}), ...(process.env.MANGO_BROWSER_CHANNEL ? {channel: process.env.MANGO_BROWSER_CHANNEL} : {}) });
  await browser.close();
  check('Navigateur', true, 'lancement réel réussi');
} catch {
  check('Navigateur', false, 'dans server : npx playwright install chromium (Linux : ajouter --with-deps si nécessaire)');
}
try {
  const res = await fetch(`${(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/tags`, {signal: AbortSignal.timeout(2500)});
  if (!res.ok) throw new Error();
  const data = await res.json();
  console.log(`✓ Ollama répond — ${(data.models || []).map(m => m.name).join(', ') || 'aucun modèle installé'}`);
  if (!data.models?.length) console.log('  Ajoute un modèle et sélectionne-le dans Réglages > Intelligence.');
} catch {
  console.log('! Ollama ne répond pas. Démarre Ollama si tu utilises ses modèles. Claude nécessite sa propre connexion ; elle n’est pas validée par ce diagnostic.');
}
console.log('Les connexions IA et aux hébergeurs restent à configurer. Aucun appel payant effectué.');
process.exitCode = failures ? 1 : 0;
