const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  adminLogin,
  adminLogout,
} = require("../controllers/adminController");
const {
  requestAdminPasswordChangeOTP,
  verifyAdminPasswordChangeOTP,
  resendAdminPasswordChangeOTP,
} = require("../controllers/adminPasswordController");
const { getDashboard } = require("../controllers/adminDashboardController");

const {
  protectAdmin,
} = require("../middleware/authMiddleware");

const {
  getAllUsers,
  updateUserBlockStatus,
  exportUsersCSV,
} = require("../controllers/adminUserController");

const {
  listCategories,
  listAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  restoreCategory,
} = require("../controllers/adminCategoryController");

const {
  listBrands,
  listAllBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  restoreBrand,
} = require("../controllers/adminBrandController");

const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  setPublishStatus,
  setBlockStatus,
} = require("../controllers/adminProductController");

const {
  uploadProductImages,
  uploadCategoryImage,
} = require("../middleware/shopImageUpload");

const router = express.Router();

// Login Rate Limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Try again later.",
  },
});

const passwordChangeRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password-change requests. Try again later.",
  },
});

// Password-change OTP verification Rate Limiter
const passwordChangeOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many verification attempts. Try again later.",
    });
  },
});

// Password-change OTP resend Rate Limiter
const passwordChangeResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification-code requests. Try again later.",
  },
});

// Verify admin credentials and create a session.
router.post("/login", loginLimiter, adminLogin);

// Admin password changes require the current password and an email OTP.
router.post(
  "/password-change/request-otp",
  protectAdmin,
  passwordChangeRequestLimiter,
  requestAdminPasswordChangeOTP
);
router.post(
  "/password-change/verify-otp",
  protectAdmin,
  passwordChangeOtpLimiter,
  verifyAdminPasswordChangeOTP
);
router.post(
  "/password-change/resend-otp",
  protectAdmin,
  passwordChangeResendLimiter,
  resendAdminPasswordChangeOTP
);

// Admin Logout
router.post("/logout", protectAdmin, adminLogout);

// Live store metrics, recent orders, stock alerts and return queue.
router.get("/dashboard", protectAdmin, getDashboard);

// GET REGISTERED USERS — ADMIN ONLY
router.get("/users", protectAdmin, getAllUsers);

// BLOCK / UNBLOCK CUSTOMER
router.patch(
  "/users/:userId/block-status",
  protectAdmin,
  updateUserBlockStatus
);

// EXPORT USERS TO CSV
router.get("/users/export", protectAdmin, exportUsersCSV);

// =====================================
// CATEGORY MANAGEMENT — ADMIN ONLY
// =====================================
router.get("/categories", protectAdmin, listCategories);
router.get("/categories/all", protectAdmin, listAllCategories);
router.post("/categories", protectAdmin, uploadCategoryImage, createCategory);
router.put("/categories/:id", protectAdmin, uploadCategoryImage, updateCategory);
router.delete("/categories/:id", protectAdmin, deleteCategory);
router.patch("/categories/:id/restore", protectAdmin, restoreCategory);

// =====================================
// BRAND MANAGEMENT — ADMIN ONLY
// =====================================
router.get("/brands", protectAdmin, listBrands);
router.get("/brands/all", protectAdmin, listAllBrands);
router.post("/brands", protectAdmin, uploadCategoryImage, createBrand);
router.put("/brands/:id", protectAdmin, uploadCategoryImage, updateBrand);
router.delete("/brands/:id", protectAdmin, deleteBrand);
router.patch("/brands/:id/restore", protectAdmin, restoreBrand);

// =====================================
// PRODUCT MANAGEMENT — ADMIN ONLY
// =====================================
router.get("/products", protectAdmin, listProducts);
router.get("/products/:id", protectAdmin, getProduct);
router.post("/products", protectAdmin, uploadProductImages, createProduct);
router.put("/products/:id", protectAdmin, uploadProductImages, updateProduct);
router.delete("/products/:id", protectAdmin, deleteProduct);
router.patch("/products/:id/restore", protectAdmin, restoreProduct);
router.patch("/products/:id/publish", protectAdmin, setPublishStatus);
router.patch("/products/:id/block", protectAdmin, setBlockStatus);



// =====================================
// ORDER MANAGEMENT — ADMIN ONLY
// =====================================
const {
  getAllOrders,
  exportOrdersCsv,
  getReturns,
  exportReturnsCsv,
  getAdminOrderById,
  downloadAdminInvoice,
  updateOrderStatus,
  reviewReturnRequest,
  retryRefund,
} = require("../controllers/adminOrderController");
router.get("/orders", protectAdmin, getAllOrders);
router.get("/orders/export", protectAdmin, exportOrdersCsv); // must stay above "/orders/:id"
router.get("/returns", protectAdmin, getReturns);
router.get("/returns/export", protectAdmin, exportReturnsCsv);
router.get("/orders/:id", protectAdmin, getAdminOrderById);
router.get("/orders/:id/invoice", protectAdmin, downloadAdminInvoice);

// =====================================
// COUPONS & OFFERS — ADMIN ONLY
// =====================================
const promo = require("../controllers/promoController");
const { uploadOfferImage } = require("../middleware/promoUpload");
router.get("/coupons", protectAdmin, promo.listCoupons);
router.post("/coupons", protectAdmin, promo.createCoupon);
router.put("/coupons/:id", protectAdmin, promo.updateCoupon);
router.delete("/coupons/:id", protectAdmin, promo.deleteCoupon);
router.patch("/coupons/:id/restore", protectAdmin, promo.restoreCoupon);
router.get("/offers", protectAdmin, promo.listOffers);
router.post("/offers", protectAdmin, uploadOfferImage, promo.createOffer);
router.put("/offers/:id", protectAdmin, uploadOfferImage, promo.updateOffer);
router.delete("/offers/:id", protectAdmin, promo.deleteOffer);
router.patch("/offers/:id/restore", protectAdmin, promo.restoreOffer);

// =====================================
// REVIEW MODERATION — ADMIN ONLY
// =====================================
const reviews = require("../controllers/reviewController");
router.get("/reviews", protectAdmin, reviews.adminListReviews);
router.put("/reviews/:id/visibility", protectAdmin, reviews.adminSetVisibility);
router.delete("/reviews/:id", protectAdmin, reviews.adminDeleteReview);
router.patch("/reviews/:id/restore", protectAdmin, reviews.adminRestoreReview);
router.put("/orders/:id/status", protectAdmin, updateOrderStatus);
router.post("/orders/:id/retry-refund", protectAdmin, retryRefund);
router.put("/orders/:id/return-review", protectAdmin, reviewReturnRequest);

module.exports = router;
