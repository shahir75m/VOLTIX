const mongoose = require("mongoose");
const ensureProductIndexes = require("../services/productIndexService");
const ensureTaxonomyIndexes = require("../services/taxonomyIndexService");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await ensureProductIndexes(mongoose.connection.db);
    await ensureTaxonomyIndexes(mongoose.connection.db);
    await require("../services/productMetadataMigration")(mongoose.connection.db);

    console.log("MongoDB Connected Successfully");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
