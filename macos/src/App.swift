import SwiftUI
import AppKit
@MainActor final class AppDelegate:NSObject,NSApplicationDelegate {
 func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{false}
 func applicationDidFinishLaunching(_ notification:Notification){NSApp.setActivationPolicy(.regular);NSApp.activate(ignoringOtherApps:true)}
}
enum Theme {
 static let accent=Color(red:0.09,green:0.39,blue:0.47)
 static let accentDark=Color(red:0.40,green:0.77,blue:0.84)
 static let danger=Color(nsColor:.systemRed)
 static let background=Color(nsColor:.windowBackgroundColor)
 static let surface=Color(nsColor:.controlBackgroundColor)
 static let line=Color.primary.opacity(0.12)
}
struct FocusButtonStyle:ButtonStyle {
 var prominent=false
 @Environment(\.colorScheme) var scheme
 @Environment(\.isEnabled) var enabled
 func makeBody(configuration:Configuration)->some View{configuration.label.font(.system(size:13,weight:.semibold)).padding(.horizontal,14).frame(minHeight:36).foregroundStyle(prominent ? Color.white:Color.primary).background(prominent ? Theme.accent:Theme.surface,in:RoundedRectangle(cornerRadius:7)).overlay(RoundedRectangle(cornerRadius:7).stroke(prominent ? Theme.accent:Theme.line,lineWidth:1)).opacity(enabled ? (configuration.isPressed ? 0.75:1):0.4)}
}
struct QuotaView:View {
 let window:UsageWindow?;let fallback:String;var large=false;var stale=false
 @Environment(\.colorScheme) private var scheme
 var tint:Color{if let w=window,w.remaining<=10{return Theme.danger};return scheme == .dark ? Theme.accentDark:Theme.accent}
 var body:some View{
  VStack(alignment:.leading,spacing:8){
   HStack{Text(window?.label ?? fallback).font(.system(size:12,weight:.medium)).foregroundStyle(.secondary);if stale{Text("Eski veri").font(.system(size:10,weight:.medium)).foregroundStyle(.secondary)}}
   HStack(alignment:.firstTextBaseline,spacing:5){Text(window.map{"%\(Int($0.remaining.rounded()))"} ?? "—").font(.system(size:large ? 44:25,weight:.semibold,design:.rounded)).monospacedDigit();Text("kalan").font(.system(size:12)).foregroundStyle(.secondary)}
   GeometryReader{g in ZStack(alignment:.leading){Capsule().fill(Theme.line);Capsule().fill(tint).frame(width:g.size.width*CGFloat((window?.remaining ?? 0)/100))}}.frame(height:5).accessibilityElement(children:.ignore).accessibilityLabel("\(window?.label ?? fallback) kalan kullanım").accessibilityValue(window.map{"Yüzde \(Int($0.remaining))"} ?? "Bilinmiyor")
   Text(window.map{"Sıfırlanma \($0.resetLabel)"} ?? "Veri bekleniyor").font(.system(size:11)).foregroundStyle(.secondary)
  }.frame(maxWidth:.infinity,alignment:.leading)
 }
}
struct ActiveAccountView:View {
 let account:Account
 @Environment(\.colorScheme) private var scheme
 var body:some View{
  HStack(alignment:.center,spacing:32){
   VStack(alignment:.leading,spacing:12){Label("Etkin hesap",systemImage:"checkmark.circle.fill").font(.system(size:12,weight:.semibold)).foregroundStyle(scheme == .dark ? Theme.accentDark:Theme.accent)
    Text(account.name).font(.system(size:20,weight:.semibold)).textSelection(.enabled).lineLimit(2).minimumScaleFactor(0.75)
    Text(account.alias.isEmpty ? account.planName:"\(account.email)\n\(account.planName)").font(.system(size:12)).foregroundStyle(.secondary)
    if let e=account.error{Text(e).font(.system(size:12)).foregroundStyle(Theme.danger)}
   }.frame(maxWidth:.infinity,alignment:.leading)
   QuotaView(window:account.primary,fallback:"5 saatlik",large:true,stale:account.stale).frame(maxWidth:180)
   QuotaView(window:account.secondary,fallback:"Haftalık",large:true,stale:account.stale).frame(maxWidth:180)
  }.padding(24).background(Theme.surface,in:RoundedRectangle(cornerRadius:14)).overlay(RoundedRectangle(cornerRadius:14).stroke(Theme.line,lineWidth:1))
 }
}
struct AccountRow:View {
 let account:Account;@ObservedObject var model:AccountsModel;var onEdit:()->Void; var onDetails:()->Void
 @State private var hover=false
 var body:some View{
  VStack(alignment:.leading,spacing:16){
   HStack(alignment:.top,spacing:16){Image(systemName:account.institution ? "building.2":"person.crop.circle").font(.system(size:24,weight:.light)).foregroundStyle(.secondary).frame(width:32)
    VStack(alignment:.leading,spacing:4){Text(account.name).font(.system(size:14,weight:.semibold)).textSelection(.enabled).lineLimit(2)
     Text(([account.alias.isEmpty ? "":account.email,account.workspace,account.planName]).filter{!$0.isEmpty}.joined(separator:" · ")).font(.system(size:12)).foregroundStyle(.secondary).lineLimit(2)
    }.frame(maxWidth:.infinity,alignment:.leading)
    if account.active{Label("Etkin",systemImage:"checkmark").font(.system(size:11,weight:.semibold)).foregroundStyle(Theme.accent)}
    Button(action:onEdit){Image(systemName:"ellipsis").frame(width:28,height:28)}.buttonStyle(.plain).help("Hesap ayarları").accessibilityLabel("\(account.name) hesap ayarları")
   }
   HStack(spacing:24){QuotaView(window:account.primary,fallback:"5 saatlik",stale:account.stale);QuotaView(window:account.secondary,fallback:"Haftalık",stale:account.stale)}
   if let e=account.error{Label(e,systemImage:"exclamationmark.circle").font(.system(size:12)).foregroundStyle(Theme.danger).fixedSize(horizontal:false,vertical:true)}
   HStack{Text(account.age).font(.system(size:11)).foregroundStyle(.secondary);Spacer();Button("Ayrıntılar",action:onDetails).buttonStyle(FocusButtonStyle())
    if account.needsLogin{Button("Yeniden giriş"){model.loginShown=true}.buttonStyle(FocusButtonStyle())}
    else if !account.active{Button{Task{await model.switchTo(account)}}label:{Label("Bu hesaba geç",systemImage:"arrow.left.arrow.right")}.buttonStyle(FocusButtonStyle()).disabled(model.busy||model.actionBusy||model.login?.status=="waiting")}
    else{Text("Kullanımda").font(.system(size:12,weight:.medium)).foregroundStyle(.secondary)}
   }
  }.padding(20).frame(maxWidth:.infinity,alignment:.leading).background(Theme.surface,in:RoundedRectangle(cornerRadius:10)).overlay(RoundedRectangle(cornerRadius:10).stroke(Theme.line.opacity(hover ? 1:0.6),lineWidth:1)).onHover{hover=$0}
 }
}
struct AccountsView:View {
 @ObservedObject var model:AccountsModel;@State private var query="";@State private var editing:Account?;@State private var details:Account?
 var filtered:[Account]{model.accounts.filter{query.isEmpty||[$0.email,$0.alias,$0.workspace].joined(separator:" ").localizedCaseInsensitiveContains(query)}}
 var body:some View{
  VStack(alignment:.leading,spacing:24){
   HStack(alignment:.center){VStack(alignment:.leading,spacing:6){Text("Hesapların, tek yerde.").font(.system(size:30,weight:.semibold));Text("Kalan kullanımını gör, çalışacağın hesabı seç.").font(.system(size:13)).foregroundStyle(.secondary)};Spacer()}
   if let a=model.active{ActiveAccountView(account:a)}
   HStack{Text("Kayıtlı hesaplar").font(.system(size:17,weight:.semibold));Text("\(model.accounts.count)").font(.system(size:12)).foregroundStyle(.secondary);Spacer();TextField("Hesap ara",text:$query).textFieldStyle(.roundedBorder).frame(width:190).accessibilityLabel("Hesap ara")}
   if filtered.isEmpty{VStack(alignment:.leading,spacing:12){Text(model.accounts.isEmpty ? "İlk hesabını ekle":"Aramana uygun hesap yok").font(.headline);Text(model.accounts.isEmpty ? "ChatGPT hesabınla ayrı giriş penceresinde oturum aç.":"E-posta veya hesap adıyla tekrar dene.").foregroundStyle(.secondary)}.padding(24).frame(maxWidth:.infinity,alignment:.leading).background(Theme.surface,in:RoundedRectangle(cornerRadius:10))}
   LazyVGrid(columns:[GridItem(.adaptive(minimum:300),spacing:16)],spacing:16){ForEach(filtered){a in AccountRow(account:a,model:model,onEdit:{editing=a},onDetails:{details=a})}}
   HStack(alignment:.top,spacing:10){Image(systemName:"info.circle").foregroundStyle(.secondary);Text(model.settings.restartClient ? "Geçişte açık Codex normal şekilde kapatılır ve yeni hesapla yeniden açılır. Devam eden iş algılanırsa önce tamamlanması beklenir.":"Geçiş yeni CLI oturumlarına uygulanır. Açık Codex uygulamasını yeni hesabı kullanmak için yeniden başlat.").font(.system(size:12)).foregroundStyle(.secondary)}.padding(.top,8)
  }.sheet(item:$editing){a in AccountSettingsView(account:a,model:model)}.sheet(item:$details){a in UsageDetailsView(accountID:a.id,model:model)}
 }
}
struct AutoView:View {
 @ObservedObject var model:AccountsModel
 var body:some View{
  VStack(alignment:.leading,spacing:24){
   Text("Otomatik geçiş").font(.system(size:30,weight:.semibold))
   Text("Limit azaldığında, uygun hesaplardan kalan kullanımı en yüksek olanı seçer.").font(.system(size:13)).foregroundStyle(.secondary)
   VStack(alignment:.leading,spacing:20){Toggle(isOn:Binding(get:{model.settings.autoEnabled},set:{v in model.update{$0.autoEnabled=v}})){VStack(alignment:.leading,spacing:4){Text("Otomatik geçişi etkinleştir").font(.headline);Text("Uygulama menü çubuğunda açıkken çalışır.").font(.system(size:12)).foregroundStyle(.secondary)}}.toggleStyle(.switch)
    Divider()
    threshold("5 saatlik kalan kullanım",value:Binding(get:{model.settings.primaryThreshold},set:{v in model.update{$0.primaryThreshold=v}}))
    threshold("Haftalık kalan kullanım",value:Binding(get:{model.settings.weeklyThreshold},set:{v in model.update{$0.weeklyThreshold=v}}))
    HStack{Text("Limit yenileme");Spacer();Picker("Limit yenileme",selection:Binding(get:{model.settings.refreshSeconds},set:{v in model.update{$0.refreshSeconds=v}})){Text("1 dakika").tag(60.0);Text("2 dakika").tag(120.0);Text("5 dakika").tag(300.0)}.labelsHidden().frame(width:150)}
    Toggle(isOn:Binding(get:{model.settings.restartClient},set:{v in model.update{$0.restartClient=v}})){VStack(alignment:.leading,spacing:4){Text("Codex’i kapatıp yeniden aç");Text("Elle ve otomatik geçişte yeni hesabı uygulamaya uygular.").font(.system(size:12)).foregroundStyle(.secondary)}}
   }.padding(24).background(Theme.surface,in:RoundedRectangle(cornerRadius:12))
   VStack(alignment:.leading,spacing:12){Label(model.activity.busy ? "Devam eden iş var; otomatik geçiş bekler.":"Geçiş öncesi çalışma durumu kontrol edilir.",systemImage:"pause.circle")
    Label("Geçişten önce 20 saniyelik iptal süresi.",systemImage:"clock")
    Label("İki geçiş arasında en az 10 dakika.",systemImage:"arrow.triangle.2.circlepath")
    Label("Eski, eksik veya erişim hatalı limitler seçilmez.",systemImage:"checkmark.shield")
   }.font(.system(size:13)).foregroundStyle(.secondary)
   Text("Otomatik geçişe dahil hesaplar").font(.system(size:17,weight:.semibold))
   ForEach(model.accounts){a in Toggle(isOn:Binding(get:{!model.settings.autoExcluded.contains(a.id)&&(!a.institution||(model.settings.institutionOptIns ?? []).contains(a.id))},set:{enabled in model.update{p in if enabled{p.autoExcluded.removeAll{$0==a.id};if a.institution{p.institutionOptIns=(p.institutionOptIns ?? []).filter{$0 != a.id}+[a.id]}}else{if !p.autoExcluded.contains(a.id){p.autoExcluded.append(a.id)};p.institutionOptIns?.removeAll{$0==a.id}}}})){VStack(alignment:.leading,spacing:4){Text(a.name);if a.institution{Text("Kurum hesabı: Codex kullanım yetkiniz varsa dahil edin.").font(.system(size:11)).foregroundStyle(.secondary)}}}}
  }
 }
 @ViewBuilder func threshold(_ title:String,value:Binding<Double>)->some View{HStack{Text(title);Spacer();Stepper(value:value,in:0...25,step:1){Text("%\(Int(value.wrappedValue)) ve altı").monospacedDigit()}.frame(width:185)}}
}
struct SettingsView:View {
 @ObservedObject var model:AccountsModel
 var body:some View{VStack(alignment:.leading,spacing:24){
  Text("Giriş ve uygulama").font(.system(size:30,weight:.semibold))
  VStack(alignment:.leading,spacing:20){Label("Ayrı tarayıcı profili",systemImage:"rectangle.on.rectangle").font(.headline)
   Text("Her giriş yeni, ayrı bir Chrome profiliyle açılır. Normal Chrome oturumların ve diğer hesapların çerezleri bu pencereye taşınmaz. Giriş tamamlandığında geçici profil temizlenir.").font(.system(size:13)).foregroundStyle(.secondary)
   Label("Resmî Codex giriş akışı",systemImage:"lock.shield").font(.headline)
   Text("Şifreyi yalnızca OpenAI veya okulunun/kurumunun giriş sayfasına yazarsın. Uygulama şifre toplamaz. Limitler resmî Codex app-server arayüzünden okunur.").font(.system(size:13)).foregroundStyle(.secondary)
   Label("Okul ve kurum hesapları",systemImage:"building.2").font(.headline)
   Text("SSO için tarayıcı girişini kullan. Cihaz kodu girişi kurum tarafından kapatılmış olabilir. Kurumun Codex erişim politikası uygulanır; erişim kısıtı hesap geçişiyle aşılmaz.").font(.system(size:13)).foregroundStyle(.secondary)
   Divider()
   Toggle("Mac oturumu açıldığında başlat",isOn:Binding(get:{model.launchAtLogin},set:{model.setLoginItem($0)}))
   Text("Pencereyi kapatınca menü çubuğunda çalışmaya devam eder. Tamamen kapatmak için uygulama menüsünden Çık’ı seç.").font(.system(size:12)).foregroundStyle(.secondary)
  }.padding(24).background(Theme.surface,in:RoundedRectangle(cornerRadius:12))
  Text("Hesap durumu yerel dosyalarda saklanır. Kimlik bilgileri Codex Auth’un hesabınıza özel dosyalarında tutulur. Ban veya hesap kısıtlaması olmayacağı garanti edilemez.").font(.system(size:12)).foregroundStyle(.secondary)
  HStack{Link("Codex Auth kaynak kodu",destination:URL(string:"https://github.com/Loongphy/codex-auth")!);Link("OpenAI app-server belgeleri",destination:URL(string:"https://learn.chatgpt.com/docs/app-server")!)}.font(.system(size:12))
  Text("Codex Accounts 1.3.0 · Codex Auth 0.3.1 · Codex CLI 0.162.0").font(.system(size:11)).foregroundStyle(.secondary)
 }}
}
struct LoginView:View {
 @ObservedObject var model:AccountsModel;@Environment(\.dismiss) private var dismiss;@State private var alias="";@State private var email="";@State private var device=false
 var waiting:Bool{model.login?.status=="waiting"}
 var body:some View{
  VStack(alignment:.leading,spacing:20){HStack{Text("Hesap ekle").font(.system(size:23,weight:.semibold));Spacer();Button{dismiss()}label:{Image(systemName:"xmark")}.buttonStyle(.plain).accessibilityLabel("Giriş penceresini kapat")}
   if let l=model.login,waiting||l.status=="complete"{
    Label(l.status=="complete" ? "Hesap kaydedildi":"Giriş bekleniyor",systemImage:l.status=="complete" ? "checkmark.circle":"globe").font(.headline)
    Text(l.message).font(.system(size:13)).foregroundStyle(.secondary)
    if let code=l.code{HStack{Text(code).font(.system(size:26,weight:.semibold,design:.monospaced)).textSelection(.enabled);Spacer();Button("Kopyala"){NSPasteboard.general.clearContents();NSPasteboard.general.setString(code,forType:.string)}}.padding(16).background(Theme.background,in:RoundedRectangle(cornerRadius:8))}
    if waiting{Button{model.reopenBrowser()}label:{Label("Giriş penceresini aç",systemImage:"arrow.up.forward.app")}.buttonStyle(FocusButtonStyle(prominent:true));Text("Bu pencere normal Chrome hesaplarından ayrıdır. Okul SSO girişleri de bu tarayıcıda tamamlanır.").font(.system(size:12)).foregroundStyle(.secondary);Button("Girişi iptal et",role:.destructive){model.cancelLogin()}}
    else{Button("Tamam"){dismiss()}.buttonStyle(FocusButtonStyle(prominent:true))}
   }else{
    Text("Her hesap için resmî ChatGPT girişi yapılır. Etkin hesabın giriş sırasında korunur.").font(.system(size:13)).foregroundStyle(.secondary)
    VStack(alignment:.leading,spacing:6){Text("Hesap adı (isteğe bağlı)").font(.system(size:12));TextField("Örneğin: Kişisel, Okul",text:$alias).textFieldStyle(.roundedBorder)}
    Toggle("Cihaz koduyla giriş yap",isOn:$device)
    Text(device ? "ChatGPT güvenlik ayarlarında cihaz kodu girişi etkin olmalı. Okul hesabında tarayıcı akışını tercih et.":"Ayrı Chrome profili açılır. Google, Microsoft ve okul SSO girişleri normal tarayıcıda çalışır.").font(.system(size:12)).foregroundStyle(.secondary)
    if let l=model.login,l.status=="error"{Text(l.message).font(.system(size:12)).foregroundStyle(Theme.danger)}
    Button{model.add(alias:alias,email:email,device:device)}label:{Label(model.actionBusy ? "Hazırlanıyor…":"Ayrı pencerede giriş yap",systemImage:"arrow.up.forward.app")}.buttonStyle(FocusButtonStyle(prominent:true)).disabled(model.actionBusy||model.busy)
   }
  }.padding(28).frame(width:460).onAppear{if model.login?.status=="complete"{Task{await model.request("cancelLogin")}}}
 }
}
struct AccountSettingsView:View {
 let account:Account;@ObservedObject var model:AccountsModel;@Environment(\.dismiss) private var dismiss;@State private var alias="";@State private var removeConfirmation=false
 var body:some View{VStack(alignment:.leading,spacing:20){Text("Hesap ayarları").font(.system(size:23,weight:.semibold));Text(account.email).textSelection(.enabled).foregroundStyle(.secondary);VStack(alignment:.leading,spacing:8){Text("Hesap adı");TextField("Kişisel / Okul",text:$alias).textFieldStyle(.roundedBorder)}
  if let buckets=account.buckets,buckets.count>1{Text("Diğer limitler").font(.headline);ForEach(buckets){b in HStack{Text(b.name).font(.system(size:12));Spacer();Text(b.primary.map{"%\(Int($0.remaining)) kalan"} ?? "Bilinmiyor").monospacedDigit()}}}
  if let credits=account.credits{Text("Kredi bakiyesi: \(credits)").font(.system(size:12)).foregroundStyle(.secondary)}
  HStack{if !account.active{Button("Hesabı kaldır",role:.destructive){removeConfirmation=true}};Spacer();Button("Kapat"){dismiss()};Button("Kaydet"){Task{await model.request("alias",["key":account.id,"alias":alias]);dismiss()}}.buttonStyle(FocusButtonStyle(prominent:true))}
 }.padding(28).frame(width:460).onAppear{alias=account.alias}.alert("Kayıtlı hesap kaldırılsın mı?",isPresented:$removeConfirmation){Button("İptal",role:.cancel){};Button("Kaldır",role:.destructive){Task{await model.request("remove",["key":account.id]);dismiss()}}}message:{Text("Bu bilgisayardaki giriş kaydı silinir. ChatGPT hesabın silinmez.")}}
}
struct MainView:View {
 @ObservedObject var model:AccountsModel
 var body:some View{HStack(spacing:0){
  VStack(alignment:.leading,spacing:24){HStack(spacing:10){Image(systemName:"arrow.triangle.2.circlepath").font(.system(size:22,weight:.semibold)).foregroundStyle(Theme.accent);VStack(alignment:.leading,spacing:0){Text("Codex").font(.system(size:20,weight:.bold));Text("Accounts").font(.system(size:12)).foregroundStyle(.secondary)}}.padding(.top,12)
   VStack(spacing:6){nav("Hesaplar",symbol:"person.2",id:"accounts");nav("Otomatik geçiş",symbol:"arrow.triangle.branch",id:"auto");nav("2FA dönüştürücü",symbol:"lock.shield",id:"otp");nav("Giriş ve uygulama",symbol:"slider.horizontal.3",id:"settings")}
   Spacer()
   VStack(alignment:.leading,spacing:10){Label(model.settings.autoEnabled ? "Otomatik geçiş açık":"Elle geçiş",systemImage:model.settings.autoEnabled ? "bolt.circle":"hand.point.up.left").font(.system(size:11));Label(ClientLifecycle.running.isEmpty ? "Codex kapalı":"Codex açık",systemImage:"macwindow").font(.system(size:11));Text("Bu Mac’te çalışır").font(.system(size:11)).foregroundStyle(.secondary)}
  }.padding(20).frame(width:190).background(Theme.background)
  Divider()
  VStack(spacing:0){
   HStack{Text(model.section=="accounts" ? "Hesap yönetimi":model.section=="auto" ? "Geçiş kuralları":"Uygulama ayarları").font(.system(size:12)).foregroundStyle(.secondary);Spacer();if model.busy||model.actionBusy{ProgressView().controlSize(.small);Text(model.transition.isEmpty ? "Limitler okunuyor…":model.transition).font(.system(size:11)).foregroundStyle(.secondary)}
    Button{model.refresh()}label:{Label("Yenile",systemImage:"arrow.clockwise")}.buttonStyle(FocusButtonStyle()).disabled(model.busy||model.actionBusy).keyboardShortcut("r",modifiers:.command)
    Button{model.loginShown=true}label:{Label("Hesap ekle",systemImage:"plus")}.buttonStyle(FocusButtonStyle(prominent:true)).disabled(model.actionBusy).keyboardShortcut("n",modifiers:.command)
   }.padding(.horizontal,28).padding(.vertical,16)
   Divider()
   ScrollView{VStack(alignment:.leading,spacing:20){
    if !model.banner.isEmpty{HStack(alignment:.top,spacing:10){Image(systemName:model.bannerError ? "exclamationmark.circle":"checkmark.circle");Text(model.banner).font(.system(size:12));Spacer();Button{model.banner=""}label:{Image(systemName:"xmark")}.buttonStyle(.plain).accessibilityLabel("Bildirimi kapat")}.foregroundStyle(model.bannerError ? Theme.danger:Color.primary).padding(14).background(Theme.surface,in:RoundedRectangle(cornerRadius:8)).accessibilityElement(children:.combine)}
    if let p=model.pending{VStack(alignment:.leading,spacing:10){Label(model.activity.busy ? "Geçiş işin tamamlanmasını bekliyor":"\(max(0,Int(p.executeAt-model.now.timeIntervalSince1970))) saniye sonra geçiş",systemImage:"clock").font(.headline);Text("\(p.reason). Hedef: \(p.email)").font(.system(size:12));Button("30 dakika ertele"){model.snooze()}.buttonStyle(FocusButtonStyle())}.padding(16).frame(maxWidth:.infinity,alignment:.leading).background(Theme.surface,in:RoundedRectangle(cornerRadius:8))}
    if model.section=="accounts"{AccountsView(model:model)}else if model.section=="auto"{AutoView(model:model)}else if model.section=="otp"{OTPView(model:model)}else{SettingsView(model:model)}
   }.padding(28)}
  }.frame(maxWidth:.infinity,maxHeight:.infinity).background(Theme.background)
 }.frame(minWidth:920,minHeight:640).sheet(isPresented:$model.loginShown){LoginView(model:model)}.onAppear{Task{await model.request("visibility",["visible":true])}}.onDisappear{Task{await model.request("visibility",["visible":false])}}}
 @ViewBuilder func nav(_ label:String,symbol:String,id:String)->some View{Button{model.section=id}label:{Label(label,systemImage:symbol).font(.system(size:13,weight:model.section==id ? .semibold:.regular)).frame(maxWidth:.infinity,alignment:.leading).padding(.horizontal,12).padding(.vertical,10).background(model.section==id ? Theme.surface:Color.clear,in:RoundedRectangle(cornerRadius:7))}.buttonStyle(.plain)}
}
struct QuickMenu:View {
 @ObservedObject var model:AccountsModel;@Environment(\.openWindow) private var openWindow
 var body:some View{Button("Hesap panelini aç"){openWindow(id:"main");NSApp.activate(ignoringOtherApps:true)}.keyboardShortcut("o",modifiers:.command);Divider();ForEach(model.accounts){a in Button{Task{await model.switchTo(a)}}label:{Text("\(a.active ? "Etkin: ":"")\(a.alias.isEmpty ? a.email:a.alias)  \(a.primary.map{"%\(Int($0.remaining))"} ?? "—")")}.disabled(a.active||a.needsLogin||model.busy||model.actionBusy)};Divider();Button("Limitleri yenile"){model.refresh()}.disabled(model.busy);Toggle("Otomatik geçiş",isOn:Binding(get:{model.settings.autoEnabled},set:{v in model.update{$0.autoEnabled=v}}));if model.pending != nil{Button("Geçişi 30 dk ertele"){model.snooze()}};Divider();Button("Çık"){model.quit()}.keyboardShortcut("q",modifiers:.command)}
}
@main struct CodexAccountsApp:App {
 @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
 @StateObject private var model=AccountsModel()
 var body:some Scene{
  WindowGroup("Codex Accounts",id:"main"){MainView(model:model)}.defaultSize(width:1120,height:800).commands{
   CommandGroup(replacing:.newItem){Button("Hesap ekle"){model.loginShown=true}.keyboardShortcut("n",modifiers:.command)}
   CommandGroup(replacing:.appTermination){Button("Codex Accounts’tan çık"){model.quit()}.keyboardShortcut("q",modifiers:.command)}
  }
  MenuBarExtra{QuickMenu(model:model)}label:{HStack(spacing:3){Image(systemName:"arrow.triangle.2.circlepath");Text(model.active?.primary.map{"%\(Int($0.remaining))"} ?? "CX").monospacedDigit()}}
 }
}
