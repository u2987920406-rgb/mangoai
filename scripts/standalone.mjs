import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { runtimeConfig } from './runtime-config.mjs';

const cfg = runtimeConfig();
const children = [];
let qaChild;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    process.exit(code);
  }, 10000);
  await Promise.all(children.map(child => (child.exitCode !== null || child.signalCode !== null) ? Promise.resolve() : new Promise(r => child.once('exit', r))));
  clearTimeout(timer);
  // Windows may terminate Node before its JS signal handlers run. Remove only our own heartbeat.
  try {
    const file = path.join(cfg.workspace, '.mangoqa-active');
    if (qaChild && JSON.parse(fs.readFileSync(file, 'utf8')).pid === qaChild.pid) fs.unlinkSync(file);
  } catch { /* absent already */ }
  process.exit(code);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

function launch(label, cwd, env) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd, env, stdio: 'inherit' });
  children.push(child);
  child.on('error', e => { console.error(`${label} : ${e.message}`); void stop(1); });
  child.on('exit', (code) => {
    if (!stopping) { console.error(`${label} s’est arrêté (${code}). Relance npm start après correction.`); void stop(1); }
  });
  return child;
}

try {
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) throw new Error('PORT invalide.');
  for (const file of ['server/node_modules/tsx/package.json', 'ui/dist/index.html']) {
    if (!fs.existsSync(path.join(cfg.root, file))) throw new Error(`${file} absent. Exécute npm run setup.`);
  }
  if (cfg.qaEnabled && !fs.existsSync(path.join(cfg.qa, 'node_modules/tsx/package.json'))) {
    throw new Error('MangoQA absent ou non installé. Clone MangoQA à côté de mangoai puis lance npm run setup. Pour utiliser explicitement Mango sans audit : MANGOQA_ENABLED=false.');
  }
  // Refuse collisions instead of killing another application on the user's machine.
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${cfg.port} occupé : change PORT ou arrête ton autre instance.`)));
    server.listen(cfg.port, cfg.host, () => server.close(resolve));
  });
  fs.mkdirSync(cfg.workspace, { recursive: true });
  fs.mkdirSync(cfg.data, { recursive: true });
  const env = { ...process.env, MANGOQA_ENABLED: cfg.qaEnabled ? '' : 'false', MANGO_STANDALONE: '1', HOST: cfg.host, PORT: String(cfg.port), MANGOAI_WORKSPACE: cfg.workspace, MANGO_DATA_DIR: cfg.data, PREVIEW_SWEEP: 'off' };
  if (cfg.qaEnabled) qaChild = launch('MangoQA', cfg.qa, env);
  launch('Mango', path.join(cfg.root, 'server'), env);
  const headers = process.env.MANGO_AUTH_TOKEN ? { Authorization: `Basic ${Buffer.from(`mango:${process.env.MANGO_AUTH_TOKEN}`).toString('base64')}` } : {};
  const url = `http://${cfg.host === '::1' ? '[::1]' : cfg.host === '0.0.0.0' ? '127.0.0.1' : cfg.host}:${cfg.port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`, { headers, signal: AbortSignal.timeout(500) });
      ready = response.ok && (await response.json()).app === 'mangoos';
      if (ready && cfg.qaEnabled) {
        const beat = JSON.parse(fs.readFileSync(path.join(cfg.workspace, '.mangoqa-active'), 'utf8'));
        ready = beat.pid === qaChild.pid && Date.now() - Date.parse(beat.heartbeat) < 15000;
      }
      if (ready) break;
    } catch { /* still starting */ }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!ready) throw new Error('Mango ne répond pas après 30 secondes. Consulte les erreurs ci-dessus.');
  console.log(`\n🥭 Mango prêt : ${url}\nProjets conservés dans ${cfg.workspace}\nCtrl+C pour arrêter Mango et MangoQA.`);
} catch (error) {
  console.error(error.message);
  await stop(1);
}
