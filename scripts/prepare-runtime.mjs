import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
  stat,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { x } from "tar";
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  platform = "win32-x64",
  cache = join(root, ".cache"),
  runtime = join(root, "runtime", platform);
await mkdir(cache, { recursive: true });
await mkdir(runtime, { recursive: true });
const packages = [
  {
    name: "@loongphy/codex-auth-win32-x64",
    version: "0.3.1",
    file: "bin/codex-auth.exe",
    out: "codex-auth.exe",
  },
  {
    name: "@openai/codex",
    version: "0.162.0-win32-x64",
    file: "vendor/x86_64-pc-windows-msvc/bin/codex.exe",
    out: "codex.exe",
  },
];
const lock = JSON.parse(
  await readFile(join(root, "runtime-lock.json"), "utf8"),
);
for (const p of packages) {
  const expected = lock.find(
    (v) => v.name === p.name && v.version === p.version,
  );
  if (!expected) throw Error("Missing runtime integrity pin");
  const file = join(cache, p.out + ".tgz");
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    const response = await fetch(expected.url);
    if (!response.ok) throw Error("Runtime download failed: " + p.name);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(file, bytes);
  }
  const actual =
    "sha512-" + createHash("sha512").update(bytes).digest("base64");
  if (actual !== expected.integrity)
    throw Error("Runtime integrity mismatch: " + p.name);
  const stage = join(cache, p.out + "-unpacked");
  await mkdir(stage, { recursive: true });
  await x({
    file,
    cwd: stage,
    filter: (name) =>
      name === "package/" + p.file || name === "package/LICENSE",
    strict: true,
  });
  await copyFile(join(stage, "package", p.file), join(runtime, p.out));
  await rm(stage, { recursive: true, force: true });
  const binary = await readFile(join(runtime, p.out));
  if (binary.subarray(0, 2).toString() !== "MZ")
    throw Error("Not a Windows executable: " + p.out);
  console.log(
    p.out +
      ": verified Windows x64 executable (" +
      Math.round((await stat(join(runtime, p.out))).size / 1048576) +
      " MB)",
  );
}
