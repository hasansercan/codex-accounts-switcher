import {readFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {extractFile} from '@electron/asar';
const require=createRequire(import.meta.url),exec=promisify(execFile);
const root=dirname(dirname(fileURLToPath(import.meta.url)));
export async function verifyPackagedLifecycle(appDir){
 const resources=join(appDir,'resources'),archive=join(resources,'app.asar');
 const actual=await readFile(join(resources,'lifecycle.ps1')),expected=await readFile(join(root,'src','lifecycle.ps1'));
 if(!actual.equals(expected))throw Error('Packaged lifecycle script differs from source.');
 const helperModule={exports:{}};
 runInNewContext(extractFile(archive,'src/lifecycle.cjs').toString('utf8'),{require,module:helperModule,exports:helperModule.exports});
 const calls=[];
 // Load the actual packaged main module, without launching Electron, accounts or PowerShell.
 const electron={app:{isPackaged:true,setName(){},getPath(){return '/unused-test-data';},getLoginItemSettings(){return {openAtLogin:false};},getLoginItemSettings(){return {openAtLogin:false};},setAppUserModelId(){},requestSingleInstanceLock(){return false;},quit(){},on(){}},shell:{async openPath(){return '';}}};
 function localRequire(name){
  if(name==='electron')return electron;
  if(name==='../package.json')return {version:'1.3.0'};
  if(name==='./lifecycle.cjs')return {createLifecycleRunner:options=>helperModule.exports.createLifecycleRunner({...options,execute:async(program,args,config)=>{
   if(program!=='powershell.exe')throw Error('Unexpected lifecycle executable');
   // This child has no Electron ASAR support and can only open real on-disk files.
   const r=await exec(process.execPath,['-e',`const fs=require('node:fs');const a=JSON.parse(process.argv[1]);const f=a[a.indexOf('-File')+1];if(!fs.readFileSync(f,'utf8').includes('CloseMainWindow'))process.exit(2);console.log('ok');`,JSON.stringify(args)]);
   if(r.stdout.trim()!=='ok')throw Error('External lifecycle resource read failed');
   const mode=args[args.indexOf('-Mode')+1];calls.push(mode);
   return {stdout:mode==='inspect'?JSON.stringify([{id:1234,path:'fixture-Codex.exe'}]):'{"ok":true}',stderr:''};
  }})};
  return require(name);
 }
 const mainModule={exports:{}};
 const main=extractFile(archive,'src/main.cjs').toString('utf8');
 const testHooks=`\npublish=()=>{};notify=()=>{};state={accounts:[{id:'fixture',active:false}],settings:{restartClient:true},activity:{busy:false,unknown:false}};call=async(method)=>state;module.exports={switchAccount};`;
 runInNewContext(main+testHooks,{require:localRequire,module:mainModule,exports:mainModule.exports,__dirname:join(archive,'src'),process:{resourcesPath:resources,platform:'win32',argv:[],pid:123,execPath:'fixture.exe'},setTimeout,clearTimeout,console,URL});
 await mainModule.exports.switchAccount({key:'fixture'});
 if(calls.join(',')!=='inspect,close')throw Error('Both packaged lifecycle modes must be checked.');
 console.log('Packaged lifecycle verified: actual main uses a real external script for inspect and close.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await verifyPackagedLifecycle(resolve(process.argv[2]||join(root,'dist','Codex Accounts-win32-x64')));
