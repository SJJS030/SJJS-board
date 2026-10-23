import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_SECONDS = 60 * 60 * 8;

export function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET은 32자 이상이어야 합니다.");
  }
  return secret;
}

function signature(payload: string) {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!passwordHash) throw new Error("관리자 비밀번호가 설정되지 않았습니다.");
  return createHmac("sha256", getSessionSecret())
    .update(`${payload}.${passwordHash}`)
    .digest("hex");
}

export function createAdminSessionToken(now = Date.now()) {
  const expires = Math.floor(now / 1000) + ADMIN_SESSION_SECONDS;
  const payload = `sjjs-v1.${expires}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminSessionToken(token: string, now = Date.now()) {
  const match = /^sjjs-v1\.(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  const seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + ADMIN_SESSION_SECONDS) return false;
  try {
    const payload = token.slice(0, token.lastIndexOf("."));
    return timingSafeEqual(Buffer.from(match[3], "hex"), Buffer.from(signature(payload), "hex"));
  } catch {
    return false;
  }
}
