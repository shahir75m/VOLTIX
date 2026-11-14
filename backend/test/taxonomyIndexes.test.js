const assert = require("node:assert/strict");
const { test } = require("node:test");
const ensureTaxonomyIndexes = require("../services/taxonomyIndexService");

test("taxonomy index migration replaces legacy full unique indexes with active-only indexes", async () => {
  const calls = [];
  const collection = (name) => ({
    async indexes() { return [
      { name: "_id_", key: { _id: 1 } },
      { name: "nameKey_1", key: { nameKey: 1 }, unique: true },
      { name: "name_1", key: { name: 1 }, unique: true },
      { name: "normalizedName_1", key: { normalizedName: 1 }, unique: true },
    ]; },
    // legacy records: the first has no nameKey / isDeleted yet, the second is already migrated
    find() {
      const docs = [{ _id: "a1", name: "  Audio   Gear " }, { _id: "a2", name: "Phones", nameKey: "phones", isDeleted: false }];
      return { async *[Symbol.asyncIterator]() { yield* docs; } };
    },
    async updateOne(filter, update) { calls.push(`${name}:update:${filter._id}:${update.$set.nameKey}:${update.$set.isDeleted}`); },
    async dropIndex(index) { calls.push(`${name}:drop:${index}`); },
    async createIndex(key, options) {
      assert.deepEqual(key, { nameKey: 1 });
      assert.equal(options.unique, true);
      assert.equal(options.partialFilterExpression.isDeleted, false);
      calls.push(`${name}:create:${options.name}`);
    },
  });
  await ensureTaxonomyIndexes({ collection });
  assert.deepEqual(calls, [
    "categories:drop:nameKey_1", "categories:drop:name_1", "categories:drop:normalizedName_1", "categories:update:a1:audio gear:false", "categories:create:taxonomy_active_name_unique",
    "brands:drop:nameKey_1", "brands:drop:name_1", "brands:drop:normalizedName_1", "brands:update:a1:audio gear:false", "brands:create:taxonomy_active_name_unique",
  ]);
});
