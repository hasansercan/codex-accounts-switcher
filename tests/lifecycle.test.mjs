import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createLifecycleRunner}=require('../src/lifecycle.cjs');
const exec=promisify(execFile);
test('Packaged lifecycle: an external process can read the physical -File path for inspect and close',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'Codex Accounts resources '));
 try{
  const resources=join(dir,'resources'),source=join(resources,'app.asar','src');
  await mkdir(resources,{recursive:true});await writeFile(join(resources,'lifecycle.ps1'),'fixture script');
  const calls=[];
  const run=createLifecycleRunner({isPackaged:true,resourcesPath:resources,sourceDir:source,execute:async(program,args,options)=>{
   assert.equal(program,'powershell.exe');assert.equal(options.windowsHide,true);calls.push({args,options});
   // A real independent process reads -File as PowerShell does, without ASAR patches.
   return exec(process.execPath,['-e',`const fs=require('node:fs');const args=JSON.parse(process.argv[1]);console.log(JSON.stringify({content:fs.readFileSync(args[args.indexOf('-File')+1],'utf8'),mode:args[args.indexOf('-Mode')+1]}))`,JSON.stringify(args)]);
  }});
  for(const mode of ['inspect','close']){const r=await run(mode,mode==='close'?[1234,5678]:[]);assert.deepEqual(JSON.parse(r.stdout),{content:'fixture script',mode});}
  assert.equal(calls[0].options.timeout,10000);assert.equal(calls[1].options.timeout,25000);
  assert.deepEqual(calls[1].args.slice(-2),['-Ids','1234,5678']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Development lifecycle uses source file; missing resource prevents process execution',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'accounts-lifecycle-'));let invoked=false;
 try{const run=createLifecycleRunner({isPackaged:false,sourceDir:dir,execute:async()=>{invoked=true;return {stdout:'[]'};}});await assert.rejects(run('inspect'),/denetim dosyası bulunamadı/);assert.equal(invoked,false);await writeFile(join(dir,'lifecycle.ps1'),'fixture');await run('inspect');assert.equal(invoked,true);}finally{await rm(dir,{recursive:true,force:true});}
});
test('ASAR paths and invalid close requests are rejected before launching a process',async()=>{
 assert.throws(()=>createLifecycleRunner({isPackaged:true,resourcesPath:join(tmpdir(),'app.asar','src')}),/arşiv dışında/);
 const run=createLifecycleRunner({isPackaged:true,resourcesPath:tmpdir()});
 await assert.rejects(run('close',[]),/Geçersiz/);await assert.rejects(run('close',['1;evil']),/Geçersiz/);await assert.rejects(run('other'),/Geçersiz/);
});
