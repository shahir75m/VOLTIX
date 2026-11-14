import assert from "node:assert/strict";
import { test } from "node:test";
import { readRecent, rememberProduct } from "../src/utils/recentlyViewed.js";

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, data };
};
const product = (n) => ({ _id: `p${n}`, name: `Product ${n}`, images: [`https://img.test/${n}.jpg`], price: 100 * n });

test("remembers the newest product first and never lists a product twice", () => {
  const storage = memoryStorage();
  rememberProduct(product(1), storage);
  rememberProduct(product(2), storage);
  rememberProduct(product(1), storage);
  assert.deepEqual(readRecent(storage).map((p) => p._id), ["p1", "p2"]);
});

test("keeps at most 8 products", () => {
  const storage = memoryStorage();
  for (let i = 1; i <= 12; i += 1) rememberProduct(product(i), storage);
  const ids = readRecent(storage).map((p) => p._id);
  assert.equal(ids.length, 8);
  assert.equal(ids[0], "p12");
});

test("corrupt or blocked storage never throws", () => {
  assert.deepEqual(readRecent(memoryStorage({ voltix_recent: "{not json" })), []);
  assert.deepEqual(readRecent(memoryStorage({ voltix_recent: '{"a":1}' })), []);
  const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.deepEqual(readRecent(blocked), []);
  assert.doesNotThrow(() => rememberProduct(product(1), blocked));
});

test("ignores a product without an id", () => {
  const storage = memoryStorage();
  rememberProduct({ name: "x" }, storage);
  assert.deepEqual(readRecent(storage), []);
});
