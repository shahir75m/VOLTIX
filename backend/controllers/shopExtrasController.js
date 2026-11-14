const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const shop = require("../config/shop");
const getPincodeDetails = require("../services/pincodeService");
const { buildVisibleProductFilter, serializeProduct } = require("../services/productService");

// pincode -> { state, district } is cached for a day so the product page does not hammer the free pincode API
const pinCache = new Map();
async function lookupPincode(pincode) {
  const hit = pinCache.get(pincode);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await getPincodeDetails(pincode);
  pinCache.set(pincode, { value, until: Date.now() + 24 * 60 * 60 * 1000 });
  if (pinCache.size > 2000) pinCache.delete(pinCache.keys().next().value);
  return value;
}

const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

// GET /api/products/delivery-estimate?pincode=682001   (public)
const deliveryEstimate = async (req, res) => {
  try {
    const pincode = String(req.query.pincode || "").trim();
    if (!/^[1-9]\d{5}$/.test(pincode)) {
      return res.status(400).json({ success: false, message: "Enter a valid 6-digit pincode" });
    }
    let place;
    try {
      place = await lookupPincode(pincode);
    } catch {
      return res.status(503).json({ success: false, message: "We could not check this pincode right now. Please try again." });
    }
    if (!place) return res.status(404).json({ success: false, message: "We do not deliver to this pincode or it does not exist" });

    const sameState = place.state?.toLowerCase() === shop.STORE_STATE.toLowerCase();
    const [min, max] = sameState ? shop.DELIVERY_DAYS_SAME_STATE : shop.DELIVERY_DAYS_OTHER_STATE;
    return res.status(200).json({
      success: true,
      pincode,
      district: place.district,
      state: place.state,
      from: addDays(shop.DELIVERY_PROCESSING_DAYS + min),
      to: addDays(shop.DELIVERY_PROCESSING_DAYS + max),
    });
  } catch (error) {
    console.error("Delivery estimate error:", error);
    return res.status(500).json({ success: false, message: "Failed to check delivery" });
  }
};

// GET /api/products/:id/bought-together   (public)
// Products that real customers bought in the SAME order as this one (cancelled / unpaid orders ignored).
const boughtTogether = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(200).json({ success: true, products: [] });
    const productId = new mongoose.Types.ObjectId(req.params.id);

    const rows = await Order.aggregate([
      { $match: { status: { $nin: ["Pending", "Cancelled"] }, "orderItems.product": productId } },
      { $unwind: "$orderItems" },
      { $match: { "orderItems.product": { $ne: productId } } },
      { $group: { _id: "$orderItems.product", times: { $sum: 1 } } },
      { $sort: { times: -1 } },
      { $limit: 12 },
    ]);
    if (rows.length === 0) return res.status(200).json({ success: true, products: [] });

    const filter = await buildVisibleProductFilter({ _id: { $in: rows.map((r) => r._id) } });
    const found = await Product.find(filter)
      .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
      .lean();
    const order = new Map(rows.map((r, i) => [String(r._id), i]));
    const products = found
      .sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)))
      .map(serializeProduct)
      .filter((p) => p.inStock !== false)
      .slice(0, 4);
    return res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Bought together error:", error);
    return res.status(200).json({ success: true, products: [] }); // an extra section must never break the page
  }
};

module.exports = { deliveryEstimate, boughtTogether };
