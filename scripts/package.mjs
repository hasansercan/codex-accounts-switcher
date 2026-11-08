import {verifyPackagedLifecycle} from './verify-package.mjs';
import {packager} from '@electron/packager';
import {mkdir,readFile,writeFile,cp,rm,readdir,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import yazl from 'yazl';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
await import('./prepare-runtime.mjs');
const dist=join(root,'dist'),stage=join(root,'.stage');await mkdir(dist,{recursive:true});await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
for(const name of ['src','licenses','LICENSE','THIRD_PARTY_NOTICES.md'])await cp(join(root,name),join(stage,name),{recursive:true});
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));delete pkg.devDependencies;delete pkg.scripts;await writeFile(join(stage,'package.json'),JSON.stringify(pkg,null,2));
const [out]=await packager({dir:stage,name:'Codex Accounts',executableName:'Codex Accounts',platform:'win32',arch:'x64',electronVersion:JSON.parse(await readFile(join(root,'package.json'),'utf8')).devDependencies.electron,appVersion:'1.3.0',icon:join(root,'src','icon.ico'),win32metadata:{CompanyName:'Codex Accounts contributors',FileDescription:'Codex Accounts',ProductName:'Codex Accounts'},...(process.env.ACCOUNTS_ELECTRON_ZIP_DIR?{electronZipDir:process.env.ACCOUNTS_ELECTRON_ZIP_DIR}:{}),out:dist,overwrite:true,asar:true,prune:false,extraResource:[join(root,'runtime'),join(root,'src','lifecycle.ps1')],ignore:[/^\/src\/demo\.cjs$/]});
await cp(join(root,'KULLANIM.txt'),join(out,'KULLANIM.txt'));await cp(join(root,'INSTALL.ps1'),join(out,'INSTALL.ps1'));
await verifyPackagedLifecycle(out);
const {installerPath}=await import('./installer.mjs');
// Explicit allowlist prevents personal credentials and local test artifacts entering the source archive.
async function zipDir(source,target,items,prefix=''){
 const z=new yazl.ZipFile(),done=pipeline(z.outputStream,createWriteStream(target));
 async function add(dir,entry){for(const item of await readdir(dir,{withFileTypes:true})){const abs=join(dir,item.name),name=entry?entry+'/'+item.name:item.name;if(item.isSymbolicLink())throw Error('Unexpected symlink: '+name);if(item.isDirectory())await add(abs,name);else z.addFile(abs,name);}}
 if(items){for(const n of items){const abs=join(source,n);if((await stat(abs)).isDirectory())await add(abs,prefix+n);else z.addFile(abs,prefix+n);}}else await add(source,prefix);
 z.end();await done;
}
const portable=join(dist,'Codex-Accounts-1.3.0-Windows-x64.zip');await zipDir(out,portable,null,'Codex Accounts/');
const source=join(dist,'Codex-Accounts-1.3.0-Windows-Source.zip');await zipDir(root,source,['src','scripts','tests','licenses','LICENSE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','runtime-lock.json','README.md','KULLANIM.txt','INSTALL.ps1','.gitignore','.github','docs','README.tr.md','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md'],'Codex-Accounts-Windows/');
const sums=[];for(const f of [portable,source,installerPath]){const h=createHash('sha256');for await(const chunk of createReadStream(f))h.update(chunk);sums.push(h.digest('hex')+'  '+relative(dist,f));}
await writeFile(join(dist,'SHA256SUMS.txt'),sums.join('\n')+'\n');await rm(stage,{recursive:true,force:true});console.log('Ready: '+portable+'\nSource: '+source);
