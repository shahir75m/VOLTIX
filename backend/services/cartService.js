const Cart = require("../models/Cart");
const Product = require("../models/Product");
const shop = require("../config/shop");
const { isVisibleToCustomer, variantLabel } = require("./productService");

const sameVariant = (a, b) => String(a || "") === String(b || "");

// Looks at ONE cart line and the CURRENT database data of its product.
// Prices and stock always come from the database, never from the browser.
const evaluateLine = (item, product) => {
  const issues = [];
  let unavailable = false;
  let stock = 0;
  let chosen = null; // the variant of this line (if the product has variants)

  if (!product || !isVisibleToCustomer(product)) {
    unavailable = true;
    issues.push("This product is no longer available");
  } else if (product.variants.length > 0) {
    const variant = item.variant
      ? product.variants.find((v) => sameVariant(v._id, item.variant))
      : null;
    if (!variant) {
      unavailable = true;
      issues.push("This option is no longer available");
    } else {
      stock = variant.stock;
      chosen = variant;
    }
  } else if (item.variant) {
    unavailable = true;
    issues.push("This option is no longer available");
  } else {
    stock = product.stock;
  }

  if (!unavailable) {
    if (stock <= 0) issues.push("Out of stock");
    else if (item.quantity > stock) issues.push(`Only ${stock} left in stock`);
    if (item.quantity > shop.MAX_QTY_PER_ITEM)
      issues.push(`Maximum ${shop.MAX_QTY_PER_ITEM} units allowed per item`);
  }

  // variants have their own price – always taken from the database
  const unitPrice = unavailable ? 0 : chosen ? chosen.price : product.price;
  const unitMrp = unavailable ? 0 : chosen ? chosen.mrp : product.mrp;

  return {
    itemId: item._id,
    productId: item.product,
    variantId: item.variant || null,
    name: product?.name || "Unavailable product",
    image: product?.images?.find((img) => img.publicId === chosen?.imagePublicId)?.url || product?.images?.[0]?.url || "",
    deliveryCharge: unavailable ? 0 : product.deliveryCharge || 0,
    codAvailable: !unavailable && product.codAvailable !== false,
    gstPercent: product?.gstPercent || 0,
    taxInclusive: true,
    imageAlt: product?.images?.find((img) => img.publicId === chosen?.imagePublicId)?.alt || product?.images?.[0]?.alt || product?.name || "Product image",
    category: product?.category?.name || "",
    categoryId: product?.category?._id ? String(product.category._id) : "",
    variantLabel: chosen ? variantLabel(chosen) : "",
    unitPrice,
    mrp: unitMrp > unitPrice ? unitMrp : 0,
    quantity: item.quantity,
    lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
    stock,
    maxQuantity: Math.max(0, Math.min(shop.MAX_QTY_PER_ITEM, stock)),
    unavailable,
    issues,
    valid: issues.length === 0,
  };
};

const buildCartView = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).lean();
  const items = cart?.items || [];

  const products = items.length
    ? await Product.find({ _id: { $in: items.map((i) => i.product) } })
        .populate({ path: "category brand", select: "name isDeleted", skipInvalidIds: true })
        .lean()
    : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = items.map((item) => evaluateLine(item, byId.get(String(item.product))));

  const subtotal =
    Math.round(
      lines.filter((l) => !l.unavailable).reduce((sum, l) => sum + l.lineTotal, 0) * 100
    ) / 100;

  const deliveryCharge = Math.round([...new Map(lines.filter((l) => !l.unavailable).map((l) => [String(l.productId), l.deliveryCharge])).values()].reduce((sum, amount) => sum + amount, 0) * 100) / 100;
  const invalidCount = lines.filter((l) => !l.valid).length;

  return {
    items: lines,
    lineCount: lines.length,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotal,
    deliveryCharge,
    codAvailable: lines.length > 0 && lines.every((l) => l.codAvailable),
    taxInclusive: true,
    total: Math.round((subtotal + deliveryCharge) * 100) / 100,
    invalidCount,
    canCheckout: lines.length > 0 && invalidCount === 0,
    limits: { maxQuantityPerItem: shop.MAX_QTY_PER_ITEM },
  };
};

// Used by the (future) order module right before an order is created.
// Re-reads stock and price from the database. `expectedTotal` is what the
// customer saw; if it no longer matches, the customer must review the cart again.
const validateCartForCheckout = async (userId, expectedTotal) => {
  const view = await buildCartView(userId);

  if (view.lineCount === 0) {
    return { ok: false, status: 400, message: "Your cart is empty", view };
  }

  if (view.invalidCount > 0) {
    const first = view.items.find((l) => !l.valid);
    return {
      ok: false,
      status: 409,
      message: `${first.name}: ${first.issues[0]}. Please update your cart.`,
      view,
    };
  }

  if (expectedTotal !== undefined && expectedTotal !== null) {
    const expected = Number(expectedTotal);
    if (!Number.isFinite(expected) || Math.abs(expected - view.total) > 0.001) {
      return {
        ok: false,
        status: 409,
        message: "Prices in your cart have changed. Please review your cart.",
        view,
      };
    }
  }

  return { ok: true, status: 200, message: "Cart is valid", view };
};

module.exports = { evaluateLine, buildCartView, validateCartForCheckout, sameVariant };
