const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 20 },
    description: { type: String, trim: true, maxlength: 160, default: "" },
    discountType: { type: String, enum: ["percent", "flat"], required: true },
    discountValue: { type: Number, required: true, min: 1 },
    maxDiscount: { type: Number, min: 0, default: 0 }, // cap for percentage coupons (0 = no cap)
    minOrder: { type: Number, min: 0, default: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null }, // null = every category
    firstOrderOnly: { type: Boolean, default: false },
    perUserLimit: { type: Number, min: 1, default: 1 }, // times ONE customer can use it
    usageLimit: { type: Number, min: 0, default: 0 }, // total uses (0 = unlimited)
    usedCount: { type: Number, min: 0, default: 0 },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    showOnOffersPage: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// one live coupon per code (deleted codes can be created again)
couponSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

module.exports = mongoose.model("Coupon", couponSchema);
