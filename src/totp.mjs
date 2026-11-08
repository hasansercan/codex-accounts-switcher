import { createHmac } from "node:crypto";
export function parseSecret(value) {
  if (typeof value !== "string" || value.length > 4096)
    throw Error("Geçerli bir 2FA kurulum anahtarı girin.");
  let secret = value.trim(),
    algorithm = "sha1",
    digits = 6,
    period = 30;
  if (secret.startsWith("otpauth://")) {
    let u;
    try {
      u = new URL(secret);
    } catch {
      throw Error("2FA bağlantısı geçersiz.");
    }
    if (u.hostname !== "totp")
      throw Error("Yalnızca zamana dayalı TOTP bağlantıları desteklenir.");
    secret = u.searchParams.get("secret") || "";
    algorithm = (u.searchParams.get("algorithm") || "SHA1").toLowerCase();
    digits = Number(u.searchParams.get("digits") || 6);
    period = Number(u.searchParams.get("period") || 30);
  }
  secret = secret.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (
    !/^[A-Z2-7]{16,1024}$/.test(secret) ||
    !["sha1", "sha256", "sha512"].includes(algorithm) ||
    ![6, 8].includes(digits) ||
    !Number.isInteger(period) ||
    period < 15 ||
    period > 120
  )
    throw Error("2FA kurulum anahtarı veya TOTP ayarları geçersiz.");
  let bits = 0,
    acc = 0;
  const bytes = [];
  for (const ch of secret) {
    acc = (acc << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >>> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  if (acc !== 0) throw Error("Base32 anahtarı geçersiz.");
  return { secret, algorithm, digits, period, key: Buffer.from(bytes) };
}
export function totp(value, time = Date.now() / 1000) {
  const c = parseSecret(value),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / c.period)));
  const h = createHmac(c.algorithm, c.key).update(counter).digest(),
    o = h.at(-1) & 15;
  return {
    code: String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** c.digits).padStart(
      c.digits,
      "0",
    ),
    remaining: c.period - Math.floor(time % c.period),
    period: c.period,
  };
}
