const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      minlength: [2, "Category name must be at least 2 characters"],
      maxlength: [40, "Category name must not exceed 40 characters"],
    },

    // lower-case copy used for the case-insensitive uniqueness check
    nameKey: {
      type: String,
      required: true,
      select: false,
    },

    image: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
    },

    specTemplate: { type: [String], default: [] },

    // soft delete
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Only ONE active category may use a name. Deleted ones can be re-created.
categorySchema.index(
  { nameKey: 1 },
  { unique: true, name: "taxonomy_active_name_unique", partialFilterExpression: { isDeleted: false } }
);
categorySchema.index({ isDeleted: 1, createdAt: -1 });

module.exports = mongoose.model("Category", categorySchema);
