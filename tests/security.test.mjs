import assert from "node:assert/strict";
import { test } from "node:test";
import { ADMIN_SESSION_SECONDS, createAdminSessionToken, verifyAdminSessionToken } from "../lib/adminToken.ts";
import { ApiError, apiError, checkOrigin, readJsonObject, requireMemoId } from "../lib/api.ts";

test("admin tokens reject expiry, tampering, old format and changed credentials", () => {
  process.env.ADMIN_SESSION_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.ADMIN_PASSWORD_HASH = "test-password-hash";
  const now = Date.now();
  const token = createAdminSessionToken(now);
  assert.equal(verifyAdminSessionToken(token, now), true);
  assert.notEqual(createAdminSessionToken(now), token);
  assert.equal(verifyAdminSessionToken(token, now + ADMIN_SESSION_SECONDS * 1000), false);
  assert.equal(verifyAdminSessionToken(token.replace("sjjs-v1", "sjjs-v2"), now), false);
  assert.equal(verifyAdminSessionToken(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"), now), false);
  assert.equal(verifyAdminSessionToken("mindlet-admin-v1.anything", now), false);
  process.env.ADMIN_PASSWORD_HASH = "changed-password-hash";
  assert.equal(verifyAdminSessionToken(token, now), false);
  process.env.ADMIN_PASSWORD_HASH = "test-password-hash";
  process.env.ADMIN_SESSION_SECRET = "changed-secret-that-is-at-least-32-characters";
  assert.equal(verifyAdminSessionToken(token, now), false);
  process.env.ADMIN_SESSION_SECRET = "short";
  assert.throws(() => createAdminSessionToken(), /32/);
  assert.equal(verifyAdminSessionToken(token, now), false);
});

function request(body, headers = {}) {
  return new Request("https://sjjs.example/api/memos", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body,
  });
}

test("JSON validation returns client errors for invalid and oversized requests", async () => {
  for (const body of ["null", "[]", '"text"', "{", ""]) {
    await assert.rejects(readJsonObject(request(body)), (error) => error instanceof ApiError && error.status === 400);
  }
  await assert.rejects(readJsonObject(request("{}", { "content-type": "text/plain" })), { status: 415 });
  await assert.rejects(readJsonObject(request("{}", { origin: "https://attacker.example" })), { status: 403 });
  await assert.rejects(readJsonObject(request(JSON.stringify({ text: "가".repeat(6000) }))), { status: 413 });
  assert.deepEqual(await readJsonObject(request('{"title":"메모"}', { origin: "https://sjjs.example" })), { title: "메모" });
});

test("invalid IDs fail before database access and rate errors include retry instructions", async () => {
  for (const id of [null, 123, "", "not-a-uuid"]) assert.throws(() => requireMemoId(id), { status: 400 });
  requireMemoId("12b6e3b2-2335-4c42-a74f-342418952650");
  const response = apiError(new ApiError(429, "retry"), "fallback");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "600");
  assert.deepEqual(await response.json(), { error: "retry" });
});

test("origin checks accept Next.js localhost normalization while rejecting foreign hosts", () => {
  const request = (origin) => new Request("http://localhost:3000/api/memos", {
    headers: { host: "127.0.0.1:3000", origin },
  });
  assert.doesNotThrow(() => checkOrigin(request("http://127.0.0.1:3000")));
  assert.throws(() => checkOrigin(request("http://attacker.example")), { status: 403 });
  assert.throws(() => checkOrigin(request("http://127.0.0.1:4000")), { status: 403 });
  assert.throws(() => checkOrigin(request("https://127.0.0.1:3000")), { status: 403 });
});
