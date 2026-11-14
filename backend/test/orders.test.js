const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");

process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
process.env.RAZORPAY_KEY_SECRET = "unit_secret";

const svc = require("../services/orderService");
const { ALLOWED_TRANSITIONS } = require("../controllers/adminOrderController");

const line = (lineTotal, gstPercent = 18) => ({ lineTotal, gstPercent });

const cartView = (lines, deliveryCharge = 0) => {
  const items = lines.map((l) => ({ unavailable: false, gstPercent: 0, categoryId: "cat1", ...l }));
  return { items, subtotal: items.reduce((n, l) => n + l.lineTotal, 0), deliveryCharge };
};
const coupon = (over = {}) => ({
  _id: "c1", code: "TEST10", discountType: "percent", discountValue: 10, maxDiscount: 0, minOrder: 0,
  category: null, usageLimit: 0, usedCount: 0, isActive: true, isDeleted: false, ...over,
});

test("totals come from cart view: GST is included, not added", () => {
  const t = svc.calculateTotals(cartView([{ lineTotal: 1180, gstPercent: 18 }], 50), null);
  assert.equal(t.itemsPrice, 1180);
  assert.equal(t.taxPrice, 180);
  assert.equal(t.totalPrice, 1230);
  assert.equal(t.discountPrice, 0);
});

test("coupon: percent, cap, flat, minimum order", () => {
  const view = cartView([{ lineTotal: 2000 }]);
  assert.equal(svc.evaluateCoupon(coupon(), view).discount, 200);
  assert.equal(svc.evaluateCoupon(coupon({ maxDiscount: 150 }), view).discount, 150);
  assert.equal(svc.evaluateCoupon(coupon({ discountType: "flat", discountValue: 500 }), view).discount, 500);
  assert.throws(() => svc.evaluateCoupon(coupon({ minOrder: 2500 }), view), /minimum order/);
});

test("coupon: disabled, expired, not started, used up, missing", () => {
  const view = cartView([{ lineTotal: 2000 }]);
  const day = 86400000;
  assert.throws(() => svc.evaluateCoupon(null, view), /Invalid coupon/);
  assert.throws(() => svc.evaluateCoupon(coupon({ isActive: false }), view), /Invalid coupon/);
  assert.throws(() => svc.evaluateCoupon(coupon({ validUntil: new Date(Date.now() - day) }), view), /expired/);
  assert.throws(() => svc.evaluateCoupon(coupon({ validFrom: new Date(Date.now() + day) }), view), /not active yet/);
  assert.throws(() => svc.evaluateCoupon(coupon({ usageLimit: 5, usedCount: 5 }), view), /usage limit/);
});

test("category coupon only counts items of that category", () => {
  const view = cartView([
    { lineTotal: 1000, categoryId: "audio" },
    { lineTotal: 9000, categoryId: "laptops" },
  ]);
  const result = svc.evaluateCoupon(coupon({ category: "audio" }), view);
  assert.equal(result.eligible, 1000);
  assert.equal(result.discount, 100); // 10% of the audio items only
  assert.throws(() => svc.evaluateCoupon(coupon({ category: "audio", minOrder: 1500 }), view), /minimum order/);
  assert.throws(() => svc.evaluateCoupon(coupon({ category: "cameras" }), view), /eligible/);
});

test("coupon discount lowers the total and the GST, and never makes it negative", () => {
  const view = cartView([{ lineTotal: 1000, gstPercent: 18 }]);
  const t = svc.calculateTotals(view, { coupon: coupon(), discount: 100 });
  assert.equal(t.discountPrice, 100);
  assert.equal(t.totalPrice, 900);
  assert.equal(t.couponCode, "TEST10");
  assert.equal(t.taxPrice, 137.29); // 152.54 tax on 1000, scaled to the 900 payable
  const big = svc.calculateTotals(cartView([{ lineTotal: 100 }]), { coupon: coupon(), discount: 500 });
  assert.equal(big.totalPrice, 0);
});

test("razorpay signature check accepts the real HMAC only", () => {
  const sig = crypto.createHmac("sha256", "unit_secret").update("order_1|pay_1").digest("hex");
  assert.equal(svc.signatureIsValid("order_1", "pay_1", sig), true);
  assert.equal(svc.signatureIsValid("order_1", "pay_2", sig), false);
  assert.equal(svc.signatureIsValid("order_1", "pay_1", "demo_sig_ok"), false);
  assert.equal(svc.signatureIsValid("order_1", "pay_1", undefined), false);
});

test("admin cannot push orders to Returned by hand or confirm unpaid online orders", () => {
  for (const next of Object.values(ALLOWED_TRANSITIONS)) assert.ok(!next.includes("Returned"));
  assert.deepEqual(ALLOWED_TRANSITIONS.Pending, ["Cancelled"]);
  assert.deepEqual(ALLOWED_TRANSITIONS.Cancelled, []);
});

test("stock flags make deduct/restore run only once", async () => {
  const order = { stockDeducted: true, stockRestored: false, orderItems: [] };
  assert.equal(await svc.deductStockOnce(order), false); // already deducted
  assert.equal(await svc.restoreStockOnce(order), true);
  assert.equal(await svc.restoreStockOnce(order), false); // second restore ignored
  assert.equal(await svc.restoreStockOnce({ stockDeducted: false, stockRestored: false, orderItems: [] }), false);
});

test("regex special characters in search are escaped", () => {
  assert.equal(svc.escapeRegex("a.*b("), "a\\.\\*b\\(");
});

test("review names are shortened for privacy", () => {
  const { publicName } = require("../controllers/reviewController");
  assert.equal(publicName("Rahul Nair"), "Rahul N.");
  assert.equal(publicName("Anjali"), "Anjali");
  assert.equal(publicName(""), "Customer");
});

test("demo/mock payments are never enabled", () => {
  assert.equal(svc.isMock(), false);
});
