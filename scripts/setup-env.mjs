import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import bcrypt from "bcryptjs";

let hidden = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!hidden) process.stdout.write(chunk, encoding);
    callback();
  },
});
const input = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });

async function ask(label, secret = false, trim = true) {
  process.stdout.write(label);
  hidden = secret;
  try {
    const value = await input.question("");
    return trim ? value.trim() : value;
  } finally {
    hidden = false;
    if (secret) process.stdout.write("\n");
  }
}

try {
  let exists = false;
  try { await access(".env.local"); exists = true; } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (exists) throw new Error(".env.local이 이미 있습니다. 기존 파일을 직접 수정해 주세요.");
  const url = await ask("Supabase 프로젝트 URL: ");
  if (new URL(url).protocol !== "https:") throw new Error("Supabase HTTPS URL을 입력해 주세요.");
  const anonKey = await ask("Supabase 레거시 anon 키 (eyJ로 시작, 입력 숨김): ", true);
  const serviceKey = await ask("Supabase 레거시 service_role 키 (eyJ로 시작, 입력 숨김): ", true);
  const password = await ask("관리자 비밀번호 (12자 이상, UTF-8 72바이트 이하, 입력 숨김): ", true, false);
  if (password.length < 12 || Buffer.byteLength(password) > 72) throw new Error("관리자 비밀번호 길이를 확인해 주세요.");
  const confirmation = await ask("관리자 비밀번호 확인 (입력 숨김): ", true, false);
  if (password !== confirmation) throw new Error("비밀번호가 일치하지 않습니다.");
  if (!anonKey || !serviceKey) throw new Error("Supabase 키를 모두 입력해 주세요.");
  const hash = await bcrypt.hash(password, 12);
  // Next.js expands dollar signs in .env files, including bcrypt's separators.
  const escape = (value) => JSON.stringify(value).replaceAll("$", "\\$");
  const contents = [
    "# Supabase 레거시 API 키 방식 (anon / service_role)",
    `NEXT_PUBLIC_SUPABASE_URL=${escape(url)}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${escape(anonKey)}`,
    `SUPABASE_SERVICE_ROLE_KEY=${escape(serviceKey)}`,
    `ADMIN_PASSWORD_HASH=${escape(hash)}`,
    `ADMIN_SESSION_SECRET=${randomBytes(32).toString("hex")}`,
    "",
  ].join("\n");
  await writeFile(".env.local", contents, { flag: "wx", mode: 0o600 });
  console.log(".env.local을 만들었습니다. npm run dev로 실행할 수 있습니다.");
  console.log("Vercel에 ADMIN_PASSWORD_HASH를 입력할 때는 $ 앞의 역슬래시를 제거하세요.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "환경 변수 파일을 만들지 못했습니다.");
  process.exitCode = 1;
} finally {
  input.close();
}
