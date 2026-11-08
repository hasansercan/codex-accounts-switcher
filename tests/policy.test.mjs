import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSettings,
  chooseAuto,
  safeAuthURL,
  remaining,
} from "../src/policy.mjs";
const now = 2000000;
const account = (id, used, extra = {}) => ({
  id,
  email: id + "@example.test",
  authMode: "chatgpt",
  source: "official",
  updatedAt: now,
  plan: "plus",
  primary: { used, minutes: 300 },
  secondary: { used: 10, minutes: 10080 },
  ...extra,
});
const settings = () => normalizeSettings({ autoEnabled: true });
test("automatic switching requires explicit enablement and fresh complete limits", () => {
  const a = [account("a", 99, { active: true }), account("b", 5)];
  assert.equal(chooseAuto(a, normalizeSettings(), now), null);
  assert.equal(chooseAuto(a, settings(), now).key, "b");
  for (const patch of [
    { source: "cache" },
    { updatedAt: now - 181 },
    { primary: null },
    { secondary: null },
    { error: "offline" },
    { authMode: "apikey" },
    { ordinaryUsageAllowed: false },
    { limitReached: "reached" },
  ])
    assert.equal(
      chooseAuto([a[0], { ...a[1], ...patch }], settings(), now),
      null,
    );
});
test("institutions need opt-in; exclusions, cooldown and snooze are respected", () => {
  const a = account("a", 99, { active: true }),
    b = account("b", 5, { plan: "edu" });
  assert.equal(chooseAuto([a, b], settings(), now), null);
  assert.equal(
    chooseAuto([a, { ...b, autoOptIn: true }], settings(), now).key,
    "b",
  );
  for (const p of [
    { autoExcluded: ["b"] },
    { snoozeUntil: now + 10 },
    { lastSwitchAt: now - 30 },
  ])
    assert.equal(
      chooseAuto([a, account("b", 5)], { ...settings(), ...p }, now),
      null,
    );
});
test("unknown quota is not zero; inputs are clamped", () => {
  assert.equal(remaining(null), null);
  assert.equal(remaining({ used: 100 }), 0);
  const s = normalizeSettings({
    primaryThreshold: 99,
    weeklyThreshold: -1,
    refreshSeconds: 1,
    planDates: { a: NaN, b: 2100000000 },
  });
  assert.equal(s.primaryThreshold, 25);
  assert.equal(s.weeklyThreshold, 0);
  assert.equal(s.refreshSeconds, 60);
  assert.deepEqual(s.planDates, { b: 2100000000 });
});
test("only official HTTPS login links without embedded credentials are allowed", () => {
  assert.ok(safeAuthURL("https://auth.openai.com/oauth/authorize"));
  for (const url of [
    "javascript:alert(1)",
    "http://auth.openai.com",
    "https://auth.openai.com.attacker.test",
    "https://user:pass@auth.openai.com",
  ])
    assert.equal(safeAuthURL(url), false);
});
