import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publicationFingerprint, verifyPublication, assertSourcesUnchanged } from '../publication-check.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mango-publish-'));
fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node test.js'}}));
fs.writeFileSync(path.join(dir,'index.html'),'<h1>Bonjour</h1>');
const green={verdict:'green' as const,rejection:null,branches:{}};
let tests=0;
const deps={active:()=>true,audit:async()=>green,test:async()=>{tests++;}};
try {
  const stamp=await verifyPublication(dir,deps); assert.equal(tests,1);
  assert.equal(stamp,publicationFingerprint(dir));
  await assert.rejects(verifyPublication(dir,{...deps,active:()=>false}),/MangoQA/);
  await assert.rejects(verifyPublication(dir,{...deps,audit:async()=>null}),/incomplet/);
  await assert.rejects(verifyPublication(dir,{...deps,audit:async()=>({...green,verdict:'unknown'})}),/incomplet/);
  await assert.rejects(verifyPublication(dir,{...deps,audit:async()=>({...green,verdict:'red'})}),/corrige/);
  await assert.rejects(verifyPublication(dir,{...deps,test:async()=>{throw new Error('test failed');}}),/test failed/);
  fs.mkdirSync(path.join(dir,'dist'));fs.writeFileSync(path.join(dir,'dist/index.html'),'build');assertSourcesUnchanged(dir,stamp);
  await assert.rejects(verifyPublication(dir,{...deps,audit:async()=>{fs.writeFileSync(path.join(dir,'index.html'),'changed');return green;}}),/changé/);
  assert.throws(()=>assertSourcesUnchanged(dir,stamp),/changé/);
  console.log('publication-check : 9 contrôles PASS (aucun hébergeur appelé).');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
