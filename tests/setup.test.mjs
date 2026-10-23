import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { test } from "node:test";
import bcrypt from "bcryptjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

test("setup hides secrets and generates a bcrypt hash that Next.js loads intact", { timeout: 15_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "sjjs-setup-"));
  const script = fileURLToPath(new URL("../scripts/setup-env.mjs", import.meta.url));
  const password = "test-admin-password-123";
  const run = async (answers = []) => {
    const child = spawn(process.execPath, [script], { cwd: directory, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let index = 0;
    child.stdout.on("data", (data) => {
      output += data;
      if (index < answers.length && output.includes(answers[index][0])) {
        child.stdin.write(`${answers[index++][1]}\n`);
      }
    });
    child.stderr.on("data", (data) => { output += data; });
    const [code] = await once(child, "exit");
    return { code, output };
  };
  try {
    const result = await run([
      ["프로젝트 URL:", "https://example.supabase.co"],
      ["레거시 anon 키", "test-anon-key"],
      ["레거시 service_role 키", "test-service-key"],
      ["관리자 비밀번호 (", password],
      ["관리자 비밀번호 확인", password],
    ]);
    assert.equal(result.code, 0, result.output);
    for (const value of [password, "test-anon-key", "test-service-key"]) assert.equal(result.output.includes(value), false);
    const contents = await readFile(join(directory, ".env.local"), "utf8");
    assert.ok(contents.includes("\\$2"));
    const { parsedEnv } = loadEnvConfig(directory, true, { info() {}, error() {} }, true);
    assert.equal(await bcrypt.compare(password, parsedEnv.ADMIN_PASSWORD_HASH), true);
    assert.equal(parsedEnv.NEXT_PUBLIC_SUPABASE_URL, "https://example.supabase.co");
    assert.equal(parsedEnv.ADMIN_SESSION_SECRET.length, 64);
    const second = await run();
    assert.equal(second.code, 1);
    assert.equal(await readFile(join(directory, ".env.local"), "utf8"), contents);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.match(basename(directory), /^sjjs-setup-/);
    await rm(directory, { recursive: true, force: true });
  }
});
