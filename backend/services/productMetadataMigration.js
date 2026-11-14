const migrateProductMetadata = async (db) => {
  const products = db.collection("products");
  const docs = await products.find({}, { projection: { name: 1, slug: 1, sku: 1, variants: 1 } }).toArray();
  for (const doc of docs) {
    const skuKeys = [doc.sku, ...(doc.variants || []).map((v) => v.sku)].filter(Boolean).map((s) => s.trim().toUpperCase());
    const patch = { skuKeys };
    if (!doc.slug) patch.slug = `${(doc.name || "product").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "product"}-${doc._id}`;
    await products.updateOne({ _id: doc._id }, { $set: patch });
  }
  await products.createIndex({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: "string", $gt: "" } } });
  await products.createIndex({ skuKeys: 1 }, { name: "product_variant_skus_unique", unique: true, partialFilterExpression: { isDeleted: false, "skuKeys.0": { $exists: true } } });
};
module.exports = migrateProductMetadata;
