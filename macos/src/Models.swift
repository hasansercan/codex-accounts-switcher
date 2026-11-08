import Foundation
import AppKit
import SwiftUI
struct UsageWindow: Codable { let used: Double; let minutes: Int?; let resetsAt: Double?
 var remaining: Double { max(0,min(100,100-used)) }
 var label: String { guard let minutes else { return "Kullanım" }; if minutes==10080{return "Haftalık"};if minutes==300{return "5 saatlik"};return minutes>=60 ? "\(minutes/60) saatlik" : "\(minutes) dakikalık" }
 var resetLabel: String { guard let resetsAt else{return "Sıfırlanma bilgisi yok"};let f=DateFormatter();f.locale=Locale(identifier:"tr_TR");f.timeZone=TimeZone(identifier:"Europe/Istanbul");f.dateFormat="d MMM HH:mm";return f.string(from:Date(timeIntervalSince1970:resetsAt)) }
}
struct Bucket:Codable,Identifiable {let id:String;let name:String;let primary:UsageWindow?;let secondary:UsageWindow?;let limitReached:String?}
struct Account:Codable,Identifiable {
 let id:String;let email:String;let alias:String;let workspace:String;let plan:String;let authMode:String;let active:Bool;let autoOptIn:Bool?
 let primary:UsageWindow?;let secondary:UsageWindow?;let updatedAt:Double?;let source:String?;let error:String?;let errorCode:String?;let ordinaryUsageAllowed:Bool?;let limitReached:String?;let buckets:[Bucket]?;let credits:String?;let resetCredits:Int?;let creditsUnlimited:Bool?;let resetDetails:[ResetCredit]?;let history:UsageHistory?;let historyUpdatedAt:Double?;let historyError:String?
 var name:String{alias.isEmpty ? email:alias}
 var needsLogin:Bool{errorCode=="signin"||errorCode=="restricted"}
 var stale:Bool{Date().timeIntervalSince1970-(updatedAt ?? 0)>180 || error != nil}
 var institution:Bool{["edu","enterprise","business"].contains(plan.lowercased())}
 var planName:String{["plus":"Plus","pro":"Pro","prolite":"Pro Lite","edu":"Education","business":"Business","enterprise":"Enterprise","free":"Free" ][plan.lowercased()] ?? plan.capitalized}
 var age:String {guard let t=updatedAt,t>0 else{return "Henüz limit okunmadı"};let secs=Int(Date().timeIntervalSince1970-t);if secs<60{return "Az önce güncellendi"};if secs<3600{return "\(secs/60) dk önce güncellendi"};if secs<86400{return "\(secs/3600) saat önce"};return "\(secs/86400) gün önce"}
}
struct Preferences:Codable {var autoEnabled:Bool;var primaryThreshold:Double;var weeklyThreshold:Double;var refreshSeconds:Double;var restartClient:Bool;var cooldownSeconds:Double;var autoExcluded:[String];var lastSwitchAt:Double;var snoozeUntil:Double;var institutionOptIns:[String]?
 static let initial=Preferences(autoEnabled:false,primaryThreshold:5,weeklyThreshold:3,refreshSeconds:120,restartClient:true,cooldownSeconds:600,autoExcluded:[],lastSwitchAt:0,snoozeUntil:0,institutionOptIns:[])
}
struct LoginState:Codable {let status:String;let url:String?;let code:String?;let message:String;let mode:String}
struct AutoPending:Codable {let key:String;let previousKey:String;let email:String;let reason:String;let executeAt:Double}
struct Activity:Codable {let busy:Bool;let unknown:Bool}
struct Notice:Codable {let kind:String;let message:String}
struct Snapshot:Codable {let accounts:[Account];let settings:Preferences;let busy:Bool;let login:LoginState?;let pendingAuto:AutoPending?;let activity:Activity;let notice:Notice?;let lastRefresh:Double}
struct BridgeFailure:LocalizedError {let message:String;var errorDescription:String?{message}}
@MainActor final class Worker {
 var onState:((Snapshot)->Void)?;var onFailure:((String)->Void)?;private var process:Process?;private var input:FileHandle?;private var output:FileHandle?;private var next=0;private var pending:[Int:CheckedContinuation<Data,Error>]=[:];private var buffer=Data();private var closing=false
 func start(){
  guard let resources=Bundle.main.resourceURL else{return}
  let p=Process();p.executableURL=resources.appendingPathComponent("node");p.arguments=[resources.appendingPathComponent("bridge.mjs").path]
  var env=ProcessInfo.processInfo.environment;env["ACCOUNTS_CODEX"]=resources.appendingPathComponent("codex").path;env["ACCOUNTS_AUTH"]=resources.appendingPathComponent("codex-auth").path;p.environment=env
  let into=Pipe(),out=Pipe();p.standardInput=into;p.standardOutput=out;p.standardError=FileHandle.nullDevice;input=into.fileHandleForWriting;output=out.fileHandleForReading
  output?.readabilityHandler={ [weak self] h in let data=h.availableData;Task{@MainActor in self?.receive(data)}}
  p.terminationHandler={ [weak self] _ in Task{@MainActor in guard let self,!self.closing else{return};self.onFailure?("Hesap servisi durdu. Uygulamayı yeniden açın.");self.failPending()}}
  do{try p.run();process=p}catch{onFailure?("Hesap servisi başlatılamadı.")}
 }
 private func receive(_ data:Data){guard !data.isEmpty else{return};buffer.append(data)
  while let range=buffer.range(of:Data([10])){let line=buffer.subdata(in:0..<range.lowerBound);buffer.removeSubrange(0..<range.upperBound)
   guard let value=try? JSONSerialization.jsonObject(with:line) as? [String:Any] else{continue}
   if let state=value["state"],let d=try? JSONSerialization.data(withJSONObject:state),let s=try? JSONDecoder().decode(Snapshot.self,from:d){onState?(s)}
   if let id=value["id"] as? Int,let continuation=pending.removeValue(forKey:id){if let error=value["error"] as? [String:Any]{continuation.resume(throwing:BridgeFailure(message:error["message"] as? String ?? "İşlem tamamlanamadı."))}else if let r=value["result"],let d=try? JSONSerialization.data(withJSONObject:r,options:[.fragmentsAllowed]){continuation.resume(returning:d)}else{continuation.resume(returning:Data("{}".utf8))}}
  }
 }
 func call(_ method:String,_ params:[String:Any]=[:]) async throws -> Data{
  guard process?.isRunning==true else{throw BridgeFailure(message:"Hesap servisi hazır değil.")};next+=1;let id=next
  return try await withCheckedThrowingContinuation{c in pending[id]=c;do{var data=try JSONSerialization.data(withJSONObject:["id":id,"method":method,"params":params]);data.append(10);try input?.write(contentsOf:data)}catch{pending.removeValue(forKey:id)?.resume(throwing:error)}}
 }
 private func failPending(){let calls=pending;pending.removeAll();for c in calls.values{c.resume(throwing:BridgeFailure(message:"Hesap servisi bağlantısı kapandı."))}}
 func close(){closing=true;output?.readabilityHandler=nil;try? input?.close();process?.terminate();failPending()}
}
@MainActor enum ClientLifecycle {
 static let bundleID="com.openai.codex"
 static var running:[NSRunningApplication]{NSRunningApplication.runningApplications(withBundleIdentifier:bundleID)}
 static var appURL:URL?{NSWorkspace.shared.urlForApplication(withBundleIdentifier:bundleID)}
 static func terminateGracefully()async throws->(Bool,URL?){
  let apps=running,wasRunning = !apps.isEmpty,url=appURL
  for app in apps {guard app.terminate() else{throw BridgeFailure(message:"Codex kapanmayı kabul etmedi. İşinizi bitirip tekrar deneyin.")}}
  for _ in 0..<75{if running.isEmpty{return (wasRunning,url)};try await Task.sleep(nanoseconds:200_000_000)}
  throw BridgeFailure(message:"Codex kapanmadı; hesap değiştirilmedi. Açık işinizi kontrol edin.")
 }
 static func reopen(_ url:URL?) async throws{
  guard let url=url ?? appURL else{throw BridgeFailure(message:"Codex uygulaması bulunamadı.")}
  let config=NSWorkspace.OpenConfiguration();config.activates=true
  _ = try await NSWorkspace.shared.openApplication(at:url,configuration:config)
 }
}
@MainActor final class AccountsModel:ObservableObject {
 @Published var accounts:[Account]=[];@Published var settings=Preferences.initial;@Published var busy=false;@Published var actionBusy=false;@Published var login:LoginState?;@Published var pending:AutoPending?;@Published var activity=Activity(busy:false,unknown:false);@Published var banner="";@Published var bannerError=false;@Published var loginShown=false;@Published var lastRefresh:Double=0;@Published var section="accounts";@Published var transition="";@Published var now=Date();@Published var launchAtLogin=false
 let worker=Worker();private var timer:Timer?;private var lastNotice="";private var autoExecuting=false
 var active:Account?{accounts.first(where:{$0.active})}
 init(){worker.onState={ [weak self] s in self?.apply(s)};worker.onFailure={ [weak self] message in self?.show(message,error:true)};worker.start();timer=Timer.scheduledTimer(withTimeInterval:1,repeats:true){[weak self] _ in Task{@MainActor in self?.tick()}}
  launchAtLogin=FileManager.default.fileExists(atPath:Self.loginAgentPath)
 }
 func apply(_ s:Snapshot){accounts=s.accounts;settings=s.settings;busy=s.busy;login=s.login;pending=s.pendingAuto;activity=s.activity;lastRefresh=s.lastRefresh
  if let n=s.notice,n.message != lastNotice{lastNotice=n.message;show(n.message,error:n.kind=="error")}
 }
 func show(_ s:String,error:Bool=false){banner=s;bannerError=error}
 func request(_ method:String,_ params:[String:Any]=[:])async{do{_ = try await worker.call(method,params)}catch{show(error.localizedDescription,error:true)}}
 func refresh(){Task{await request("refresh")}}
 func update(_ transform:(inout Preferences)->Void){var p=settings;transform(&p);settings=p
  if let d=try? JSONEncoder().encode(p),let params=try? JSONSerialization.jsonObject(with:d) as? [String:Any]{Task{await request("settings",params)}}
 }
 func add(alias:String,email:String,device:Bool){actionBusy=true;Task{defer{actionBusy=false};await request("login",["alias":alias,"email":email,"mode":device ? "device":"browser"]);loginShown=true}}
 func reopenBrowser(){Task{await request("openBrowser")}}
 func cancelLogin(){Task{await request("cancelLogin")}}
 func snooze(){Task{await request("snooze")}}
 func switchTo(_ a:Account,automatic:Bool=false)async{
  guard !actionBusy,!busy else{return};actionBusy=true;defer{actionBusy=false;transition="";autoExecuting=false}
  var wasRunning=false;var url:URL?
  do{
   _ = try await worker.call("state")
   if settings.restartClient && !ClientLifecycle.running.isEmpty{
    if activity.busy||activity.unknown{if automatic{await request("snooze")};throw BridgeFailure(message:"Codex’te devam eden iş algılandı. İş tamamlandığında geçiş yapın.")}
    transition="Codex kapanıyor…";(wasRunning,url)=try await ClientLifecycle.terminateGracefully()
   }
   transition="Hesap değiştiriliyor…";_ = try await worker.call("switch",["key":a.id,"auto":automatic])
   if wasRunning{transition="Codex yeniden açılıyor…";try await ClientLifecycle.reopen(url);show("\(a.name) etkinleştirildi. Codex yeniden açıldı.")}
   else{show("\(a.name) etkinleştirildi. Yeni CLI oturumları bu hesabı kullanacak.")}
  }catch{if wasRunning{try? await ClientLifecycle.reopen(url)};show(error.localizedDescription,error:true)}
 }
 func tick(){now=Date();guard let p=pending,settings.autoEnabled,!autoExecuting,!busy,!actionBusy,!activity.busy,!activity.unknown,now.timeIntervalSince1970>=p.executeAt,let a=accounts.first(where:{$0.id==p.key}) else{return};autoExecuting=true;Task{await switchTo(a,automatic:true)}}
 static var loginAgentPath:String{FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents/local.codex.accounts.plist").path}
 func setLoginItem(_ enabled:Bool){
  do{let path=Self.loginAgentPath
   if enabled{let config:[String:Any]=["Label":"local.codex.accounts","ProgramArguments":["/usr/bin/open","-g",Bundle.main.bundleURL.path],"RunAtLoad":true];let data=try PropertyListSerialization.data(fromPropertyList:config,format:.xml,options:0);try FileManager.default.createDirectory(atPath:(path as NSString).deletingLastPathComponent,withIntermediateDirectories:true);try data.write(to:URL(fileURLWithPath:path));try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:path)}else if FileManager.default.fileExists(atPath:path){try FileManager.default.removeItem(atPath:path)};launchAtLogin=enabled
  }catch{show("Oturum açılış ayarı kaydedilemedi.",error:true)}
 }
 func quit(){timer?.invalidate();worker.close();NSApp.terminate(nil)}
}
