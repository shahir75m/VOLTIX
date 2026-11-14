const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    alt: { type: String, trim: true, maxlength: 160, default: "" },
  },
  { _id: false }
);

const highlightSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    value: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { _id: false }
);

// One purchasable option of a product (Amazon style): a value for every variant option
// (e.g. Colour = Black, Storage = 128 GB) plus its own price, MRP and stock.
const variantAttributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 20 },
    value: { type: String, required: true, trim: true, maxlength: 30 },
    hex: { type: String, default: "" }, // only used for colours
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema({
  imagePublicId: { type: String, default: "" },
  attributes: { type: [variantAttributeSchema], default: [] },
  price: { type: Number, required: true, min: 0 },
  mrp: { type: Number, default: 0, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  sku: { type: String, trim: true, uppercase: true, maxlength: 30, default: "" },
});

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    description: { type: String, trim: true, default: "", maxlength: 10000 },
    shortDescription: { type: String, trim: true, default: "", maxlength: 300 },
    modelNumber: { type: String, trim: true, default: "", maxlength: 80 },
    slug: { type: String, trim: true, lowercase: true, default: "" },
    gstPercent: { type: Number, min: 0, max: 100, default: 0 },
    taxInclusive: { type: Boolean, default: true, enum: [true] },
    costPrice: { type: Number, min: 0, default: 0, select: false },
    warrantyPeriod: { type: String, trim: true, maxlength: 80, default: "" },
    warrantyType: { type: String, trim: true, maxlength: 120, default: "" },
    boxContents: { type: [String], default: [] },
    keyFeatures: { type: [String], default: [] }, // 4-5 short benefit bullets shown near the top
    videoUrl: { type: String, trim: true, maxlength: 300, default: "" }, // YouTube / Vimeo / direct .mp4 link
    weightGrams: { type: Number, min: 0, default: 0 },
    codAvailable: { type: Boolean, default: true },
    deliveryCharge: { type: Number, min: 0, default: 0 },
    // updated by the review controller whenever a review is added, changed, hidden or deleted
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    isFeatured: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    skuKeys: { type: [String], default: [], select: false },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
      index: true,
    },

    // With variants these three are DERIVED by the server:
    // price/mrp = the cheapest variant, stock = sum of all variant stock.
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, default: 0, min: 0 }, // 0 = no discount shown
    stock: { type: Number, required: true, min: 0, default: 0 },

    variantOptions: { type: [String], default: [] }, // e.g. ["Colour", "Storage"]
    variants: { type: [variantSchema], default: [] },

    sku: { type: String, trim: true, uppercase: true, maxlength: 30, default: "" },

    images: { type: [imageSchema], default: [] },
    highlights: { type: [highlightSchema], default: [] },

    isPublished: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false }, // blocked by admin
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

productSchema.index({ isDeleted: 1, createdAt: -1 });
productSchema.index({ isDeleted: 1, isPublished: 1, isBlocked: 1, price: 1 });
// SKU must be unique among products that are not deleted (empty SKU is allowed many times)
productSchema.index(
  { sku: 1 },
  {
    name: "sku_active_unique",
    unique: true,
    partialFilterExpression: { isDeleted: false, sku: { $type: "string", $gt: "" } },
  }
);

productSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: "string", $gt: "" } } });
productSchema.index({ skuKeys: 1 }, { name: "product_variant_skus_unique", unique: true,
  partialFilterExpression: { isDeleted: false, "skuKeys.0": { $exists: true } } });
productSchema.pre("validate", function () {
  this.skuKeys = [this.sku, ...this.variants.map((v) => v.sku)].filter(Boolean).map((s) => s.toUpperCase());
  if (new Set(this.skuKeys).size !== this.skuKeys.length) this.invalidate("sku", "Product and variant SKUs must be different");
  if (this.variants.length) {
    const cheapest = this.variants.reduce((a, b) => a.price <= b.price ? a : b);
    this.price = cheapest.price;
    this.mrp = cheapest.mrp > cheapest.price ? cheapest.mrp : 0;
    this.stock = this.variants.reduce((sum, v) => sum + v.stock, 0);
  }
  if (this.isPublished) {
    if (!this.category) this.invalidate("category", "Select a category before publishing");
    if (!this.brand) this.invalidate("brand", "Select a brand before publishing");
    if (!this.images.length) this.invalidate("images", "Add an image before publishing");
    if (this.price <= 0 || this.variants.some((v) => v.price <= 0)) this.invalidate("price", "Selling price must be greater than zero");
  }
});

module.exports = mongoose.model("Product", productSchema);
