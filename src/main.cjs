const {app,BrowserWindow,ipcMain,Tray,Menu,nativeImage,safeStorage,clipboard,dialog,shell}=require('electron');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const crypto=require('node:crypto');
const {createLifecycleRunner}=require('./lifecycle.cjs');
const runLifecycle=createLifecycleRunner({isPackaged:app.isPackaged,resourcesPath:process.resourcesPath,sourceDir:__dirname});
app.setName('Codex Accounts');
const version=require('../package.json').version;
let copiedValue=null;
let win,tray,worker,state,quitting=false,switching=false,autoExecuting=false,hostNotice=null,lastPending=null;
let nextId=0,pending=new Map(),hostPrefs={},otpValue=null,otpFile={},clipboardTimer,shutting=false;
const demo=!app.isPackaged&&process.argv.includes('--demo');
// The test mode never launches an account bridge or reads the real Codex home.
const dataDir=demo?path.join(app.getPath('temp'),'codex-accounts-preview-'+process.pid):app.getPath('userData');
const allowed=new Set(['state','refresh','details','login','resetLogin','cancelLogin','openBrowser','settings','snooze','alias','remove','switch']);
const methods=new Set([...allowed,'hostSettings','chooseClient','totp','totpSave','totpLoad','totpRemove','totpAccounts','copyCode','copyLogin','copyDeviceCode','quit','docs','releases','forgetTotp']);
function publish(){if(win&&!win.isDestroyed())win.webContents.send('accounts:state',snapshot());updateTray();}
function snapshot(){return {...state,host:{...hostPrefs,version,launchAtLogin:demo?false:app.getLoginItemSettings().openAtLogin,switching,notice:hostNotice,demo},notice:hostNotice||state?.notice};}
function notify(message,kind='error'){hostNotice={message,kind};publish();}
async function atomic(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,value,{mode:0o600});await fs.rename(temp,file);}
function call(method,params={}){
 if(demo)return demoCall(method,params);
 if(!worker||worker.exitCode!==null)return Promise.reject(Error('Hesap servisi hazır değil. Uygulamayı yeniden açın.'));
 return new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('İşlem süresi doldu. Servisin tamamlanmasını bekleyip Yenile seçin.'));},240000);pending.set(id,{resolve,reject,timer});worker.stdin.write(JSON.stringify({id,method,params})+'\n',e=>{if(e){clearTimeout(timer);pending.delete(id);reject(Error('Hesap servisine ulaşılamadı.'));}});});
}
function startWorker(){
 const platform=process.platform==='win32'?'win32-x64':'darwin-arm64';
 const runtime=app.isPackaged?path.join(process.resourcesPath,'runtime',platform):path.join(__dirname,'..','runtime',platform);
 worker=spawn(process.execPath,[path.join(__dirname,'bridge.mjs')],{windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',ACCOUNTS_CODEX:path.join(runtime,process.platform==='win32'?'codex.exe':'codex'),ACCOUNTS_AUTH:path.join(runtime,process.platform==='win32'?'codex-auth.exe':'codex-auth'),ACCOUNTS_STORE:dataDir},stdio:['pipe','pipe','ignore']});
 worker.on('error',()=>notify('Hesap servisi başlatılamadı. Uygulamayı yeniden açın.'));
 worker.stdin.on('error',()=>{});
 createInterface({input:worker.stdout}).on('line',line=>{let msg;try{msg=JSON.parse(line);}catch{return;}
  if(msg.event==='state'){state=msg.state;publish();}
  if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}
 });
 worker.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Hesap servisi durdu. Uygulamayı yeniden açın.'));}pending.clear();if(!quitting)notify('Hesap servisi durdu. Uygulamayı yeniden açın.');});
}
async function inspectClient(){
 if(process.platform!=='win32')return [];
 const {stdout}=await runLifecycle('inspect');
 const result=JSON.parse(stdout.replace(/^\uFEFF/,''));return Array.isArray(result)?result:result?[result]:[];
}
async function reopenClient(file){
 if(!file)return;
 const err=await shell.openPath(file);if(err)throw Error('Codex yeniden açılamadı. Başlat menüsünden Codex’i açın.');
}
async function switchAccount(params){
 if(switching||state?.busy||state?.login?.status==='waiting')throw Error('Devam eden işlemin bitmesini bekleyin.');
 switching=true;hostNotice=null;publish();let clients=[],closed=false;
 try{
  state=await call('state');if(!state.accounts.some(a=>a.id===params.key))throw Error('Hesap bulunamadı.');
  if(params.auto&&!state.settings.autoEnabled)throw Error('Otomatik geçiş kapalı.');
  if(state.settings.restartClient){
   clients=demo?[]:await inspectClient();
   if(clients.length){
    if(state.activity.busy||state.activity.unknown)throw Error('Codex’te devam eden iş veya belirsiz durum var. İş tamamlanınca tekrar deneyin.');
    notify('Codex normal biçimde kapatılıyor…','info');
    try{await runLifecycle('close',clients.map(c=>c.id));closed=true;}
    catch{throw Error('Codex kapanmadı veya kapanmayı reddetti. Hesap değiştirilmedi.');}
   }
  }
  await call('switch',params);notify('Hesap değiştirildi.'+(closed?' Codex yeniden açılıyor.':' Yeni CLI oturumları bu hesabı kullanacak.'),'success');
  return snapshot();
 }finally{
  if(closed){for(const file of new Set(clients.map(c=>c.path||hostPrefs.clientPath))){try{await reopenClient(file);}catch(e){notify(e.message);}}}
  switching=false;publish();
 }
}
function updateTray(){if(!tray)return;const active=state?.accounts?.find(a=>a.active);tray.setToolTip('Codex Accounts'+(active?' · '+(active.alias||active.email):''));tray.setContextMenu(Menu.buildFromTemplate([{label:'Codex Accounts’ı aç',click:()=>{win.show();win.focus();}}, {type:'separator'},...(state?.accounts||[]).slice(0,30).map(a=>({label:(a.active?'✓ ':'')+(a.alias||a.email),enabled:!a.active&&!switching&&!state?.busy,click:()=>switchAccount({key:a.id}).catch(e=>notify(e.message))})),{type:'separator'},{label:'Çık',click:()=>app.quit()}]));}
async function requireCrypto(){if(!await safeStorage.isAsyncEncryptionAvailable())throw Error('Windows şifreli depolama kullanılamıyor. Anahtar kaydedilmedi.');}
const otpId=key=>crypto.createHash('sha256').update(key).digest('hex');
function validKey(key){if(typeof key!=='string'||!state?.accounts?.some(a=>a.id===key))throw Error('Önce kayıtlı bir hesap seçin.');return otpId(key);}
function writeClipboard(value){copiedValue=value;clipboard.writeText(value);clearTimeout(clipboardTimer);clipboardTimer=setTimeout(()=>{if(clipboard.readText()===value)clipboard.clear();copiedValue=null;},45000);}
async function handle(method,p){
 if(typeof method!=='string'||!methods.has(method)||!p||typeof p!=='object'||Array.isArray(p)||JSON.stringify(p).length>16000)throw Error('Geçersiz işlem.');
 switch(method){
 case 'quit':app.quit();return {};
 case 'forgetTotp':otpValue=null;return {};
 case 'releases':await shell.openExternal('https://github.com/hasansercan/codex-accounts-switcher/releases/latest');return {};
 case 'docs':await shell.openExternal('https://learn.chatgpt.com/docs/app-server');return {};
 case 'hostSettings':
  if('launchAtLogin' in p){if(demo)throw Error('Önizlemede başlangıç ayarı değiştirilmez.');app.setLoginItemSettings({openAtLogin:p.launchAtLogin===true,path:process.execPath});}
  if('theme' in p)hostPrefs.theme=['light','dark','system'].includes(p.theme)?p.theme:'system';
  await atomic(path.join(dataDir,'desktop.json'),JSON.stringify(hostPrefs));publish();return snapshot();
 case 'chooseClient':{
  const r=await dialog.showOpenDialog(win,{title:'Codex uygulamasını seç',properties:['openFile'],filters:[{name:'Codex',extensions:['exe']}]});
  if(!r.canceled){if(path.basename(r.filePaths[0]).toLowerCase()!=='codex.exe')throw Error('Codex.exe uygulamasını seçin.');hostPrefs.clientPath=r.filePaths[0];await atomic(path.join(dataDir,'desktop.json'),JSON.stringify(hostPrefs));publish();}return snapshot();}
 case 'copyLogin':if(!state?.login?.url)throw Error('Giriş bağlantısı hazır değil.');{const u=new URL(state.login.url);if(u.protocol!=='https:'||!['auth.openai.com','chatgpt.com','auth0.openai.com'].includes(u.hostname))throw Error('Giriş bağlantısı geçersiz.');writeClipboard(state.login.url);return {};}
 case 'copyDeviceCode':if(state?.login?.code)writeClipboard(state.login.code);return {};
 case 'totp':{const {totp}=await import('./totp.mjs');if(p.value){totp(p.value);otpValue=p.value;}if(!otpValue)throw Error('Önce bir 2FA kurulum anahtarı girin.');return totp(otpValue);}
 case 'copyCode':{const {totp}=await import('./totp.mjs');if(!otpValue)throw Error('Önce 2FA anahtarını girin.');writeClipboard(totp(otpValue).code);return {};}
 case 'totpSave':{const id=validKey(p.key);if(!otpValue)throw Error('Önce 2FA anahtarını doğrulayın.');await requireCrypto();const encrypted=await safeStorage.encryptStringAsync(otpValue);otpFile[id]=encrypted.toString('base64');await atomic(path.join(dataDir,'totp-vault.json'),JSON.stringify(otpFile));return {};}
 case 'totpLoad':{const id=validKey(p.key);if(!otpFile[id])throw Error('Bu hesap için kayıtlı anahtar yok.');await requireCrypto();const decrypted=await safeStorage.decryptStringAsync(Buffer.from(otpFile[id],'base64'));otpValue=decrypted.result;const {totp}=await import('./totp.mjs');return totp(otpValue);}
 case 'totpRemove':{const id=validKey(p.key);const answer=await dialog.showMessageBox(win,{type:'warning',buttons:['Vazgeç','Kayıtlı 2FA anahtarını sil'],defaultId:0,cancelId:0,message:'Bu hesaba ait kayıtlı 2FA anahtarı silinsin mi?',detail:'Anahtarı yeniden kaydetmek için kurulum anahtarına ihtiyacınız olacak.'});if(answer.response===1){delete otpFile[id];await atomic(path.join(dataDir,'totp-vault.json'),JSON.stringify(otpFile));otpValue=null;return {removed:true};}return {removed:false};}
 case 'totpAccounts':return Object.keys(otpFile).filter(id=>state?.accounts?.some(a=>otpId(a.id)===id)).map(id=>state.accounts.find(a=>otpId(a.id)===id).id);
 case 'remove':{validKey(p.key);const answer=await dialog.showMessageBox(win,{type:'warning',buttons:['Vazgeç','Hesabı kaldır'],defaultId:0,cancelId:0,message:'Hesap bu bilgisayardan kaldırılsın mı?',detail:'Bu uygulamada yeniden kullanmak için tekrar giriş yapmanız gerekir. Kayıtlı 2FA anahtarı da kaldırılır.'});if(answer.response!==1)return snapshot();const r=await call(method,p);delete otpFile[otpId(p.key)];await atomic(path.join(dataDir,'totp-vault.json'),JSON.stringify(otpFile));return r;}
 case 'switch':return switchAccount(p);
 case 'state':await call('state');return snapshot();
 default:hostNotice=null;return call(method,p);
 }
}
app.setAppUserModelId('local.codex.accounts.windows');
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(win){win.show();win.focus();}});
 app.whenReady().then(async()=>{
  if(!demo&&process.platform!=='win32'){dialog.showErrorBox('Windows sürümü','Bu sürüm Windows içindir. Diğer sistemlerde yalnızca --demo ile önizleme yapın.');app.quit();return;}
  await fs.mkdir(dataDir,{recursive:true,mode:0o700});
  try{hostPrefs=JSON.parse(await fs.readFile(path.join(dataDir,'desktop.json'),'utf8'));}catch{}
  try{otpFile=JSON.parse(await fs.readFile(path.join(dataDir,'totp-vault.json'),'utf8'));}catch{}
  state={accounts:[],settings:{autoEnabled:false},busy:true,activity:{busy:false,unknown:false}};
  if(demo){state=require('./demo.cjs');}
  win=new BrowserWindow({title:'Codex Accounts',width:1180,height:820,minWidth:760,minHeight:560,backgroundColor:'#f3f4f6',show:false,icon:path.join(__dirname,'icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.setMenuBarVisibility(false);Menu.setApplicationMenu(null);
  const page=pathToFileURL(path.join(__dirname,'index.html')).href;
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  ipcMain.handle('accounts:call',async(event,method,p)=>{if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('Yetkisiz pencere.');try{return await handle(method,p);}catch(e){const raw=String(e.message||'İşlem tamamlanamadı.');const message=raw.startsWith('Command failed:')?'Sistem işlemi tamamlanamadı. Uygulamanın güncel sürümünü kurup tekrar deneyin.':raw.slice(0,700);notify(message);throw Error(message);}});
  await win.loadFile(path.join(__dirname,'index.html'));
  win.show();publish();
  win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();call('visibility',{visible:false}).catch(()=>{});}});
  win.on('show',()=>call('visibility',{visible:true}).catch(()=>{}));
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'icon.png')).resize({width:20,height:20}));tray.on('double-click',()=>{win.show();win.focus();});updateTray();
  if(!demo)startWorker();
  setInterval(async()=>{const p=state?.pendingAuto;if(!p||!state.settings.autoEnabled||state.busy||switching||autoExecuting||state.activity.busy||state.activity.unknown||Date.now()/1000<p.executeAt)return;
   if(lastPending===p.executeAt)return;lastPending=p.executeAt;autoExecuting=true;try{await switchAccount({key:p.key,auto:true});}catch(e){notify(e.message);await call('snooze').catch(()=>{});}finally{autoExecuting=false;}
  },1000).unref();
 }).catch(()=>{dialog.showErrorBox('Codex Accounts','Uygulama başlatılamadı. Güncel kurulum dosyasını yeniden çalıştırın veya ZIP’in tamamını çıkarın.');app.quit();});
}
app.on('before-quit',event=>{
 quitting=true;otpValue=null;clearTimeout(clipboardTimer);if(copiedValue&&clipboard.readText()===copiedValue)clipboard.clear();copiedValue=null;
 if(worker&&worker.exitCode===null&&!shutting){event.preventDefault();shutting=true;worker.stdin.end();worker.once('exit',()=>app.quit());setTimeout(()=>{worker?.kill();app.quit();},6000).unref();}
});
app.on('window-all-closed',()=>{});
async function demoCall(method,p){if(method==='switch'){state.accounts.forEach(a=>a.active=a.id===p.key);state.pendingAuto=null;}if(method==='settings')state.settings={...state.settings,...p};if(method==='alias')state.accounts.find(a=>a.id===p.key).alias=p.alias;if(method==='snooze')state.pendingAuto=null;if(method==='visibility')return {};if(method==='login')state.login={status:'waiting',url:'https://auth.openai.com/',message:'Önizleme: gerçek giriş başlatılmadı.',code:p.mode==='device'?'DEMO-CODE':null};if(method==='cancelLogin'||method==='resetLogin')state.login=null;publish();return structuredClone(state);}
