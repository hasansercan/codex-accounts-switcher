const now = Date.now() / 1000;
const base = {
  workspace: "",
  authMode: "chatgpt",
  source: "official",
  updatedAt: now,
  extrasUpdatedAt: now,
  error: null,
  resetCredits: 2,
  credits: "0",
  ordinaryUsageAllowed: true,
  resetDetails: [
    {
      id: "demo",
      title: "Codex limit yenileme hakkı",
      status: "available",
      grantedAt: now - 86400,
      expiresAt: now + 86400 * 7,
      description: "Yalnızca arayüz önizlemesi için örnek veri.",
    },
  ],
  historyUpdatedAt: now,
  history: {
    summary: {
      lifetimeTokens: 1254780,
      peakDailyTokens: 245600,
      currentStreakDays: 5,
      longestStreakDays: 12,
      longestRunningTurnSec: 1234,
    },
    daily: Array.from({ length: 14 }, (_, i) => ({
      date: new Date(Date.now() - (13 - i) * 86400000)
        .toISOString()
        .slice(0, 10),
      tokens: [
        20300, 43600, 32900, 120800, 70500, 245600, 148200, 65700, 168900,
        85400, 136100, 49200, 103600, 156900,
      ][i],
    })),
  },
};
module.exports = {
  accounts: [
    {
      ...base,
      id: "demo::personal",
      email: "kisisel@example.test",
      alias: "Kişisel",
      plan: "plus",
      active: true,
      primary: { used: 28, minutes: 300, resetsAt: now + 7200 },
      secondary: { used: 45, minutes: 10080, resetsAt: now + 250000 },
    },
    {
      ...base,
      id: "demo::work",
      email: "is@example.test",
      alias: "İş hesabı",
      plan: "pro",
      active: false,
      primary: { used: 8, minutes: 300, resetsAt: now + 15000 },
      secondary: { used: 16, minutes: 10080, resetsAt: now + 350000 },
    },
    {
      ...base,
      id: "demo::school",
      email: "okul@example.test",
      alias: "Okul",
      plan: "edu",
      active: false,
      resetCredits: 0,
      primary: { used: 94, minutes: 300, resetsAt: now + 1000 },
      secondary: { used: 22, minutes: 10080, resetsAt: now + 450000 },
    },
  ],
  settings: {
    autoEnabled: false,
    primaryThreshold: 5,
    weeklyThreshold: 3,
    refreshSeconds: 120,
    restartClient: true,
    cooldownSeconds: 600,
    autoExcluded: [],
    institutionOptIns: [],
    planDates: {},
    lastSwitchAt: 0,
    snoozeUntil: 0,
  },
  busy: false,
  activity: { busy: false, unknown: false },
  pendingAuto: null,
  notice: null,
  lastRefresh: now,
};
