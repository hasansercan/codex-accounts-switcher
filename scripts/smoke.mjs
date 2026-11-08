import { _electron } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  screens = process.argv.includes("--screenshots");
const output = join(root, "docs", "screenshots");
if (screens) await mkdir(output, { recursive: true });
const electron = await _electron.launch({ args: [root, "--demo"], cwd: root });
const pid = electron.process().pid;
const errors = [];
try {
  const page = await electron.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".account");
  assert.equal(await page.locator(".account").count(), 3);
  assert.equal(await page.evaluate(() => typeof require), "undefined");
  async function shot(name) {
    if (!screens) return;
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: join(output, name + ".png"), scale: "css" });
  }
  await shot("accounts-light");
  await page.getByRole("searchbox").fill("does-not-exist");
  assert.equal(await page.locator(".account").count(), 0);
  await page.getByRole("searchbox").fill("");
  await page.locator('[data-switch="1"]').click();
  await page.waitForFunction(
    () => document.querySelector(".active-name").textContent === "İş hesabı",
  );
  await page.locator('[data-details="1"]').click();
  assert.equal(await page.locator("tbody tr").count(), 14);
  await shot("usage-details");
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .locator('[data-details="1"]')
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page
    .getByRole("button", { name: "Otomatik geçiş", exact: true })
    .click();
  assert.equal(await page.locator("#autoEnabled").isChecked(), false);
  await shot("automatic-switching");
  await page
    .getByRole("button", { name: "2FA dönüştürücü", exact: true })
    .click();
  await shot("totp");
  await page.locator("#otp-secret").fill("123456");
  await page.getByRole("button", { name: "Doğrulama koduna çevir" }).click();
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("geçersiz"),
  );
  await page.locator("#otp-secret").fill("JBSWY3DPEHPK3PXP");
  await page.getByRole("button", { name: "Doğrulama koduna çevir" }).click();
  await page.waitForFunction(() =>
    /^\d{6}$/.test(document.querySelector("#otp-code").textContent),
  );
  assert.equal(await page.locator("#otp-secret").inputValue(), "");
  if (process.platform === "win32") {
    await page.locator("#otp-account").selectOption("0");
    await page.locator("#save-otp").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#notice")
        .textContent.includes("şifreli kaydedildi"),
    );
    await page.locator("#clear-otp").click();
    await page.locator("#load-otp").click();
    await page.waitForFunction(() =>
      /^\d{6}$/.test(document.querySelector("#otp-code").textContent),
    );
    console.log(
      "Windows DPAPI: synthetic TOTP save/decrypt/load passed in isolated demo directory.",
    );
  }
  await page.locator("#clear-otp").click();
  assert.equal(await page.locator("#otp-result").isVisible(), false);
  await page
    .getByRole("button", { name: "Giriş ve uygulama", exact: true })
    .click();
  await page.locator("#theme").selectOption("dark");
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.getByRole("button", { name: "Hesaplar", exact: true }).click();
  await shot("accounts-dark");
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(760, 560),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Electron demo smoke passed: search, switch, details/focus, TOTP invalid/valid/clear, theme and minimum width.",
  );
} finally {
  await electron.close();
  await rm(join(tmpdir(), "codex-accounts-preview-" + pid), {
    recursive: true,
    force: true,
  });
}
