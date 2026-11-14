const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const svc = require("../services/orderService");
const { generateInvoicePDF } = require("../services/invoiceService");
const { sendOrderStatusEmail } = require("../services/orderEmailService");
const { normalizeTracking } = require("../utils/tracking");

const { OrderError } = svc;
const ORDER_STATUSES = ["Pending", "Confirmed", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned"];

// Permitted status changes.
// - "Returned" is NOT here: an order only becomes Returned when the admin approves a return request.
// - "Pending" (online payment not done yet) can only be cancelled, never pushed forward by hand.
const ALLOWED_TRANSITIONS = {
  Pending: ["Cancelled"],
  Confirmed: ["Shipped", "Cancelled"],
  Shipped: ["Out for Delivery", "Cancelled"],
  "Out for Delivery": ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: [],
  Returned: [],
};

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  total_desc: { totalPrice: -1, createdAt: -1 },
  total_asc: { totalPrice: 1, createdAt: -1 },
};

const isId = (id) => mongoose.isValidObjectId(id);

function fail(res, error, fallback) {
  if (error instanceof OrderError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error(fallback, error);
  const detail = process.env.NODE_ENV === "production" ? "" : ` (${error?.name || "Error"}: ${String(error?.message || error).slice(0, 160)})`;
  return res.status(500).json({ success: false, message: fallback + detail });
}

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

const GROUPS = {
  Processing: ["Pending", "Confirmed"],
  Shipped: ["Shipped", "Out for Delivery"],
  Delivered: ["Delivered"],
  Cancelled: ["Cancelled"],
};

// Builds the Mongo filter from the query string. `skipStatus` is used for the tab counts.
async function buildOrderQuery(q, { skipStatus = false } = {}) {
  const query = {};

  if (!skipStatus) {
    if (GROUPS[q.group]) query.status = { $in: GROUPS[q.group] };
    else if (ORDER_STATUSES.includes(q.status)) query.status = q.status;
  }
  if (["COD", "Razorpay", "Wallet"].includes(q.paymentMethod)) query.paymentMethod = q.paymentMethod;
  if (["Pending", "Completed", "Failed", "Refunded"].includes(q.paymentStatus)) query.paymentStatus = q.paymentStatus;
  if (q.returnsOnly === "true") query["returnRequest.isRequested"] = true;

  const range = { createdAt: {} };
  const days = Number(q.days);
  if (days > 0 && days <= 3650) range.createdAt.$gte = new Date(Date.now() - days * 86400000);
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (from && !isNaN(from)) range.createdAt.$gte = from;
  if (to && !isNaN(to)) {
    to.setHours(23, 59, 59, 999);
    range.createdAt.$lte = to;
  }
  if (Object.keys(range.createdAt).length) query.createdAt = range.createdAt;

  // search: order number, delivery name / phone, customer account name / email
  if (typeof q.search === "string" && q.search.trim()) {
    const s = svc.escapeRegex(q.search.trim().replace(/^#/, "").slice(0, 60));
    const users = await User.find({ $or: [{ name: { $regex: s, $options: "i" } }, { email: { $regex: s, $options: "i" } }] })
      .select("_id")
      .limit(200)
      .lean();
    query.$or = [
      { orderId: { $regex: s, $options: "i" } },
      { "shippingAddress.fullName": { $regex: s, $options: "i" } },
      { "shippingAddress.phone": { $regex: s, $options: "i" } },
      { user: { $in: users.map((u) => u._id) } },
    ];
  }
  return query;
}

// CSV cells that start with = + - @ could run as a formula in Excel, so they are neutralised
const csvCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

// @route GET /api/admin/orders?search=&group=&status=&paymentMethod=&paymentStatus=&days=&from=&to=&sort=&page=&limit=
const getAllOrders = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const query = await buildOrderQuery(req.query);
    const sort = SORTS[req.query.sort] || SORTS.newest; // newest first by default

    // tab counts follow every filter except the status tab itself
    const countQuery = await buildOrderQuery(req.query, { skipStatus: true });

    const [totalOrders, orders, grouped] = await Promise.all([
      Order.countDocuments(query),
      Order.find(query)
        .select("-razorpaySignature -idempotencyKey -paymentLogs -statusHistory")
        .populate("user", "name email phone")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.aggregate([{ $match: countQuery }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);

    const byStatus = Object.fromEntries(grouped.map((g) => [g._id, g.n]));
    const sum = (list) => list.reduce((t, k) => t + (byStatus[k] || 0), 0);
    const counts = {
      All: grouped.reduce((t, g) => t + g.n, 0),
      Processing: sum(GROUPS.Processing),
      Shipped: sum(GROUPS.Shipped),
      Delivered: sum(GROUPS.Delivered),
      Cancelled: sum(GROUPS.Cancelled),
    };

    return res.status(200).json({
      success: true,
      orders,
      counts,
      pagination: { page, limit, totalPages: Math.max(1, Math.ceil(totalOrders / limit)), totalOrders },
    });
  } catch (error) {
    return fail(res, error, "Failed to load orders");
  }
};

// @route GET /api/admin/orders/export   (same filters as the list, no pagination)
const exportOrdersCsv = async (req, res) => {
  try {
    const query = await buildOrderQuery(req.query);
    const orders = await Order.find(query).populate("user", "name email").sort({ createdAt: -1 }).limit(5000).lean();
    const csv = toCsv(
      ["Order", "Date", "Customer", "Email", "Items", "Total", "Payment method", "Payment status", "Order status"],
      orders.map((o) => [
        o.orderId,
        day(o.createdAt),
        o.shippingAddress?.fullName || o.user?.name,
        o.user?.email,
        o.orderItems.reduce((n, i) => n + i.qty, 0),
        o.totalPrice,
        o.paymentMethod,
        o.paymentStatus,
        o.status,
      ])
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="orders.csv"');
    return res.send(csv);
  } catch (error) {
    return fail(res, error, "Failed to export orders");
  }
};

// ---------------------------------------------------------------- RETURNS LIST
const returnTab = (o) => {
  const r = o.returnRequest || {};
  if (r.status === "Pending") return "Requested";
  if (r.status === "Rejected") return "Rejected";
  return ["Initiated", "Processed"].includes(o.refundStatus) ? "Refunded" : "Approved";
};

function returnQuery(tab) {
  const base = { "returnRequest.isRequested": true };
  if (tab === "Requested") return { ...base, "returnRequest.status": "Pending" };
  if (tab === "Rejected") return { ...base, "returnRequest.status": "Rejected" };
  if (tab === "Approved") return { ...base, "returnRequest.status": "Approved", refundStatus: { $nin: ["Initiated", "Processed"] } };
  if (tab === "Refunded") return { ...base, "returnRequest.status": "Approved", refundStatus: { $in: ["Initiated", "Processed"] } };
  return base;
}

// @route GET /api/admin/returns?tab=Requested|Approved|Rejected|Refunded&page=
const getReturns = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const tab = ["Requested", "Approved", "Rejected", "Refunded"].includes(req.query.tab) ? req.query.tab : "Requested";

    const [total, orders, ...countList] = await Promise.all([
      Order.countDocuments(returnQuery(tab)),
      Order.find(returnQuery(tab))
        .select("orderId orderItems returnRequest refundStatus paymentStatus paymentMethod totalPrice shippingAddress user status")
        .populate("user", "name email")
        .sort({ "returnRequest.requestedAt": -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ...["Requested", "Approved", "Rejected", "Refunded"].map((t) => Order.countDocuments(returnQuery(t))),
    ]);

    return res.status(200).json({
      success: true,
      returns: orders.map((o) => ({ ...o, tab: returnTab(o), returnId: `R-${o.orderId}` })),
      counts: { Requested: countList[0], Approved: countList[1], Rejected: countList[2], Refunded: countList[3] },
      pagination: { page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), total },
    });
  } catch (error) {
    return fail(res, error, "Failed to load returns");
  }
};

// @route GET /api/admin/returns/export
const exportReturnsCsv = async (req, res) => {
  try {
    const orders = await Order.find({ "returnRequest.isRequested": true })
      .populate("user", "name email")
      .sort({ "returnRequest.requestedAt": -1 })
      .limit(5000)
      .lean();
    const csv = toCsv(
      ["Return", "Order", "Customer", "Items", "Amount", "Reason", "Details", "Requested on", "Status", "Refund"],
      orders.map((o) => [
        `R-${o.orderId}`,
        o.orderId,
        o.shippingAddress?.fullName || o.user?.name,
        o.orderItems.map((i) => `${i.name} x${i.qty}`).join("; "),
        o.totalPrice,
        o.returnRequest.reason,
        o.returnRequest.details,
        day(o.returnRequest.requestedAt),
        returnTab(o),
        o.refundStatus,
      ])
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="returns.csv"');
    return res.send(csv);
  } catch (error) {
    return fail(res, error, "Failed to export returns");
  }
};

// @route GET /api/admin/orders/:id   (includes statusHistory + paymentLogs for troubleshooting)
const getAdminOrderById = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const order = await Order.findById(req.params.id)
      .select("-razorpaySignature -idempotencyKey")
      .populate("user", "name email phone");
    if (!order) throw new OrderError("Order not found", 404);
    return res.status(200).json({ success: true, order });
  } catch (error) {
    return fail(res, error, "Failed to load order");
  }
};

// @route GET /api/admin/orders/:id/invoice
const downloadAdminInvoice = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const order = await Order.findById(req.params.id).populate("user", "name email phone").lean();
    if (!order) throw new OrderError("Order not found", 404);
    const pdf = await generateInvoicePDF(order, order.user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Invoice-${order.orderId}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    return fail(res, error, "Failed to generate invoice");
  }
};

// @route PUT /api/admin/orders/:id/status
const updateOrderStatus = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const { status } = req.body || {};
    const comment = typeof req.body?.comment === "string" ? req.body.comment.trim().slice(0, 300) : "";
    if (!ORDER_STATUSES.includes(status)) throw new OrderError("Invalid order status");

    const outcome = await inTransaction(async (session) => {
      const order = await Order.findById(req.params.id).session(session);
      if (!order) throw new OrderError("Order not found", 404);

      if (order.status === status) return { unchanged: true }; // same request sent twice -> no second stock change

      const allowed = ALLOWED_TRANSITIONS[order.status] || [];
      if (!allowed.includes(status)) {
        throw new OrderError(
          `Cannot change order status from '${order.status}' to '${status}'. Allowed: ${allowed.join(", ") || "none"}`
        );
      }

      let refund = false;
      if (status === "Cancelled") {
        await svc.restoreStockOnce(order, session);
        await svc.releaseCouponOnce(order, session);
        order.cancelledAt = new Date();
        order.cancelReason = comment || "Cancelled by admin";
        refund = order.paymentMethod === "Razorpay" && order.isPaid;
        if (order.paymentMethod === "Wallet" && order.isPaid) {
          await Wallet.updateOne(
            { user: order.user, transactions: { $not: { $elemMatch: { sourceOrderId: order._id, type: "Credit" } } } },
            { $inc: { balance: order.totalPrice }, $push: { transactions: { type: "Credit", amount: order.totalPrice, description: `Wallet refund for cancelled order #${order.orderId}`, sourceOrderId: order._id } }, $setOnInsert: { user: order.user } },
            { upsert: true, session, setDefaultsOnInsert: true }
          );
          order.paymentStatus = "Refunded";
        }
      }

      if (status === "Delivered") {
        order.isDelivered = true;
        order.deliveredAt = new Date();
        if (order.paymentMethod === "COD" && !order.isPaid) {
          order.isPaid = true; // cash collected on delivery
          order.paidAt = new Date();
          order.paymentStatus = "Completed";
          svc.addPaymentLog(order, "cod_collected", { note: "Cash collected on delivery" });
        }
      }

      const tracking = normalizeTracking(req.body);
      if (tracking.courier || tracking.trackingNumber || tracking.trackingUrl) order.tracking = tracking;

      order.status = status;
      svc.addStatus(order, status, "admin", comment);
      await order.save({ session });
      return { unchanged: false, refund, reason: order.cancelReason };
    });

    let order = await Order.findById(req.params.id);
    if (outcome.refund) await svc.refundOrder(order, outcome.reason);
    order = await Order.findById(req.params.id)
      .select("-razorpaySignature -idempotencyKey")
      .populate("user", "name email phone");

    let emailed = false;
    if (req.body?.notify === true && !outcome.unchanged) emailed = await sendOrderStatusEmail(order, order.user, comment);

    return res.status(200).json({
      success: true,
      emailed,
      message: outcome.unchanged ? `Order is already '${status}'.` : `Order status updated to '${status}' successfully.`,
      order,
    });
  } catch (error) {
    return fail(res, error, "Failed to update order status");
  }
};

// @route PUT /api/admin/orders/:id/return-review   body: { action: "Approved" | "Rejected", adminComment }
const reviewReturnRequest = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const { action } = req.body || {};
    const adminComment = typeof req.body?.adminComment === "string" ? req.body.adminComment.trim().slice(0, 300) : "";
    if (!["Approved", "Rejected"].includes(action)) throw new OrderError("Action must be 'Approved' or 'Rejected'");
    if (action === "Rejected" && !adminComment) throw new OrderError("Please add a comment explaining why the return is rejected");

    const outcome = await inTransaction(async (session) => {
      const order = await Order.findById(req.params.id).session(session);
      if (!order) throw new OrderError("Order not found", 404);
      if (!order.returnRequest?.isRequested) throw new OrderError("No return request submitted for this order");
      if (order.returnRequest.status !== "Pending") {
        throw new OrderError(`Return request already ${order.returnRequest.status.toLowerCase()}`);
      }

      order.returnRequest.status = action;
      order.returnRequest.adminComment = adminComment;
      order.returnRequest.reviewedAt = new Date();
      let outcomeData = { approved: false };

      if (action === "Approved") {
        const returned = order.returnRequest.items?.length
          ? order.orderItems.filter((i) => order.returnRequest.items.some((r) => String(r.itemId) === String(i._id)))
          : order.orderItems; // requests made before item-wise returns existed = whole order
        const everything = returned.length === order.orderItems.length;

        // only the returned items go back to stock, and only once
        if (order.stockDeducted && !order.returnRequest.stockRestored) {
          await svc.restoreStock(returned, session);
          order.returnRequest.stockRestored = true;
          if (everything) order.stockRestored = true;
        }
        if (everything) {
          order.status = "Returned";
          svc.addStatus(order, "Returned", "admin", adminComment || "Return approved");
        } else {
          svc.addStatus(order, "Delivered", "admin", `Partial return approved (${returned.length} of ${order.orderItems.length} items)`);
        }
        const amount = Number(order.returnRequest.refundAmount || order.totalPrice);
        if (order.returnRequest.refundMethod === "Store credit" || order.paymentMethod === "Wallet") {
          await Wallet.updateOne(
            { user: order.user, transactions: { $not: { $elemMatch: { sourceOrderId: order._id, type: "Credit" } } } },
            {
              $inc: { balance: amount },
              $push: { transactions: { type: "Credit", amount, description: `Store credit for return of order #${order.orderId}`, sourceOrderId: order._id } },
              $setOnInsert: { user: order.user },
            },
            { upsert: true, session, setDefaultsOnInsert: true }
          );
          outcomeData = { approved: true, everything, amount, walletCredited: true };
        } else {
          outcomeData = { approved: true, everything, amount, walletCredited: false };
        }
      }

      await order.save({ session });
      return outcomeData;
    });

    let order = await Order.findById(req.params.id);
    if (outcome.approved) {
      if (!outcome.walletCredited) await svc.refundOrder(order, "Return approved", outcome.amount);
      if (!outcome.walletCredited && order.paymentMethod === "COD" && outcome.everything) {
        order = await Order.findById(req.params.id);
        order.paymentStatus = "Refunded"; // cash order: the store returns the money manually
        await order.save();
      }
    }
    order = await Order.findById(req.params.id)
      .select("-razorpaySignature -idempotencyKey")
      .populate("user", "name email phone");

    return res.status(200).json({
      success: true,
      message: `Return request ${action.toLowerCase()} successfully.${outcome.walletCredited ? ` ₹${outcome.amount.toFixed(2)} store credit added to customer wallet.` : ""}` ,
      order,
    });
  } catch (error) {
    return fail(res, error, "Failed to review return request");
  }
};

// @route POST /api/admin/orders/:id/retry-refund
// A refund that Razorpay rejected (network error, low balance) stays "Failed" forever unless someone retries it.
const retryRefund = async (req, res) => {
  try {
    if (!isId(req.params.id)) throw new OrderError("Order not found", 404);
    const order = await Order.findById(req.params.id);
    if (!order) throw new OrderError("Order not found", 404);
    if (order.paymentMethod !== "Razorpay" || order.refundStatus !== "Failed") {
      throw new OrderError("There is no failed refund to retry for this order");
    }
    const approvedReturn = order.returnRequest?.status === "Approved" && order.returnRequest.refundAmount > 0;
    await svc.refundOrder(order, "Refund retried by admin", approvedReturn ? order.returnRequest.refundAmount : undefined);

    const fresh = await Order.findById(req.params.id)
      .select("-razorpaySignature -idempotencyKey")
      .populate("user", "name email phone");
    const started = fresh.refundStatus === "Initiated";
    return res.status(started ? 200 : 502).json({
      success: started,
      message: started ? "Refund started again." : "Refund failed again. See the payment log on this order.",
      order: fresh,
    });
  } catch (error) {
    return fail(res, error, "Failed to retry refund");
  }
};

module.exports = {
  retryRefund,
  getAllOrders,
  exportOrdersCsv,
  getReturns,
  exportReturnsCsv,
  getAdminOrderById,
  downloadAdminInvoice,
  updateOrderStatus,
  reviewReturnRequest,
  ALLOWED_TRANSITIONS,
};
