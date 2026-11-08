const api = window.accounts,
  $ = (s) => document.querySelector(s);
const paths = {
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  switch: "M4 7h16m-4-4 4 4-4 4 M20 17H4m4-4-4 4 4 4",
  shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11 M9 12l2 2 4-4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z",
  refresh: "M20 7a9 9 0 1 0 1 8 M20 2v6h-6",
  plus: "M12 5v14 M5 12h14",
  close: "M6 6l12 12 M6 18 18 6",
  check: "M5 12l4 4L19 6",
  info: "M12 8h.01 M12 11v6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  chart: "M3 3v18h18 M7 16v-4 M12 16V8 M17 16V5",
  clock: "M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  copy: "M8 8h12v13H8Z M16 8V3H3v13h5",
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[n] || paths.info}"/></svg>`;
function icons() {
  document
    .querySelectorAll("[data-icon]")
    .forEach((e) => (e.innerHTML = icon(e.dataset.icon)));
}
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const count = (v) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("tr-TR");
const date = (t) =>
  Number.isFinite(t) && t > 0
    ? new Date(t * 1000).toLocaleString("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Belirtilmedi";
const remain = (w) =>
  w && Number.isFinite(w.used)
    ? Math.max(0, Math.min(100, 100 - w.used))
    : null;
const name = (a) => a.alias || a.email;
const plan = (a) =>
  ({
    plus: "Plus",
    pro: "Pro",
    prolite: "Pro Lite",
    edu: "Education",
    business: "Business",
    enterprise: "Enterprise",
    free: "Free",
  })[a.plan?.toLowerCase()] ||
  a.plan ||
  "Bilinmiyor";
const stale = (a) =>
  !a.updatedAt || Date.now() / 1000 - a.updatedAt > 180 || Boolean(a.error);
const institution = (a) => /edu|business|enterprise/i.test(a.plan);
let state = {
    accounts: [],
    settings: { autoExcluded: [], institutionOptIns: [], planDates: {} },
    busy: true,
    activity: {},
  },
  page = "accounts",
  search = "",
  inflight = 0,
  modalType = null,
  modalKey = null,
  returnFocus = null,
  returnSelector = null,
  otpActive = false,
  otpTickBusy = false,
  toastTimer;
async function request(method, p = {}) {
  inflight++;
  setBusy();
  try {
    return await api.call(method, p);
  } catch (e) {
    const message = (e.message || "İşlem tamamlanamadı.").replace(
      /^Error invoking remote method '[^']+': Error: /,
      "",
    );
    showError(message);
    throw e;
  } finally {
    inflight--;
    setBusy();
  }
}
function run(method, p = {}) {
  request(method, p).catch(() => {});
}
function showError(message) {
  if ($("#modal").open) {
    $("#modal-error").textContent = message;
    $("#modal-error").hidden = false;
  } else {
    const e = $("#notice");
    e.textContent = message;
    e.className = "error";
    e.hidden = false;
  }
}
function toast(message) {
  const e = $("#notice");
  e.textContent = message;
  e.className = "";
  e.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (!state.notice) e.hidden = true;
  }, 4000);
}
function setBusy() {
  const busy = inflight > 0 || state.busy || state.host?.switching;
  $("#content").setAttribute("aria-busy", String(busy));
  $("#refresh").disabled = busy;
  $("#add").disabled = busy || state.login?.status === "waiting";
  $("#status").textContent = state.host?.switching
    ? "Hesap değiştiriliyor…"
    : state.busy
      ? "Limitler okunuyor…"
      : state.host?.demo
        ? "Örnek verilerle önizleme"
        : state.lastRefresh
          ? "Son yenileme " +
            new Date(state.lastRefresh * 1000).toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Yerel hesap yöneticisi";
  document
    .querySelectorAll("[data-switch]")
    .forEach((b) => (b.disabled = busy || state.login?.status === "waiting"));
}
function accept(next) {
  state = { ...state, ...next };
  document.documentElement.dataset.theme = state.host?.theme || "system";
  render();
  if (modalType === "login") renderLogin();
  if (modalType === "details") renderDetails();
  setBusy();
}
api.onState(accept);
function quota(w, label, isStale = false) {
  const r = remain(w);
  return `<div class="quota"><div class="quota-label">${esc(w?.minutes === 10080 ? "Haftalık" : w?.minutes === 300 ? "5 saatlik" : w?.minutes ? `${w.minutes} dakikalık` : label)}${isStale ? "<small>· Eski veri</small>" : ""}</div><div class="quota-value">${r === null ? "—" : "%" + Math.round(r)}<small>kalan</small></div><progress ${r === null ? 'value="0"' : `value="${r}"`} max="100" class="${r !== null && r <= 10 ? "low" : ""}" aria-label="${esc(label)} kalan kullanım" aria-valuetext="${r === null ? "Bilinmiyor" : "Yüzde " + Math.round(r)}"></progress><small class="muted">${w?.resetsAt ? "Sıfırlanma " + esc(date(w.resetsAt)) : "Veri bekleniyor"}</small></div>`;
}
function age(a) {
  if (!a.updatedAt) return "Henüz limit okunmadı";
  const n = Math.max(0, Math.floor(Date.now() / 1000 - a.updatedAt));
  return n < 60
    ? "Az önce güncellendi"
    : n < 3600
      ? `${Math.floor(n / 60)} dk önce güncellendi`
      : `${Math.floor(n / 3600)} saat önce güncellendi`;
}
function card(a) {
  const i = state.accounts.indexOf(a),
    pd = state.settings.planDates?.[a.id],
    left = pd ? Math.ceil((pd - Date.now() / 1000) / 86400) : null;
  return `<article class="account"><div class="card-head">${icon(institution(a) ? "shield" : "users")}<div class="identity"><h3>${esc(name(a))}</h3><small>${esc([a.alias ? a.email : "", a.workspace, plan(a)].filter(Boolean).join(" · "))}</small></div>${a.active ? '<span class="badge">Etkin</span>' : ""}<button class="more" data-edit="${i}" aria-label="${esc(name(a))} hesap ayarları">${icon("more")}</button></div><div class="card-quotas">${quota(a.primary, "5 saatlik", stale(a))}${quota(a.secondary, "Haftalık", stale(a))}</div><div class="row muted"><small>${count(a.resetCredits)} yenileme hakkı</small><small>Kredi: ${a.creditsUnlimited ? "Sınırsız" : esc(a.credits ?? "—")}</small></div>${pd ? `<div class="date-note">Plus: ${left > 0 ? left + " gün kaldı" : left === 0 ? "Bugün" : Math.abs(left) + " gün geçti"} · Elle girilen tarih<br>${esc(date(pd))}</div>` : ""}${a.error ? `<p class="error">${esc(a.error)}</p>` : ""}<small>${esc(age(a))}</small><div class="card-actions"><button data-details="${i}">${icon("chart")}Ayrıntılar</button>${a.active ? "<small>Kullanımda</small>" : `<button data-switch="${i}">${icon("switch")}Bu hesaba geç</button>`}</div></article>`;
}
function render() {
  const notice = state.notice;
  $("#notice").hidden = !notice;
  if (notice) {
    $("#notice").textContent = notice.message;
    $("#notice").className = notice.kind === "error" ? "error" : "";
  }
  const p = state.pendingAuto;
  $("#pending").hidden = !p;
  if (p) {
    $("#pending").innerHTML =
      `<span>${esc(p.reason)}. <strong>${esc(p.email)}</strong> hesabına geçiş <span id="countdown"></span></span><button id="snooze">30 dakika ertele</button>`;
    $("#snooze").onclick = () => run("snooze");
    updateCountdown();
  }
  if (page === "accounts") renderAccounts();
  else if (page === "auto") renderAuto();
  else if (page === "settings") renderSettings();
  else if (page === "otp" && !$("#otp-form")) renderOTP();
  setBusy();
  icons();
}
function renderAccounts() {
  const active = state.accounts.find((a) => a.active),
    filtered = state.accounts.filter((a) =>
      [a.email, a.alias, a.workspace]
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
    );
  const wasSearch = document.activeElement?.id === "search",
    selection = wasSearch ? $("#search").selectionStart : 0;
  $("#content").innerHTML =
    `<h1>Hesapların, tek yerde.</h1><p class="intro">Kalan kullanımını gör, çalışacağın hesabı seç.</p>${active ? `<section class="panel active-panel" aria-label="Etkin hesap"><div><div class="eyebrow">${icon("check")}Etkin hesap</div><h2 class="active-name">${esc(name(active))}</h2><span class="muted">${esc([active.alias ? active.email : "", plan(active)].filter(Boolean).join(" · "))}</span>${active.error ? `<p class="error">${esc(active.error)}</p>` : ""}</div>${quota(active.primary, "5 saatlik", stale(active))}${quota(active.secondary, "Haftalık", stale(active))}</section>` : ""}<div class="section-title"><h2>Kayıtlı hesaplar <span class="count">${state.accounts.length}</span></h2><input type="search" id="search" placeholder="Hesap ara" aria-label="Hesap ara" value="${esc(search)}"></div><div class="grid">${filtered.map(card).join("")}</div>${filtered.length ? "" : `<div class="empty"><h2>${state.accounts.length ? "Aramana uygun hesap yok" : state.busy ? "Hesaplar yükleniyor…" : "İlk hesabını ekle"}</h2><p>${state.accounts.length ? "E-posta veya hesap adıyla tekrar dene." : "ChatGPT hesabınla resmî giriş penceresinde oturum aç."}</p>${state.accounts.length || state.busy ? "" : '<button class="primary" id="first-account">Hesap ekle</button>'}</div>`}<div class="note">${icon("info")}<span>${state.settings.restartClient ? "Geçişte açık Codex normal biçimde kapatılıp yeni hesapla yeniden açılır. Devam eden iş algılanırsa geçiş bekler." : "Yeni CLI oturumları seçili hesabı kullanır. Açık Codex uygulamasını yeni hesabı kullanmak için yeniden başlat."}</span></div>`;
  $("#search").oninput = (e) => {
    search = e.target.value;
    renderAccounts();
    setBusy();
  };
  if (wasSearch) {
    $("#search").focus();
    $("#search").setSelectionRange(selection, selection);
  }
  $("#first-account")?.addEventListener("click", openLogin);
  document
    .querySelectorAll("[data-switch]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          run("switch", { key: state.accounts[Number(b.dataset.switch)].id })),
    );
  document
    .querySelectorAll("[data-details]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          openDetails(state.accounts[Number(b.dataset.details)].id)),
    );
  document
    .querySelectorAll("[data-edit]")
    .forEach(
      (b) =>
        (b.onclick = () => openEdit(state.accounts[Number(b.dataset.edit)])),
    );
}
function toggleRow(id, title, desc, checked) {
  return `<div class="settings-row"><div><strong>${esc(title)}</strong>${desc ? `<p>${esc(desc)}</p>` : ""}</div><label class="check"><input id="${id}" type="checkbox" ${checked ? "checked" : ""} aria-label="${esc(title)}"></label></div>`;
}
function renderAuto() {
  const s = state.settings;
  $("#content").innerHTML =
    `<h1>Otomatik geçiş</h1><p class="intro">Limit azaldığında, uygun hesaplardan kalan kullanımı en yüksek olanı seçer.</p><section class="panel">${toggleRow("autoEnabled", "Otomatik geçişi etkinleştir", "Uygulama sistem tepsisinde açıkken çalışır.", s.autoEnabled)}<div class="settings-row"><label for="primaryThreshold">5 saatlik kalan kullanım</label><span><input id="primaryThreshold" type="number" min="0" max="25" step="1" value="${s.primaryThreshold ?? 5}"> % ve altı</span></div><div class="settings-row"><label for="weeklyThreshold">Haftalık kalan kullanım</label><span><input id="weeklyThreshold" type="number" min="0" max="25" step="1" value="${s.weeklyThreshold ?? 3}"> % ve altı</span></div><div class="settings-row"><label for="refreshSeconds">Limit yenileme</label><select id="refreshSeconds">${[60, 120, 300].map((v) => `<option value="${v}" ${v === s.refreshSeconds ? "selected" : ""}>${v / 60} dakika</option>`).join("")}</select></div>${toggleRow("restartClient", "Codex’i kapatıp yeniden aç", "Elle ve otomatik geçişte yeni hesabı uygulamaya uygular.", s.restartClient)}</section><div class="rules"><div>${icon("clock")}Geçişten önce 20 saniye iptal süresi.</div><div>${icon("switch")}İki geçiş arasında ${Math.round((s.cooldownSeconds || 600) / 60)} dakika beklenir.</div><div>${icon("shield")}Eski, eksik veya erişim hatalı limitler seçilmez.</div><div>${icon("info")}${state.activity?.busy || state.activity?.unknown ? "Devam eden iş veya belirsiz durum algılandı; geçiş bekler." : "Geçiş öncesinde yerel çalışma durumu kontrol edilir."}</div></div><h2>Otomatik geçişe dahil hesaplar</h2><section class="panel spaced">${state.accounts.map((a, i) => toggleRow("include-" + i, name(a), institution(a) ? "Kurum hesabı: yalnızca Codex kullanım yetkiniz varsa dahil edin." : plan(a), !s.autoExcluded?.includes(a.id) && (!institution(a) || s.institutionOptIns?.includes(a.id)))).join("") || '<p class="muted">Önce bir hesap ekle.</p>'}</section><button id="pause-auto">30 dakika ertele</button>`;
  for (const key of [
    "autoEnabled",
    "restartClient",
    "primaryThreshold",
    "weeklyThreshold",
    "refreshSeconds",
  ])
    $("#" + key).onchange = (e) =>
      run("settings", {
        [key]:
          e.target.type === "checkbox"
            ? e.target.checked
            : Number(e.target.value),
      });
  state.accounts.forEach(
    (a, i) =>
      ($("#include-" + i).onchange = (e) => {
        const included = e.target.checked,
          excluded = new Set(s.autoExcluded || []),
          opt = new Set(s.institutionOptIns || []);
        if (included) {
          excluded.delete(a.id);
          if (institution(a)) opt.add(a.id);
        } else {
          excluded.add(a.id);
          opt.delete(a.id);
        }
        run("settings", {
          autoExcluded: [...excluded],
          institutionOptIns: [...opt],
        });
      }),
  );
  $("#pause-auto").onclick = () => run("snooze");
}
function renderSettings() {
  const h = state.host || {};
  $("#content").innerHTML =
    `<h1>Giriş ve uygulama</h1><p class="intro">Bu bilgisayardaki giriş ve masaüstü tercihlerin.</p><section class="panel stack"><div><h2>Ayrı tarayıcı profili</h2><p class="muted">Her giriş geçici bir Chrome veya Edge profiliyle açılır. Normal tarayıcı oturumların ve çerezlerin giriş penceresine taşınmaz. İstersen bağlantıyı kendi tarayıcında açabilirsin.</p></div><div><h2>Resmî Codex giriş akışı</h2><p class="muted">Şifreni yalnızca OpenAI veya kurumunun giriş sayfasına yazarsın. Uygulama şifre toplamaz; limitleri resmî Codex app-server arayüzünden okur.</p></div><div><h2>Okul ve kurum hesapları</h2><p class="muted">SSO için tarayıcı girişini kullan. Kurumun Codex erişim politikası uygulanır.</p></div>${toggleRow("startup", "Windows oturumu açıldığında başlat", "Pencereyi kapatınca sistem tepsisinde çalışmaya devam eder.", h.launchAtLogin)}<div class="row"><label for="theme">Görünüm</label><select id="theme">${[
      ["system", "Sistem ayarı"],
      ["light", "Açık"],
      ["dark", "Koyu"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${v === (h.theme || "system") ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></div></section><p class="muted">Hesap kayıtları bu Windows kullanıcısının .codex klasöründe tutulur. İsteğe bağlı 2FA anahtarları Windows DPAPI ile şifrelenir. Plus tarihleri elle girilen takip bilgisidir.</p><p class="muted">Codex’i yeniden açma, açık pencerenin uygulama yolunu kullanır. Normal kapanış reddedilirse hesap geçişi yapılmaz. Çalışma durumu kontrolü yerel oturum kayıtlarına dayanır.</p><div class="actions"><button id="releases">GitHub · Güncel sürümü indir</button><button id="docs">Resmî app-server belgeleri</button></div><p class="muted spaced">Codex Accounts ${esc(state.host?.version || "1.3.0")} · Codex Auth 0.3.1 · Codex CLI 0.162.0<br>OpenAI tarafından yayımlanmış bir ürün değildir.</p>`;
  $("#startup").onchange = (e) =>
    run("hostSettings", { launchAtLogin: e.target.checked });
  $("#theme").onchange = (e) => run("hostSettings", { theme: e.target.value });
  $("#docs").onclick = () => run("docs");
  $("#releases").onclick = () => run("releases");
}
function renderOTP() {
  $("#content").innerHTML =
    `<h1>2FA dönüştürücü</h1><p class="intro">Kurulum anahtarını bu bilgisayarda doğrulama koduna çevir.</p><section class="panel"><form id="otp-form"><label class="field" for="otp-secret">2FA kurulum anahtarı veya otpauth bağlantısı<textarea id="otp-secret" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Base32 kurulum anahtarı veya otpauth://totp/…" required></textarea></label><button type="submit" class="primary">Doğrulama koduna çevir</button></form><div id="otp-result" class="otp-result" hidden><small>Doğrulama kodu</small><div class="otp-code" id="otp-code" role="status" aria-live="polite"></div><p id="otp-time" class="muted"></p><div class="actions"><button id="copy-otp">${icon("copy")}Kodu kopyala</button><button id="clear-otp" class="quiet">Kodu ekrandan temizle</button></div></div><hr><label for="otp-account">Kaydetmek veya kayıtlı anahtarı açmak için hesap seç</label><select id="otp-account" class="full spaced"><option value="">Hesap seç</option>${state.accounts.map((a, i) => `<option value="${i}">${esc(name(a))}</option>`).join("")}</select><div class="actions"><button id="save-otp">Windows’a şifreli kaydet</button><button id="load-otp">Kayıtlı anahtarı aç</button><button id="remove-otp" class="danger">Kayıtlı anahtarı sil</button></div></section><p class="muted">Anahtar üçüncü bir servise gönderilmez. Kaydetmek isteğe bağlıdır. Kopyalanan kod, pano değişmediyse 45 saniye sonra temizlenir.</p><p class="muted">Tek kullanımlık kod veya kurtarma kodu yerine 2FA kurulum anahtarı gerekir. Kod reddedilirse Windows tarih ve saatini kontrol et.</p>`;
  $("#otp-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await request("totp", { value: $("#otp-secret").value });
      $("#otp-secret").value = "";
      showOTP(r);
    } catch {}
  };
  $("#copy-otp").onclick = () =>
    request("copyCode")
      .then(() => toast("Kod kopyalandı."))
      .catch(() => {});
  $("#clear-otp").onclick = () => {
    otpActive = false;
    $("#otp-result").hidden = true;
    $("#otp-code").textContent = "";
    run("forgetTotp");
  };
  const key = () => {
    const value = $("#otp-account").value;
    if (value === "") throw Error("Önce kayıtlı bir hesap seçin.");
    return state.accounts[Number(value)]?.id;
  };
  $("#save-otp").onclick = async () => {
    try {
      await request("totpSave", { key: key() });
      toast("Anahtar Windows’ta şifreli kaydedildi.");
    } catch (e) {
      showError(e.message);
    }
  };
  $("#load-otp").onclick = async () => {
    try {
      showOTP(await request("totpLoad", { key: key() }));
    } catch (e) {
      showError(e.message);
    }
  };
  $("#remove-otp").onclick = async () => {
    try {
      const result = await request("totpRemove", { key: key() });
      if (result.removed) {
        otpActive = false;
        $("#otp-result").hidden = true;
      }
    } catch (e) {
      showError(e.message);
    }
  };
  if (otpActive)
    request("totp")
      .then(showOTP)
      .catch(() => {});
}
function showOTP(r) {
  if (!$("#otp-result")) return;
  otpActive = true;
  $("#otp-result").hidden = false;
  if ($("#otp-code").textContent !== r.code)
    $("#otp-code").textContent = r.code;
  $("#otp-time").textContent =
    `${r.remaining} saniye sonra yenilenir · ${r.period} saniyelik kod`;
}
function openModal(type, title, key) {
  returnFocus = document.activeElement;
  returnSelector = returnFocus?.id
    ? "#" + CSS.escape(returnFocus.id)
    : returnFocus?.hasAttribute("data-details")
      ? '[data-details="' + returnFocus.dataset.details + '"]'
      : returnFocus?.hasAttribute("data-edit")
        ? '[data-edit="' + returnFocus.dataset.edit + '"]'
        : null;
  modalType = type;
  modalKey = key;
  $("#modal-title").textContent = title;
  $("#modal-error").hidden = true;
  $("#modal-body").innerHTML = "";
  $("#modal").showModal();
}
function closeModal() {
  modalType = null;
  modalKey = null;
  $("#modal").close();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  else if (returnSelector) $(returnSelector)?.focus({ preventScroll: true });
  else $("#add").focus({ preventScroll: true });
}
$("#close-modal").onclick = closeModal;
$("#modal").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
$("#modal").addEventListener("close", () => {
  modalType = null;
  modalKey = null;
});
async function openLogin() {
  try {
    await request("resetLogin");
  } catch {}
  openModal("login", "Hesap ekle");
  renderLogin();
}
function renderLogin() {
  const l = state.login;
  if (l?.status === "waiting" || l?.status === "complete") {
    $("#modal-body").innerHTML =
      `<h3>${l.status === "complete" ? "Hesap kaydedildi" : "Giriş bekleniyor"}</h3><p class="muted spaced">${esc(l.message)}</p>${l.code ? `<div class="panel"><strong class="active-name">${esc(l.code)}</strong><button id="copy-device" class="spaced">Kodu kopyala</button></div>` : ""}${l.status === "waiting" ? '<div class="actions"><button id="browser" class="primary">Giriş penceresini aç</button><button id="copy-link">Bağlantıyı kopyala</button></div><p class="muted spaced">Bağlantıyı aynı bilgisayardaki tarayıcında aç. Giriş tamamlanana kadar uygulamayı açık tut.</p><button id="cancel-login" class="danger">Girişi iptal et</button>' : '<button id="login-done" class="primary">Tamam</button>'}`;
    $("#copy-device")?.addEventListener("click", () => run("copyDeviceCode"));
    $("#browser")?.addEventListener("click", () => run("openBrowser"));
    $("#copy-link")?.addEventListener("click", () =>
      request("copyLogin")
        .then(() => {
          const b = $("#copy-link");
          if (b) b.textContent = "Bağlantı kopyalandı";
        })
        .catch(() => {}),
    );
    $("#cancel-login")?.addEventListener("click", () => run("cancelLogin"));
    $("#login-done")?.addEventListener("click", closeModal);
    return;
  }
  if ($("#login-form")) return;
  $("#modal-body").innerHTML =
    `<p class="muted">Resmî ChatGPT girişi yapılır. Etkin hesabın giriş sırasında korunur.</p><form id="login-form"><label class="field">Hesap adı (isteğe bağlı)<input id="login-alias" maxlength="60" placeholder="Kişisel, Okul…"></label><label class="check"><input id="login-device" type="checkbox">Cihaz koduyla giriş yap</label><label class="check"><input id="login-browser" type="checkbox" checked>Ayrı giriş penceresini otomatik aç</label><p class="muted spaced">Ayrı Chrome veya Edge profili kullanılır. Kurum SSO girişi için tarayıcı akışını tercih et.</p>${l?.status === "error" ? `<p class="error">${esc(l.message)}</p>` : ""}<button id="start-login" type="submit" class="primary">Giriş başlat</button></form>`;
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const b = $("#start-login"),
      p = {
        alias: $("#login-alias").value,
        mode: $("#login-device").checked ? "device" : "browser",
        openBrowser: $("#login-browser").checked,
      };
    b.disabled = true;
    b.textContent = "Hazırlanıyor…";
    try {
      await request("login", p);
    } catch {
      if ($("#start-login")) {
        $("#start-login").disabled = false;
        $("#start-login").textContent = "Tekrar dene";
      }
    }
  };
}
function openEdit(a) {
  openModal("edit", "Hesap ayarları", a.id);
  const pd = state.settings.planDates?.[a.id];
  $("#modal-body").innerHTML =
    `<p class="muted">${esc(a.email)}</p><form id="edit-form"><label class="field">Hesap adı<input id="edit-alias" maxlength="60" value="${esc(a.alias)}"></label><label class="check"><input type="checkbox" id="has-date" ${pd ? "checked" : ""}>Plus yenilenme / bitiş tarihini takip et</label><label class="field spaced" id="date-field" ${pd ? "" : "hidden"}>Tarih<input type="date" id="plan-date" value="${pd ? new Date(pd * 1000).toLocaleDateString("en-CA") : new Date().toLocaleDateString("en-CA")}"></label><p class="muted">Elle girilen tarih. Gerçek abonelik veya ödeme durumu otomatik doğrulanmaz.</p><div class="actions"><button type="submit" class="primary">Değişiklikleri kaydet</button>${a.active ? "" : '<button type="button" id="remove-account" class="danger">Hesabı kaldır</button>'}</div></form>`;
  $("#has-date").onchange = (e) =>
    ($("#date-field").hidden = !e.target.checked);
  $("#edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const alias = $("#edit-alias").value,
      dates = { ...state.settings.planDates };
    if ($("#has-date").checked) {
      const t = new Date($("#plan-date").value + "T12:00:00").getTime() / 1000;
      if (!Number.isFinite(t)) {
        showError("Geçerli bir tarih seç.");
        return;
      }
      dates[a.id] = t;
    } else delete dates[a.id];
    try {
      await request("alias", { key: a.id, alias });
      await request("settings", { planDates: dates });
      closeModal();
    } catch {}
  };
  $("#remove-account")?.addEventListener("click", async () => {
    try {
      await request("remove", { key: a.id });
      if (!state.accounts.some((x) => x.id === a.id)) closeModal();
    } catch {}
  });
}
function openDetails(key) {
  openModal("details", "Kullanım ayrıntıları", key);
  renderDetails();
  run("details", { key });
}
function renderDetails() {
  const a = state.accounts.find((a) => a.id === modalKey);
  if (!a) {
    $("#modal-body").textContent = "Hesap bulunamadı.";
    return;
  }
  const h = a.history,
    summary = h?.summary || {},
    daily = h?.daily || [],
    recent = daily.slice(-14),
    peak = Math.max(1, ...recent.map((d) => d.tokens));
  $("#modal-body").innerHTML =
    `<div class="row dialog-section"><p class="muted">${esc(name(a))} · ${esc(plan(a))}</p><button id="refresh-detail" ${state.busy ? "disabled" : ""}>Yenile</button></div>${a.error ? `<p class="error">${esc(a.error)}</p>` : ""}${stale(a) ? '<p class="muted">Bu bilgiler güncel olmayabilir.</p>' : ""}<section class="dialog-section"><h3>Kullanım limitleri</h3><p class="muted">Dahil kullanım: ${a.ordinaryUsageAllowed === true ? "Açık" : a.ordinaryUsageAllowed === false ? "Kapalı" : "Bilinmiyor"}</p>${(a.buckets?.length ? a.buckets : [{ name: "Codex", primary: a.primary, secondary: a.secondary }]).map((b) => `<div class="panel"><h3>${esc(b.name)}</h3><div class="card-quotas spaced">${quota(b.primary, "5 saatlik", stale(a))}${quota(b.secondary, "Haftalık", stale(a))}</div>${b.limitReached ? `<p class="error spaced">Limit durumu: ${esc(b.limitReached)}</p>` : ""}</div>`).join("")}<small>Limit verisi: ${esc(date(a.updatedAt))} · ${a.source === "official" ? "Resmî Codex sorgusu" : "Önceki veya yerel kayıt"}</small></section><section class="dialog-section"><div class="row"><h3>Yenileme hakları</h3><strong class="success">${count(a.resetCredits)} kullanılabilir</strong></div><p class="muted spaced">Ek kullanım kredisi: ${a.creditsUnlimited ? "Sınırsız" : esc(a.credits ?? "Bilinmiyor")}<br>Son sorgu: ${esc(date(a.extrasUpdatedAt))}</p>${a.resetDetails?.length ? a.resetDetails.map((c) => `<div class="panel"><div class="row"><strong>${esc(c.title || "Codex limit yenileme hakkı")}</strong><small>${esc({ available: "Kullanılabilir", redeeming: "İşleniyor", redeemed: "Kullanılmış" }[c.status] || "Bilinmiyor")}</small></div><p class="muted spaced">${esc(c.description || "")}</p><small>Verildiği tarih: ${esc(date(c.grantedAt))}<br>Son kullanım: ${esc(date(c.expiresAt))}</small></div>`).join("") : `<p class="muted">${a.resetCredits === 0 ? "Kullanılabilir yenileme hakkı yok." : "Sunucu yenileme hakkı ayrıntısı sağlamadı."}</p>`}</section><section class="dialog-section"><h3>Token kullanımı</h3><div class="detail-grid spaced">${[
      ["Toplam token", summary.lifetimeTokens],
      ["En yüksek günlük", summary.peakDailyTokens],
      ["Güncel seri (gün)", summary.currentStreakDays],
    ]
      .map(
        ([l, v]) =>
          `<div class="metric"><small>${l}</small><strong>${count(v)}</strong></div>`,
      )
      .join(
        "",
      )}</div><p class="muted spaced">En uzun çalışma: ${summary.longestRunningTurnSec == null ? "—" : Math.floor(summary.longestRunningTurnSec / 60) + " dk " + (summary.longestRunningTurnSec % 60) + " sn"} · En uzun seri: ${count(summary.longestStreakDays)} gün</p>${
      recent.length
        ? `<div class="chart" role="img" aria-label="Son ${recent.length} kaydın günlük token grafiği; değerler aşağıdaki tabloda">${recent.map((d) => `<div class="bar" data-height="${Math.max(1, (100 * d.tokens) / peak)}" title="${esc(d.date)}: ${count(d.tokens)} token"></div>`).join("")}</div><table class="data-table"><caption>Son 30 günlük kayıt</caption><thead><tr><th scope="col">Gün</th><th scope="col">Token</th></tr></thead><tbody>${daily
            .slice(-30)
            .reverse()
            .map(
              (d) =>
                `<tr><td>${esc(d.date)}</td><td>${count(d.tokens)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : `<p class="muted">${h ? "Günlük token kaydı sağlanmadı." : "Token geçmişi henüz alınamadı."}</p>`
    }${a.historyError ? `<p class="error spaced">Token bilgisi güncellenemedi: ${esc(a.historyError)}</p>` : ""}<p class="muted spaced">Token verisi: ${esc(date(a.historyUpdatedAt))}<br>Sunucunun sağlamadığı değerler ‘—’ olarak gösterilir.</p></section>`;
  document
    .querySelectorAll("[data-height]")
    .forEach((b) => (b.style.height = b.dataset.height + "%"));
  $("#refresh-detail").onclick = () => run("details", { key: a.id });
}
function updateCountdown() {
  const e = $("#countdown");
  if (e && state.pendingAuto)
    e.textContent =
      state.activity?.busy || state.activity?.unknown
        ? "çalışma bitene kadar bekliyor."
        : `${Math.max(0, Math.ceil(state.pendingAuto.executeAt - Date.now() / 1000))} sn sonra.`;
}
for (const b of document.querySelectorAll("[data-page]"))
  b.onclick = () => {
    page = b.dataset.page;
    document
      .querySelectorAll("[data-page]")
      .forEach((x) => x.removeAttribute("aria-current"));
    b.setAttribute("aria-current", "page");
    $("#breadcrumb").textContent = b.textContent.trim();
    $("#content").innerHTML = "";
    render();
    window.scrollTo({ top: 0 });
    $("#content").focus({ preventScroll: true });
  };
$("#add").onclick = openLogin;
$("#refresh").onclick = () => run("refresh");
$("#quit").onclick = () => run("quit");
icons();
render();
request("state")
  .then(accept)
  .catch(() => {});
setInterval(async () => {
  updateCountdown();
  if (page === "otp" && otpActive && !otpTickBusy) {
    otpTickBusy = true;
    try {
      showOTP(await api.call("totp"));
    } catch {
    } finally {
      otpTickBusy = false;
    }
  }
}, 1000);
