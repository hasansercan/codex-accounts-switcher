import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import extract from "@electron-internal/extract-zip";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const electronDir = join(root, "node_modules", "electron");
const pkg = JSON.parse(
  await readFile(join(electronDir, "package.json"), "utf8"),
);
const checksums = JSON.parse(
  await readFile(join(electronDir, "checksums.json"), "utf8"),
);
export const zipDir = join(root, ".cache", "electron-zips");
async function hash(file) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}
async function download(url, file, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw Error("Electron download HTTP " + r.status);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
}
export async function ensureElectronZip(platform, arch) {
  const name = `electron-v${pkg.version}-${platform}-${arch}.zip`,
    file = join(zipDir, name),
    expected = checksums[name];
  if (!expected) throw Error("Unsupported Electron target");
  await mkdir(zipDir, { recursive: true });
  try {
    if ((await hash(file)) === expected) return file;
  } catch {}
  const temp = file + ".download";
  await rm(temp, { force: true });
  try {
    await download(
      `https://github.com/electron/electron/releases/download/v${pkg.version}/${name}`,
      temp,
    );
  } catch {
    await rm(temp, { force: true });
    console.log("Using official GitHub release API for " + name);
    const headers = {
      "User-Agent": "codex-accounts-switcher-build",
      Accept: "application/vnd.github+json",
    };
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN)
      headers.Authorization =
        "Bearer " + (process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
    const response = await fetch(
      `https://api.github.com/repos/electron/electron/releases/tags/v${pkg.version}`,
      { headers, signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok)
      throw Error(
        "Cannot read official Electron release metadata: HTTP " +
          response.status,
      );
    const asset = (await response.json()).assets.find((a) => a.name === name);
    if (!asset) throw Error("Official Electron release asset not found");
    try {
      await download(asset.url, temp, {
        ...headers,
        Accept: "application/octet-stream",
      });
    } catch {
      // GitHub CLI is optional; uses the user's existing login, never stores credentials here.
      await new Promise((resolve, reject) => {
        const child = spawn(
          "gh",
          [
            "api",
            `repos/electron/electron/releases/assets/${asset.id}`,
            "-H",
            "Accept: application/octet-stream",
          ],
          { stdio: ["ignore", "pipe", "inherit"], windowsHide: true },
        );
        const stream = pipeline(child.stdout, createWriteStream(temp));
        child.on("error", reject);
        child.on("close", async (code) => {
          try {
            await stream;
            if (code !== 0) throw Error("GitHub CLI Electron download failed");
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    }
  }
  if ((await hash(temp)) !== expected) {
    await rm(temp, { force: true });
    throw Error("Electron SHA-256 mismatch: " + name);
  }
  await rename(temp, file);
  console.log(name + ": official SHA-256 verified");
  return file;
}
export async function installHostElectron() {
  const file = await ensureElectronZip(process.platform, process.arch),
    dist = join(electronDir, "dist");
  await mkdir(dist, { recursive: true });
  await extract(file, { dir: dist });
  const entry =
    process.platform === "darwin"
      ? "Electron.app/Contents/MacOS/Electron"
      : process.platform === "win32"
        ? "electron.exe"
        : "electron";
  await writeFile(join(electronDir, "path.txt"), entry);
  console.log("Electron host runtime ready.");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await installHostElectron();
