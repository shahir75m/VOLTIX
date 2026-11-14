import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminSessionCache } from "./adminSessionCache.js";

test("overlapping admin checks share one request and reuse its successful result", async () => {
  let calls = 0;
  let resolve;
  const cache = createAdminSessionCache(() => { calls += 1; return new Promise((done) => { resolve = done; }); });
  const first = cache.load();
  const second = cache.load();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve({ role: "admin" });
  await first;
  assert.equal((await cache.load()).role, "admin");
  assert.equal(calls, 1);
});

test("expired sessions are rechecked and logout clears a valid cached session", async () => {
  let clock = 0;
  let calls = 0;
  const cache = createAdminSessionCache(async () => ({ role: "admin", request: ++calls }), { now: () => clock, ttl: 100 });
  await cache.load();
  clock = 100;
  assert.equal(cache.peek(), null);
  assert.equal((await cache.load()).request, 2);
  cache.clear();
  assert.equal(cache.peek(), null);
  assert.equal((await cache.load()).request, 3);
});

test("a rejected session check is never cached and a later request can recover", async () => {
  let calls = 0;
  const cache = createAdminSessionCache(async () => {
    if (++calls === 1) throw new Error("Unauthorized");
    return { role: "admin" };
  });
  await assert.rejects(cache.load(), /Unauthorized/);
  assert.equal(cache.peek(), null);
  assert.equal((await cache.load()).role, "admin");
});

test("an old request completing after logout cannot restore the cleared session", async () => {
  const resolvers = [];
  const cache = createAdminSessionCache(() => new Promise((resolve) => resolvers.push(resolve)));
  const old = cache.load();
  await Promise.resolve();
  cache.clear();
  const current = cache.load();
  await Promise.resolve();
  resolvers[1]({ role: "admin", account: "current" });
  await current;
  resolvers[0]({ role: "admin", account: "old" });
  await old;
  assert.equal(cache.peek().account, "current");
});

test("background refresh never extends an expired session before a successful server response", async () => {
  let clock = 0;
  let resolveRefresh;
  let calls = 0;
  const cache = createAdminSessionCache(() => ++calls === 1 ? Promise.resolve({ role: "admin" }) : new Promise((resolve) => { resolveRefresh = resolve; }), { now: () => clock, ttl: 100 });
  await cache.load();
  clock = 80;
  const refresh = cache.load({ force: true });
  await Promise.resolve();
  assert.equal(cache.remaining(), 20);
  clock = 100;
  assert.equal(cache.peek(), null);
  resolveRefresh({ role: "admin" });
  await refresh;
  assert.equal(cache.peek().role, "admin");
  assert.equal(cache.remaining(), 100);
});
