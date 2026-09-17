// Real browser against the compiled standalone application; no paid AI calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium} from '../server/node_modules/playwright/index.mjs';
import {root} from './runtime-config.mjs';
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'mango-browser-test-'));
const output = path.resolve(root, 'test-results'); fs.mkdirSync(output,{recursive:true});
const port = await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const env={...process.env,HOST:'127.0.0.1',PORT:String(port),MANGO_AUTH_TOKEN:'',MANGOQA_ENABLED:'true',MANGOAI_WORKSPACE:path.join(temp,'workspace'),MANGO_DATA_DIR:path.join(temp,'data'),VISION_PREWARM:'off'};
const child=spawn(process.execPath,['scripts/standalone.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
let browser;
try {
  const url=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let i=0;i<80;i++) {try{if((await fetch(url+'/api/health')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,250));}
  assert(ready,'Server must start');
  browser=await chromium.launch({headless:true,timeout:15000,...(process.env.MANGO_BROWSER_EXECUTABLE?{executablePath:process.env.MANGO_BROWSER_EXECUTABLE}:{}),...(process.env.MANGO_BROWSER_CHANNEL?{channel:process.env.MANGO_BROWSER_CHANNEL}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url); await page.getByText('Bienvenue dans').waitFor();
  await page.screenshot({path:path.join(output,'01-onboarding.png')});
  for(const label of ['Sites vitrines','React + Vite','Minimaliste','Projets perso']) {
    await page.getByRole('button',{name:new RegExp(label.replace('+','\\+'))}).click();
    await page.getByRole('button',{name:'Suivant →'}).click();
  }
  await page.getByRole('button',{name:/Débutant/}).click();
  // Failure injection is restricted to this request; the retry uses the real server.
  await page.route('**/api/onboarding',route=>route.fulfill({status:500,json:{error:'test'}}),{times:1});
  await page.getByRole('button',{name:'Démarrer avec Mango →'}).click();
  await page.getByRole('alert').getByText(/Impossible d’enregistrer/).waitFor();
  await page.getByRole('button',{name:'Démarrer avec Mango →'}).click();
  await page.getByText('Bienvenue dans').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/État de Mango/}).click();
  await page.getByRole('heading',{name:'État de Mango'}).waitFor();
  await page.screenshot({path:path.join(output,'02-home-status.png')});
  await page.getByRole('button',{name:/Vérifier à nouveau/}).click();
  await page.getByText('Le service de contrôle qualité est actif.',{exact:false}).waitFor();
  await page.reload();
  await page.getByRole('button',{name:/État de Mango/}).waitFor();
  assert.equal(await page.getByText('Bienvenue dans').count(),0,'onboarding persists');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/État de Mango/}).click();
  await page.screenshot({path:path.join(output,'03-mobile-status.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no horizontal overflow');
  assert.deepEqual(errors,[],'no uncaught browser errors');
  console.log('Browser: onboarding, real save/reload, failed save/retry, runtime diagnostics, desktop/mobile: PASS.');
} catch(e) {console.error(e); console.error(logs); process.exitCode=1;}
finally {
  await browser?.close();
  if(child.exitCode===null) await new Promise(r=>{const t=setTimeout(()=>{child.kill('SIGKILL');r();},12000);child.once('exit',()=>{clearTimeout(t);r();});child.kill('SIGTERM');});
  fs.rmSync(temp,{recursive:true,force:true});
}
