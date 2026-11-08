import SwiftUI
import Charts
struct ResetCredit:Codable,Identifiable{let id:String;let resetType:String?;let status:String?;let grantedAt:Double?;let expiresAt:Double?;let title:String?;let description:String?}
struct UsageSummary:Codable{let lifetimeTokens:Int?;let peakDailyTokens:Int?;let longestRunningTurnSec:Int?;let currentStreakDays:Int?;let longestStreakDays:Int?}
struct UsageDay:Codable,Identifiable{let date:String;let tokens:Int;var id:String{date};var day:Date{let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=TimeZone(secondsFromGMT:0);f.dateFormat="yyyy-MM-dd";return f.date(from:date) ?? Date(timeIntervalSince1970:0)}}
struct UsageHistory:Codable{let summary:UsageSummary;let daily:[UsageDay]?}
enum DisplayValue {
 static func date(_ epoch:Double?)->String{guard let epoch else{return "Belirtilmedi"};let f=DateFormatter();f.locale=Locale(identifier:"tr_TR");f.timeZone=TimeZone(identifier:"Europe/Istanbul");f.dateFormat="d MMM yyyy HH:mm";return f.string(from:Date(timeIntervalSince1970:epoch))}
 static func count(_ value:Int?)->String{guard let value else{return "—"};return value.formatted(.number.locale(Locale(identifier:"tr_TR")))}
 static func percent(_ value:Double)->String{let f=NumberFormatter();f.locale=Locale(identifier:"tr_TR");f.maximumFractionDigits=1;return "%"+(f.string(from:NSNumber(value:value)) ?? String(value))}
 static func status(_ value:String?)->String{["available":"Kullanılabilir","redeeming":"İşleniyor","redeemed":"Kullanılmış","unknown":"Bilinmiyor"][value ?? "unknown"] ?? "Bilinmiyor"}
 static func reached(_ value:String?)->String{switch value{case "rate_limit_reached":return "Kullanım limitine ulaşıldı";case "workspace_owner_credits_depleted","workspace_member_credits_depleted":return "Kurum kullanım kredisi tükendi";case "workspace_owner_usage_limit_reached","workspace_member_usage_limit_reached":return "Kurum kullanım sınırına ulaşıldı";default:return value ?? ""}}
}
struct UsageDetailsView:View {
 let accountID:String;@ObservedObject var model:AccountsModel;@Environment(\.dismiss) private var dismiss;@State private var loading=false;@State private var error=""
 var account:Account?{model.accounts.first{$0.id==accountID}}
 var body:some View{
  VStack(spacing:0){
   HStack{VStack(alignment:.leading,spacing:4){Text("Kullanım ayrıntıları").font(.system(size:24,weight:.semibold));Text(account?.name ?? "Hesap bulunamadı").font(.system(size:12)).foregroundStyle(.secondary).textSelection(.enabled)};Spacer();if loading{ProgressView().controlSize(.small)};Button("Yenile"){Task{await load()}}.buttonStyle(FocusButtonStyle()).disabled(loading);Button("Kapat"){dismiss()}.buttonStyle(FocusButtonStyle())}.padding(24)
   Divider()
   ScrollView{if let a=account{VStack(alignment:.leading,spacing:24){
    if !error.isEmpty{Text(error).font(.system(size:12)).foregroundStyle(Theme.danger)}
    if a.stale{Label("Bu bilgiler güncel olmayabilir. Son başarılı sorgu: \(DisplayValue.date(a.updatedAt))",systemImage:"exclamationmark.circle").font(.system(size:12)).foregroundStyle(.secondary)}
    limits(a)
    resetCredits(a)
    tokenUsage(a)
    Text("Limit verisi: \(DisplayValue.date(a.updatedAt)) · \(a.source=="official" ? "Resmî Codex sorgusu":a.source=="local" ? "Yerel oturum kaydı":"Önceki kayıt")").font(.system(size:11)).foregroundStyle(.secondary)
   }.padding(24)}}
  }.frame(width:760,height:720).task{await load()}
 }
 func load()async{guard !loading else{return};loading=true;defer{loading=false};do{_ = try await model.worker.call("details",["key":accountID]);error=""}catch{self.error=error.localizedDescription}}
 @ViewBuilder func limits(_ a:Account)->some View{
  VStack(alignment:.leading,spacing:16){
   Text("Kullanım limitleri").font(.system(size:18,weight:.semibold))
   HStack{Text("Plan: \(a.planName)");Spacer();if let allowed=a.ordinaryUsageAllowed{Label(allowed ? "Dahil kullanım açık":"Dahil kullanım kapalı",systemImage:allowed ? "checkmark.circle":"pause.circle")}else{Text("Dahil kullanım durumu bilinmiyor")}}.font(.system(size:12)).foregroundStyle(.secondary)
   if let reached=a.limitReached{Text(DisplayValue.reached(reached)).font(.system(size:12)).foregroundStyle(Theme.danger)}
   ForEach(a.buckets ?? []){bucket in VStack(alignment:.leading,spacing:12){Text(bucket.name).font(.system(size:14,weight:.semibold));if let w=bucket.primary{windowRow(w)};if let w=bucket.secondary{windowRow(w)};if let reached=bucket.limitReached{Text(DisplayValue.reached(reached)).font(.system(size:12)).foregroundStyle(Theme.danger)}}.padding(16).background(Theme.surface,in:RoundedRectangle(cornerRadius:10))}
   if (a.buckets ?? []).isEmpty{VStack(alignment:.leading,spacing:12){if let w=a.primary{windowRow(w)};if let w=a.secondary{windowRow(w)};if a.primary==nil&&a.secondary==nil{Text("Sunucu kullanım limiti döndürmedi.").font(.system(size:12)).foregroundStyle(.secondary)}}.padding(16).background(Theme.surface,in:RoundedRectangle(cornerRadius:10))}
  }
 }
 func windowRow(_ w:UsageWindow)->some View{VStack(alignment:.leading,spacing:8){HStack{Text(w.label).font(.system(size:13,weight:.medium));Spacer();Text("\(DisplayValue.percent(w.used)) kullanıldı").foregroundStyle(.secondary);Text("\(DisplayValue.percent(w.remaining)) kaldı").fontWeight(.semibold)}.font(.system(size:12));ProgressView(value:w.used,total:100).tint(w.remaining<=10 ? Theme.danger:Theme.accent).accessibilityLabel("\(w.label) kullanılan limit").accessibilityValue(DisplayValue.percent(w.used));Text("Sıfırlanma: \(DisplayValue.date(w.resetsAt))").font(.system(size:11)).foregroundStyle(.secondary)}}
 @ViewBuilder func resetCredits(_ a:Account)->some View{
  VStack(alignment:.leading,spacing:16){
   HStack(alignment:.firstTextBaseline){Text("Yenileme hakları").font(.system(size:18,weight:.semibold));Spacer();Text(a.resetCredits.map{"\($0) kullanılabilir"} ?? "Sayı bilinmiyor").font(.system(size:15,weight:.semibold)).foregroundStyle(Theme.accent)}
   HStack{Text("Ek kullanım kredisi");Spacer();Text(a.creditsUnlimited==true ? "Sınırsız":a.credits ?? "Bilinmiyor").fontWeight(.semibold)}.font(.system(size:12)).padding(16).background(Theme.surface,in:RoundedRectangle(cornerRadius:10))
   if let details=a.resetDetails,!details.isEmpty{
    ForEach(details){credit in VStack(alignment:.leading,spacing:8){HStack{Text(credit.title ?? "Codex limit yenileme hakkı").font(.system(size:13,weight:.semibold));Spacer();Text(DisplayValue.status(credit.status)).font(.system(size:11)).foregroundStyle(.secondary)};if let description=credit.description{Text(description).font(.system(size:12)).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)};HStack{Text("Verildiği tarih: \(DisplayValue.date(credit.grantedAt))");Spacer();Text("Son kullanım: \(DisplayValue.date(credit.expiresAt))")}.font(.system(size:11)).foregroundStyle(.secondary)}.padding(16).background(Theme.surface,in:RoundedRectangle(cornerRadius:10))}
    if let count=a.resetCredits,count>details.count{Text("\(count) hakkın \(details.count) tanesi için ayrıntı sağlandı.").font(.system(size:11)).foregroundStyle(.secondary)}
   }else{Text(a.resetCredits==0 ? "Kullanılabilir yenileme hakkı yok.":"Yenileme hakkı ayrıntıları sunucu tarafından sağlanmadı.").font(.system(size:12)).foregroundStyle(.secondary)}
  }
 }
 @ViewBuilder func tokenUsage(_ a:Account)->some View{
  VStack(alignment:.leading,spacing:16){Text("Token kullanımı").font(.system(size:18,weight:.semibold))
   if let history=a.history{
    let summary=history.summary
    HStack(spacing:32){summaryValue("Toplam token",summary.lifetimeTokens);summaryValue("En yüksek günlük",summary.peakDailyTokens);summaryValue("Güncel seri (gün)",summary.currentStreakDays)}.padding(16).background(Theme.surface,in:RoundedRectangle(cornerRadius:10))
    if let longest=summary.longestRunningTurnSec{Text("En uzun çalışma: \(longest/60) dk \(longest%60) sn · En uzun kullanım serisi: \(DisplayValue.count(summary.longestStreakDays)) gün").font(.system(size:11)).foregroundStyle(.secondary)}
    if let daily=history.daily,!daily.isEmpty{
     let recent=Array(daily.suffix(14))
     Chart(recent){row in BarMark(x:.value("Gün",row.day),y:.value("Token",row.tokens)).foregroundStyle(Theme.accent).accessibilityLabel(row.date).accessibilityValue("\(DisplayValue.count(row.tokens)) token")}.chartXAxis{AxisMarks(values:.automatic(desiredCount:5)){value in AxisGridLine();AxisValueLabel(format:.dateTime.day().month(.abbreviated))}}.frame(height:150).accessibilityLabel("Son \(recent.count) kayıttaki günlük token kullanımı")
     ForEach(Array(daily.suffix(30).reversed())){row in HStack{Text(row.date);Spacer();Text("\(DisplayValue.count(row.tokens)) token").monospacedDigit()}.font(.system(size:12));Divider()}
    }else{Text(history.daily==nil ? "Günlük token bilgisi sunucu tarafından sağlanmadı.":"Günlük kullanım kaydı bulunmuyor.").font(.system(size:12)).foregroundStyle(.secondary)}
    Text("Token verisi: \(DisplayValue.date(a.historyUpdatedAt))").font(.system(size:11)).foregroundStyle(.secondary)
   }else if loading{Text("Token geçmişi okunuyor…").font(.system(size:12)).foregroundStyle(.secondary)}else{Text("Bu hesap için token bilgisi alınamadı.").font(.system(size:12)).foregroundStyle(.secondary)}
   if let e=a.historyError{Text("Token bilgisi güncellenemedi: \(e)").font(.system(size:12)).foregroundStyle(Theme.danger)}
   Text("Sunucunun sağlamadığı değerler ‘—’ olarak gösterilir.").font(.system(size:11)).foregroundStyle(.secondary)
  }
 }
 func summaryValue(_ title:String,_ value:Int?)->some View{VStack(alignment:.leading,spacing:6){Text(title).font(.system(size:11)).foregroundStyle(.secondary);Text(DisplayValue.count(value)).font(.system(size:21,weight:.semibold)).monospacedDigit()}.frame(maxWidth:.infinity,alignment:.leading)}
}
