const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/Product");
const Order = require("../models/Order");
const User = require("../models/User");
const svc = require("../services/orderService");
const { detectImageType, uploadBuffer, destroyImages } = require("../utils/imageUpload");
const { buildVisibleProductFilter } = require("../services/productService");

const isId = (id) => mongoose.isValidObjectId(id);
const fail = (res, status, message, error) => {
  if (error) console.error(message, error);
  return res.status(status).json({ success: false, message });
};

// Rating shown on product cards = average of the visible reviews. Recalculated after every change.
async function refreshProductRating(productId) {
  const [row] = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), isHidden: false, isDeleted: { $ne: true } } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  await Product.updateOne(
    { _id: productId },
    { $set: { ratingAverage: row ? Math.round(row.avg * 10) / 10 : 0, ratingCount: row ? row.count : 0 } },
    { timestamps: false }
  );
}

// "Rahul Nair" -> "Rahul N." (customers' full names are not shown publicly)
const publicName = (name) => {
  const parts = String(name || "Customer").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};

const clean = (v, max) => (typeof v === "string" ? v.trim().replace(/[ \t]+/g, " ").slice(0, max) : "");

// A customer may review a product only after it was delivered to them.
const hasReceived = (userId, productId) =>
  Order.exists({ user: userId, status: { $in: ["Delivered", "Returned"] }, "orderItems.product": productId });

async function visibleProduct(id) {
  if (!isId(id)) return null;
  // Reviews must obey the same public visibility rules as product pages.
  // This prevents review data leaking from drafts, blocked products, or a
  // product whose category/brand has been removed.
  const filter = await buildVisibleProductFilter({ _id: id });
  return Product.findOne(filter).select("_id name").lean();
}

// GET /api/reviews/product/:productId?page=&sort=newest|highest|lowest   (public)
const listProductReviews = async (req, res) => {
  try {
    if (!(await visibleProduct(req.params.productId))) return fail(res, 404, "Product not found");
    const requestedPage = Number(req.query.page);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    const limit = 5;
    const sorts = { newest: { createdAt: -1 }, highest: { rating: -1, createdAt: -1 }, lowest: { rating: 1, createdAt: -1 } };
    const filter = { product: req.params.productId, isHidden: false, isDeleted: { $ne: true } };

    const [reviews, total, grouped] = await Promise.all([
      Review.find(filter).populate("user", "name").sort(sorts[req.query.sort] || sorts.newest).skip((page - 1) * limit).limit(limit).lean(),
      Review.countDocuments(filter),
      Review.aggregate([{ $match: { product: new mongoose.Types.ObjectId(req.params.productId), isHidden: false, isDeleted: { $ne: true } } }, { $group: { _id: "$rating", n: { $sum: 1 } } }]),
    ]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    grouped.forEach((g) => (distribution[g._id] = g.n));
    const count = Object.values(distribution).reduce((a, b) => a + b, 0);
    const average = count ? Object.entries(distribution).reduce((s, [star, n]) => s + star * n, 0) / count : 0;

    return res.status(200).json({
      success: true,
      summary: { average: Math.round(average * 10) / 10, count, distribution },
      reviews: reviews.map((r) => ({
        _id: r._id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        photos: (r.photos || []).map((p) => p.url),
        name: publicName(r.user?.name),
        verified: r.isVerifiedPurchase,
        createdAt: r.createdAt,
        edited: r.updatedAt > r.createdAt,
      })),
      pagination: { page, totalPages: Math.max(1, Math.ceil(total / limit)), total },
    });
  } catch (error) {
    return fail(res, 500, "Failed to load reviews", error);
  }
};

// GET /api/reviews/product/:productId/mine   – my review + whether I may write one
const getMyReview = async (req, res) => {
  try {
    if (!(await visibleProduct(req.params.productId))) return fail(res, 404, "Product not found");
    const [mine, received] = await Promise.all([
      Review.findOne({ product: req.params.productId, user: req.user._id, isDeleted: { $ne: true } }).lean(),
      hasReceived(req.user._id, req.params.productId),
    ]);
    return res.status(200).json({ success: true, review: mine, canReview: Boolean(received) || Boolean(mine) });
  } catch (error) {
    return fail(res, 500, "Failed to load your review", error);
  }
};

// uploads the review photos to Cloudinary (real images only)
async function storePhotos(files = []) {
  const stored = [];
  try {
    for (const file of files) {
      if (!detectImageType(file.buffer)) throw Object.assign(new Error("Photos must be real JPG, PNG or WebP images"), { status: 400 });
      const result = await uploadBuffer(file.buffer, "voltix/reviews", [{ width: 1400, crop: "limit", quality: "auto" }]);
      stored.push({ url: result.secure_url, publicId: result.public_id });
    }
    return stored;
  } catch (error) {
    await destroyImages(stored.map((p) => p.publicId));
    throw error;
  }
}

function readReview(body) {
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Please choose a rating from 1 to 5 stars" };
  const title = clean(body?.title, 80);
  const comment = clean(body?.comment, 1000);
  if (comment && comment.length < 3) return { error: "Please write a little more in your review" };
  return { data: { rating, title, comment } };
}

// POST /api/reviews/product/:productId
const createReview = async (req, res) => {
  let photos = [];
  try {
    if (!(await visibleProduct(req.params.productId))) return fail(res, 404, "Product not found");
    const { data, error } = readReview(req.body);
    if (error) return fail(res, 400, error);
    if (!(await hasReceived(req.user._id, req.params.productId))) {
      return fail(res, 403, "You can review a product after it has been delivered to you");
    }
    if (await Review.exists({ product: req.params.productId, user: req.user._id, isDeleted: { $ne: true } })) {
      return fail(res, 409, "You have already reviewed this product. You can edit your review.");
    }
    photos = await storePhotos(req.files);
    const review = await Review.create({ ...data, photos, product: req.params.productId, user: req.user._id });
    await refreshProductRating(req.params.productId);
    return res.status(201).json({ success: true, message: "Thank you for your review!", review });
  } catch (error) {
    await destroyImages(photos.map((p) => p.publicId));
    if (error.status === 400) return fail(res, 400, error.message);
    if (error.code === 11000) return fail(res, 409, "You have already reviewed this product.");
    return fail(res, 500, "Failed to save your review", error);
  }
};

// PUT /api/reviews/:id  (own review)
const updateReview = async (req, res) => {
  let uploaded = [];
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Review not found");
    const { data, error } = readReview(req.body);
    if (error) return fail(res, 400, error);
    const existing = await Review.findOne({ _id: req.params.id, user: req.user._id, isDeleted: { $ne: true } });
    if (!existing) return fail(res, 404, "Review not found");

    // photos the customer keeps (sent as a JSON list of urls) + new uploads, at most 3 together
    let keep = [];
    try {
      const sent = typeof req.body?.keepPhotos === "string" ? JSON.parse(req.body.keepPhotos) : [];
      if (!Array.isArray(sent) || sent.some((url) => typeof url !== "string")) {
        return fail(res, 400, "Invalid review photo selection");
      }
      keep = existing.photos.filter((p) => sent.includes(p.url));
    } catch {
      return fail(res, 400, "Invalid review photo selection");
    }
    if (keep.length + (req.files?.length || 0) > 3) return fail(res, 400, "A review can have at most 3 photos");
    uploaded = await storePhotos(req.files);

    const removed = existing.photos.filter((p) => !keep.includes(p));
    existing.set({ ...data, photos: [...keep, ...uploaded] });
    await existing.save();
    await destroyImages(removed.map((p) => p.publicId));
    await refreshProductRating(existing.product);
    return res.status(200).json({ success: true, message: "Review updated", review: existing });
  } catch (error) {
    await destroyImages(uploaded.map((p) => p.publicId));
    if (error.status === 400) return fail(res, 400, error.message);
    return fail(res, 500, "Failed to update your review", error);
  }
};

// DELETE /api/reviews/:id  (own review)
const deleteReview = async (req, res) => {
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Review not found");
    const review = await Review.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!review) return fail(res, 404, "Review not found");
    await destroyImages((review.photos || []).map((p) => p.publicId));
    await refreshProductRating(review.product);
    return res.status(200).json({ success: true, message: "Review deleted" });
  } catch (error) {
    return fail(res, 500, "Failed to delete your review", error);
  }
};

// ----------------------------------------------------------------- admin moderation
// GET /api/admin/reviews?search=&rating=&status=hidden|visible&page=
const adminListReviews = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 10;
    const requestedStatus = req.query.status || "";
    if (!["", "visible", "hidden", "deleted"].includes(requestedStatus)) return fail(res, 400, "Invalid status filter");
    const deleted = requestedStatus === "deleted";
    const filter = deleted ? { isDeleted: true } : { isDeleted: { $ne: true } };
    if ([1, 2, 3, 4, 5].includes(Number(req.query.rating))) filter.rating = Number(req.query.rating);
    if (req.query.status === "hidden") filter.isHidden = true;
    if (req.query.status === "visible") filter.isHidden = false;
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const s = svc.escapeRegex(req.query.search.trim().slice(0, 60));
      const [products, users] = await Promise.all([
        Product.find({ name: { $regex: s, $options: "i" } }).select("_id").limit(100).lean(),
        User.find({ $or: [{ name: { $regex: s, $options: "i" } }, { email: { $regex: s, $options: "i" } }] }).select("_id").limit(100).lean(),
      ]);
      filter.$or = [
        { product: { $in: products.map((p) => p._id) } },
        { user: { $in: users.map((u) => u._id) } },
        { comment: { $regex: s, $options: "i" } },
      ];
    }
    const [reviews, total] = await Promise.all([
      Review.find(filter).populate("product", "name slug").populate("user", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Review.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, reviews, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    return fail(res, 500, "Failed to load reviews", error);
  }
};

// PUT /api/admin/reviews/:id/visibility   body: { isHidden }
const adminSetVisibility = async (req, res) => {
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Review not found");
    const review = await Review.findOneAndUpdate({ _id: req.params.id, isDeleted: { $ne: true } }, { $set: { isHidden: req.body?.isHidden === true } }, { new: true });
    if (!review) return fail(res, 404, "Review not found");
    await refreshProductRating(review.product);
    return res.status(200).json({ success: true, message: review.isHidden ? "Review hidden" : "Review is visible again", review });
  } catch (error) {
    return fail(res, 500, "Failed to update the review", error);
  }
};

// DELETE /api/admin/reviews/:id
const adminDeleteReview = async (req, res) => {
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Review not found");
    const review = await Review.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true }
    );
    if (!review) return fail(res, 404, "Review not found");
    await refreshProductRating(review.product);
    return res.status(200).json({ success: true, message: "Review deleted" });
  } catch (error) {
    return fail(res, 500, "Failed to delete the review", error);
  }
};

// PATCH /api/admin/reviews/:id/restore
const adminRestoreReview = async (req, res) => {
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Review not found");
    const review = await Review.findOneAndUpdate(
      { _id: req.params.id, isDeleted: true },
      { $set: { isDeleted: false, deletedAt: null } },
      { new: true }
    );
    if (!review) return fail(res, 404, "Deleted review not found");
    await refreshProductRating(review.product);
    return res.status(200).json({ success: true, message: "Review restored", review });
  } catch (error) {
    return fail(res, 500, "Failed to restore review", error);
  }
};

module.exports = { listProductReviews, getMyReview, createReview, updateReview, deleteReview, adminListReviews, adminSetVisibility, adminDeleteReview, adminRestoreReview, publicName };
