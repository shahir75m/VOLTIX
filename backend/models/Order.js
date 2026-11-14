const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
    variantLabel: { type: String, default: "" },
    image: { type: String, default: "" },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    gstPercent: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: "" },
    city: { type: String, required: true },
    district: { type: String, default: "" },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
  },
  { _id: false }
);

const returnRequestSchema = new mongoose.Schema(
  {
    isRequested: { type: Boolean, default: false },
    reason: { type: String, default: "" },
    details: { type: String, default: "" },
    photos: { type: [String], default: [] },
    refundMethod: {
      type: String,
      enum: ["Original payment method", "Store credit"],
      default: "Original payment method",
    },
    // which order lines come back (whole quantity of each) and how much is refunded for them
    items: {
      type: [{ itemId: { type: mongoose.Schema.Types.ObjectId, required: true }, qty: { type: Number, min: 1, required: true }, _id: false }],
      default: [],
    },
    refundAmount: { type: Number, default: 0 },
    stockRestored: { type: Boolean, default: false },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    adminComment: { type: String, default: "" },
    requestedAt: { type: Date },
    reviewedAt: { type: Date },
  },
  { _id: false }
);

// Basic history used for troubleshooting (who changed the order status, when and why)
const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, enum: ["customer", "admin", "system", "payment"], default: "system" },
    note: { type: String, default: "" },
  },
  { _id: false }
);

// Every payment related event (order created, verified, failed, refunded ...)
const paymentLogSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    at: { type: Date, default: Date.now },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Same key = same checkout attempt. Stops double-click / retry from creating two orders.
    idempotencyKey: { type: String, default: undefined },

    orderItems: { type: [orderItemSchema], required: true },
    shippingAddress: { type: shippingAddressSchema, required: true },

    paymentMethod: { type: String, required: true, enum: ["COD", "Razorpay", "Wallet"], default: "COD" },
    paymentStatus: {
      type: String,
      required: true,
      enum: ["Pending", "Completed", "Failed", "Refunded"],
      default: "Pending",
    },
    paymentAttempts: { type: Number, default: 0 },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: undefined },
    razorpaySignature: { type: String, default: "", select: false },

    refundStatus: {
      type: String,
      enum: ["None", "Initiated", "Processed", "Failed", "Manual"],
      default: "None",
    },
    refundId: { type: String, default: "" },
    refundedAt: { type: Date },

    itemsPrice: { type: Number, required: true, default: 0 },
    taxPrice: { type: Number, required: true, default: 0 }, // GST already included in itemsPrice
    shippingPrice: { type: Number, required: true, default: 0 },
    discountPrice: { type: Number, required: true, default: 0 },
    couponCode: { type: String, default: "" },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: undefined },
    couponReleased: { type: Boolean, default: false },
    totalPrice: { type: Number, required: true, default: 0 },

    status: {
      type: String,
      required: true,
      enum: ["Pending", "Confirmed", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned"],
      default: "Pending",
      index: true,
    },
    cancelReason: { type: String, default: "" },
    cancelledAt: { type: Date },

    // Courier details typed by the admin when the order is shipped (shown to the customer)
    tracking: {
      courier: { type: String, default: "" },
      trackingNumber: { type: String, default: "" },
      trackingUrl: { type: String, default: "" },
    },
    returnRequest: { type: returnRequestSchema, default: () => ({}) },

    // Guards: stock is taken once when the order becomes Confirmed and given back once.
    stockDeducted: { type: Boolean, default: false },
    stockRestored: { type: Boolean, default: false },

    isPaid: { type: Boolean, required: true, default: false },
    paidAt: { type: Date },
    isDelivered: { type: Boolean, required: true, default: false },
    deliveredAt: { type: Date },

    statusHistory: { type: [statusHistorySchema], default: [] },
    paymentLogs: { type: [paymentLogSchema], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
// One Razorpay payment can belong to one order only
orderSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string" } } }
);
orderSchema.index({ razorpayOrderId: 1 });

module.exports = mongoose.model("Order", orderSchema);
