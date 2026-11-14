const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Wishlist = require("../models/Wishlist");
const shop = require("../config/shop");
const { isValidId, validateQuantity } = require("../utils/validators");
const { isVisibleToCustomer } = require("../services/productService");
const {
  buildCartView,
  validateCartForCheckout,
  sameVariant,
} = require("../services/cartService");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// GET /api/cart
const getCart = async (req, res) => {
  try {
    const cart = await buildCartView(req.user._id);
    return res.status(200).json({ success: true, cart });
  } catch (error) {
    console.error("Get Cart Error:", error);
    return fail(res, 500, "Failed to load cart");
  }
};

// GET /api/cart/count
const getCartCount = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).select("items").lean();
    return res.status(200).json({ success: true, count: cart?.items?.length || 0 });
  } catch (error) {
    console.error("Cart Count Error:", error);
    return fail(res, 500, "Failed to load cart");
  }
};

// POST /api/cart/items   { productId, variantId?, quantity? }
const addToCart = async (req, res) => {
  try {
    const { productId, variantId } = req.body || {};
    if (!isValidId(productId)) return fail(res, 400, "Invalid product");

    const qty = validateQuantity(req.body.quantity === undefined ? 1 : req.body.quantity);
    if (qty.error) return fail(res, 400, qty.error);

    const product = await Product.findById(productId)
      .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
      .lean();

    // unpublished / deleted / blocked / hidden-category products can never be added
    if (!isVisibleToCustomer(product)) {
      return fail(res, 404, "This product is no longer available");
    }

    let stock = product.stock;
    let chosenVariant = null;

    if (product.variants.length > 0) {
      if (!isValidId(String(variantId || ""))) return fail(res, 400, "Please select all product options");
      chosenVariant = product.variants.find((v) => sameVariant(v._id, variantId));
      if (!chosenVariant) return fail(res, 400, "Selected option is not available");
      stock = chosenVariant.stock;
    } else if (variantId) {
      return fail(res, 400, "This product has no options");
    }

    if (stock <= 0) return fail(res, 409, "This item is out of stock");

    // Create the cart once. A concurrent request may win the unique user key.
    try {
      await Cart.updateOne(
        { user: req.user._id },
        { $setOnInsert: { items: [] } },
        { upsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }

    const lineMatch = { product: product._id, variant: chosenVariant ? chosenVariant._id : null };
    let existingLine;
    let saved = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const cart = await Cart.findOne({ user: req.user._id }).lean();
      if (!cart) continue;
      existingLine = cart.items.find(
        (i) => String(i.product) === String(product._id) && sameVariant(i.variant, chosenVariant?._id)
      );
      const existingQty = existingLine?.quantity || 0;
      const newQty = existingQty + qty.quantity;
      if (newQty > shop.MAX_QTY_PER_ITEM) {
        return fail(res, 400, existingQty
          ? `You already have ${existingQty} in your cart. Maximum ${shop.MAX_QTY_PER_ITEM} per item.`
          : `You can buy a maximum of ${shop.MAX_QTY_PER_ITEM} units of one item`);
      }
      if (newQty > stock) {
        return fail(res, 409, existingQty
          ? `Only ${stock} in stock and you already have ${existingQty} in your cart`
          : `Only ${stock} left in stock`);
      }
      if (!existingLine && cart.items.length >= shop.MAX_CART_LINES) {
        return fail(res, 400, `Your cart can hold at most ${shop.MAX_CART_LINES} different items`);
      }
      const nextItems = existingLine
        ? cart.items.map((i) => String(i._id) === String(existingLine._id) ? { ...i, quantity: newQty } : i)
        : [...cart.items, { ...lineMatch, quantity: newQty }];
      // Compare the complete snapshot so simultaneous adds/removes cannot overwrite each other.
      const result = await Cart.updateOne(
        { _id: cart._id, items: cart.items },
        { $set: { items: nextItems } }
      );
      if (result.matchedCount) { saved = true; break; }
    }
    if (!saved) return fail(res, 409, "Your cart changed. Please try again.");

    // item moved to cart -> remove it from the wishlist automatically
    const wishlistResult = await Wishlist.updateOne(
      { user: req.user._id },
      { $pull: { items: { product: product._id } } }
    );

    const view = await buildCartView(req.user._id);
    return res.status(existingLine ? 200 : 201).json({
      success: true,
      message: existingLine ? "Cart updated" : "Added to cart",
      removedFromWishlist: wishlistResult.modifiedCount > 0,
      cart: view,
    });
  } catch (error) {
    console.error("Add To Cart Error:", error);
    return fail(res, 500, "Failed to add item to cart");
  }
};

// PATCH /api/cart/items/:itemId   { quantity }
const updateCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!isValidId(itemId)) return fail(res, 400, "Invalid cart item");

    const qty = validateQuantity(req.body?.quantity);
    if (qty.error) return fail(res, 400, qty.error);

    const cart = await Cart.findOne({ user: req.user._id }).lean();
    const item = cart?.items?.find((i) => String(i._id) === itemId);
    if (!item) return fail(res, 404, "Item not found in your cart");

    const product = await Product.findById(item.product)
      .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
      .lean();

    if (!isVisibleToCustomer(product)) {
      return fail(res, 409, "This product is no longer available. Please remove it from your cart.");
    }

    let stock = product.stock;
    if (product.variants.length > 0) {
      const variant = product.variants.find((v) => sameVariant(v._id, item.variant));
      if (!variant) return fail(res, 409, "This option is no longer available. Please remove it.");
      stock = variant.stock;
    }

    if (stock <= 0) return fail(res, 409, "This item is out of stock");
    if (qty.quantity > stock) return fail(res, 409, `Only ${stock} left in stock`);

    await Cart.updateOne(
      { user: req.user._id, "items._id": itemId },
      { $set: { "items.$.quantity": qty.quantity } }
    );

    return res.status(200).json({
      success: true,
      message: "Quantity updated",
      cart: await buildCartView(req.user._id),
    });
  } catch (error) {
    console.error("Update Cart Item Error:", error);
    return fail(res, 500, "Failed to update cart");
  }
};

// DELETE /api/cart/items/:itemId
const removeCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!isValidId(itemId)) return fail(res, 400, "Invalid cart item");

    const result = await Cart.updateOne(
      { user: req.user._id },
      { $pull: { items: { _id: itemId } } }
    );

    if (result.modifiedCount === 0) return fail(res, 404, "Item not found in your cart");

    return res.status(200).json({
      success: true,
      message: "Item removed from cart",
      cart: await buildCartView(req.user._id),
    });
  } catch (error) {
    console.error("Remove Cart Item Error:", error);
    return fail(res, 500, "Failed to remove item");
  }
};

// POST /api/cart/validate-checkout   { expectedTotal? }
// Checkout / order creation must call this (or validateCartForCheckout) first.
const validateCheckout = async (req, res) => {
  try {
    const result = await validateCartForCheckout(req.user._id, req.body?.expectedTotal);
    return res.status(result.status).json({
      success: result.ok,
      message: result.message,
      cart: result.view,
    });
  } catch (error) {
    console.error("Validate Checkout Error:", error);
    return fail(res, 500, "Failed to validate cart");
  }
};

module.exports = {
  getCart,
  getCartCount,
  addToCart,
  updateCartItem,
  removeCartItem,
  validateCheckout,
};
