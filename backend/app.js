const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const { applyTrustProxy } = require("./config/proxy");
const { createWebhookHandler } = require("./services/paymentWebhook");
const { renderShareHtml } = require("./services/shareService");

const adminRoutes = require("./routes/adminRoutes");
const userAuthRoutes = require("./routes/userAuthRoutes");
const addressRoutes = require("./routes/addressRoutes");
const orderRoutes = require("./routes/orderRoutes");
const { productRouter, cartRouter, wishlistRouter } = require("./routes/shopRoutes");

const app = express();

applyTrustProxy(app, process.env.TRUST_PROXY);

const cors = require("cors");

// Keep framework and browser defaults from leaking implementation details or
// allowing an API response to be embedded as a document.
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  // Auth, orders and profiles must not be retained in shared browser caches.
  if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
  next();
});

const allowedOrigins = (
  process.env.FRONTEND_URL || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Razorpay webhook: must read the RAW body (the signature covers the exact bytes), so it is mounted
// before express.json(). Set RAZORPAY_WEBHOOK_SECRET in .env to enable it.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json", limit: "100kb" }),
  (req, res, next) =>
    createWebhookHandler({
      secret: process.env.RAZORPAY_WEBHOOK_SECRET,
      findOrder: (razorpayOrderId) => require("./models/Order").findOne({ razorpayOrderId }).select("user totalPrice"),
      finalize: (...args) => require("./controllers/orderController").finalizePayment(...args),
    })(req, res, next)
);

app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  const origin = req.get("origin");

  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    origin &&
    !allowedOrigins.includes(origin)
  ) {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed",
    });
  }

  next();
});

// Link-preview page used by the Share button (WhatsApp/Telegram crawlers do not run JavaScript).
app.get("/share/p/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).type("text").send("Product not found");
    const Product = require("./models/Product");
    const { isVisibleToCustomer } = require("./services/productService");
    const product = await Product.findOne({ _id: req.params.id, isDeleted: false })
      .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
      .lean();
    if (!isVisibleToCustomer(product)) return res.status(404).type("text").send("Product not found");
    const frontendUrl = allowedOrigins[0] || "http://localhost:5173";
    res.set("Cache-Control", "public, max-age=300");
    return res.type("html").send(renderShareHtml({ ...product, image: product.images?.[0]?.url }, { frontendUrl }));
  } catch (error) {
    return next(error);
  }
});

app.get("/", (req, res) => {
  res.json({
    message: "VORTIX API is running",
  });
});

app.use("/api/admin", adminRoutes);
app.use("/api/users", userAuthRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/products", productRouter);
app.use("/api/cart", cartRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/orders", orderRoutes);
app.use("/api/offers", require("./routes/offerRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.status || error.statusCode || 500;
  const message =
    status === 400 && error.type === "entity.parse.failed"
      ? "Invalid JSON request body"
      : status >= 500
        ? "Internal server error"
        : error.message || "Request failed";

  if (status >= 500) {
    console.error("Unhandled API Error:", error);
  }

  return res.status(status).json({
    success: false,
    message,
  });
});

module.exports = app;
