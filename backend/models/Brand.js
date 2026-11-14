const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Brand name is required"],
      trim: true,
      minlength: [2, "Brand name must be at least 2 characters"],
      maxlength: [40, "Brand name must not exceed 40 characters"],
    },
    nameKey: { type: String, required: true, select: false },
    image: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

brandSchema.index({ nameKey: 1 }, { unique: true, name: "taxonomy_active_name_unique", partialFilterExpression: { isDeleted: false } });
brandSchema.index({ isDeleted: 1, createdAt: -1 });

module.exports = mongoose.model("Brand", brandSchema);
