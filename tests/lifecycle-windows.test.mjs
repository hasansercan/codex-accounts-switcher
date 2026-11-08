import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const require = createRequire(import.meta.url),
  { createLifecycleRunner } = require("../src/lifecycle.cjs");
test(
  "Windows PowerShell can inspect the real external lifecycle script",
  {
    skip:
      process.platform !== "win32"
        ? "Windows-only PowerShell execution"
        : false,
  },
  async () => {
    const run = createLifecycleRunner({
      isPackaged: false,
      sourceDir: dirname(
        fileURLToPath(new URL("../src/lifecycle.ps1", import.meta.url)),
      ),
    });
    const { stdout } = await run("inspect");
    const result = JSON.parse(stdout.replace(/^\uFEFF/, ""));
    assert.ok(Array.isArray(result));
    for (const p of result) {
      assert.ok(Number.isInteger(p.id) && p.id > 0);
      assert.equal(typeof p.path, "string");
    }
  },
);
