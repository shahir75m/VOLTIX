const crypto = require("crypto");
const Razorpay = require("razorpay");
const Counter = require("../models/Counter");
const Coupon = require("../models/Coupon");
const Order = require("../models/Order");
const Product = require("../models/Product");

// ------------------------------------------------------------------ RAZORPAY
const hasKeys = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
// Payment success is never simulated. Both Razorpay keys are required for online payments.
const isMock = () => false;
const paymentsEnabled = () => hasKeys;

const razorpay = hasKeys
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const round2 = (n) => Math.round(n * 100) / 100;

// Typed error so controllers can send the right HTTP status
class OrderError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// ------------------------------------------------------------------ COUPONS
// Coupons are created by the admin (Coupon collection). The checks below run on the server
// both when the customer applies a code and again when the order is created.

// Pure check of one coupon against the cart. Returns { discount, eligible } or throws OrderError.
function evaluateCoupon(coupon, view, now = new Date()) {
  if (!coupon || !coupon.isActive || coupon.isDeleted) throw new OrderError("Invalid coupon code");
  if (coupon.validFrom && new Date(coupon.validFrom) > now) throw new OrderError("This coupon is not active yet");
  if (coupon.validUntil && new Date(coupon.validUntil) < now) throw new OrderError("This coupon has expired");
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw new OrderError("This coupon has reached its usage limit");
  }

  // category coupons only count the items of that category
  const lines = view.items.filter((l) => !l.unavailable);
  const eligibleLines = coupon.category ? lines.filter((l) => l.categoryId === String(coupon.category)) : lines;
  const eligible = round2(eligibleLines.reduce((sum, l) => sum + l.lineTotal, 0));
  if (eligible <= 0) throw new OrderError("None of the items in your cart are eligible for this coupon");
  if (eligible < coupon.minOrder) {
    throw new OrderError(`Coupon requires a minimum order of ₹${coupon.minOrder.toLocaleString("en-IN")}${coupon.category ? " on eligible items" : ""}`);
  }

  let discount = coupon.discountType === "percent" ? Math.round((eligible * coupon.discountValue) / 100) : coupon.discountValue;
  if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, eligible);
  return { discount, eligible };
}

// Finds the coupon by code and also checks the rules that need the database
// (per-customer limit, first-order-only). Returns { coupon, discount }.
async function loadCoupon(code, userId, view) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean || clean.length > 20) throw new OrderError("Invalid coupon code");
  const coupon = await Coupon.findOne({ code: clean, isDeleted: false }).lean();
  const { discount } = evaluateCoupon(coupon, view);

  const used = await Order.countDocuments({ user: userId, couponId: coupon._id, status: { $ne: "Cancelled" } });
  if (used >= (coupon.perUserLimit || 1)) throw new OrderError("You have already used this coupon");

  if (coupon.firstOrderOnly) {
    const previous = await Order.countDocuments({ user: userId, status: { $ne: "Cancelled" } });
    if (previous > 0) throw new OrderError("This coupon is only valid on your first order");
  }
  return { coupon, discount };
}

// Takes one use of the coupon. The condition is part of the update, so two customers can never
// both take the last use.
async function reserveCoupon(couponId, session) {
  const result = await Coupon.updateOne(
    {
      _id: couponId,
      isActive: true,
      isDeleted: false,
      $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
    },
    { $inc: { usedCount: 1 } },
    session ? { session } : {}
  );
  if (result.matchedCount === 0) throw new OrderError("This coupon has reached its usage limit", 409);
}

// Gives the use back when an order is cancelled (only once per order).
async function releaseCouponOnce(order, session) {
  if (!order.couponId || order.couponReleased) return false;
  await Coupon.updateOne({ _id: order.couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, session ? { session } : {});
  order.couponReleased = true;
  return true;
}

// ------------------------------------------------------------------ PRICING
// Everything is calculated from the database cart. Nothing from the browser is trusted.
// Product prices are GST-inclusive, so tax is shown as "included" and not added again.
// `couponResult` is what loadCoupon() returned (or null).
function calculateTotals(view, couponResult) {
  const itemsPrice = round2(view.subtotal);
  const shippingPrice = round2(view.deliveryCharge);
  const discountPrice = couponResult ? couponResult.discount : 0;

  let taxPrice = view.items.reduce((sum, l) => {
    const rate = Number(l.gstPercent) || 0;
    return sum + (l.lineTotal - l.lineTotal / (1 + rate / 100));
  }, 0);
  // the discount lowers the taxable value too
  if (itemsPrice > 0 && discountPrice > 0) taxPrice *= (itemsPrice - discountPrice) / itemsPrice;

  const totalPrice = round2(Math.max(0, itemsPrice + shippingPrice - discountPrice));
  return {
    itemsPrice,
    shippingPrice,
    taxPrice: round2(taxPrice),
    discountPrice,
    couponCode: couponResult ? couponResult.coupon.code : "",
    totalPrice,
  };
}

// ------------------------------------------------------------------ ORDER NUMBER
// Atomic counter: two customers ordering at the same moment can never get the same number.
async function generateOrderNumber() {
  const counter = await Counter.findOneAndUpdate(
    { _id: "order" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  // first order = 1001. (Counter starts at 1.)
  return String(1000 + counter.seq);
}

// ------------------------------------------------------------------ STOCK
// One conditional update per line: "take qty only if stock >= qty". If two customers buy the last
// item together only one update matches, so overselling is impossible.
async function deductStock(items, session) {
  for (const item of items) {
    const filter = { _id: item.product, isDeleted: false, isBlocked: false, isPublished: true };
    let update;
    if (item.variantId) {
      filter.variants = { $elemMatch: { _id: item.variantId, stock: { $gte: item.qty } } };
      update = { $inc: { "variants.$.stock": -item.qty, stock: -item.qty } };
    } else {
      filter.stock = { $gte: item.qty };
      filter["variants.0"] = { $exists: false };
      update = { $inc: { stock: -item.qty } };
    }
    const result = await Product.updateOne(filter, update, { session });
    if (result.matchedCount === 0) {
      throw new OrderError(`Sorry, ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ""} is out of stock`, 409, {
        code: "OUT_OF_STOCK",
      });
    }
  }
}

async function restoreStock(items, session) {
  for (const item of items) {
    if (item.variantId) {
      await Product.updateOne(
        { _id: item.product, "variants._id": item.variantId },
        { $inc: { "variants.$.stock": item.qty, stock: item.qty } },
        { session }
      );
    } else {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: item.qty } }, { session });
    }
  }
}

// Idempotent wrappers: the flag on the order makes a retried call do nothing the second time.
async function deductStockOnce(order, session) {
  if (order.stockDeducted) return false;
  await deductStock(order.orderItems, session);
  order.stockDeducted = true;
  order.stockRestored = false;
  return true;
}

async function restoreStockOnce(order, session) {
  if (!order.stockDeducted || order.stockRestored) return false;
  await restoreStock(order.orderItems, session);
  order.stockRestored = true;
  return true;
}

// ------------------------------------------------------------------ HISTORY
function addStatus(order, status, by, note = "") {
  order.statusHistory.push({ status, by, note: String(note).slice(0, 300) });
}

function addPaymentLog(order, event, data = {}) {
  order.paymentLogs.push({
    event,
    razorpayOrderId: data.razorpayOrderId || order.razorpayOrderId || "",
    razorpayPaymentId: data.razorpayPaymentId || "",
    amount: data.amount ?? order.totalPrice,
    note: String(data.note || "").slice(0, 300),
  });
}

// ------------------------------------------------------------------ PAYMENTS
async function createGatewayOrder(totalPrice, receipt) {
  if (!hasKeys || !razorpay) throw new OrderError("Online payment is not available right now. Please choose Cash on Delivery.", 503);
  try {
    return await razorpay.orders.create({
      amount: toPaise(totalPrice),
      currency: "INR",
      receipt: String(receipt).slice(0, 40),
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error?.error || error);
    throw new OrderError("Payment gateway is not reachable. Please try again.", 502);
  }
}

function signatureIsValid(razorpayOrderId, razorpayPaymentId, signature) {
  if (!hasKeys || typeof signature !== "string") return false;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Asks Razorpay itself (server to server) for the real payment status and amount.
async function fetchVerifiedPayment(order, razorpayPaymentId) {
  if (!hasKeys || !razorpay) throw new OrderError("Razorpay is not configured", 503);
  let payment = await razorpay.payments.fetch(razorpayPaymentId);
  if (payment.status === "authorized") {
    payment = await razorpay.payments.capture(razorpayPaymentId, toPaise(order.totalPrice), "INR");
  }
  return payment;
}

// Returns the captured payment of a Razorpay order, if the customer already paid.
async function findCapturedPayment(order) {
  if (!hasKeys || !razorpay || !order.razorpayOrderId) return null;
  const list = await razorpay.orders.fetchPayments(order.razorpayOrderId);
  return (list.items || []).find((p) => p.status === "captured") || null;
}

// Refund is attempted after the database transaction is committed.
// The result is written on the order so an admin can see it if something fails.
async function refundOrder(order, note, amount) {
  const refundAmount = round2(amount > 0 ? Math.min(amount, order.totalPrice) : order.totalPrice);
  const partial = refundAmount < order.totalPrice;

  if (order.paymentMethod === "COD") {
    if (order.isPaid) {
      order.refundStatus = "Manual"; // cash was collected: refund has to be handled by the store
      addPaymentLog(order, "refund_manual", { amount: refundAmount, note: note || `Refund ${refundAmount} manually` });
      await order.save();
    }
    return;
  }
  if (!order.razorpayPaymentId || order.refundStatus === "Initiated" || order.refundStatus === "Processed") return;

  try {
    let refundId;
    {
      const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
        amount: toPaise(refundAmount),
        speed: "normal",
        receipt: `refund_${order.orderId}`,
        notes: { orderId: order.orderId, reason: String(note || "").slice(0, 200) },
      });
      refundId = refund.id;
    }
    order.refundId = refundId;
    order.refundStatus = "Initiated";
    order.refundedAt = new Date();
    if (!partial) order.paymentStatus = "Refunded"; // a partial refund keeps the order itself as paid
    addPaymentLog(order, "refund_initiated", { razorpayPaymentId: order.razorpayPaymentId, amount: refundAmount, note: `${refundId} ${note || ""}` });
  } catch (error) {
    order.refundStatus = "Failed";
    addPaymentLog(order, "refund_failed", {
      razorpayPaymentId: order.razorpayPaymentId,
      note: error?.error?.description || error.message,
    });
    console.error("Refund failed for order", order.orderId, error?.error || error);
  }
  await order.save();
}

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Fields that must never be sent to the browser
const PRIVATE_ORDER_FIELDS = "-razorpaySignature -idempotencyKey -paymentLogs";

module.exports = {
  OrderError,
  evaluateCoupon,
  loadCoupon,
  reserveCoupon,
  releaseCouponOnce,
  calculateTotals,
  generateOrderNumber,
  deductStock,
  restoreStock,
  deductStockOnce,
  restoreStockOnce,
  addStatus,
  addPaymentLog,
  createGatewayOrder,
  signatureIsValid,
  fetchVerifiedPayment,
  findCapturedPayment,
  refundOrder,
  paymentsEnabled,
  isMock,
  toPaise,
  escapeRegex,
  PRIVATE_ORDER_FIELDS,
};
