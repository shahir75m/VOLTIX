const express = require("express");
const rateLimit = require("express-rate-limit");

const { protectUser } = require("../middleware/userAuthMiddleware");
const { listProducts, listCategories, listBrands, getProduct } = require("../controllers/shopProductController");
const { deliveryEstimate, boughtTogether } = require("../controllers/shopExtrasController");
const {
  getCart,
  getCartCount,
  addToCart,
  updateCartItem,
  removeCartItem,
  validateCheckout,
} = require("../controllers/cartController");
const {
  getWishlist,
  getWishlistIds,
  addToWishlist,
  removeFromWishlist,
} = require("../controllers/wishlistController");

const limiter = (limit, message) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message },
  });

// ---------------------------------------------------------- PUBLIC PRODUCTS
const productRouter = express.Router();
productRouter.use(limiter(120, "Too many requests. Please slow down."));
productRouter.get("/", listProducts);
productRouter.get("/categories", listCategories); // must stay above "/:id"
productRouter.get("/brands", listBrands);
productRouter.get("/delivery-estimate", deliveryEstimate); // must stay above "/:id"
productRouter.get("/:id/bought-together", boughtTogether);
productRouter.get("/:id", getProduct);

// -------------------------------------------------------------------- CART
const cartRouter = express.Router();
cartRouter.use(protectUser);
cartRouter.use(limiter(60, "Too many cart requests. Please slow down."));
cartRouter.get("/", getCart);
cartRouter.get("/count", getCartCount);
cartRouter.post("/items", addToCart);
cartRouter.patch("/items/:itemId", updateCartItem);
cartRouter.delete("/items/:itemId", removeCartItem);
cartRouter.post("/validate-checkout", validateCheckout);

// ---------------------------------------------------------------- WISHLIST
const wishlistRouter = express.Router();
wishlistRouter.use(protectUser);
wishlistRouter.use(limiter(60, "Too many wishlist requests. Please slow down."));
wishlistRouter.get("/", getWishlist);
wishlistRouter.get("/ids", getWishlistIds); // must stay above "/:productId"
wishlistRouter.post("/", addToWishlist);
wishlistRouter.delete("/:productId", removeFromWishlist);

module.exports = { productRouter, cartRouter, wishlistRouter };
