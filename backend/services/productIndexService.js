// Replace only the obsolete full SKU constraint, after its replacement exists.
// Empty SKUs and soft-deleted products must not prevent a new product being saved.
const ensureProductIndexes = async (db) => {
  const products = db.collection("products");
  await products.createIndex(
    { sku: 1 },
    {
      name: "sku_active_unique",
      unique: true,
      partialFilterExpression: { isDeleted: false, sku: { $type: "string", $gt: "" } },
    }
  );
  const indexes = await products.indexes();
  for (const index of indexes) {
    if (
      index.name !== "sku_active_unique" && index.unique &&
      Object.keys(index.key).length === 1 && index.key.sku === 1 &&
      !index.partialFilterExpression
    ) {
      await products.dropIndex(index.name);
    }
  }
};

module.exports = ensureProductIndexes;
