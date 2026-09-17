import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { root } from './runtime-config.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mango-standalone-'));
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const token = 'test-password-for-standalone-123456789';
const auth = {Authorization: `Basic ${Buffer.from(`mango:${token}`).toString('base64')}`};
const url = `http://127.0.0.1:${port}`;
const env = {...process.env, PORT:String(port), HOST:'127.0.0.1', MANGO_AUTH_TOKEN:token,
  MANGOAI_WORKSPACE:path.join(temp, 'workspace'), MANGO_DATA_DIR:path.join(temp, 'data'),
  VISION_PREWARM:'off', MANGOQA_ENABLED:'true', INTEGRITY_SCHEDULER:'off'};
let logs = '';
let child;
let count = 0;
function passed(label) { count++; console.log(`✓ ${label}`); }
function start() {
  child = spawn(process.execPath, ['scripts/standalone.mjs'], {cwd:root, env, stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const c = child;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {c.kill('SIGKILL'); reject(new Error('Arrêt incomplet'));}, 12000);
    c.once('exit', () => {clearTimeout(timer);resolve();}); c.kill('SIGTERM');
  });
}
async function request(p, init = {}) {
  return fetch(url + p, {...init, headers:{...auth, ...init.headers}, signal:AbortSignal.timeout(5000)});
}
async function waitReady() {
  for (let i=0;i<80;i++) {
    if (child.exitCode !== null) throw new Error('Démarrage échoué : '+logs);
    try { if ((await request('/api/health')).ok) return; } catch {}
    await new Promise(r => setTimeout(r,250));
  }
  throw new Error('Pas de réponse : '+logs);
}
try {
  start(); await waitReady();
  assert.equal((await (await request('/api/health')).json()).app, 'mangoos'); passed('serveur autonome prêt');
  assert.equal((await fetch(url+'/api/projects')).status,401); passed('authentification obligatoire quand configurée');
  assert.match(await (await request('/')).text(), /<div id="root"><\/div>/); passed('interface compilée servie sans Vite');
  assert.equal((await request('/creation/exemple')).status,200); passed('navigation SPA');
  const missing = await request('/api/inconnue'); assert.equal(missing.status,404); assert.match(missing.headers.get('content-type'),/json/); passed('404 API non masquée par la SPA');
  assert.equal((await request('/.env')).status,404); passed('configuration privée non servie');
  assert.equal((await request('/api/projects',{headers:{Origin:'https://evil.example'}})).status,403); passed('origine étrangère refusée');
  const state = await (await request('/api/runtime')).json(); assert.equal(state.standalone,true); assert.equal(state.storageWritable,true); assert.equal(state.qa,true); passed('MangoQA lancé et dossiers persistants accessibles');
  assert.equal((await (await request('/api/onboarding/status')).json()).hasProfile,false);
  const saved = await request('/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:'webapp',stack:'react',goal:'personnel',level:'debutant'})});
  assert.equal(saved.status,200); passed('première configuration enregistrée');
  const collision = spawn(process.execPath,['scripts/standalone.mjs'],{cwd:root,env,stdio:'ignore'});
  assert.equal(await new Promise(r=>collision.on('exit',r)),1);
  assert.equal((await request('/api/health')).status,200); passed('deuxième lancement refusé sans tuer la première instance');
  await stop();
  assert.equal(fs.existsSync(path.join(env.MANGOAI_WORKSPACE,'.mangoqa-active')),false); passed('MangoQA arrêté avec Mango');
  start(); await waitReady();
  assert.equal((await (await request('/api/onboarding/status')).json()).hasProfile,true); passed('configuration conservée après redémarrage');
  console.log(`${count} contrôles d’intégration réussis. Aucun appel IA ni publication.`);
} catch(e) { console.error(e); console.error(logs); process.exitCode=1; }
finally { await stop(); fs.rmSync(temp,{recursive:true,force:true}); }
