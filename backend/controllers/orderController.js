const mongoose = require("mongoose");
const Order = require("../models/Order");
const Wallet = require("../models/Wallet");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const Address = require("../models/Address");
const shop = require("../config/shop");
const { buildCartView, validateCartForCheckout } = require("../services/cartService");
const { isVisibleToCustomer } = require("../services/productService");
const { generateInvoicePDF } = require("../services/invoiceService");
const svc = require("../services/orderService");
const { detectImageType, uploadBuffer, destroyImages } = require("../utils/imageUpload");

const { OrderError } = svc;
const ORDER_STATUSES = ["Pending", "Confirmed", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned"];
const isId = (id) => mongoose.isValidObjectId(id);

// Sends the right HTTP response for any error thrown inside a controller
function fail(res, error, fallback = "Something went wrong. Please try again.") {
  if (error instanceof OrderError) {
    return res.status(error.status).json({ success: false, message: error.message, ...error.extra });
  }
  if (error?.code === 11000) {
    return res.status(409).json({ success: false, message: "This request was already processed." });
  }
  console.error(fallback, error);
  const detail = process.env.NODE_ENV === "production" ? "" : ` (${error?.name || "Error"}: ${String(error?.message || error).slice(0, 160)})`;
  return res.status(500).json({ success: false, message: fallback + detail });
}

// Runs `work` inside a database transaction. withTransaction() also retries automatically on
// write conflicts, so `work` must only touch the database through `session`.
async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    session.endSession();
  }
}

const publicOrder = (order) => {
  const obj = order.toObject ? order.toObject() : order;
  delete obj.razorpaySignature;
  delete obj.idempotencyKey;
  delete obj.paymentLogs;
  return obj;
};

const gatewayPayload = (order) => ({
  razorpayKey: process.env.RAZORPAY_KEY_ID || "",
  mock: svc.isMock(),
  razorpayOrder: {
    id: order.razorpayOrderId,
    amount: svc.toPaise(order.totalPrice),
    currency: "INR",
  },
});

const clean = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

// ---------------------------------------------------------------- ADDRESS
async function resolveAddress(userId, body) {
  if (body.addressId) {
    if (!isId(body.addressId)) throw new OrderError("Invalid delivery address");
    const saved = await Address.findOne({ _id: body.addressId, user: userId }).lean();
    if (!saved) throw new OrderError("Delivery address not found");
    const { fullName, phone, addressLine1, addressLine2, city, district, state, pincode } = saved;
    return { fullName, phone, addressLine1, addressLine2: addressLine2 || "", city, district: district || "", state, pincode };
  }

  const a = body.shippingAddress || {};
  const address = {
    fullName: clean(a.fullName, 60),
    phone: clean(a.phone, 10),
    addressLine1: clean(a.addressLine1, 200),
    addressLine2: clean(a.addressLine2, 200),
    city: clean(a.city, 100),
    district: clean(a.district, 100),
    state: clean(a.state, 100),
    pincode: clean(a.pincode, 6),
  };
  if (!address.fullName || !address.addressLine1 || !address.city || !address.state) {
    throw new OrderError("Complete delivery address is required");
  }
  if (!/^[6-9]\d{9}$/.test(address.phone)) throw new OrderError("Enter a valid 10-digit mobile number");
  if (!/^[1-9]\d{5}$/.test(address.pincode)) throw new OrderError("Enter a valid 6-digit pincode");
  return address;
}

// ---------------------------------------------------------------- CHECKOUT SUMMARY / COUPON
// @route POST /api/orders/summary   – amounts for the checkout page, always from the database cart
const getCheckoutSummary = async (req, res) => {
  try {
    const view = await buildCartView(req.user._id);
    if (!view.lineCount) throw new OrderError("Your cart is empty");
    let totals;
    const code = typeof req.body?.couponCode === "string" ? req.body.couponCode : "";
    try {
      totals = svc.calculateTotals(view, code ? await svc.loadCoupon(code, req.user._id, view) : null);
    } catch (error) {
      if (!(error instanceof OrderError)) throw error;
      totals = { ...svc.calculateTotals(view, null), couponError: error.message };
    }
    return res.status(200).json({
      success: true,
      totals,
      codAvailable: view.codAvailable,
      canCheckout: view.canCheckout,
      onlinePaymentAvailable: svc.paymentsEnabled(),
      demoPayments: false,
      walletBalance: Number((await Wallet.findOne({ user: req.user._id }).select("balance").lean())?.balance || 0),
    });
  } catch (error) {
    return fail(res, error, "Failed to load checkout summary");
  }
};

// @route POST /api/orders/apply-coupon
const applyCoupon = async (req, res) => {
  try {
    const code = req.body?.code;
    if (!code || typeof code !== "string") throw new OrderError("Coupon code is required");
    const view = await buildCartView(req.user._id);
    if (!view.lineCount) throw new OrderError("Your cart is empty");
    const totals = svc.calculateTotals(view, await svc.loadCoupon(code, req.user._id, view));
    return res.status(200).json({
      success: true,
      message: `Coupon ${totals.couponCode} applied successfully!`,
      code: totals.couponCode,
      discount: totals.discountPrice,
      finalTotal: totals.totalPrice,
      totals,
    });
  } catch (error) {
    return fail(res, error, "Failed to apply coupon");
  }
};

// ---------------------------------------------------------------- CREATE ORDER
// @route POST /api/orders
// Body: { addressId | shippingAddress, paymentMethod: "COD" | "Razorpay" | "Wallet", couponCode?, idempotencyKey }
// Items and prices are NOT taken from the browser – the server reads the customer's cart.
//
// Stock flow:  COD      -> stock is taken now (order is Confirmed immediately)
//              Razorpay -> order stays Pending, stock is taken when the payment is verified
const createOrder = async (req, res) => {
  try {
    const { paymentMethod, couponCode } = req.body || {};
    const idempotencyKey =
      typeof req.body?.idempotencyKey === "string" && /^[\w-]{8,100}$/.test(req.body.idempotencyKey)
        ? req.body.idempotencyKey
        : undefined;

    if (!["COD", "Razorpay", "Wallet"].includes(paymentMethod)) throw new OrderError("Select a valid payment method");

    // Same checkout attempt sent twice (double click, slow network) -> return the first order
    if (idempotencyKey) {
      const existing = await Order.findOne({ user: req.user._id, idempotencyKey });
      if (existing) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: "Order already placed",
          order: publicOrder(existing),
          ...(existing.paymentMethod === "Razorpay" ? gatewayPayload(existing) : {}),
        });
      }
    }

    const shippingAddress = await resolveAddress(req.user._id, req.body || {});

    const check = await validateCartForCheckout(req.user._id, req.body?.expectedCartTotal);
    if (!check.ok) throw new OrderError(check.message, check.status);
    const view = check.view;

    if (paymentMethod === "COD" && !view.codAvailable) {
      throw new OrderError("Cash on delivery is not available for one or more items in your cart");
    }

    const couponResult = couponCode ? await svc.loadCoupon(couponCode, req.user._id, view) : null;
    const totals = svc.calculateTotals(view, couponResult);
    if (totals.totalPrice <= 0) throw new OrderError("Order total must be greater than zero");

    const orderItems = view.items.map((l) => ({
      product: l.productId,
      variantId: l.variantId || null,
      name: l.name,
      variantLabel: l.variantLabel || "",
      image: l.image || "",
      qty: l.quantity,
      price: l.unitPrice,
      gstPercent: l.gstPercent || 0,
      lineTotal: l.lineTotal,
    }));

    const orderId = await svc.generateOrderNumber();
    const base = {
      orderId,
      user: req.user._id,
      idempotencyKey,
      orderItems,
      shippingAddress,
      paymentMethod,
      ...totals,
      couponId: couponResult ? couponResult.coupon._id : undefined,
    };

    // ---- Cash on delivery: stock + order + cart cleanup in ONE transaction
    if (paymentMethod === "COD") {
      const order = await inTransaction(async (session) => {
        const doc = new Order({ ...base, status: "Confirmed", paymentStatus: "Pending" });
        svc.addStatus(doc, "Confirmed", "system", "Cash on delivery order placed");
        await svc.deductStockOnce(doc, session);
        if (couponResult) await svc.reserveCoupon(couponResult.coupon._id, session);
        await doc.save({ session });
        await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } }, { session });
        return doc;
      });
      return res.status(201).json({ success: true, message: "Order placed successfully!", order: publicOrder(order) });
    }

    // ---- Wallet: debit store credit and confirm the order atomically.
    if (paymentMethod === "Wallet") {
      const order = await inTransaction(async (session) => {
        const doc = new Order({ ...base, status: "Confirmed", paymentStatus: "Completed", isPaid: true, paidAt: new Date() });
        const wallet = await Wallet.findOneAndUpdate(
          { user: req.user._id, balance: { $gte: totals.totalPrice } },
          {
            $inc: { balance: -totals.totalPrice },
            $push: { transactions: { type: "Debit", amount: totals.totalPrice, description: `Payment for order #${orderId}`, sourceOrderId: doc._id } },
          },
          { returnDocument: "after", session }
        );
        if (!wallet) throw new OrderError("Insufficient wallet balance. Choose another payment method or request store credit after a return.", 409);
        svc.addStatus(doc, "Confirmed", "payment", "Paid using wallet balance");
        svc.addPaymentLog(doc, "wallet_payment", { amount: totals.totalPrice, note: "Wallet balance debited" });
        await svc.deductStockOnce(doc, session);
        if (couponResult) await svc.reserveCoupon(couponResult.coupon._id, session);
        await doc.save({ session });
        await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } }, { session });
        return doc;
      });
      return res.status(201).json({ success: true, message: "Order paid using wallet balance", order: publicOrder(order) });
    }

    // ---- Razorpay: create the gateway order first, then save our order as Pending
    if (!svc.paymentsEnabled()) {
      throw new OrderError("Online payment is not available right now. Please choose Cash on Delivery.", 503);
    }
    const gateway = await svc.createGatewayOrder(totals.totalPrice, `rcpt_${orderId}`);
    if (couponResult) await svc.reserveCoupon(couponResult.coupon._id);
    const doc = new Order({
      ...base,
      status: "Pending",
      paymentStatus: "Pending",
      razorpayOrderId: gateway.id,
      paymentAttempts: 1,
    });
    svc.addStatus(doc, "Pending", "system", "Waiting for online payment");
    svc.addPaymentLog(doc, "gateway_order_created", { razorpayOrderId: gateway.id });
    try {
      await doc.save();
    } catch (saveError) {
      await svc.releaseCouponOnce(doc); // do not keep a coupon use for an order that was not saved
      throw saveError;
    }

    return res.status(201).json({
      success: true,
      message: "Order initialized. Proceed to payment.",
      order: publicOrder(doc),
      ...gatewayPayload(doc),
    });
  } catch (error) {
    // two requests with the same key raced each other: return the winner
    if (error?.code === 11000 && req.body?.idempotencyKey) {
      const existing = await Order.findOne({ user: req.user._id, idempotencyKey: req.body.idempotencyKey });
      if (existing) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          order: publicOrder(existing),
          ...(existing.paymentMethod === "Razorpay" ? gatewayPayload(existing) : {}),
        });
      }
    }
    return fail(res, error, "Failed to create order");
  }
};

// ---------------------------------------------------------------- PAYMENT CONFIRMATION
// Used by verify-payment and retry-payment. `payment` is data that came straight from Razorpay.
// Safe to call many times: an order that is already paid is returned untouched.
async function finalizePayment(orderDbId, userId, payment, signature) {
  const apply = async (session, soldOut) => {
    const order = await Order.findOne({ _id: orderDbId, user: userId }).session(session);
    if (!order) throw new OrderError("Order not found", 404);

    const out = { already: false, refund: false, soldOut: false, note: "" };
    if (["Completed", "Refunded"].includes(order.paymentStatus)) {
      out.already = true;
      return out;
    }

    order.paymentStatus = "Completed";
    order.isPaid = true;
    order.paidAt = new Date();
    order.razorpayPaymentId = payment.id;
    if (signature) order.razorpaySignature = signature;
    svc.addPaymentLog(order, "payment_verified", { razorpayPaymentId: payment.id, amount: payment.amount / 100 });

    if (order.status === "Cancelled") {
      // customer paid after the order was cancelled -> money goes back
      out.refund = true;
      out.note = "Payment received after the order was cancelled";
      svc.addPaymentLog(order, "paid_after_cancel", { razorpayPaymentId: payment.id });
    } else if (soldOut) {
      order.status = "Cancelled";
      order.cancelReason = "Item went out of stock while the payment was being made";
      order.cancelledAt = new Date();
      await svc.releaseCouponOnce(order, session);
      svc.addStatus(order, "Cancelled", "system", order.cancelReason);
      out.refund = true;
      out.soldOut = true;
      out.note = order.cancelReason;
    } else {
      await svc.deductStockOnce(order, session); // throws OUT_OF_STOCK -> whole transaction rolls back
      order.status = "Confirmed";
      svc.addStatus(order, "Confirmed", "payment", "Online payment verified");
    }

    await order.save({ session });
    return out;
  };

  let outcome;
  try {
    outcome = await inTransaction((session) => apply(session, false));
  } catch (error) {
    if (error instanceof OrderError && error.extra?.code === "OUT_OF_STOCK") {
      outcome = await inTransaction((session) => apply(session, true));
    } else {
      throw error;
    }
  }

  let order = await Order.findById(orderDbId);
  if (outcome.refund) await svc.refundOrder(order, outcome.note);
  order = await Order.findById(orderDbId);

  // remove the bought lines from the cart (only now, so a failed payment never empties the cart)
  if (!outcome.already && !outcome.refund) {
    const lines = order.orderItems.map((i) => ({ product: i.product, variant: i.variantId || null }));
    await Cart.updateOne({ user: userId }, { $pull: { items: { $or: lines } } }).catch(() => {});
  }

  return { order, ...outcome };
}

const paymentResponse = (res, result) => {
  if (result.soldOut) {
    return res.status(409).json({
      success: false,
      soldOut: true,
      message: "Sorry, an item sold out while you were paying. Your order was cancelled and the amount will be refunded.",
      order: publicOrder(result.order),
    });
  }
  if (result.refund) {
    return res.status(409).json({
      success: false,
      message: "This order was cancelled earlier. The amount will be refunded.",
      order: publicOrder(result.order),
    });
  }
  return res.status(200).json({
    success: true,
    message: result.already ? "Order is already paid" : "Payment verified successfully!",
    order: publicOrder(result.order),
  });
};

// @route POST /api/orders/:id/verify-payment
const verifyRazorpayPayment = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) throw new OrderError("Order not found", 404);
    if (order.paymentMethod !== "Razorpay") throw new OrderError("This order does not need online payment");

    // already paid -> same answer again (safe to retry)
    if (["Completed", "Refunded"].includes(order.paymentStatus)) {
      return res.status(200).json({ success: true, message: "Order is already paid", order: publicOrder(order) });
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
    if (typeof razorpayOrderId !== "string" || typeof razorpayPaymentId !== "string") {
      throw new OrderError("Payment details are missing");
    }
    const log = (event, note) =>
      Order.updateOne(
        { _id: order._id },
        { $push: { paymentLogs: { event, razorpayOrderId, razorpayPaymentId, amount: order.totalPrice, note } } }
      );

    if (razorpayOrderId !== order.razorpayOrderId) {
      await log("verify_rejected", "Gateway order id does not belong to this order");
      throw new OrderError("Payment verification failed");
    }

    if (!svc.signatureIsValid(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      await log("signature_mismatch", "Invalid Razorpay signature");
      throw new OrderError("Payment verification failed: invalid signature");
    }

    // second check: ask Razorpay for the real status and amount
    let payment;
    try {
      payment = await svc.fetchVerifiedPayment(order, razorpayPaymentId);
    } catch (error) {
      console.error("Razorpay payment fetch failed:", error?.error || error);
      throw new OrderError("Could not confirm the payment with Razorpay. Please try again in a moment.", 502);
    }
    if (
      payment.status !== "captured" ||
      payment.order_id !== order.razorpayOrderId ||
      Number(payment.amount) !== svc.toPaise(order.totalPrice)
    ) {
      await log("verify_rejected", `Gateway status=${payment.status}, amount=${payment.amount}`);
      throw new OrderError("Payment was not completed or the amount does not match");
    }

    const result = await finalizePayment(order._id, req.user._id, payment, razorpaySignature);
    return paymentResponse(res, result);
  } catch (error) {
    return fail(res, error, "Payment verification failed");
  }
};

// @route POST /api/orders/:id/payment-failed – keeps the order so the customer can retry
const recordPaymentFailure = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const reason = clean(req.body?.reason, 200) || "Payment failed or was closed by the customer";
    const updated = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        paymentMethod: "Razorpay",
        status: "Pending",
        paymentStatus: { $in: ["Pending", "Failed"] }, // a paid order can never be flipped back to Failed
      },
      { $set: { paymentStatus: "Failed" }, $push: { paymentLogs: { event: "payment_failed", note: reason, amount: 0 } } },
      { returnDocument: "after" }
    );
    const order = updated || (await Order.findOne({ _id: req.params.id, user: req.user._id }));
    if (!order) throw new OrderError("Order not found", 404);
    return res.status(200).json({
      success: true,
      message: "Payment marked as failed. Your order is saved and you can retry.",
      order: publicOrder(order),
    });
  } catch (error) {
    return fail(res, error, "Failed to update payment status");
  }
};

// @route POST /api/orders/:id/retry-payment – pay again for the SAME order (no duplicate order)
const retryPayment = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) throw new OrderError("Order not found", 404);

    if (["Completed", "Refunded"].includes(order.paymentStatus)) {
      return res.status(200).json({ success: true, paid: true, message: "Order is already paid", order: publicOrder(order) });
    }
    if (order.paymentMethod !== "Razorpay" || order.status !== "Pending") {
      throw new OrderError("Payment cannot be retried for this order");
    }

    // The customer may have paid but closed the browser before we heard back: check with Razorpay
    try {
      const captured = await svc.findCapturedPayment(order);
      if (captured && Number(captured.amount) === svc.toPaise(order.totalPrice)) {
        const result = await finalizePayment(order._id, req.user._id, captured, "");
        if (result.soldOut || result.refund) return paymentResponse(res, result);
        return res.status(200).json({ success: true, paid: true, message: "Payment received", order: publicOrder(result.order) });
      }
    } catch (error) {
      if (error instanceof OrderError) throw error;
      console.error("Payment reconcile failed:", error?.error || error);
    }

    // items must still be in stock
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product).lean();
      const variant = item.variantId ? product?.variants?.find((v) => String(v._id) === String(item.variantId)) : null;
      const stock = item.variantId ? variant?.stock : product?.stock;
      const sellable = product && !product.isDeleted && !product.isBlocked && product.isPublished;
      if (!sellable || (item.variantId && !variant) || (stock || 0) < item.qty) {
        throw new OrderError(`${item.name} is no longer available in the requested quantity. Please cancel this order and place a new one.`, 409);
      }
    }

    if (!svc.paymentsEnabled()) throw new OrderError("Online payment is not available right now.", 503);

    // the same Razorpay order is reused, so a late payment on an earlier attempt is still matched
    if (!order.razorpayOrderId) {
      const gateway = await svc.createGatewayOrder(order.totalPrice, `rcpt_${order.orderId}`);
      order.razorpayOrderId = gateway.id;
    }
    order.paymentStatus = "Pending";
    order.paymentAttempts += 1;
    svc.addPaymentLog(order, "retry_started", { note: `Attempt ${order.paymentAttempts}` });
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Ready for payment",
      order: publicOrder(order),
      ...gatewayPayload(order),
    });
  } catch (error) {
    return fail(res, error, "Failed to retry payment");
  }
};

// ---------------------------------------------------------------- READ
// @route GET /api/orders/myorders?status=&search=
const getMyOrders = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = { user: req.user._id };

    if (status === "Processing") filter.status = { $in: ["Pending", "Confirmed"] };
    else if (ORDER_STATUSES.includes(status)) filter.status = status;

    if (typeof search === "string" && search.trim()) {
      const s = svc.escapeRegex(search.trim().slice(0, 60));
      filter.$or = [{ orderId: { $regex: s, $options: "i" } }, { "orderItems.name": { $regex: s, $options: "i" } }];
    }

    const orders = await Order.find(filter).select(svc.PRIVATE_ORDER_FIELDS).sort({ createdAt: -1 }).limit(200).lean();
    return res.status(200).json({ success: true, orders });
  } catch (error) {
    return fail(res, error, "Failed to load orders");
  }
};

// @route GET /api/orders/:id   – only the owner can see an order
const getOrderById = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
      .select(svc.PRIVATE_ORDER_FIELDS)
      .lean();
    if (!order) throw new OrderError("Order not found", 404);
    return res.status(200).json({ success: true, order });
  } catch (error) {
    return fail(res, error, "Failed to load order");
  }
};

// ---------------------------------------------------------------- CANCEL
// @route PUT /api/orders/:id/cancel   – reason is optional
const cancelOrder = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const reason = clean(req.body?.reason, 300) || "Cancelled by customer";

    const outcome = await inTransaction(async (session) => {
      const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).session(session);
      if (!order) throw new OrderError("Order not found", 404);

      if (order.status === "Cancelled") return { already: true }; // retry: nothing to do twice
      if (!["Pending", "Confirmed"].includes(order.status)) {
        throw new OrderError(`Order cannot be cancelled once it is ${order.status}`);
      }

      await svc.restoreStockOnce(order, session);
      await svc.releaseCouponOnce(order, session);
      order.status = "Cancelled";
      order.cancelReason = reason;
      order.cancelledAt = new Date();
      svc.addStatus(order, "Cancelled", "customer", reason);
      let walletRefund = false;
      if (order.paymentMethod === "Wallet" && order.isPaid) {
        await Wallet.updateOne(
          { user: order.user, transactions: { $not: { $elemMatch: { sourceOrderId: order._id, type: "Credit" } } } },
          { $inc: { balance: order.totalPrice }, $push: { transactions: { type: "Credit", amount: order.totalPrice, description: `Wallet refund for cancelled order #${order.orderId}`, sourceOrderId: order._id } }, $setOnInsert: { user: order.user } },
          { upsert: true, session, setDefaultsOnInsert: true }
        );
        order.paymentStatus = "Refunded";
        walletRefund = true;
      }
      await order.save({ session });
      return { already: false, refund: order.paymentMethod === "Razorpay" && order.isPaid, walletRefund };
    });

    let order = await Order.findById(req.params.id);
    if (outcome.refund) await svc.refundOrder(order, reason);
    order = await Order.findById(req.params.id).select(svc.PRIVATE_ORDER_FIELDS);

    return res.status(200).json({
      success: true,
      message: outcome.already
        ? "Order is already cancelled."
        : outcome.walletRefund
          ? "Order cancelled. The amount has been returned to your VORTIX Wallet."
          : outcome.refund
            ? "Order cancelled. Your refund has been initiated."
            : "Order has been cancelled successfully.",
      order: publicOrder(order),
    });
  } catch (error) {
    return fail(res, error, "Failed to cancel order");
  }
};

// ---------------------------------------------------------------- RETURN
// @route POST /api/orders/:id/return   – multipart form: itemIds[], reason (mandatory), details, refundMethod, photos[]
const requestReturn = async (req, res) => {
  const uploaded = []; // cloudinary ids, removed again if the request fails
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const reason = clean(req.body?.reason, 300);
    if (!reason) throw new OrderError("A reason is mandatory for return requests");
    const details = clean(req.body?.details, 1000);
    const refundMethod = ["Original payment method", "Store credit"].includes(req.body?.refundMethod)
      ? req.body.refundMethod
      : "Original payment method";

    const current = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!current) throw new OrderError("Order not found", 404);
    if (current.status !== "Delivered") throw new OrderError("Return can only be requested for delivered orders");
    if (current.returnRequest?.isRequested) {
      throw new OrderError("A return request has already been submitted for this order");
    }
    const days = (Date.now() - new Date(current.deliveredAt || current.updatedAt).getTime()) / 86400000;
    if (days > shop.RETURN_WINDOW_DAYS) {
      throw new OrderError(`Returns are accepted within ${shop.RETURN_WINDOW_DAYS} days of delivery`);
    }

    // which items come back (the full quantity of every selected item)
    let ids = req.body?.itemIds ?? req.body?.["itemIds[]"] ?? [];
    if (typeof ids === "string") ids = ids.startsWith("[") ? JSON.parse(ids) : [ids];
    ids = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
    if (ids.length === 0) throw new OrderError("Select at least one item to return");
    const chosen = current.orderItems.filter((i) => ids.includes(String(i._id)));
    if (chosen.length !== ids.length) throw new OrderError("One of the selected items is not part of this order");

    // refund = price of the chosen items (after their share of any coupon) + delivery if everything comes back
    const lineTotal = (i) => (Number.isFinite(i.lineTotal) ? i.lineTotal : (Number(i.price) || 0) * (Number(i.qty) || 1));
    const itemsSum = current.orderItems.reduce((n, i) => n + lineTotal(i), 0);
    const share = itemsSum > 0 ? Math.max(0, (itemsSum - (Number(current.discountPrice) || 0)) / itemsSum) : 1;
    let refundAmount = chosen.reduce((sum, i) => sum + lineTotal(i) * share, 0);
    if (chosen.length === current.orderItems.length) refundAmount += Number(current.shippingPrice) || 0;
    refundAmount = Math.min(Math.round(refundAmount * 100) / 100, Number(current.totalPrice) || refundAmount);
    if (!Number.isFinite(refundAmount)) refundAmount = Number(current.totalPrice) || 0;

    // optional photos
    const photos = [];
    for (const file of req.files || []) {
      if (!detectImageType(file.buffer)) throw new OrderError("Photos must be real JPG, PNG or WebP images");
      const result = await uploadBuffer(file.buffer, "voltix/returns", [{ width: 1400, crop: "limit", quality: "auto" }]);
      uploaded.push(result.public_id);
      photos.push(result.secure_url);
    }

    // one atomic update: two quick clicks can only create one request
    const order = await Order.findOneAndUpdate(
      { _id: current._id, status: "Delivered", "returnRequest.isRequested": { $ne: true } },
      {
        $set: {
          returnRequest: {
            isRequested: true,
            reason,
            details,
            photos,
            refundMethod,
            items: chosen.map((i) => ({ itemId: i._id, qty: i.qty })),
            refundAmount,
            status: "Pending",
            requestedAt: new Date(),
          },
        },
      },
      { returnDocument: "after" }
    ).select(svc.PRIVATE_ORDER_FIELDS);
    if (!order) throw new OrderError("A return request has already been submitted for this order");

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully. Admin will review it shortly.",
      order: publicOrder(order),
    });
  } catch (error) {
    await destroyImages(uploaded);
    return fail(res, error instanceof SyntaxError ? new OrderError("Invalid item selection") : error, "Failed to submit return request");
  }
};

// ---------------------------------------------------------------- BUY AGAIN
// @route POST /api/orders/:id/buy-again – puts the still-available items of an old order into the cart
const buyAgain = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!order) throw new OrderError("Order not found", 404);

    const added = [];
    const skipped = [];

    // decide what can be added (stock, visibility, per-item limit) from CURRENT product data
    const wanted = [];
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product)
        .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
        .lean();
      const variant = item.variantId ? product?.variants?.find((v) => String(v._id) === String(item.variantId)) : null;
      const stock = item.variantId ? variant?.stock : product?.stock;
      const ok = product && isVisibleToCustomer(product) && (!item.variantId || variant) && (stock || 0) > 0;
      if (!ok) {
        skipped.push(item.name);
        continue;
      }
      wanted.push({ item, stock, qty: Math.min(item.qty, stock, shop.MAX_QTY_PER_ITEM) });
    }
    if (wanted.length === 0) throw new OrderError("These items are no longer available", 409);

    await Cart.updateOne({ user: req.user._id }, { $setOnInsert: { items: [] } }, { upsert: true }).catch((e) => {
      if (e.code !== 11000) throw e;
    });

    let saved = false;
    for (let attempt = 0; attempt < 8 && !saved; attempt += 1) {
      const cart = await Cart.findOne({ user: req.user._id }).lean();
      const items = cart.items.map((i) => ({ ...i }));
      added.length = 0;

      for (const { item, stock, qty } of wanted) {
        const line = items.find((i) => String(i.product) === String(item.product) && String(i.variant || "") === String(item.variantId || ""));
        if (line) {
          const next = Math.min(line.quantity + qty, stock, shop.MAX_QTY_PER_ITEM);
          if (next === line.quantity) continue;
          line.quantity = next;
        } else if (items.length >= shop.MAX_CART_LINES) {
          skipped.push(item.name);
          continue;
        } else {
          items.push({ product: item.product, variant: item.variantId || null, quantity: qty });
        }
        added.push(item.name);
      }

      const result = await Cart.updateOne({ _id: cart._id, items: cart.items }, { $set: { items } });
      saved = result.matchedCount > 0;
    }
    if (!saved) throw new OrderError("Your cart changed. Please try again.", 409);

    const view = await buildCartView(req.user._id);
    return res.status(200).json({
      success: true,
      message: skipped.length
        ? `Added to cart. Not available now: ${[...new Set(skipped)].join(", ")}`
        : "Items added to your cart",
      added,
      skipped: [...new Set(skipped)],
      cartCount: view.lineCount,
    });
  } catch (error) {
    return fail(res, error, "Failed to add items to cart");
  }
};

// ---------------------------------------------------------------- INVOICE
// @route GET /api/orders/:id/invoice
const downloadInvoice = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!order) throw new OrderError("Order not found", 404);
    if (["Pending", "Cancelled"].includes(order.status)) {
      throw new OrderError("Invoice is available once the order is confirmed");
    }

    const pdfBuffer = await generateInvoicePDF(order, req.user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Invoice-${order.orderId}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return fail(res, error, "Failed to generate invoice");
  }
};

module.exports = {
  getCheckoutSummary,
  applyCoupon,
  createOrder,
  finalizePayment,
  verifyRazorpayPayment,
  recordPaymentFailure,
  retryPayment,
  getMyOrders,
  getOrderById,
  cancelOrder,
  requestReturn,
  buyAgain,
  downloadInvoice,
};
