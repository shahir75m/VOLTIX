const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    title: { type: String, trim: true, maxlength: 80, default: "" },
    comment: { type: String, trim: true, maxlength: 1000, default: "" },
    photos: { type: [{ url: String, publicId: String, _id: false }], default: [] }, // up to 3 customer photos
    isVerifiedPurchase: { type: Boolean, default: true },
    isHidden: { type: Boolean, default: false }, // hidden by the admin (not shown, not counted)
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// a customer reviews a product once (they can edit it)
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, isDeleted: 1, isHidden: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
