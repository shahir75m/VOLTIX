const express = require("express");
const rateLimit = require("express-rate-limit");
const { protectUser } = require("../middleware/userAuthMiddleware");
const c = require("../controllers/reviewController");
const { uploadReviewPhotos } = require("../middleware/promoUpload");

const router = express.Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "test" ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

router.get("/product/:productId", limiter, c.listProductReviews); // public
router.get("/product/:productId/mine", limiter, protectUser, c.getMyReview);
router.post("/product/:productId", limiter, protectUser, uploadReviewPhotos, c.createReview);
router.put("/:id", limiter, protectUser, uploadReviewPhotos, c.updateReview);
router.delete("/:id", limiter, protectUser, c.deleteReview);

module.exports = router;
