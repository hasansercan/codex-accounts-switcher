import Foundation
import CryptoKit
import Security
struct OTPFailure:LocalizedError {let message:String;var errorDescription:String?{message}}
struct OTPSecret:Codable {
 let base32:String;let algorithm:String;let digits:Int;let period:Int
 static func parse(_ input:String)throws->OTPSecret{
  let raw=input.trimmingCharacters(in:.whitespacesAndNewlines);guard raw.count<=4096 else{throw OTPFailure(message:"2FA anahtarı çok uzun.")}
  var secret=raw,algorithm="SHA1",digits=6,period=30
  if raw.lowercased().hasPrefix("otpauth:"){
   guard let u=URLComponents(string:raw),u.host?.lowercased()=="totp" else{throw OTPFailure(message:"Zamana dayalı otpauth://totp bağlantısı gerekiyor.")}
   let q=Dictionary((u.queryItems ?? []).map{($0.name.lowercased(),$0.value ?? "")},uniquingKeysWith:{first,_ in first});secret=q["secret"] ?? "";algorithm=(q["algorithm"] ?? "SHA1").uppercased();digits=Int(q["digits"] ?? "6") ?? 0;period=Int(q["period"] ?? "30") ?? 0
  }
  if raw.range(of:"^[0-9]{6,8}$",options:.regularExpression) != nil{throw OTPFailure(message:"Bu tek kullanımlık doğrulama kodu. Yeni kod üretmek için 2FA kurulum anahtarını yapıştırın.")}
  secret=secret.uppercased().filter{!$0.isWhitespace&&$0 != "-"}
  guard ["SHA1","SHA256","SHA512"].contains(algorithm),[6,8].contains(digits),(15...120).contains(period) else{throw OTPFailure(message:"Desteklenmeyen 2FA biçimi. SHA1/256/512 ve 6/8 hane desteklenir.")}
  let result=OTPSecret(base32:secret,algorithm:algorithm,digits:digits,period:period)
  let bytes=try result.keyData();guard bytes.count>=10,bytes.count<=128 else{throw OTPFailure(message:"Geçerli bir 2FA kurulum anahtarı gerekiyor. Genellikle 16 veya daha fazla harf/rakam içerir.")};return result
 }
 func keyData()throws->Data{
  let text=base32.trimmingCharacters(in:CharacterSet(charactersIn:"="));let alphabet=Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".utf8);var acc:UInt32=0,bits=0,bytes=[UInt8]()
  for ch in text.utf8{guard let value=alphabet.firstIndex(of:ch) else{throw OTPFailure(message:"2FA anahtarı okunamadı. Kurulum anahtarını veya otpauth bağlantısını yapıştırın.")};acc=(acc<<5)|UInt32(value);bits+=5;if bits>=8{bits-=8;bytes.append(UInt8((acc>>bits)&255));acc=bits>0 ? acc&((1<<bits)-1):0}}
  guard !bytes.isEmpty,(bits==0||acc==0),![1,3,6].contains(text.count%8) else{throw OTPFailure(message:"2FA anahtarı eksik veya hatalı.")};return Data(bytes)
 }
 func code(at time:TimeInterval=Date().timeIntervalSince1970)throws->String{
  guard time>=0,time.isFinite else{throw OTPFailure(message:"Mac tarih ve saatini kontrol edin.")};let key=SymmetricKey(data:try keyData());var counter=UInt64(floor(time/Double(period))).bigEndian
  let data=withUnsafeBytes(of:&counter){Data($0)};let digest:[UInt8]
  switch algorithm{case "SHA256":digest=Array(HMAC<SHA256>.authenticationCode(for:data,using:key));case "SHA512":digest=Array(HMAC<SHA512>.authenticationCode(for:data,using:key));default:digest=Array(HMAC<Insecure.SHA1>.authenticationCode(for:data,using:key))}
  let off=Int(digest.last!&15);let bin=(UInt32(digest[off]&127)<<24)|(UInt32(digest[off+1])<<16)|(UInt32(digest[off+2])<<8)|UInt32(digest[off+3]);let mod:UInt32=digits==8 ? 100_000_000:1_000_000
  return String(format:"%0*d",digits,bin%mod)
 }
}
enum OTPKeychain {
 static let service="local.codex.accounts.totp"
 static func query(_ account:String)->[String:Any]{[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account,kSecAttrSynchronizable as String:false]}
 static func store(_ secret:OTPSecret,account:String)throws{
  let data=try JSONEncoder().encode(secret);var q=query(account)
  let update=SecItemUpdate(q as CFDictionary,[kSecValueData as String:data] as CFDictionary)
  if update==errSecSuccess{return};guard update==errSecItemNotFound else{throw OTPFailure(message:"Anahtar Zinciri’ne kaydedilemedi.")}
  q[kSecValueData as String]=data;q[kSecAttrLabel as String]="Codex Accounts 2FA";q[kSecAttrAccessible as String]=kSecAttrAccessibleWhenUnlockedThisDeviceOnly
  guard SecItemAdd(q as CFDictionary,nil)==errSecSuccess else{throw OTPFailure(message:"Anahtar Zinciri’ne kaydedilemedi.")}
 }
 static func read(account:String)throws->OTPSecret?{var q=query(account);q[kSecReturnData as String]=true;q[kSecMatchLimit as String]=kSecMatchLimitOne;var result:CFTypeRef?
  let status=SecItemCopyMatching(q as CFDictionary,&result);if status==errSecItemNotFound{return nil};guard status==errSecSuccess,let data=result as? Data else{throw OTPFailure(message:"Anahtar Zinciri kaydı okunamadı.")};return try JSONDecoder().decode(OTPSecret.self,from:data)
 }
 static func remove(account:String)throws{let status=SecItemDelete(query(account) as CFDictionary);guard status==errSecSuccess||status==errSecItemNotFound else{throw OTPFailure(message:"2FA kaydı silinemedi.")}}
}
