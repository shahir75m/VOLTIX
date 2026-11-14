// Migrate legacy taxonomy records before creating the active-only unique indexes.
// Older records may not have nameKey (or isDeleted), which otherwise makes
// MongoDB index several records under the same null key and abort startup.
const normalizeName = (value) => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase("en")
  .replace(/\s+/g, " ")
  .trim();

module.exports = async function ensureTaxonomyIndexes(db) {
  for (const collectionName of ["categories", "brands"]) {
    const collection = db.collection(collectionName);
    let indexes = [];
    try {
      indexes = await collection.indexes();
    } catch (error) {
      if (error.codeName === "NamespaceNotFound") continue;
      throw error;
    }

    // Remove legacy non-partial unique indexes first; they also prevent safely
    // reusing names from soft-deleted records.
    for (const index of indexes) {
      const onlyNameField = Object.keys(index.key || {}).length === 1 &&
        (index.key.nameKey === 1 || index.key.name === 1 || index.key.normalizedName === 1);
      if (onlyNameField && index.unique && !index.partialFilterExpression) {
        await collection.dropIndex(index.name);
      }
    }

    // Backfill old documents before building the unique index. A missing
    // nameKey is indexed as null, so multiple legacy records cause E11000.
    const cursor = collection.find({
      $or: [
        { nameKey: null },
        { nameKey: { $exists: false } },
        { nameKey: "" },
        { isDeleted: { $exists: false } },
      ],
    });

    for await (const doc of cursor) {
      const update = {};
      if (doc.nameKey == null || doc.nameKey === "") {
        const nameKey = normalizeName(doc.name);
        if (!nameKey) {
          throw new Error(`Cannot create taxonomy index: ${collectionName} record ${doc._id} has no valid name`);
        }
        update.nameKey = nameKey;
      }
      if (doc.isDeleted === undefined) update.isDeleted = false;
      if (Object.keys(update).length) {
        await collection.updateOne({ _id: doc._id }, { $set: update });
      }
    }

    try {
      await collection.createIndex(
        { nameKey: 1 },
        {
          unique: true,
          name: "taxonomy_active_name_unique",
          partialFilterExpression: { isDeleted: false },
        }
      );
    } catch (error) {
      if (error.code === 11000) {
        throw new Error(
          `Cannot create ${collectionName} unique index: there are duplicate active names after normalization. ` +
          `Check records with the same name (case/space differences count as duplicates), fix them, then restart. Original: ${error.message}`
        );
      }
      throw error;
    }
  }
};
