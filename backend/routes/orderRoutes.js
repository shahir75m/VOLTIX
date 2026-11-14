const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const {
  getCheckoutSummary,
  applyCoupon,
  createOrder,
  verifyRazorpayPayment,
  recordPaymentFailure,
  retryPayment,
  getMyOrders,
  getOrderById,
  cancelOrder,
  requestReturn,
  buyAgain,
  downloadInvoice,
} = require("../controllers/orderController");
const { uploadReturnPhotos } = require("../middleware/promoUpload");
const { protectUser } = require("../middleware/userAuthMiddleware");

// Brake on order / payment endpoints (per IP) against scripts and accidental loops
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "test" ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

router.use(protectUser);

router.post("/summary", getCheckoutSummary);
router.post("/apply-coupon", applyCoupon);
router.post("/", orderLimiter, createOrder);
router.get("/myorders", getMyOrders);
router.get("/:id", getOrderById);
router.post("/:id/verify-payment", orderLimiter, verifyRazorpayPayment);
router.post("/:id/payment-failed", orderLimiter, recordPaymentFailure);
router.post("/:id/retry-payment", orderLimiter, retryPayment);
router.put("/:id/cancel", orderLimiter, cancelOrder);
router.post("/:id/return", orderLimiter, uploadReturnPhotos, requestReturn);
router.post("/:id/buy-again", orderLimiter, buyAgain);
router.get("/:id/invoice", downloadInvoice);

module.exports = router;
