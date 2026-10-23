import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("schema preserves memos and prevents hash access, direct writes and public limiter use", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;");
    const schema = await readFile(new URL("../schema.sql", import.meta.url), "utf8");
    await db.exec(schema);
    await db.exec("insert into memos(title,content,password_hash) values ('기존 메모','내용','secret-hash');");
    // Simulate the original public read/insert permissions before migrating again.
    await db.exec(`
      grant select, insert on memos to anon, authenticated;
      create policy "Anyone can create memos" on memos for insert to anon, authenticated with check (true);
    `);
    await db.exec(schema);
    await db.exec("set role anon;");
    assert.equal((await db.query("select id,title,content,created_at from memos")).rows.length, 1);
    await assert.rejects(db.query("select password_hash from memos"), /permission denied/);
    await assert.rejects(db.query("select * from memos"), /permission denied/);
    await assert.rejects(db.query("insert into memos(title,content,password_hash) values ('x','x','hash')"), /permission denied/);
    await assert.rejects(db.query("delete from memos"), /permission denied/);
    await assert.rejects(db.query("select * from request_rate_limits"), /permission denied/);
    await assert.rejects(db.query("select consume_rate_limit(repeat('a',64),2,600)"), /permission denied/);
    await db.exec("reset role; set role authenticated;");
    await assert.rejects(db.query("select password_hash from memos"), /permission denied/);
    await assert.rejects(db.query("update memos set title='changed'"), /permission denied/);
    await db.exec("reset role; set role service_role;");
    assert.equal((await db.query("select password_hash from memos")).rows[0].password_hash, "secret-hash");
    const consume = async () => (await db.query("select consume_rate_limit(repeat('a',64),2,600) as allowed")).rows[0].allowed;
    assert.equal(await consume(), true);
    assert.equal(await consume(), true);
    assert.equal(await consume(), false);
    assert.equal(await consume(), false);
    await db.exec("update request_rate_limits set expires_at=now()-interval '1 second';");
    assert.equal(await consume(), true);
    await db.exec("delete from memos;");
    assert.equal((await db.query("select id from memos")).rows.length, 0);
  } finally {
    await db.close();
  }
});
