const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { access } = require("node:fs/promises");
const path = require("node:path");

// PowerShell is an external program: it cannot read Electron's virtual ASAR paths.
function createLifecycleRunner({
  isPackaged,
  resourcesPath,
  sourceDir,
  execute = promisify(execFile),
}) {
  const script = path.join(
    isPackaged ? resourcesPath : sourceDir,
    "lifecycle.ps1",
  );
  if (
    !path.isAbsolute(script) ||
    /(^|[\\/])[^\\/]+\.asar([\\/]|$)/i.test(script)
  )
    throw Error("Codex denetim betiği arşiv dışında bulunmalıdır.");
  return async function runLifecycle(mode, ids = []) {
    if (
      !["inspect", "close"].includes(mode) ||
      !Array.isArray(ids) ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      (mode === "close" && ids.length === 0)
    )
      throw Error("Geçersiz Codex denetim isteği.");
    try {
      await access(script);
    } catch {
      throw Error(
        "Codex denetim dosyası bulunamadı. Güncel kurulum dosyasını yeniden çalıştırın.",
      );
    }
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-Mode",
      mode,
    ];
    if (mode === "close") args.push("-Ids", ids.join(","));
    return execute("powershell.exe", args, {
      windowsHide: true,
      timeout: mode === "close" ? 25000 : 10000,
      encoding: "utf8",
    });
  };
}
module.exports = { createLifecycleRunner };
