import SwiftUI
import AppKit
struct OTPView:View {
 @ObservedObject var model:AccountsModel;@State private var input="";@State private var selected="temporary";@State private var secret:OTPSecret?;@State private var code="";@State private var error="";@State private var saved=false;@State private var message="";@State private var showInput=false;@State private var deleteConfirmation=false
 var seconds:Int{guard let secret else{return 30};return secret.period-Int(model.now.timeIntervalSince1970)%secret.period}
 var body:some View{VStack(alignment:.leading,spacing:24){
  Text("2FA dönüştürücü").font(.system(size:30,weight:.semibold));Text("Elindeki kurulum kodunu güncel doğrulama koduna dönüştür.").font(.system(size:13)).foregroundStyle(.secondary)
  VStack(alignment:.leading,spacing:20){
   HStack{Text("Hesap");Spacer();Picker("Hesap",selection:$selected){Text("Kaydetmeden kullan").tag("temporary");ForEach(model.accounts){a in Text(a.name).tag(a.id)}}.labelsHidden().frame(maxWidth:340)}
   VStack(alignment:.leading,spacing:8){Text("2FA anahtarı / kurulum kodu").font(.system(size:12,weight:.medium));HStack{Group{if showInput{TextField("Anahtarı veya otpauth bağlantısını yapıştır",text:$input)}else{SecureField("Anahtarı veya otpauth bağlantısını yapıştır",text:$input)}}.textFieldStyle(.roundedBorder).onSubmit(convert);Button{showInput.toggle()}label:{Image(systemName:showInput ? "eye.slash":"eye")}.buttonStyle(.plain).accessibilityLabel(showInput ? "Anahtarı gizle":"Anahtarı göster");Button("Yapıştır"){input=NSPasteboard.general.string(forType:.string) ?? "";convert()}.buttonStyle(FocusButtonStyle())}
    Text("Sadece bu Mac’te hesaplanır. Kurulum anahtarını sohbet mesajına yazmana gerek yok.").font(.system(size:11)).foregroundStyle(.secondary)
   }
   if !error.isEmpty{Text(error).font(.system(size:12)).foregroundStyle(Theme.danger)}
   HStack{Button("Doğrulama koduna çevir",action:convert).buttonStyle(FocusButtonStyle(prominent:true)).disabled(input.isEmpty);if !input.isEmpty||secret != nil{Button("Temizle"){input="";secret=nil;code="";error="";message="";saved=false}.buttonStyle(FocusButtonStyle())}}
  }.padding(24).background(Theme.surface,in:RoundedRectangle(cornerRadius:12))
  if let secret,!code.isEmpty{
   VStack(alignment:.leading,spacing:20){HStack(alignment:.center){VStack(alignment:.leading,spacing:12){Text("Güncel doğrulama kodu").font(.system(size:13)).foregroundStyle(.secondary);Text(groupedCode).font(.system(size:52,weight:.semibold,design:.monospaced)).textSelection(.enabled).accessibilityLabel("Doğrulama kodu \(code)")};Spacer();Button{copyCode()}label:{Label("Kodu kopyala",systemImage:"doc.on.doc")}.buttonStyle(FocusButtonStyle(prominent:true))}
    ProgressView(value:Double(seconds),total:Double(secret.period)).tint(Theme.accent)
    Text("\(seconds) saniye sonra yenilenir · \(secret.digits) hane · \(secret.algorithm)").font(.system(size:12)).foregroundStyle(.secondary)
    if selected != "temporary"{HStack{Button(saved ? "Anahtarı güncelle":"Bu hesap için Anahtar Zinciri’ne kaydet"){save()}.buttonStyle(FocusButtonStyle());if saved{Button("Kaydı sil",role:.destructive){deleteConfirmation=true}}}}
    if !message.isEmpty{Text(message).font(.system(size:12)).foregroundStyle(.secondary)}
   }.padding(24).background(Theme.surface,in:RoundedRectangle(cornerRadius:12))
  }
  Text("Kod reddedilirse Mac tarih ve saatini kontrol et. Tek kullanımlık doğrulama kodu veya yedek kurtarma kodu, yeni doğrulama kodu üretmek için kullanılamaz.").font(.system(size:12)).foregroundStyle(.secondary)
 }.onChange(of:model.now){_ in if let secret{code=(try? secret.code()) ?? ""}}.onChange(of:selected){_ in loadSaved()}.alert("Bu hesabın 2FA kaydı silinsin mi?",isPresented:$deleteConfirmation){Button("İptal",role:.cancel){};Button("Sil",role:.destructive){do{try OTPKeychain.remove(account:selected);saved=false;input="";secret=nil;code="";message="Kaydedilmiş anahtar silindi."}catch{self.error=error.localizedDescription}}}message:{Text("Mac Anahtar Zinciri’ndeki yerel kopya silinir. Hesabının 2FA ayarı değişmez.")}}
 var groupedCode:String{let mid=code.count/2;let at=code.index(code.startIndex,offsetBy:mid);return String(code[..<at])+" "+String(code[at...])}
 func convert(){do{let s=try OTPSecret.parse(input);secret=s;code=try s.code();error="";message="";saved=false}catch{secret=nil;code="";self.error=error.localizedDescription}}
 func save(){guard let secret,selected != "temporary" else{return};do{try OTPKeychain.store(secret,account:selected);saved=true;message="Anahtar bu Mac’in Anahtar Zinciri’ne kaydedildi."}catch{self.error=error.localizedDescription}}
 func loadSaved(){input="";secret=nil;code="";saved=false;error="";message="";guard selected != "temporary" else{return};do{if let s=try OTPKeychain.read(account:selected){secret=s;code=try s.code();saved=true;message="Anahtar Zinciri’nden yüklendi."}}catch{self.error=error.localizedDescription}}
 func copyCode(){guard let secret,let current=try? secret.code() else{return};code=current;NSPasteboard.general.clearContents();NSPasteboard.general.setString(current,forType:.string);message="Kod kopyalandı. Pano 45 saniye sonra temizlenir.";DispatchQueue.main.asyncAfter(deadline:.now()+45){if NSPasteboard.general.string(forType:.string)==current{NSPasteboard.general.clearContents()}}}
}
