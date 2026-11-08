# Codex Accounts 1.1

Mac uygulaması `/Applications/Codex Accounts.app` konumuna kuruldu. Launchpad veya Spotlight’ta **Codex Accounts** aramasıyla açılır. Web sunucusu veya terminalden başlatma gerektirmez. Apple Silicon Mac için yerel SwiftUI uygulamasıdır; gerekli Codex CLI, Codex Auth ve Node çalışma ortamı uygulamaya dahildir.

## Hesaplar ve limitler

- Mevcut Codex Auth hesapları otomatik görünür. **Hesap ekle** resmî Codex giriş akışını başlatır.
- Giriş, normal Chrome’dan ayrı, geçici bir Chrome profiliyle açılır. Google/Microsoft/okul SSO sayfaları tarayıcı üzerinden kullanılır. Şifreler uygulama tarafından alınmaz.
- Giriş sırasında etkin Codex hesabı korunur. Yeni hesap kaydedildikten sonra **Bu hesaba geç** ile etkinleştirilir.
- Limitler resmî `codex app-server` → `account/rateLimits/read` üzerinden okunur. Varsayılan yenileme aralığı 2 dakikadır; **Yenile** ile yenilenebilir. Aynı anda yapılan sorgular sıraya alınır, çok hızlı yeniden sorgu engellenir.
- Eski veya okunamayan veriler belirtilir. Okul/kurum politikaları tarafından kısıtlanmış hesapların erişimi aşılmaz.
- Menü çubuğundan hızlı hesap seçilebilir. Pencereyi kapatmak uygulamadan çıkmaz. **Cmd+Q / Çık** tamamen kapatır.

## Hesap geçişi

**Codex’i kapatıp yeniden aç** ayarı açık olduğunda `com.openai.codex` kimliğine sahip ChatGPT/Codex uygulaması normal biçimde kapatılır, hesap değiştirilir, seçim doğrulanır ve uygulama açılır. Zorla kapatma uygulanmaz. Kapanış reddedilirse hesap değiştirilmez. Geçiş başarısız olursa uygulamanın yeniden açılması denenir.

Yakın tarihli Codex oturum kayıtlarında devam eden iş veya belirsiz durum algılanırsa otomatik yeniden başlatma bekler. Bu kontrol yerel kayıtlara dayanır; uygulamadaki tüm çalışmaların eksiksiz algılandığı garanti edilmez. Açık CLI oturumları kendiliğinden yeni hesaba taşınmaz.

## Otomatik geçiş

Başlangıçta kapalıdır. **Otomatik geçiş** bölümünden etkinleştirilir.

- Eşikler: 5 saatlik kalan %5; haftalık kalan %3. Değiştirilebilir.
- Aday hesapların iki limit penceresi de güncel ve uygun olmalıdır. Eski, eksik, giriş hatalı veya erişimi kapalı hesaplar seçilmez.
- Kurum/Education hesapları açık tercihle dahil edilir.
- Geçişten önce 20 saniye iptal/erteleme süresi vardır. **30 dakika ertele** izlemeyi duraklatır.
- İki geçiş arasında en az 10 dakika vardır.
- Uygulama menü çubuğunda açık kalmalıdır. İstersen **Giriş ve uygulama → Mac oturumu açıldığında başlat** ayarını aç.

Resmî giriş ve resmî Codex arayüzü kullanılır. Hesap kısıtlaması veya ban olmayacağı garanti edilemez. Bu uygulama OpenAI tarafından yayımlanmış bir ürün değildir.

## 2FA dönüştürücü

**2FA dönüştürücü** bölümünde elindeki 2FA kurulum anahtarını veya `otpauth://totp/...` bağlantısını yapıştır, **Doğrulama koduna çevir** seç.

- Kod, Mac’te çevrimdışı hesaplanır; üçüncü bir servise gönderilmez.
- Standart anahtarda 6 hane / 30 saniye kullanılır. Otpauth bağlantısı SHA1/256/512, 6/8 hane ve farklı süreleri belirtebilir.
- Anahtarı saklamak isteğe bağlıdır. Hesap seçip **Anahtar Zinciri’ne kaydet** kullanılabilir. Kaydedilen anahtar yalnızca bu Mac’in Anahtar Zinciri’nde tutulur, uygulamanın JSON dosyalarına veya limit köprüsüne yazılmaz.
- Kopyalanan doğrulama kodu, pano içeriği değişmediyse 45 saniye sonra temizlenir.
- Tek kullanımlık 6 haneli kodlar veya yedek kurtarma kodları yeni kod üretmez. Gereken değer 2FA kurulum anahtarıdır.
- Kod reddedilirse Mac’in tarih ve saatini kontrol et.

## Plus tarihleri

Hesap kartındaki **… → Plus yenilenme / bitiş tarihini takip et** alanından tarih girilir. Kalan günler kartta görünür. **Elle girilen tarih** olarak gösterilir; ödeme veya gerçek abonelik bitişi otomatik doğrulanmaz. Resmî limit arayüzünde bitiş/yenilenme tarihi bulunmadığı için tarih tahmin edilmez.

## Kaynaklar ve doğrulama

- [Loongphy/codex-auth](https://github.com/Loongphy/codex-auth) — hesap kaydı ve atomik geçiş altyapısı; güncel kararlı 0.3.1.
- [Resmî Codex app-server belgeleri](https://learn.chatgpt.com/docs/app-server) — giriş ve kullanım limitleri; paketlenen Codex CLI 0.162.0.
- [RFC 6238](https://www.rfc-editor.org/info/rfc6238/) — TOTP test vektörleri.

Doğrulandı: native derleme ve yerel imza, iki gerçek hesapta limit okuma, gerçek Codex Auth ile yalıtılmış kopyada hesap geçişi, ayrı Chrome profiliyle giriş başlatma/iptal, 11 Node regresyon testi, 18 RFC TOTP örneği ve Anahtar Zinciri kaydetme/okuma/güncelleme/silme. Normal kapatma ve yeniden açma ayrıca deneme Mac uygulamasında doğrulandı. Okul SSO girişinin kullanıcı hesabıyla tamamlanması ve canlı ChatGPT’nin hesap geçişiyle yeniden açılması bu çalışma sırasında yapılmadı.

`src/` düzenlenebilir SwiftUI ve köprü kaynaklarını, `tests/` doğrulama kaynaklarını içerir. `build.sh` yeniden derler. Yerel ayarlar `~/Library/Application Support/Codex Accounts`, Codex giriş kayıtları `~/.codex/accounts` altında tutulur. Kaynak paketinde gerçek hesap giriş dosyaları bulunmaz.
