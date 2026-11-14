const Product = require("../models/Product");
const { defaultSpecTemplate } = require("../config/specTemplates");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const shop = require("../config/shop");
const {
  isValidId,
  escapeRegex,
  parsePage,
  toNumber,
} = require("../utils/validators");
const {
  buildVisibleProductFilter,
  isVisibleToCustomer,
  serializeProduct,
} = require("../services/productService");

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  rating: { ratingAverage: -1, ratingCount: -1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: 1 },
};

// GET /api/products  (public)
// search, category (comma separated ids), minPrice, maxPrice, sort, page
const listProducts = async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const limit = shop.STORE_PAGE_SIZE;

    // ---- sort
    const sortKey = typeof req.query.sort === "string" && req.query.sort ? req.query.sort : "newest";
    if (!Object.hasOwn(SORTS, sortKey)) {
      return res.status(400).json({ success: false, message: "Invalid sort option" });
    }

    // ---- price range
    const extra = {};
    for (const [query, field] of [["featured", "isFeatured"], ["new", "newArrival"], ["bestSeller", "isBestSeller"]]) {
      if (req.query[query] !== undefined) {
        if (!["true", "false"].includes(req.query[query])) return res.status(400).json({ success: false, message: "Invalid product flag filter" });
        extra[field] = req.query[query] === "true";
      }
    }
    if (typeof req.query.tag === "string" && req.query.tag.trim()) extra.tags = req.query.tag.trim().slice(0, 40);
    const hasMin = req.query.minPrice !== undefined && req.query.minPrice !== "";
    const hasMax = req.query.maxPrice !== undefined && req.query.maxPrice !== "";
    const minPrice = hasMin ? toNumber(req.query.minPrice) : null;
    const maxPrice = hasMax ? toNumber(req.query.maxPrice) : null;

    if ((hasMin && minPrice === null) || (hasMax && maxPrice === null)) {
      return res.status(400).json({ success: false, message: "Price filter must be a number" });
    }
    if ((hasMin && minPrice < 0) || (hasMax && maxPrice < 0)) {
      return res.status(400).json({ success: false, message: "Price cannot be negative" });
    }
    if (hasMin && hasMax && minPrice > maxPrice) {
      return res
        .status(400)
        .json({ success: false, message: "Minimum price cannot be greater than maximum price" });
    }
    if (hasMin || hasMax) {
      extra.price = {};
      if (hasMin) extra.price.$gte = minPrice;
      if (hasMax) extra.price.$lte = maxPrice;
    }

    // ---- search
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: "i" };
      extra.$or = [{ name: rx }, { description: rx }];
    }

    // ---- category filter
    let categoryIds = null;
    if (typeof req.query.category === "string" && req.query.category) {
      categoryIds = req.query.category.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 20);
      if (categoryIds.some((c) => !isValidId(c))) {
        return res.status(400).json({ success: false, message: "Invalid category filter" });
      }
    }

    // ---- brand filter
    let brandIds = null;
    if (typeof req.query.brand === "string" && req.query.brand) {
      brandIds = req.query.brand.split(",").map((b) => b.trim()).filter(Boolean).slice(0, 20);
      if (brandIds.some((b) => !isValidId(b))) {
        return res.status(400).json({ success: false, message: "Invalid brand filter" });
      }
    }

    const filter = await buildVisibleProductFilter(extra, categoryIds, brandIds);

    const total = await Product.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);

    const products = await Product.find(filter)
      .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
      .collation({ locale: "en", strength: 2 })
      .sort(SORTS[sortKey])
      .skip((safePage - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      products: products.map(serializeProduct),
      pagination: { currentPage: safePage, totalPages, totalItems: total, limit },
    });
  } catch (error) {
    console.error("Shop List Products Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
};

// GET /api/products/categories (public) â€“ only active categories
const listCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isDeleted: false })
      .select("name image specTemplate")
      .sort({ name: 1 })
      .collation({ locale: "en", strength: 2 })
      .lean();

    return res.status(200).json({
      success: true,
      categories: categories.map((c) => ({ _id: c._id, name: c.name, image: c.image?.url || "", specTemplate: c.specTemplate?.length ? c.specTemplate : defaultSpecTemplate(c.name) })),
    });
  } catch (error) {
    console.error("Shop List Categories Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch categories" });
  }
};

// GET /api/products/brands (public) â€“ only active brands
const listBrands = async (req, res) => {
  try {
    const brands = await Brand.find({ isDeleted: false })
      .select("name image specTemplate")
      .sort({ name: 1 })
      .collation({ locale: "en", strength: 2 })
      .lean();

    return res.status(200).json({
      success: true,
      brands: brands.map((b) => ({ _id: b._id, name: b.name, image: b.image?.url || "" })),
    });
  } catch (error) {
    console.error("Shop List Brands Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch brands" });
  }
};

// GET /api/products/:id (public)
const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      return res.status(404).json({ success: false, message: "Product not found", redirectTo: "/products" });
    }

    const product = await Product.findOne({ ...(isValidId(id) ? { _id: id } : { slug: id }), isDeleted: false })
      .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
      .lean();

    if (!isVisibleToCustomer(product)) {
      return res.status(404).json({
        success: false,
        message: "This product is no longer available",
        redirectTo: "/products",
      });
    }

    // related: same category first, then fill with newest others
    const baseFilter = await buildVisibleProductFilter({ _id: { $ne: product._id } });
    let related = await Product.find({ ...baseFilter, category: product.category._id })
      .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
      .sort({ createdAt: -1 })
      .limit(4)
      .lean();

    if (related.length < 4) {
      const more = await Product.find({
        ...baseFilter,
        _id: { $nin: [product._id, ...related.map((r) => r._id)] },
      })
        .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
        .sort({ createdAt: -1 })
        .limit(4 - related.length)
        .lean();
      related = related.concat(more);
    }

    return res.status(200).json({
      success: true,
      product: serializeProduct(product),
      relatedProducts: related.map(serializeProduct),
    });
  } catch (error) {
    console.error("Shop Get Product Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch product" });
  }
};

module.exports = { listProducts, listCategories, listBrands, getProduct };
