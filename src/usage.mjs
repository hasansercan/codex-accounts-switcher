const text = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : null);
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const timestamp = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const window = (v) =>
  v && Number.isFinite(v.usedPercent)
    ? {
        used: Math.max(0, Math.min(100, v.usedPercent)),
        minutes: count(v.windowDurationMins),
        resetsAt: timestamp(v.resetsAt),
      }
    : null;
export function limitsFromResponse(result, prior = {}) {
  const bucket = result.rateLimitsByLimitId?.codex || result.rateLimits;
  const reset = result.rateLimitResetCredits;
  const mapped = Object.entries(result.rateLimitsByLimitId || {})
    .filter(([, b]) => b && typeof b === "object")
    .map(([id, b]) => ({
      id: text(b.limitId) || id,
      name:
        text(b.limitName) || text(b.normalModelSlug) || text(b.limitId) || id,
      primary: window(b.primary),
      secondary: window(b.secondary),
      limitReached: text(b.rateLimitReachedType),
    }));
  const fallback = bucket
    ? [
        {
          id: text(bucket.limitId) || "codex",
          name:
            text(bucket.limitName) || text(bucket.normalModelSlug) || "Codex",
          primary: window(bucket.primary),
          secondary: window(bucket.secondary),
          limitReached: text(bucket.rateLimitReachedType),
        },
      ]
    : [];
  const history = Object.fromEntries(
    ["history", "historyUpdatedAt", "historyCheckedAt", "historyError"].map(
      (k) => [k, prior[k]],
    ),
  );
  return {
    ...history,
    primary: window(bucket?.primary),
    secondary: window(bucket?.secondary),
    source: "official",
    error: null,
    errorCode: null,
    retryAt: 0,
    ordinaryUsageAllowed:
      typeof result.ordinaryUsageAllowed === "boolean"
        ? result.ordinaryUsageAllowed
        : null,
    limitReached: text(bucket?.rateLimitReachedType),
    credits: text(bucket?.credits?.balance),
    creditsUnlimited:
      typeof bucket?.credits?.unlimited === "boolean"
        ? bucket.credits.unlimited
        : null,
    hasCredits:
      typeof bucket?.credits?.hasCredits === "boolean"
        ? bucket.credits.hasCredits
        : null,
    resetCredits: count(reset?.availableCount),
    resetDetails: Array.isArray(reset?.credits)
      ? reset.credits
          .filter((c) => c && typeof c.id === "string")
          .map((c) => ({
            id: c.id,
            resetType: text(c.resetType),
            status: text(c.status),
            grantedAt: timestamp(c.grantedAt),
            expiresAt: timestamp(c.expiresAt),
            title: text(c.title),
            description: text(c.description, 1500),
          }))
      : null,
    buckets: mapped.length ? mapped : fallback,
  };
}
export function historyFromResponse(result) {
  const raw = result.summary || {};
  const summary = Object.fromEntries(
    [
      "lifetimeTokens",
      "peakDailyTokens",
      "longestRunningTurnSec",
      "currentStreakDays",
      "longestStreakDays",
    ].map((k) => [k, count(raw[k])]),
  );
  const daily = Array.isArray(result.dailyUsageBuckets)
    ? result.dailyUsageBuckets
        .filter(
          (x) =>
            x &&
            typeof x.startDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(x.startDate) &&
            !Number.isNaN(Date.parse(x.startDate)) &&
            count(x.tokens) !== null,
        )
        .map((x) => ({ date: x.startDate, tokens: x.tokens }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : null;
  return { summary, daily };
}
