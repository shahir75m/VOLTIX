const crypto = require("node:crypto");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const shop = require("../config/shop");
const {
  isValidId,
  escapeRegex,
  parsePage,
  parseJsonField,
  validateProductInput,
} = require("../utils/validators");
const { detectImageType, uploadBuffer, destroyImages } = require("../utils/imageUpload");
const { stockStatus } = require("../services/productService");

const badRequest = (res, errors, message) =>
  res.status(400).json({
    success: false,
    message: message || Object.values(errors)[0],
    errors,
  });

const formatAdminProduct = (p) => ({
  _id: p._id,
  name: p.name,
  description: p.description,
  ...Object.fromEntries(["shortDescription", "modelNumber", "slug", "gstPercent", "taxInclusive", "costPrice", "warrantyPeriod", "warrantyType", "boxContents", "weightGrams", "codAvailable", "deliveryCharge", "isFeatured", "newArrival", "isBestSeller", "tags", "keyFeatures", "videoUrl"].map((key) => [key, p[key]])),
  isNew: Boolean(p.newArrival),
  discountPercent: p.mrp > p.price ? Math.round((p.mrp - p.price) / p.mrp * 100) : 0,
  category: p.category && p.category._id ? { _id: p.category._id, name: p.category.name, isDeleted: p.category.isDeleted } : p.category,
  brand: p.brand && p.brand._id ? { _id: p.brand._id, name: p.brand.name, isDeleted: p.brand.isDeleted } : p.brand,
  price: p.price,
  mrp: p.mrp,
  stock: p.stock,
  stockStatus: stockStatus(p.stock),
  sku: p.sku,
  image: p.images?.[0]?.url || "",
  images: p.images || [],
  highlights: p.highlights || [],
  variantOptions: p.variantOptions || [],
  variants: (p.variants || []).map((v) => ({
    _id: v._id,
    attributes: (v.attributes || []).map((a) => ({ name: a.name, value: a.value, hex: a.hex || "" })),
    price: v.price,
    mrp: v.mrp,
    stock: v.stock,
    sku: v.sku || "",
    imagePublicId: v.imagePublicId || "",
  })),
  isPublished: p.isPublished,
  isBlocked: p.isBlocked,
  isDeleted: Boolean(p.isDeleted),
  deletedAt: p.deletedAt || null,
  status: p.isDeleted ? "deleted" : p.isBlocked ? "blocked" : p.isPublished ? "published" : "draft",
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const uploadProductFiles = async (files) => {
  for (const file of files) {
    if (!file.buffer || file.buffer.length > shop.MAX_IMAGE_SIZE || !detectImageType(file.buffer)) {
      const error = new Error(`"${file.originalname}" is not a valid image`);
      error.status = 400;
      throw error;
    }
  }

  const uploaded = [];
  try {
    for (const file of files) {
      const result = await uploadBuffer(file.buffer, "voltix/products", [
        { width: 1000, height: 1000, crop: "limit", quality: "auto" },
      ]);
      uploaded.push({ url: result.secure_url, publicId: result.public_id });
    }
    return uploaded;
  } catch (error) {
    await destroyImages(uploaded.map((u) => u.publicId));
    throw error;
  }
};

const checkCategoryAndSku = async (value, ignoreId) => {
  const errors = {};

  if (value.category) {
    const exists = await Category.exists({ _id: value.category, isDeleted: false });
    if (!exists) errors.category = "Selected category does not exist";
  }

  if (value.brand) {
    const exists = await Brand.exists({ _id: value.brand, isDeleted: false });
    if (!exists) errors.brand = "Selected brand does not exist";
  }

  if (value.skuKeys?.length) {
    const filter = { isDeleted: false, $or: [ { sku: { $in: value.skuKeys } }, { "variants.sku": { $in: value.skuKeys } }, { skuKeys: { $in: value.skuKeys } } ] };
    if (ignoreId) filter._id = { $ne: ignoreId };
    if (await Product.exists(filter)) errors.sku = "A product or variant already uses one of these SKUs";
  }

  if (value.slug) {
    const filter = { slug: value.slug };
    if (ignoreId) filter._id = { $ne: ignoreId };
    if (await Product.exists(filter)) errors.slug = "This slug is already used by another product";
  }
  return errors;
};

const makeSlug = (name) => `${name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "product"}-${crypto.randomBytes(5).toString("hex")}`;

const attachImageDetails = (images, tokens, variants, rawMeta, name) => {
  const meta = parseJsonField(rawMeta, {});
  if (!meta || typeof meta !== "object" || Array.isArray(meta) || Object.values(meta).some((alt) => typeof alt !== "string" || alt.trim().length > 160)) {
    const error = new Error("Image alt text must be text of at most 160 characters"); error.status = 400; throw error;
  }
  const byToken = new Map(tokens.map((token, i) => [token, images[i]]));
  for (const [i, image] of images.entries()) image.alt = Object.hasOwn(meta, tokens[i]) ? meta[tokens[i]].trim() : image.alt || name;
  for (const variant of variants) {
    if (variant.imageToken && !byToken.has(variant.imageToken)) {
      const error = new Error("Choose each variant image from the product images"); error.status = 400; throw error;
    }
    variant.imagePublicId = variant.imageToken ? byToken.get(variant.imageToken).publicId : "";
    delete variant.imageToken;
  }
};

const duplicateProduct = (res, error) => badRequest(res, error.keyPattern?.slug
  ? { slug: "This slug is already used by another product" }
  : { sku: "A product or variant already uses this SKU" });

// GET /api/admin/products
const listProducts = async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const limit = shop.ADMIN_PAGE_SIZE;
    // Be tolerant of a stale browser tab / old bookmarked filter. The admin UI
    // should simply fall back to the active list, never expose a raw filter
    // validation message to the user.
    const requestedStatus = typeof req.query.status === "string" ? req.query.status : "all";
    const status = ["all", "published", "unpublished", "draft", "blocked", "deleted"].includes(requestedStatus)
      ? requestedStatus
      : "all";
    // "all" means all active records. Deleted records are deliberately only
    // exposed through the explicit Deleted view, never mixed into normal lists.
    const filter = { isDeleted: status === "deleted" };

    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: "i" };
      filter.$or = [{ name: rx }, { sku: rx }];
    }

    if (req.query.category) {
      if (!isValidId(req.query.category)) return badRequest(res, { category: "Invalid category" });
      filter.category = req.query.category;
    }
    if (req.query.brand) {
      if (!isValidId(req.query.brand)) return badRequest(res, { brand: "Invalid brand" });
      filter.brand = req.query.brand;
    }

    const stock = req.query.stock || "all";
    if (stock === "in") filter.stock = { $gt: shop.LOW_STOCK_LIMIT };
    else if (stock === "low") filter.stock = { $gt: 0, $lte: shop.LOW_STOCK_LIMIT };
    else if (stock === "out") filter.stock = 0;
    else if (stock !== "all") return badRequest(res, { stock: "Invalid stock filter" });

    if (status === "deleted") {
      // Soft-deleted records can be searched and restored, but not edited/toggled.
    } else if (status === "published") Object.assign(filter, { isPublished: true, isBlocked: false });
    else if (status === "unpublished" || status === "draft") filter.isPublished = false;
    else if (status === "blocked") filter.isBlocked = true;

    const total = await Product.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);

    const products = await Product.find(filter)
      .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
      .sort({ createdAt: -1, _id: -1 })
      .skip((safePage - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      products: products.map(formatAdminProduct),
      pagination: { currentPage: safePage, totalPages, totalItems: total, limit },
    });
  } catch (error) {
    console.error("List Products Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
};

// GET /api/admin/products/:id
const getProduct = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });

    const product = await Product.findOne({ _id: req.params.id, isDeleted: false })
      .select("+costPrice")
      .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
      .lean();

    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    return res.status(200).json({ success: true, product: formatAdminProduct(product) });
  } catch (error) {
    console.error("Get Product Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch product" });
  }
};

// POST /api/admin/products   (multipart: fields + images[])
const createProduct = async (req, res) => {
  let uploaded = [];
  try {
    const files = req.files || [];
    const { errors, value } = validateProductInput(req.body);

    if (value.isPublished && files.length === 0) errors.images = "Please upload at least one product image";
    if (files.length > shop.MAX_PRODUCT_IMAGES)
      errors.images = `You can upload at most ${shop.MAX_PRODUCT_IMAGES} images`;

    Object.assign(errors, await checkCategoryAndSku(value, null));
    if (Object.keys(errors).length) return badRequest(res, errors);

    uploaded = await uploadProductFiles(files);
    attachImageDetails(uploaded, uploaded.map((_, i) => `new:${i}`), value.variants, req.body.imageMeta, value.name);
    value.slug ||= makeSlug(value.name);

    const product = await Product.create({
      ...value,
      variants: value.variants.map(({ _id, ...rest }) => rest), // new product: ids are generated by MongoDB
      images: uploaded,
      isBlocked: false,
    });

    return res.status(201).json({
      success: true,
      message: "Product added successfully",
      product: { _id: product._id },
    });
  } catch (error) {
    if (uploaded.length) await destroyImages(uploaded.map((u) => u.publicId));
    if (error.name === "ValidationError") return badRequest(res, Object.fromEntries(Object.entries(error.errors).map(([key, e]) => [key, e.message])));
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    if (error.code === 11000)
      return duplicateProduct(res, error);
    console.error("Create Product Error:", error);
    return res.status(500).json({ success: false, message: "Failed to add product" });
  }
};

// PUT /api/admin/products/:id   (multipart)
// imageOrder = JSON array. Each entry is either the publicId of an image to KEEP
// or "new:<n>" which points to the n-th uploaded file. The first entry is the main image.
const updateProduct = async (req, res) => {
  let uploaded = [];
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid product id" });

    const product = await Product.findOne({ _id: id, isDeleted: false });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const files = req.files || [];
    const { errors, value } = validateProductInput(req.body);

    // build final image order
    const existing = new Map(product.images.map((img) => [img.publicId, img]));
    let order = parseJsonField(req.body.imageOrder, null);

    if (order === undefined || (order !== null && !Array.isArray(order))) {
      errors.images = "Invalid image order";
      order = [];
    }
    if (order === null) {
      order = [...product.images.map((i) => i.publicId), ...files.map((_, i) => `new:${i}`)];
    }

    const seen = new Set();
    for (const token of order) {
      if (typeof token !== "string" || seen.has(token)) {
        errors.images = "Invalid image order";
        break;
      }
      seen.add(token);
      if (token.startsWith("new:")) {
        const index = Number(token.slice(4));
        if (!/^new:(0|[1-9]\d*)$/.test(token) || !Number.isInteger(index) || index < 0 || index >= files.length) {
          errors.images = "Invalid image order";
          break;
        }
      } else if (!existing.has(token)) {
        errors.images = "Invalid image order";
        break;
      }
    }
    // any uploaded file not referenced is appended
    files.forEach((_, i) => {
      if (!seen.has(`new:${i}`)) order.push(`new:${i}`);
    });

    if (!errors.images) {
      if (value.isPublished && order.length === 0) errors.images = "A product needs at least one image";
      else if (order.length > shop.MAX_PRODUCT_IMAGES)
        errors.images = `You can keep at most ${shop.MAX_PRODUCT_IMAGES} images`;
    }

    Object.assign(errors, await checkCategoryAndSku(value, product._id));
    if (Object.keys(errors).length) return badRequest(res, errors);

    uploaded = await uploadProductFiles(files);

    const finalImages = order.map((token) =>
      token.startsWith("new:") ? uploaded[Number(token.slice(4))] : existing.get(token)
    );
    attachImageDetails(finalImages, order, value.variants, req.body.imageMeta, value.name);
    const removedIds = product.images
      .map((i) => i.publicId)
      .filter((pid) => !finalImages.some((img) => img.publicId === pid));

    // keep variant ids that already exist so carts keep pointing to them
    const knownVariantIds = new Set(product.variants.map((v) => String(v._id)));
    const variants = value.variants.map((v) => ({
      ...(v._id && knownVariantIds.has(String(v._id)) ? { _id: v._id } : {}),
      attributes: v.attributes,
      price: v.price,
      mrp: v.mrp,
      stock: v.stock,
      sku: v.sku,
      imagePublicId: v.imagePublicId,
    }));

    for (const key of ["shortDescription", "modelNumber", "gstPercent", "taxInclusive", "costPrice", "warrantyPeriod", "warrantyType", "boxContents", "weightGrams", "codAvailable", "deliveryCharge", "isFeatured", "newArrival", "isBestSeller", "tags", "skuKeys", "keyFeatures", "videoUrl"]) product[key] = value[key];
    product.slug = value.slug || product.slug || makeSlug(value.name);
    product.name = value.name;
    product.description = value.description;
    product.category = value.category;
    product.brand = value.brand;
    product.variantOptions = value.variantOptions;
    product.price = value.price;
    product.mrp = value.mrp;
    product.sku = value.sku;
    product.variants = variants;
    product.stock = value.stock;
    product.highlights = value.highlights;
    product.isPublished = value.isPublished;
    product.images = finalImages;

    await product.save();
    if (removedIds.length) await destroyImages(removedIds);

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: { _id: product._id },
    });
  } catch (error) {
    if (uploaded.length) await destroyImages(uploaded.map((u) => u.publicId));
    if (error.name === "ValidationError") return badRequest(res, Object.fromEntries(Object.entries(error.errors).map(([key, e]) => [key, e.message])));
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    if (error.code === 11000)
      return duplicateProduct(res, error);
    console.error("Update Product Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update product" });
  }
};

// DELETE /api/admin/products/:id  (soft delete)
const deleteProduct = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    return res.status(200).json({ success: true, message: "Product deleted" });
  } catch (error) {
    console.error("Delete Product Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete product" });
  }
};

// PATCH /api/admin/products/:id/restore
const restoreProduct = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, isDeleted: true },
      { $set: { isDeleted: false, deletedAt: null } },
      { returnDocument: "after" }
    );
    if (!product) return res.status(404).json({ success: false, message: "Deleted product not found" });

    return res.status(200).json({ success: true, message: "Product restored", product: { _id: product._id } });
  } catch (error) {
    if (error.code === 11000) return duplicateProduct(res, error);
    console.error("Restore Product Error:", error);
    return res.status(500).json({ success: false, message: "Failed to restore product" });
  }
};

const makeToggle = (field, label) => async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });
    if (typeof req.body?.[field] !== "boolean")
      return res.status(400).json({ success: false, message: `${field} must be true or false` });

    const product = await Product.findOne({ _id: req.params.id, isDeleted: false });
    if (product && field === "isPublished" && req.body[field]) {
      const { errors, value } = validateProductInput({ ...product.toObject(), category: String(product.category || ""), brand: String(product.brand || ""), isPublished: true });
      Object.assign(errors, await checkCategoryAndSku(value, product._id));
      if (!product.images.length) errors.images = "Add at least one image before publishing";
      if (Object.keys(errors).length) return badRequest(res, errors);
    }
    if (product) {
      product[field] = req.body[field];
      if (field === "isBlocked" || !req.body[field]) await Product.updateOne({ _id: product._id }, { $set: { [field]: req.body[field] } });
      else await product.save();
    }
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    return res.status(200).json({
      success: true,
      message: `Product ${label(req.body[field])}`,
      product: { _id: product._id, isPublished: product.isPublished, isBlocked: product.isBlocked },
    });
  } catch (error) {
    console.error("Toggle Product Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update product" });
  }
};

const setPublishStatus = makeToggle("isPublished", (v) => (v ? "published" : "saved as draft"));
const setBlockStatus = makeToggle("isBlocked", (v) => (v ? "blocked" : "unblocked"));

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  setPublishStatus,
  setBlockStatus,
};
