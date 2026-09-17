import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runtimeConfig } from './runtime-config.mjs';
const cfg = runtimeConfig();
function npm(cwd, args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
if (cfg.qaEnabled && !fs.existsSync(path.join(cfg.qa, 'package-lock.json'))) {
  console.error('Clone MangoQA à côté de mangoai, ou renseigne MANGOQA_DIR dans .env.'); process.exit(1);
}
for (const dir of [path.join(cfg.root, 'server'), path.join(cfg.root, 'ui'), ...(cfg.qaEnabled ? [cfg.qa] : [])]) npm(dir, ['ci', '--no-audit', '--no-fund']);
npm(path.join(cfg.root, 'ui'), ['run', 'build']);
console.log('\nInstallation terminée. npm start lance Mango. npm run doctor vérifie les modèles et le navigateur.');
