import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {readFile,writeFile,copyFile,chmod,mkdir,mkdtemp,rm,rename,readdir,stat,open} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {normalizeSettings,chooseAuto,safeAuthURL,classifyError} from './policy.mjs';
import {limitsFromResponse,historyFromResponse} from './usage.mjs';
const usageKeys=['primary','secondary','updatedAt','source','error','errorCode','retryAt','ordinaryUsageAllowed','limitReached','buckets','credits','creditsUnlimited','hasCredits','resetCredits','resetDetails','history','historyUpdatedAt','historyCheckedAt','historyError','extrasUpdatedAt'];
const exec=promisify(execFile),root=dirname(fileURLToPath(import.meta.url));
const isWindows=process.platform==='win32';
const codex=process.env.ACCOUNTS_CODEX||join(root,'codex'),auth=process.env.ACCOUNTS_AUTH||join(root,'codex-auth');
const codexHome=process.env.ACCOUNTS_HOME||join(homedir(),'.codex');
const store=process.env.ACCOUNTS_STORE||join(homedir(),'Library','Application Support','Codex Accounts');
const env={...process.env,HOME:homedir(),TMPDIR:process.env.TMPDIR||tmpdir(),LANG:'en_US.UTF-8'};
delete env.ELECTRON_RUN_AS_NODE;
const rpcProcesses=new Set();
let settings=normalizeSettings(),accounts=[],busy=false,visible=true,login=null,pendingAuto=null,activity={busy:false,unknown:false},notice=null,cache={},lastRefresh=0,quitting=false,queue=Promise.resolve();
const emit=()=>!quitting&&process.stdout.write(JSON.stringify({event:'state',state:state()})+'\n');
process.stdout.on('error',()=>shutdown());
function state(){return {accounts,settings,busy,login:login?{status:login.status,url:login.url||null,code:login.code||null,message:login.message,mode:login.mode,browserPid:login.browser?.pid||null}:null,pendingAuto,activity,notice,lastRefresh,versions:{auth:'0.3.1',codex:'0.162.0'}};}
async function atomic(path,contents,mode=0o600){const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,contents,{mode});await rename(tmp,path);await chmod(path,mode);}
async function save(){await atomic(join(store,'preferences.json'),JSON.stringify(settings));await atomic(join(store,'usage-cache.json'),JSON.stringify(cache));}
async function runAuth(args){const {stdout}=await exec(auth,args,{env:{...env,CODEX_HOME:codexHome},timeout:60000,maxBuffer:1024*1024,windowsHide:true});return stdout;}
async function loadAccounts(){
 const data=JSON.parse(await runAuth(['list','--skip-api','--json']));
 accounts=data.accounts.map(a=>{
  const c=cache[a.account_key],u=a.usage;const fromCache=c&&c.updatedAt>=Number(u?.updated_at||0);
  const window=w=>w?{used:w.used_percent,minutes:w.window_minutes,resetsAt:w.resets_at}:null;
  const base={id:a.account_key,email:a.email||'API hesabı',alias:a.alias||'',workspace:a.account_name||'',plan:a.plan||'unknown',authMode:a.auth_mode,active:a.active,autoOptIn:settings.institutionOptIns?.includes(a.account_key)||false};
  const data=c?Object.fromEntries(usageKeys.map(k=>[k,c[k]])):null;
  return {...base,...(fromCache?data:{...data,primary:window(u?.primary),secondary:window(u?.secondary),updatedAt:u?.updated_at||0,source:u?.source==='local'?'local':'cache',error:data?.error||null,ordinaryUsageAllowed:null,limitReached:null,buckets:[]})};
 });
 if(pendingAuto&&!accounts.some(a=>a.id===pendingAuto.previousKey&&a.active))pendingAuto=null;
}
function snapshotPath(key){const name=/^[a-zA-Z0-9_.-]+$/.test(key)&&!['.','..'].includes(key)?key:Buffer.from(key).toString('base64url');return join(codexHome,'accounts',name+'.auth.json');}
class CodexRPC {
 constructor(home){this.next=0;this.pending=new Map();this.child=spawn(codex,['-c','cli_auth_credentials_store="file"','-c','analytics.enabled=false','app-server','--listen','stdio://'],{env:{...env,CODEX_HOME:home},windowsHide:true,stdio:['pipe','pipe','ignore']});
 rpcProcesses.add(this);this.child.on('error',e=>{rpcProcesses.delete(this);this.fail(e);});this.child.on('exit',()=>{rpcProcesses.delete(this);this.fail(Error('Codex process ended'));});
 createInterface({input:this.child.stdout}).on('line',line=>{try{const msg=JSON.parse(line);if(msg.id!==undefined&&this.pending.has(msg.id)){const call=this.pending.get(msg.id);clearTimeout(call.timer);this.pending.delete(msg.id);msg.error?call.reject(Error(msg.error.message||'Codex error')):call.resolve(msg.result);}else if(msg.method){this.onEvent?.(msg);}}catch{}});
 }
 fail(e){for(const c of this.pending.values()){clearTimeout(c.timer);c.reject(e);}this.pending.clear();}
 async start(){await this.call('initialize',{clientInfo:{name:'codex_accounts_local',title:'Codex Accounts',version:'1.2.0'},capabilities:{experimentalApi:true}});this.child.stdin.write('{"method":"initialized"}\n');}
 call(method,params){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('timeout'));},30000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,method,...(params?{params}: {})})+'\n');});}
 close(){this.child.stdin.end();this.child.kill('SIGTERM');this.fail(Error('closed'));}
}
async function privateTemp(){const dir=await mkdtemp(join(tmpdir(),'codex-accounts-'));await chmod(dir,0o700);return dir;}
async function readIf(path){try{return await readFile(path);}catch{return null;}}
async function compareWrite(path,original,replacement){const latest=await readIf(path);if(latest?.equals(original))await atomic(path,replacement);}
async function refreshAccount(a,includeHistory=false){
 if(a.authMode!=='chatgpt')return;
 const prior=cache[a.id];if(!includeHistory&&prior?.retryAt>Date.now()/1000)return;
 const path=snapshotPath(a.id),initial=await readIf(path);if(!initial)return;
 const dir=await privateTemp();let rpc;
 try{
 await writeFile(join(dir,'auth.json'),initial,{mode:0o600});rpc=new CodexRPC(dir);await rpc.start();
 await rpc.call('account/read',{refreshToken:false});
 const result=await rpc.call('account/rateLimits/read');
 const expected=a.id.split('::').at(-1);if(result.accountId&&result.accountId!==expected)throw Error('account mismatch');
 const now=Date.now()/1000;cache[a.id]={...limitsFromResponse(result,prior),updatedAt:now,extrasUpdatedAt:now};
 if(includeHistory){
  cache[a.id].historyCheckedAt=Date.now()/1000;
  try{const history=await rpc.call('account/usage/read');cache[a.id].history=historyFromResponse(history);cache[a.id].historyUpdatedAt=Date.now()/1000;cache[a.id].historyError=null;}
  catch(e){cache[a.id].historyError=classifyError(e).message;}
 }

 }catch(e){const error=classifyError(e);const stored=prior||a;const usageOnly=Object.fromEntries(usageKeys.map(k=>[k,stored[k]]));cache[a.id]={...usageOnly,error:error.message,errorCode:error.code,retryAt:Date.now()/1000+({signin:3600,restricted:900,throttled:900,network:120,unavailable:300}[error.code])};delete cache[a.id].active;delete cache[a.id].id;}
 finally{
 rpc?.close();const renewed=await readIf(join(dir,'auth.json'));
 if(renewed&&!renewed.equals(initial)){await compareWrite(path,initial,renewed);if(a.active)await compareWrite(join(codexHome,'auth.json'),initial,renewed);}
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:300});
 }
}
async function scanActivity(){
 const now=new Date(),base=join(codexHome,'sessions');const days=[now,new Date(now-86400000)];let files=[];
 for(const d of days){const dir=join(base,String(d.getFullYear()),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0'));try{for(const name of await readdir(dir)){if(!name.endsWith('.jsonl'))continue;const path=join(dir,name),info=await stat(path);if(Date.now()-info.mtimeMs<10*60*1000)files.push({path,time:info.mtimeMs});}}catch{}}
 files.sort((a,b)=>b.time-a.time);let active=false,unknown=false;
 for(const f of files.slice(0,12)){
  let handle;try{handle=await open(f.path,'r');const s=await handle.stat(),size=Math.min(s.size,256*1024),buffer=Buffer.alloc(size);await handle.read(buffer,0,size,s.size-size);const rows=buffer.toString('utf8').split('\n');let last=null;for(const line of rows){try{const x=JSON.parse(line);if(x.type==='event_msg'&&['task_started','task_complete','turn_aborted','task_failed'].includes(x.payload?.type))last=x.payload.type;}catch{}}
  if(last==='task_started')active=true;if(!last&&Date.now()-f.time<60000)unknown=true;
  }catch{unknown=true;}finally{await handle?.close();}
 }
 activity={busy:active,unknown};return activity;
}
async function refresh(force=false){
 busy=true;emit();try{await loadAccounts();for(const a of accounts){if(force&&cache[a.id]&&cache[a.id].errorCode!=='signin')cache[a.id].retryAt=0;await refreshAccount(a);await loadAccounts();emit();}lastRefresh=Date.now()/1000;await scanActivity();const next=chooseAuto(accounts,settings);
 if(next&&!pendingAuto){pendingAuto={...next,executeAt:Date.now()/1000+20};}
 if(!next)pendingAuto=null;
 await save();}finally{busy=false;emit();}
 return state();
}
async function openBrowser(){
 if(!login?.url||!safeAuthURL(login.url))throw Error('Giriş bağlantısı hazır değil.');
 const candidates=isWindows?[join(process.env.PROGRAMFILES||'C:/Program Files','Google/Chrome/Application/chrome.exe'),join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Google/Chrome/Application/chrome.exe'),join(process.env.LOCALAPPDATA||homedir(),'Google/Chrome/Application/chrome.exe'),join(process.env.PROGRAMFILES||'C:/Program Files','Microsoft/Edge/Application/msedge.exe'),join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')]:['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
 let chrome;for(const candidate of candidates){try{await stat(candidate);chrome=candidate;break;}catch{}}
 if(!chrome)throw Error('Chrome veya Edge bulunamadı. Otomatik açmayı kapatıp bağlantıyı kendi tarayıcınıza kopyalayın.');
 if(login.browser&&login.browser.exitCode===null&&!login.browser.killed){const reopen=spawn(chrome,[`--user-data-dir=${login.profile}`,'--no-first-run','--no-default-browser-check',`--app=${login.url}`],{env,windowsHide:true,stdio:'ignore'});reopen.on('error',()=>{});return {ok:true,pid:login.browser.pid};}
 login.profile=login.profile||await privateTemp();
 const child=spawn(chrome,[`--user-data-dir=${login.profile}`,'--no-first-run','--no-default-browser-check',`--app=${login.url}`],{env,windowsHide:true,stdio:'ignore'});
 login.browser=child;child.once('exit',()=>{if(login?.browser===child)login.browser=null;});child.on('error',()=>{if(login){login.message='Chrome açılamadı. Chrome kurulumu veya cihaz kodu girişini kullanın.';emit();}});return {ok:true,pid:child.pid};
}
async function clearLogin(){const old=login;if(!old)return;clearTimeout(old.timer);old.rpc?.close();const browser=old.browser;if(browser&&browser.exitCode===null){browser.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(resolve,2500);browser.once('exit',()=>{clearTimeout(timer);resolve();});});if(browser.exitCode===null)browser.kill('SIGKILL');}old.rpc=null;await rm(old.dir,{recursive:true,force:true,maxRetries:5,retryDelay:300});if(old.profile)await rm(old.profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
async function finishLogin(event){
 const current=login;if(!current||current.status!=='waiting')return;
 try{if(!event.success)throw Error(event.error||'Login failed');await runAuth(['import',join(current.dir,'auth.json'),...(current.alias?['--alias',current.alias]:[])]);await loadAccounts();const added=JSON.parse(await readFile(join(current.dir,'auth.json'),'utf8'));const addedAccountId=added.tokens?.account_id;for(const a of accounts)if(a.id.split('::').at(-1)===addedAccountId||a.email===current.email||current.alias&&a.alias===current.alias){delete cache[a.id];}current.status='complete';current.message='Hesap eklendi. Listeden geçiş yapabilirsiniz.';notice={kind:'success',message:current.message};}
 catch(e){current.status='error';current.message=classifyError(e).message;}
 finally{try{await clearLogin();}catch{if(login)login.message+=' Geçici tarayıcı dosyaları temizlenemedi.';}emit();queue=queue.then(()=>refresh(true)).catch(()=>{});}
}
async function startLogin(input){
 if(login?.status==='waiting')throw Error('Açık giriş işlemi önce tamamlanmalı.');
 const dir=await privateTemp(),rpc=new CodexRPC(dir);login={dir,rpc,mode:input.mode==='device'?'device':'browser',alias:String(input.alias||'').slice(0,60),email:String(input.email||'').slice(0,150),status:'waiting',message:'Resmî Codex girişi hazırlanıyor.'};emit();
 rpc.onEvent=event=>{if(event.method==='account/login/completed'){queue=queue.then(()=>finishLogin(event.params)).catch(()=>{});}};
 try{await rpc.start();const response=await rpc.call('account/login/start',{type:login.mode==='device'?'chatgptDeviceCode':'chatgpt'});
 login.id=response.loginId;login.url=response.authUrl||response.verificationUrl;login.code=response.userCode||null;if(!safeAuthURL(login.url))throw Error('Unexpected authentication URL');
 login.message=login.mode==='device'?'Ayrı giriş penceresinde cihaz kodunu girin.':'Ayrı giriş penceresinde ChatGPT hesabınızla giriş yapın.';
 login.timer=setTimeout(()=>{queue=queue.then(async()=>{if(login?.status==='waiting'){login.status='error';login.message='Giriş süresi doldu. Tekrar deneyin.';await clearLogin();emit();}});},10*60*1000);
 if(input.openBrowser!==false){await openBrowser();}else{login.message=login.mode==='device'?'Bağlantıyı kendi tarayıcınızda açıp cihaz kodunu girin.':'Bağlantıyı kopyalayıp aynı bilgisayardaki tarayıcınızda açın.';}emit();return state();
 }catch(e){login.status='error';login.message=classifyError(e).message;await clearLogin();emit();throw Error(login.message);}
}
async function switchAccount(input){
 if(login?.status==='waiting')throw Error('Önce giriş işlemini tamamlayın.');await loadAccounts();const target=accounts.find(a=>a.id===input.key);if(!target)throw Error('Hesap bulunamadı.');
 if(input.auto){await scanActivity();const eligible=chooseAuto(accounts,settings);if(!eligible||eligible.key!==input.key||activity.busy||activity.unknown)throw Error('Otomatik geçiş için koşullar değişti.');}
 if(target.errorCode==='signin'||target.errorCode==='restricted')throw Error('Önce bu hesaba yeniden giriş yapın.');
 busy=true;emit();try{const result=JSON.parse(await runAuth(['switch',target.id,'--json']));await loadAccounts();if(!accounts.some(a=>a.id===input.key&&a.active))throw Error('Hesap geçişi doğrulanamadı.');settings.lastSwitchAt=Date.now()/1000;pendingAuto=null;notice={kind:'success',message:`${target.alias||target.email} etkinleştirildi.`};await save();return result;}finally{busy=false;emit();}
}
async function command(method,input={}){
 switch(method){
 case 'state':await loadAccounts();await scanActivity();emit();return state();
 case 'resetLogin':if(login?.status!=='waiting'){login=null;emit();}return state();
 case 'refresh':if(Date.now()/1000-lastRefresh<15)return state();return refresh(true);
 case 'details':{await loadAccounts();const a=accounts.find(a=>a.id===input.key);if(!a)throw Error('Hesap bulunamadı.');if(a.authMode!=='chatgpt')return state();if(Date.now()/1000-(cache[a.id]?.historyCheckedAt||0)<15)return state();busy=true;emit();try{await refreshAccount(a,true);await save();await loadAccounts();return state();}finally{busy=false;emit();}}
 case 'switch':return switchAccount(input);
 case 'login':return startLogin(input);
 case 'openBrowser':return openBrowser();
 case 'cancelLogin':if(login?.status==='waiting'){try{await login.rpc.call('account/login/cancel',{loginId:login.id});}catch{}login.status='cancelled';login.message='Giriş iptal edildi.';await clearLogin();emit();}return state();
 case 'settings':{const prior=settings;settings=normalizeSettings({...settings,...input,lastSwitchAt:settings.lastSwitchAt});settings.institutionOptIns=Array.isArray(input.institutionOptIns)?input.institutionOptIns:prior.institutionOptIns||[];pendingAuto=null;await save();await loadAccounts();const next=chooseAuto(accounts,settings);pendingAuto=next?{...next,executeAt:Date.now()/1000+20}:null;emit();return state();}
 case 'snooze':pendingAuto=null;settings.snoozeUntil=Date.now()/1000+1800;await save();emit();return state();
 case 'visibility':visible=input.visible!==false;return {ok:true};
 case 'alias':{if(typeof input.alias!=='string'||input.alias.length>60||/[\r\n\x00-\x1f]/.test(input.alias))throw Error('Hesap adı en fazla 60 karakter olabilir.');await loadAccounts();if(!accounts.some(a=>a.id===input.key))throw Error('Hesap bulunamadı.');await runAuth(input.alias?['alias','set',input.key,input.alias]:['alias','clear',input.key]);await loadAccounts();emit();return state();}
 case 'remove':{await loadAccounts();const a=accounts.find(a=>a.id===input.key);if(!a||a.active)throw Error('Etkin hesap kaldırılamaz.');await runAuth(['remove',input.key,'--json']);delete cache[input.key];await save();await loadAccounts();emit();return state();}
 default:throw Error('İşlem tanınmadı.');
 }
}
async function shutdown(){if(quitting)return;quitting=true;try{await clearLogin();}catch{}for(const rpc of rpcProcesses)rpc.close();process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);process.stdin.on('end',shutdown);
await mkdir(store,{recursive:true,mode:0o700});await chmod(store,0o700);
try{settings=normalizeSettings(JSON.parse(await readFile(join(store,'preferences.json'),'utf8')));const original=JSON.parse(await readFile(join(store,'preferences.json'),'utf8'));settings.institutionOptIns=original.institutionOptIns||[];}catch{}
try{cache=JSON.parse(await readFile(join(store,'usage-cache.json'),'utf8'));}catch{}
createInterface({input:process.stdin}).on('line',line=>{let request;try{request=JSON.parse(line);}catch{return;}
 if(!request||typeof request.id!=='number'||typeof request.method!=='string'||request.params!==undefined&&(!request.params||typeof request.params!=='object'||Array.isArray(request.params)))return;
 queue=queue.then(async()=>{try{const result=await command(request.method,request.params);process.stdout.write(JSON.stringify({id:request.id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id:request.id,error:{message:['switch','alias','remove','login','openBrowser'].includes(request.method)?(String(e.message).includes('Command failed')?'Codex Auth işlemi tamamlanamadı.':String(e.message)):'İşlem tamamlanamadı. Tekrar deneyin.'}})+'\n');}}).catch(()=>{});
});
queue=queue.then(async()=>{await loadAccounts();await scanActivity();emit();await refresh();}).catch(()=>{notice={kind:'error',message:'Hesaplar yüklenemedi. Codex oturumunu kontrol edin.'};emit();});
setInterval(()=>{const interval=settings.autoEnabled||visible?settings.refreshSeconds:300;if(!busy&&login?.status!=='waiting'&&Date.now()/1000-lastRefresh>=interval){queue=queue.then(()=>refresh()).catch(()=>{});}else if(pendingAuto){queue=queue.then(async()=>{await scanActivity();emit();}).catch(()=>{});}},5000);
