const mongoose = require("mongoose");
const Coupon = require("../models/Coupon");
const Offer = require("../models/Offer");
const Category = require("../models/Category");
const { detectImageType, uploadBuffer, destroyImages } = require("../utils/imageUpload");

const isId = (id) => mongoose.isValidObjectId(id);
const fail = (res, status, message, error) => {
  const detail = error && status >= 500 && process.env.NODE_ENV !== "production" ? ` (${error.name}: ${String(error.message).slice(0, 160)})` : "";
  return res.status(status).json({ success: false, message: message + detail });
};
const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

// "2026-10-31" -> last millisecond of that day (so "valid until 31 Oct" includes the whole day)
const endOfDay = (value) => {
  const d = new Date(value);
  if (isNaN(d)) return null;
  d.setHours(23, 59, 59, 999);
  return d;
};
const startOfDay = (value) => {
  const d = new Date(value);
  if (isNaN(d)) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};
const bool = (v) => v === true || v === "true" || v === "on" || v === "1";

// ====================================================================== COUPONS (admin)
const couponStatus = (c, now = new Date()) => {
  if (c.isDeleted) return "Deleted";
  if (!c.isActive) return "Disabled";
  if (c.validUntil && new Date(c.validUntil) < now) return "Expired";
  if (c.validFrom && new Date(c.validFrom) > now) return "Scheduled";
  if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) return "Used up";
  return "Active";
};

const discountText = (c) =>
  c.discountType === "percent"
    ? `${c.discountValue}% off${c.maxDiscount ? ` (up to ${inr(c.maxDiscount)})` : ""}`
    : `${inr(c.discountValue)} off`;

function readCoupon(body, existing) {
  const out = {};
  const code = String(body.code ?? existing?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) return { error: "Coupon code must be 3-20 letters or digits (no spaces)" };
  if (existing && existing.usedCount > 0 && code !== existing.code) return { error: "The code cannot be changed after the coupon was used" };
  out.code = code;

  out.discountType = body.discountType;
  if (!["percent", "flat"].includes(out.discountType)) return { error: "Choose a discount type" };
  out.discountValue = Number(body.discountValue);
  if (!Number.isFinite(out.discountValue) || out.discountValue < 1) return { error: "Discount value must be at least 1" };
  if (out.discountType === "percent" && out.discountValue > 90) return { error: "A percentage coupon can be at most 90%" };
  if (out.discountType === "flat" && out.discountValue > 1000000) return { error: "Discount value is too large" };

  out.maxDiscount = Number(body.maxDiscount || 0);
  out.minOrder = Number(body.minOrder || 0);
  out.usageLimit = Number(body.usageLimit || 0);
  out.perUserLimit = Number(body.perUserLimit || 1);
  if (![out.maxDiscount, out.minOrder, out.usageLimit].every((n) => Number.isFinite(n) && n >= 0)) return { error: "Amounts and limits cannot be negative" };
  if (!Number.isInteger(out.usageLimit)) return { error: "Usage limit must be a whole number" };
  if (!Number.isInteger(out.perUserLimit) || out.perUserLimit < 1) return { error: "Uses per customer must be at least 1" };
  if (out.discountType === "flat" && out.minOrder && out.discountValue > out.minOrder) return { error: "A flat discount cannot be more than the minimum order" };

  out.category = body.category ? body.category : null;
  if (out.category && !isId(out.category)) return { error: "Invalid category" };

  out.validFrom = body.validFrom ? startOfDay(body.validFrom) : null;
  out.validUntil = body.validUntil ? endOfDay(body.validUntil) : null;
  if ((body.validFrom && !out.validFrom) || (body.validUntil && !out.validUntil)) return { error: "Enter valid dates" };
  if (out.validFrom && out.validUntil && out.validUntil < out.validFrom) return { error: "'Valid until' must be after 'Valid from'" };
  if (!existing && out.validUntil && out.validUntil < new Date()) return { error: "'Valid until' is already in the past" };

  out.description = String(body.description || "").trim().slice(0, 160);
  out.firstOrderOnly = bool(body.firstOrderOnly);
  out.showOnOffersPage = body.showOnOffersPage === undefined ? true : bool(body.showOnOffersPage);
  out.isActive = body.isActive === undefined ? true : bool(body.isActive);
  return { data: out };
}

const serializeCoupon = (c) => ({ ...c, status: couponStatus(c), discountText: discountText(c) });

// GET /api/admin/coupons
const listCoupons = async (req, res) => {
  try {
    const status = req.query.status || "all";
    if (!["all", "deleted"].includes(status)) return fail(res, 400, "Invalid status filter");
    const coupons = await Coupon.find({ isDeleted: status === "deleted" }).populate("category", "name").sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, coupons: coupons.map(serializeCoupon) });
  } catch (error) {
    console.error("List coupons:", error);
    return fail(res, 500, "Failed to load coupons", error);
  }
};

// POST /api/admin/coupons
const createCoupon = async (req, res) => {
  try {
    const { data, error } = readCoupon(req.body || {});
    if (error) return fail(res, 400, error);
    if (data.category && !(await Category.exists({ _id: data.category, isDeleted: false }))) return fail(res, 400, "Selected category was not found");
    const coupon = await Coupon.create(data);
    return res.status(201).json({ success: true, message: `Coupon ${coupon.code} created`, coupon: serializeCoupon(coupon.toObject()) });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, "A coupon with this code already exists");
    console.error("Create coupon:", error);
    return fail(res, 500, "Failed to create coupon", error);
  }
};

// PUT /api/admin/coupons/:id
const updateCoupon = async (req, res) => {
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Coupon not found");
    const existing = await Coupon.findOne({ _id: req.params.id, isDeleted: false });
    if (!existing) return fail(res, 404, "Coupon not found");
    const { data, error } = readCoupon(req.body || {}, existing);
    if (error) return fail(res, 400, error);
    if (data.category && !(await Category.exists({ _id: data.category, isDeleted: false }))) return fail(res, 400, "Selected category was not found");
    if (data.usageLimit > 0 && data.usageLimit < existing.usedCount) return fail(res, 400, `This coupon was already used ${existing.usedCount} times. The limit cannot be lower.`);
    existing.set(data);
    await existing.save();
    return res.status(200).json({ success: true, message: "Coupon updated", coupon: serializeCoupon(existing.toObject()) });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, "A coupon with this code already exists");
    console.error("Update coupon:", error);
    return fail(res, 500, "Failed to update coupon", error);
  }
};

// DELETE /api/admin/coupons/:id  (soft delete: orders that used it keep their record)
const deleteCoupon = async (req, res) => {
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Coupon not found");
    const result = await Coupon.updateOne({ _id: req.params.id, isDeleted: false }, { $set: { isDeleted: true, deletedAt: new Date() } });
    if (!result.matchedCount) return fail(res, 404, "Coupon not found");
    return res.status(200).json({ success: true, message: "Coupon deleted" });
  } catch (error) {
    console.error("Delete coupon:", error);
    return fail(res, 500, "Failed to delete coupon", error);
  }
};

const restoreCoupon = async (req, res) => {
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Coupon not found");
    const coupon = await Coupon.findOneAndUpdate(
      { _id: req.params.id, isDeleted: true },
      { $set: { isDeleted: false, deletedAt: null } },
      { new: true }
    );
    if (!coupon) return fail(res, 404, "Deleted coupon not found");
    return res.status(200).json({ success: true, message: "Coupon restored", coupon: serializeCoupon(coupon.toObject()) });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, "A coupon with this code already exists");
    return fail(res, 500, "Failed to restore coupon", error);
  }
};

// ====================================================================== OFFERS (admin)
const offerStatus = (o, now = new Date()) => {
  if (o.isDeleted) return "Deleted";
  if (!o.isActive) return "Disabled";
  if (new Date(o.endDate) < now) return "Expired";
  if (new Date(o.startDate) > now) return "Scheduled";
  return "Active";
};

const offerLink = (o) => {
  if (o.appliesTo === "category" && o.category) return `/products?category=${o.category._id || o.category}`;
  if (o.appliesTo === "custom" && o.linkUrl) return o.linkUrl;
  return "/products";
};

const serializeOffer = (o) => ({ ...o, status: offerStatus(o), link: offerLink(o), appliesToLabel: o.appliesTo === "category" ? o.category?.name || "Category" : o.appliesTo === "all" ? "All products" : "Custom link" });

function readOffer(body, existing, hasImage) {
  const out = {};
  out.name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  if (out.name.length < 2 || out.name.length > 60) return { error: "Offer name must be 2-60 characters" };

  out.appliesTo = body.appliesTo;
  if (!["all", "category", "custom"].includes(out.appliesTo)) return { error: "Choose what the offer applies to" };
  out.category = null;
  out.linkUrl = "";
  if (out.appliesTo === "category") {
    if (!isId(body.category)) return { error: "Select a category" };
    out.category = body.category;
  }
  if (out.appliesTo === "custom") {
    const link = String(body.linkUrl || "").trim();
    // only a path on this site or an https link: never javascript: or other schemes
    if (!/^(\/[A-Za-z0-9\-._~/?=&%#]*|https:\/\/[^\s]+)$/.test(link) || link.length > 200) return { error: "Link must start with / (page on this site) or https://" };
    out.linkUrl = link;
  }

  out.discountLabel = String(body.discountLabel || "").trim().slice(0, 40);
  out.description = String(body.description || "").trim().slice(0, 160);
  out.startDate = startOfDay(body.startDate);
  out.endDate = endOfDay(body.endDate);
  if (!out.startDate || !out.endDate) return { error: "Start and end date are required" };
  if (out.endDate < out.startDate) return { error: "End date must be after the start date" };

  out.showOnHome = bool(body.showOnHome);
  out.showOnOffers = body.showOnOffers === undefined ? true : bool(body.showOnOffers);
  if (!out.showOnHome && !out.showOnOffers) return { error: "Show the offer on the home page, the offers page, or both" };
  if (out.showOnHome && !hasImage) return { error: "A banner image is required to show an offer on the home page" };
  out.sortOrder = Math.max(0, Math.min(999, parseInt(body.sortOrder, 10) || 0));
  out.isActive = body.isActive === undefined ? true : bool(body.isActive);
  return { data: out };
}

// GET /api/admin/offers
const listOffers = async (req, res) => {
  try {
    const status = req.query.status || "all";
    if (!["all", "deleted"].includes(status)) return fail(res, 400, "Invalid status filter");
    const offers = await Offer.find({ isDeleted: status === "deleted" }).populate("category", "name").sort({ startDate: -1 }).lean();
    return res.status(200).json({ success: true, offers: offers.map(serializeOffer) });
  } catch (error) {
    console.error("List offers:", error);
    return fail(res, 500, "Failed to load offers", error);
  }
};

async function storeImage(file) {
  if (!detectImageType(file.buffer)) throw Object.assign(new Error("Banner must be a real JPG, PNG or WebP image"), { status: 400 });
  const result = await uploadBuffer(file.buffer, "voltix/offers", [{ width: 1600, crop: "limit", quality: "auto" }]);
  return { url: result.secure_url, publicId: result.public_id };
}

// POST /api/admin/offers  (multipart: fields + optional image)
const createOffer = async (req, res) => {
  let image = null;
  try {
    const { data, error } = readOffer(req.body || {}, null, Boolean(req.file));
    if (error) return fail(res, 400, error);
    if (data.category && !(await Category.exists({ _id: data.category, isDeleted: false }))) return fail(res, 400, "Selected category was not found");
    if (req.file) image = await storeImage(req.file);
    const offer = await Offer.create({ ...data, image: image || { url: "", publicId: "" } });
    return res.status(201).json({ success: true, message: "Offer created", offer: serializeOffer((await offer.populate("category", "name")).toObject()) });
  } catch (error) {
    if (image) await destroyImages([image.publicId]);
    if (error.status === 400) return fail(res, 400, error.message);
    console.error("Create offer:", error);
    return fail(res, 500, "Failed to create offer", error);
  }
};

// PUT /api/admin/offers/:id  (multipart; send removeImage=true to delete the banner)
const updateOffer = async (req, res) => {
  let image = null;
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Offer not found");
    const offer = await Offer.findOne({ _id: req.params.id, isDeleted: false });
    if (!offer) return fail(res, 404, "Offer not found");

    const removeImage = bool(req.body?.removeImage);
    const willHaveImage = Boolean(req.file) || (Boolean(offer.image?.url) && !removeImage);
    const { data, error } = readOffer(req.body || {}, offer, willHaveImage);
    if (error) return fail(res, 400, error);
    if (data.category && !(await Category.exists({ _id: data.category, isDeleted: false }))) return fail(res, 400, "Selected category was not found");

    const oldId = offer.image?.publicId;
    if (req.file) {
      image = await storeImage(req.file);
      offer.image = image;
    } else if (removeImage) {
      offer.image = { url: "", publicId: "" };
    }
    offer.set(data);
    await offer.save();
    if ((req.file || removeImage) && oldId) await destroyImages([oldId]);
    await offer.populate("category", "name");
    return res.status(200).json({ success: true, message: "Offer updated", offer: serializeOffer(offer.toObject()) });
  } catch (error) {
    if (image) await destroyImages([image.publicId]);
    if (error.status === 400) return fail(res, 400, error.message);
    console.error("Update offer:", error);
    return fail(res, 500, "Failed to update offer", error);
  }
};

// DELETE /api/admin/offers/:id
const deleteOffer = async (req, res) => {
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Offer not found");
    const offer = await Offer.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { $set: { isDeleted: true, deletedAt: new Date() } });
    if (!offer) return fail(res, 404, "Offer not found");
    return res.status(200).json({ success: true, message: "Offer deleted" });
  } catch (error) {
    console.error("Delete offer:", error);
    return fail(res, 500, "Failed to delete offer", error);
  }
};

const restoreOffer = async (req, res) => {
  try {
    if (!isId(req.params.id)) return fail(res, 404, "Offer not found");
    const offer = await Offer.findOneAndUpdate(
      { _id: req.params.id, isDeleted: true },
      { $set: { isDeleted: false, deletedAt: null } },
      { new: true }
    ).populate("category", "name");
    if (!offer) return fail(res, 404, "Deleted offer not found");
    return res.status(200).json({ success: true, message: "Offer restored", offer: serializeOffer(offer.toObject()) });
  } catch (error) {
    return fail(res, 500, "Failed to restore offer", error);
  }
};

// ====================================================================== PUBLIC
// GET /api/offers?placement=home|offers
// Live offers (and, for the offers page, the public coupon codes). Nothing private is returned.
const getPublicPromos = async (req, res) => {
  try {
    const now = new Date();
    const placement = req.query.placement;
    const filter = { isDeleted: false, isActive: true, startDate: { $lte: now }, endDate: { $gte: now } };
    if (placement === "home") filter.showOnHome = true;
    else filter.showOnOffers = true;

    const offers = await Offer.find(filter).populate("category", "name isDeleted").sort({ sortOrder: 1, startDate: -1 }).limit(12).lean();
    const live = offers.filter((o) => !(o.appliesTo === "category" && (!o.category || o.category.isDeleted)));

    const result = {
      success: true,
      offers: live.map((o) => ({
        _id: o._id,
        name: o.name,
        discountLabel: o.discountLabel,
        description: o.description,
        image: o.image?.url || "",
        link: offerLink(o),
        endsOn: fmtDate(o.endDate),
        startsOn: fmtDate(o.startDate),
        appliesToLabel: o.appliesTo === "category" ? o.category?.name : o.appliesTo === "all" ? "All products" : "",
      })),
    };

    if (placement !== "home") {
      const coupons = await Coupon.find({
        isDeleted: false,
        isActive: true,
        showOnOffersPage: true,
        $and: [
          { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
          { $or: [{ validUntil: null }, { validUntil: { $gte: now } }] },
          { $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }] },
        ],
      })
        .populate("category", "name")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      result.coupons = coupons.map((c) => ({
        code: c.code,
        headline: c.discountType === "percent" ? `${c.discountValue}% off${c.category ? ` ${c.category.name}` : ""}` : `${inr(c.discountValue)} off${c.category ? ` ${c.category.name}` : ""}`,
        condition: [
          c.minOrder ? `On ${c.category ? `${c.category.name} ` : ""}orders above ${inr(c.minOrder)}.` : c.category ? `On ${c.category.name} items.` : "",
          c.firstOrderOnly ? "First order only." : "",
          c.validUntil ? `Valid until ${fmtDate(c.validUntil)}.` : "",
        ].filter(Boolean).join(" "),
      }));
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Public promos:", error);
    return fail(res, 500, "Failed to load offers", error);
  }
};

module.exports = { listCoupons, createCoupon, updateCoupon, deleteCoupon, restoreCoupon, listOffers, createOffer, updateOffer, deleteOffer, restoreOffer, getPublicPromos, couponStatus, offerStatus };
