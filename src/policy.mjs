export const defaultSettings = {
  autoEnabled: false,
  primaryThreshold: 5,
  weeklyThreshold: 3,
  refreshSeconds: 120,
  restartClient: true,
  cooldownSeconds: 600,
  autoExcluded: [],
  planDates: {},
  lastSwitchAt: 0,
  snoozeUntil: 0,
};
export function normalizeSettings(input = {}) {
  const clamp = (v, min, max, fallback) =>
    Number.isFinite(Number(v))
      ? Math.max(min, Math.min(max, Number(v)))
      : fallback;
  const planDates = Object.fromEntries(
    Object.entries(
      input.planDates && typeof input.planDates === "object"
        ? input.planDates
        : {},
    ).filter(
      ([k, v]) =>
        typeof k === "string" && Number.isFinite(v) && v > 0 && v < 4102444800,
    ),
  );
  return {
    ...defaultSettings,
    planDates,
    autoEnabled: input.autoEnabled === true,
    restartClient: input.restartClient !== false,
    primaryThreshold: clamp(input.primaryThreshold, 0, 25, 5),
    weeklyThreshold: clamp(input.weeklyThreshold, 0, 25, 3),
    refreshSeconds: clamp(input.refreshSeconds, 60, 600, 120),
    cooldownSeconds: clamp(input.cooldownSeconds, 300, 3600, 600),
    autoExcluded: Array.isArray(input.autoExcluded)
      ? input.autoExcluded.filter((v) => typeof v === "string")
      : [],
    lastSwitchAt: clamp(input.lastSwitchAt, 0, Number.MAX_SAFE_INTEGER, 0),
    snoozeUntil: clamp(input.snoozeUntil, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}
export function remaining(w) {
  return w && Number.isFinite(w.used)
    ? Math.max(0, Math.min(100, 100 - w.used))
    : null;
}
export function fresh(a, now) {
  return (
    a.source === "official" &&
    !a.error &&
    Number.isFinite(a.updatedAt) &&
    now - a.updatedAt < 180 &&
    now >= a.updatedAt
  );
}
export function chooseAuto(accounts, settings, now = Date.now() / 1000) {
  if (
    !settings.autoEnabled ||
    now < settings.snoozeUntil ||
    now - settings.lastSwitchAt < settings.cooldownSeconds
  )
    return null;
  const active = accounts.find((a) => a.active);
  if (!active || !fresh(active, now)) return null;
  if (
    settings.autoExcluded.includes(active.id) ||
    (/edu|business|enterprise/i.test(active.plan) && !active.autoOptIn)
  )
    return null;
  const low5 = remaining(active.primary),
    lowWeek = remaining(active.secondary);
  if (
    !(
      (low5 !== null && low5 <= settings.primaryThreshold) ||
      (lowWeek !== null && lowWeek <= settings.weeklyThreshold) ||
      active.ordinaryUsageAllowed === false
    )
  )
    return null;
  const targets = accounts.filter(
    (a) =>
      !a.active &&
      fresh(a, now) &&
      a.authMode === "chatgpt" &&
      !settings.autoExcluded.includes(a.id) &&
      a.ordinaryUsageAllowed !== false &&
      !a.limitReached &&
      (!/edu|business|enterprise/i.test(a.plan) || a.autoOptIn) &&
      remaining(a.primary) !== null &&
      remaining(a.secondary) !== null &&
      remaining(a.primary) > settings.primaryThreshold + 5 &&
      remaining(a.secondary) > settings.weeklyThreshold + 5,
  );
  targets.sort(
    (a, b) =>
      Math.min(remaining(b.primary), remaining(b.secondary)) -
        Math.min(remaining(a.primary), remaining(a.secondary)) ||
      b.updatedAt - a.updatedAt,
  );
  return targets[0]
    ? {
        key: targets[0].id,
        previousKey: active.id,
        email: targets[0].email,
        reason:
          low5 !== null && low5 <= settings.primaryThreshold
            ? "5 saatlik limit azaldı"
            : "Haftalık limit azaldı",
      }
    : null;
}
export function safeAuthURL(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ["auth.openai.com", "chatgpt.com", "auth0.openai.com"].includes(
        u.hostname,
      )
    );
  } catch {
    return false;
  }
}
export function classifyError(error) {
  const s = String(error?.message || error).toLowerCase();
  if (
    /revoked|expired|401|refresh_token_reused|invalid_grant|token_expired/.test(
      s,
    )
  )
    return {
      code: "signin",
      message: "Oturum yenilenmeli. Yeniden giriş yapın.",
    };
  if (/403|forbidden|workspace|organization|access.denied/.test(s))
    return {
      code: "restricted",
      message: "Hesap veya okul/kurum politikası Codex erişimini kısıtlıyor.",
    };
  if (/429|too.many|rate.limit/.test(s))
    return {
      code: "throttled",
      message: "Sorgu sınırı. Tekrar denemek için biraz bekleyin.",
    };
  if (/timeout|timed.out/.test(s))
    return { code: "network", message: "Bağlantı zaman aşımına uğradı." };
  return {
    code: "unavailable",
    message: "Güncel bilgi alınamadı. Bağlantıyı ve girişinizi kontrol edin.",
  };
}
