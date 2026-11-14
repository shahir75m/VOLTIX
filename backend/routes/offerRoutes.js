const express = require("express");
const rateLimit = require("express-rate-limit");
const { getPublicPromos } = require("../controllers/promoController");

const router = express.Router();

const publicPromoLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.NODE_ENV === "test" ? 10000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many offer requests. Please slow down." },
});

// public: no login needed (home page banners and the Offers page)
router.get("/", publicPromoLimiter, getPublicPromos);

module.exports = router;
