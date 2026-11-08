import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
  access,
} from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile),
  root = dirname(dirname(fileURLToPath(import.meta.url)));
const appDir = join(root, "dist", "Codex Accounts-win32-x64"),
  output = join(root, "dist", "Codex-Accounts-1.3.0-Windows-x64-Setup.exe");
const cache = join(root, ".cache");
await mkdir(cache, { recursive: true });
await access(join(appDir, "Codex Accounts.exe"));
const files = [],
  dirs = [];
let size = 0;
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, item.name);
    if (item.isSymbolicLink()) throw Error("Unexpected symlink in app");
    if (item.isDirectory()) {
      dirs.push(relative(appDir, abs));
      await walk(abs);
    } else {
      files.push(relative(appDir, abs));
      size += (await stat(abs)).size;
    }
  }
}
await walk(appDir);
// NSIS string escaping. File names with wildcards or control characters are not accepted.
function quote(value) {
  if (/[\r\n*?]/.test(value)) throw Error("Unsafe file name");
  return value.replace(/\$/g, "$$").replace(/"/g, '$\\"').replaceAll("/", "\\");
}
const manifest = join(cache, "uninstall-files.nsh");
const lines = files.map((file) => 'Delete "$INSTDIR\\' + quote(file) + '"');
lines.push("IfErrors uninstall_failed", "ClearErrors");
for (const dir of dirs.sort((a, b) => b.length - a.length))
  lines.push('RMDir "$INSTDIR\\' + quote(dir) + '"');
lines.push("ClearErrors");
await writeFile(manifest, lines.join("\n") + "\n", "utf8");
let compiler = process.env.MAKENSIS || "makensis";
if (process.platform === "win32" && !process.env.MAKENSIS) {
  for (const base of [
    process.env["ProgramFiles(x86)"],
    process.env.ProgramFiles,
  ])
    if (base) {
      const candidate = join(base, "NSIS", "makensis.exe");
      try {
        await access(candidate);
        compiler = candidate;
        break;
      } catch {}
    }
}
const flag = process.platform === "win32" ? "/" : "-";
const args = [
  flag + "WX",
  flag + "V3",
  flag + "INPUTCHARSET",
  "UTF8",
  flag + "DAPP_DIR=" + appDir,
  flag + "DAPP_GLOB=" + join(appDir, "*"),
  flag + "DOUT_FILE=" + output,
  flag + "DAPP_ICON=" + join(root, "src", "icon.ico"),
  flag + "DUNINSTALL_FILES=" + manifest,
  flag + "DAPP_SIZE_KB=" + Math.ceil(size / 1024),
  join(root, "scripts", "installer.nsi"),
];
const result = await exec(compiler, args, {
  maxBuffer: 4 * 1024 * 1024,
  timeout: 600000,
});
console.log(result.stdout.trim());
const header = await readFile(output);
if (header.subarray(0, 2).toString() !== "MZ")
  throw Error("Invalid installer executable");
console.log("Installer ready: " + output);
export const installerPath = output;
