// Real template + dependency install + Vite + browser; no LLM or hosting provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mango-preview-live-'));
process.env.MANGOAI_WORKSPACE=temp;
process.env.MANGO_STANDALONE='1';
const {createProject,deleteProject,listProjects}=await import('../projects.js');
const {startPreview,stopPreview}=await import('../preview.js');
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const dir=await createProject('audit-counter');
  fs.writeFileSync(path.join(dir,'src/App.jsx'),`import {useState} from 'react';\nexport default function App(){const [n,setN]=useState(0);return <main><h1>Compteur de vérification</h1><button onClick={()=>setN(n+1)}>Ajouter</button><output aria-label="Total">{n}</output></main>}`);
  const {url}=await startPreview(dir);
  browser=await chromium.launch({headless:true,...(process.env.MANGO_BROWSER_EXECUTABLE?{executablePath:process.env.MANGO_BROWSER_EXECUTABLE}:{})});
  const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.getByRole('button',{name:'Ajouter'}).click();
  assert.equal(await page.getByLabel('Total').textContent(),'1');
  assert.deepEqual(errors,[]);
  await promisify(execFile)('npm',['run','build'],{cwd:dir,timeout:120000,shell:process.platform==='win32'});
  assert(fs.existsSync(path.join(dir,'dist/index.html')));
  await stopPreview(dir);
  let stopped=false;try {await fetch(url,{signal:AbortSignal.timeout(2000)});}catch{stopped=true;}
  assert(stopped,'preview child process must stop');
  assert(listProjects().includes('audit-counter'));
  const restarted=await startPreview(dir);await page.goto(restarted.url);
  await page.getByRole('heading',{name:'Compteur de vérification'}).waitFor();
  await stopPreview(dir);deleteProject('audit-counter');assert(!listProjects().includes('audit-counter'));
  console.log('PASS : création depuis le template, installation, aperçu, clic réel, build, arrêt sans orphelin, réouverture, suppression. IA non sollicitée.');
} finally {await browser?.close();await stopPreview();fs.rmSync(temp,{recursive:true,force:true});}
