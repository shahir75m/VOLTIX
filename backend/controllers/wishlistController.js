const Wishlist = require("../models/Wishlist");
const Product = require("../models/Product");
const { isValidId } = require("../utils/validators");
const { buildVisibleProductFilter, isVisibleToCustomer, serializeProduct } = require("../services/productService");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// GET /api/wishlist  – only products customers may still see
const getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).lean();
    const entries = [...(wishlist?.items || [])].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    if (entries.length === 0) {
      return res.status(200).json({ success: true, products: [], count: 0 });
    }

    const filter = await buildVisibleProductFilter({ _id: { $in: entries.map((e) => e.product) } });
    const products = await Product.find(filter).populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true }).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const ordered = entries
      .map((e) => byId.get(String(e.product)))
      .filter(Boolean)
      .map(serializeProduct);

    return res.status(200).json({ success: true, products: ordered, count: ordered.length });
  } catch (error) {
    console.error("Get Wishlist Error:", error);
    return fail(res, 500, "Failed to load wishlist");
  }
};

// GET /api/wishlist/ids – lightweight, used to colour the hearts
const getWishlistIds = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).select("items").lean();
    const saved = (wishlist?.items || []).map((i) => i.product);
    if (saved.length === 0) return res.status(200).json({ success: true, ids: [] });

    // hidden / deleted / blocked products are not shown on the wishlist page, so they are not counted either
    const filter = await buildVisibleProductFilter({ _id: { $in: saved } });
    const visible = await Product.find(filter).select("_id").lean();
    return res.status(200).json({ success: true, ids: visible.map((p) => String(p._id)) });
  } catch (error) {
    console.error("Wishlist Ids Error:", error);
    return fail(res, 500, "Failed to load wishlist");
  }
};

// POST /api/wishlist   { productId }
const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body || {};
    if (!isValidId(productId)) return fail(res, 400, "Invalid product");

    const product = await Product.findById(productId).populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true }).lean();
    if (!isVisibleToCustomer(product)) return fail(res, 404, "This product is no longer available");

    // atomic "add if not already there"
    const result = await Wishlist.updateOne(
      { user: req.user._id, "items.product": { $ne: product._id } },
      { $push: { items: { product: product._id, addedAt: new Date() } } }
    );

    if (result.matchedCount === 0) {
      const exists = await Wishlist.exists({ user: req.user._id, "items.product": product._id });
      if (exists) return res.status(200).json({ success: true, message: "Already in your wishlist" });

      // no wishlist document yet
      try {
        await Wishlist.create({ user: req.user._id, items: [{ product: product._id }] });
      } catch (error) {
        if (error.code !== 11000) throw error;
        await Wishlist.updateOne(
          { user: req.user._id, "items.product": { $ne: product._id } },
          { $push: { items: { product: product._id, addedAt: new Date() } } }
        );
      }
    }

    return res.status(201).json({ success: true, message: "Added to wishlist" });
  } catch (error) {
    console.error("Add To Wishlist Error:", error);
    return fail(res, 500, "Failed to add to wishlist");
  }
};

// DELETE /api/wishlist/:productId
const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!isValidId(productId)) return fail(res, 400, "Invalid product");

    const result = await Wishlist.updateOne(
      { user: req.user._id },
      { $pull: { items: { product: productId } } }
    );

    if (result.modifiedCount === 0) return fail(res, 404, "Product is not in your wishlist");

    return res.status(200).json({ success: true, message: "Removed from wishlist" });
  } catch (error) {
    console.error("Remove From Wishlist Error:", error);
    return fail(res, 500, "Failed to remove from wishlist");
  }
};

module.exports = { getWishlist, getWishlistIds, addToWishlist, removeFromWishlist };
