import Foundation
@main struct TOTPTests {
 static func main()throws{
  let sha1="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",sha256="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA",sha512="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA"
  let times:[Double]=[59,1111111109,1111111111,1234567890,2000000000,20000000000]
  let expected=[["94287082","07081804","14050471","89005924","69279037","65353130"],["46119246","68084774","67062674","91819424","90698825","77737706"],["90693936","25091201","99943326","93441116","38618901","47863826"]]
  for (i,pair) in [(sha1,"SHA1"),(sha256,"SHA256"),(sha512,"SHA512")].enumerated(){for (j,t) in times.enumerated(){let secret=try OTPSecret.parse("otpauth://totp/Test?secret=\(pair.0)&algorithm=\(pair.1)&digits=8&period=30");precondition(try secret.code(at:t)==expected[i][j])}}
  let six=try OTPSecret.parse(sha1);precondition(try six.code(at:59)=="287082");precondition(try six.code(at:1111111109)=="081804")
  for input in ["123456","abcdefgh0invalid","otpauth://hotp/test?secret=\(sha1)","otpauth://totp/test?secret=\(sha1)&digits=12"]{do{_ = try OTPSecret.parse(input);fatalError("Invalid input accepted")}catch is OTPFailure{}}
  let testAccount="selftest-"+UUID().uuidString;defer{try? OTPKeychain.remove(account:testAccount)}
  try OTPKeychain.store(six,account:testAccount);let loaded=try OTPKeychain.read(account:testAccount);precondition(loaded?.base32==six.base32);precondition(try loaded?.code(at:59)=="287082")
  let eight=try OTPSecret.parse("otpauth://totp/Test?secret=\(sha1)&digits=8");try OTPKeychain.store(eight,account:testAccount);precondition(try OTPKeychain.read(account:testAccount)?.digits==8);try OTPKeychain.remove(account:testAccount);precondition(try OTPKeychain.read(account:testAccount)==nil)
  print("PASS: 18 RFC 6238 vectors; 6-digit/zero padding; invalid input; Keychain save/read/update/delete.")
 }
}
