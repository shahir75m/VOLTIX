const mongoose = require("mongoose");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const shop = require("../config/shop");

const stockStatus = (stock) => {
  if (stock <= 0) return "out_of_stock";
  if (stock <= shop.LOW_STOCK_LIMIT) return "low_stock";
  return "in_stock";
};

const discountPercent = (price, mrp) =>
  mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

// ids of categories that customers are allowed to see
const getActiveCategoryIds = () => Category.find({ isDeleted: false }).distinct("_id");

// ONE place that decides what customers may see.
// soft-deleted, unpublished, blocked products and products of deleted categories are always excluded.
const getActiveBrandIds = () => Brand.find({ isDeleted: false }).distinct("_id");

const intersect = (activeIds, wantedIds) => {
  if (!Array.isArray(wantedIds)) return activeIds;
  const wanted = new Set(wantedIds.map(String));
  return activeIds.filter((id) => wanted.has(String(id)));
};

const buildVisibleProductFilter = async (extra = {}, categoryIds = null, brandIds = null) => {
  const [activeCategories, activeBrands] = await Promise.all([getActiveCategoryIds(), getActiveBrandIds()]);
  const allowed = intersect(activeCategories, categoryIds);
  const allowedBrands = intersect(activeBrands, brandIds);

  const filter = {
    isDeleted: false,
    isPublished: true,
    isBlocked: false,
    category: { $in: allowed },
    brand: { $in: allowedBrands },
    ...extra,
  };

  if (shop.HIDE_OUT_OF_STOCK_IN_LISTING) filter.stock = { $gt: 0 };
  return filter;
};

// Same rules for a single, already loaded product (populated category required)
const isVisibleToCustomer = (product) =>
  Boolean(
    product &&
      !product.isDeleted &&
      product.isPublished &&
      !product.isBlocked &&
      product.category &&
      !product.category.isDeleted &&
      product.brand &&
      !product.brand.isDeleted
  );

const refDoc = (value) =>
  value && typeof value === "object" && value._id
    ? { _id: value._id, name: value.name }
    : { _id: value, name: "" };

const variantLabel = (variant) => (variant.attributes || []).map((a) => a.value).join(" · ");

const serializeVariant = (v, images = []) => ({
  image: images.find((img) => img.publicId === v.imagePublicId)?.url || "",
  imageAlt: images.find((img) => img.publicId === v.imagePublicId)?.alt || "",
  stockStatus: stockStatus(v.stock),
  _id: v._id,
  attributes: (v.attributes || []).map((a) => ({ name: a.name, value: a.value, hex: a.hex || "" })),
  label: variantLabel(v),
  price: v.price,
  mrp: v.mrp > v.price ? v.mrp : 0,
  discountPercent: discountPercent(v.price, v.mrp),
  inStock: v.stock > 0,
  // exact count only when it is low – avoids leaking exact inventory
  stockLeft: v.stock > 0 && v.stock <= shop.LOW_STOCK_LIMIT ? v.stock : null,
  maxQuantity: Math.min(shop.MAX_QTY_PER_ITEM, Math.max(v.stock, 0)),
});

const serializeProduct = (product) => {
  const images = (product.images || []).map((img) => img.url);
  const status = stockStatus(product.stock);
  const isNew = Date.now() - new Date(product.createdAt).getTime() < 14 * 24 * 3600 * 1000;
  const percent = discountPercent(product.price, product.mrp);
  const variants = (product.variants || []).map((v) => serializeVariant(v, product.images || []));
  const prices = variants.map((v) => v.price);

  return {
    _id: product._id,
    name: product.name,
    description: product.description,
    shortDescription: product.shortDescription || "",
    modelNumber: product.modelNumber || "",
    slug: product.slug || "",
    gstPercent: product.gstPercent || 0,
    taxInclusive: true,
    warrantyPeriod: product.warrantyPeriod || "",
    warrantyType: product.warrantyType || "",
    boxContents: product.boxContents || [],
    keyFeatures: product.keyFeatures || [],
    videoUrl: product.videoUrl || "",
    returnWindowDays: shop.RETURN_WINDOW_DAYS,
    weightGrams: product.weightGrams || 0,
    codAvailable: product.codAvailable !== false,
    deliveryCharge: product.deliveryCharge || 0,
    ratingAverage: product.ratingAverage || 0,
    ratingCount: product.ratingCount || 0,
    isFeatured: Boolean(product.isFeatured),
    isBestSeller: Boolean(product.isBestSeller),
    tags: product.tags || [],
    imageAlt: product.images?.[0]?.alt || product.name,
    imageDetails: (product.images || []).map((img) => ({ url: img.url, alt: img.alt || product.name })),
    price: product.price,
    mrp: product.mrp > product.price ? product.mrp : 0,
    discountPercent: percent,
    // true when variants have different prices -> show "From ₹x"
    priceFrom: prices.length > 1 && Math.max(...prices) !== Math.min(...prices),
    category: refDoc(product.category),
    brand: refDoc(product.brand),
    image: images[0] || "",
    images,
    highlights: product.highlights || [],
    hasVariants: variants.length > 0,
    variantOptions: product.variantOptions || [],
    variants,
    inStock: product.stock > 0,
    stockStatus: status,
    stockLeft: status === "low_stock" ? product.stock : null,
    maxQuantity: Math.min(shop.MAX_QTY_PER_ITEM, Math.max(product.stock, 0)),
    isNew: typeof product.newArrival === "boolean" ? product.newArrival : isNew,
    isOnSale: percent > 0,
    createdAt: product.createdAt,
  };
};

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

module.exports = {
  stockStatus,
  discountPercent,
  getActiveCategoryIds,
  getActiveBrandIds,
  variantLabel,
  buildVisibleProductFilter,
  isVisibleToCustomer,
  serializeProduct,
  toObjectId,
};
