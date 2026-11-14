const mongoose = require("mongoose");

// A promotional sale / banner. It is shown on the Offers page and (optionally) on the home page.
// It does not change product prices – real discounts come from coupons or product MRP.
const offerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    appliesTo: { type: String, enum: ["all", "category", "custom"], default: "category" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    discountLabel: { type: String, trim: true, maxlength: 40, default: "" }, // e.g. "Up to 30% off"
    description: { type: String, trim: true, maxlength: 160, default: "" },
    linkUrl: { type: String, trim: true, maxlength: 200, default: "" }, // only for appliesTo = custom
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    image: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
    },
    // where the banner appears
    showOnHome: { type: Boolean, default: false }, // big slider on the home page
    showOnOffers: { type: Boolean, default: true }, // card on the Offers page
    sortOrder: { type: Number, default: 0 }, // smaller number = shown first
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

offerSchema.index({ isDeleted: 1, isActive: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("Offer", offerSchema);
