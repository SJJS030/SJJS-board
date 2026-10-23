import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

test("production API handles memo and admin flows with a local Supabase API double", { timeout: 120_000 }, async (t) => {
  const memos = new Map();
  const counts = new Map();
  let databaseDown = false;
  const backend = createServer(async (request, response) => {
    const reply = (status, data) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(data));
    };
    if (request.headers.apikey !== "test-service-key") return reply(401, { message: "Wrong key" });
    if (databaseDown) return reply(503, { message: "Test database unavailable" });
    const url = new URL(request.url, "http://localhost");
    let text = "";
    for await (const chunk of request) text += chunk;
    const body = text ? JSON.parse(text) : {};
    if (url.pathname === "/rest/v1/rpc/consume_rate_limit") {
      const count = (counts.get(body.p_key) ?? 0) + 1;
      counts.set(body.p_key, count);
      return reply(200, count <= body.p_limit);
    }
    if (url.pathname !== "/rest/v1/memos") return reply(404, {});
    const filter = url.searchParams.get("id");
    if (request.method === "POST") {
      const memo = { id: randomUUID(), ...body, created_at: new Date().toISOString() };
      memos.set(memo.id, memo);
      const { password_hash: hash, ...publicMemo } = memo;
      assert.ok(hash.startsWith("$2"));
      return reply(201, publicMemo);
    }
    const selected = [...memos.values()].filter((memo) => !filter?.startsWith("eq.") || memo.id === filter.slice(3));
    if (request.method === "GET") return reply(200, selected.map(({ id, password_hash }) => ({ id, password_hash })));
    if (request.method === "DELETE") {
      selected.forEach((memo) => memos.delete(memo.id));
      return reply(200, selected.map(({ id }) => ({ id })));
    }
    return reply(405, {});
  });
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const password = "sjjs-test-admin-password";
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(), windowsHide: true,
    env: {
      ...process.env, NODE_ENV: "production", VERCEL: "0",
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${backend.address().port}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
      ADMIN_PASSWORD_HASH: await bcrypt.hash(password, 4),
      ADMIN_SESSION_SECRET: "test-session-secret-at-least-32-characters",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (data) => { logs += data; });
  child.stderr.on("data", (data) => { logs += data; });
  const exited = once(child, "exit");
  async function post(path, body, cookie, extraHeaders = {}) {
    return fetch(`${origin}${path}`, {
      method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extraHeaders },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }
  const create = () => post("/api/memos", { title: "테스트 메모", content: "내용입니다.", password: "1234" });
  try {
    const deadline = Date.now() + 45_000;
    while (true) {
      try { if ((await fetch(origin)).ok) break; } catch { /* Wait for server startup. */ }
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Production server did not start: ${logs}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await t.test("SJJS homepage and unauthenticated session", async () => {
      const html = await (await fetch(origin)).text();
      assert.match(html, /SJJS/);
      assert.doesNotMatch(html, /MINDLET/);
      assert.deepEqual(await (await fetch(`${origin}/api/admin/session`)).json(), { isAdmin: false });
      for (const path of ["/api/admin/delete", "/api/admin/delete-all"]) assert.equal((await post(path, {})).status, 401);
    });
    await t.test("malformed requests produce 4xx responses", async () => {
      for (const body of ["null", "[]", "{"]) assert.equal((await post("/api/memos", body)).status, 400);
      assert.equal((await post("/api/memos", {}, undefined, { "content-type": "text/plain" })).status, 415);
      assert.equal((await post("/api/memos", {}, undefined, { origin: "https://attacker.example" })).status, 403);
      assert.equal((await post("/api/memos/delete", { id: "bad-id", password: "1234" })).status, 400);
      assert.equal((await post("/api/memos", { title: "x", content: "x", password: "12" })).status, 400);
      assert.equal((await post("/api/admin/login", { password: 123 })).status, 400);
    });
    await t.test("create hashes passwords, wrong PIN cannot delete, correct PIN deletes", async () => {
      const response = await create();
      assert.equal(response.status, 201);
      const { memo } = await response.json();
      assert.equal(memo.password_hash, undefined);
      assert.equal(await bcrypt.compare("1234", memos.get(memo.id).password_hash), true);
      assert.equal((await post("/api/memos/delete", { id: memo.id, password: "0000" })).status, 403);
      assert.equal(memos.has(memo.id), true);
      assert.equal((await post("/api/memos/delete", { id: memo.id, password: "1234" })).status, 200);
      assert.equal(memos.has(memo.id), false);
      assert.equal((await post("/api/memos/delete", { id: memo.id, password: "1234" })).status, 404);
    });
    await t.test("admin cookie authenticates, rejects tampering and protects deletion", async () => {
      assert.equal((await post("/api/admin/login", { password: "wrong" })).status, 401);
      const response = await post("/api/admin/login", { password });
      assert.equal(response.status, 200);
      const header = response.headers.get("set-cookie");
      assert.match(header, /HttpOnly/i);
      assert.match(header, /Secure/i);
      assert.match(header, /SameSite=Strict/i);
      const cookie = header.split(";")[0];
      assert.deepEqual(await (await fetch(`${origin}/api/admin/session`, { headers: { cookie } })).json(), { isAdmin: true });
      assert.deepEqual(await (await fetch(`${origin}/api/admin/session`, { headers: { cookie: `${cookie}bad` } })).json(), { isAdmin: false });
      const { memo } = await (await create()).json();
      assert.equal((await post("/api/admin/delete", { id: memo.id }, cookie)).status, 200);
      assert.equal((await post("/api/admin/delete", { id: memo.id }, cookie)).status, 404);
      await create();
      await create();
      assert.equal((await post("/api/admin/delete-all", {}, cookie, { origin: "https://attacker.example" })).status, 403);
      assert.equal(memos.size, 2);
      assert.equal((await post("/api/admin/delete-all", {}, cookie)).status, 200);
      assert.equal(memos.size, 0);
      const logout = await post("/api/admin/logout", {}, cookie);
      assert.equal(logout.status, 200);
      assert.match(logout.headers.get("set-cookie"), /Max-Age=0/i);
    });
    await t.test("database failures fail closed and excessive login attempts return 429", async () => {
      databaseDown = true;
      assert.equal((await create()).status, 503);
      databaseDown = false;
      counts.clear();
      for (let attempt = 0; attempt < 10; attempt++) assert.equal((await post("/api/admin/login", { password: "wrong" })).status, 401);
      const limited = await post("/api/admin/login", { password });
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get("retry-after"), "600");
      counts.clear();
      const { memo } = await (await create()).json();
      for (let attempt = 0; attempt < 10; attempt++) assert.equal((await post("/api/memos/delete", { id: memo.id, password: "0000" })).status, 403);
      assert.equal((await post("/api/memos/delete", { id: memo.id, password: "1234" })).status, 429);
      assert.equal(memos.has(memo.id), true);
    });
  } finally {
    child.kill();
    await exited;
    backend.closeAllConnections();
    await new Promise((resolve) => backend.close(resolve));
  }
});
