const assert = require("node:assert/strict");
const { test } = require("node:test");
const ensureProductIndexes = require("../services/productIndexService");

test("SKU migration creates the partial constraint before removing the obsolete full constraint", async () => {
  const calls = [];
  const collection = {
    async createIndex(key, options) {
      assert.deepEqual(key, { sku: 1 });
      assert.equal(options.unique, true);
      assert.equal(options.partialFilterExpression.isDeleted, false);
      assert.deepEqual(options.partialFilterExpression.sku, { $type: "string", $gt: "" });
      calls.push("create");
    },
    async indexes() { return [
      { name: "sku_1", key: { sku: 1 }, unique: true },
      { name: "sku_active_unique", key: { sku: 1 }, unique: true, partialFilterExpression: {} },
      { name: "other", key: { name: 1 }, unique: true },
      { name: "compound", key: { sku: 1, name: 1 }, unique: true },
    ]; },
    async dropIndex(name) { calls.push(name); },
  };
  await ensureProductIndexes({ collection: () => collection });
  assert.deepEqual(calls, ["create", "sku_1"]);
});

test("SKU migration preserves the old constraint if its replacement cannot be created", async () => {
  let dropped = false;
  const collection = {
    async createIndex() { throw new Error("index build failed"); },
    async dropIndex() { dropped = true; },
  };
  await assert.rejects(ensureProductIndexes({ collection: () => collection }), /index build failed/);
  assert.equal(dropped, false);
});

test("SKU migration leaves existing partial constraints untouched on subsequent starts", async () => {
  let dropped = false;
  const collection = {
    async createIndex() {},
    async indexes() { return [{ name: "sku_active_unique", key: { sku: 1 }, unique: true, partialFilterExpression: {} }]; },
    async dropIndex() { dropped = true; },
  };
  await ensureProductIndexes({ collection: () => collection });
  assert.equal(dropped, false);
});
