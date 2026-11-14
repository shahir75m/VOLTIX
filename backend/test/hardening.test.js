const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");

process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
process.env.RAZORPAY_KEY_SECRET = "unit_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_unit";
process.env.FRONTEND_URL = "http://localhost:5173";

const { applyTrustProxy } = require("../config/proxy");
const { verifyWebhookSignature, createWebhookHandler } = require("../services/paymentWebhook");
const { expireStaleOrders } = require("../services/orderExpiryService");
const { renderShareHtml } = require("../services/shareService");
const { normalizeTracking } = require("../utils/tracking");
const app = require("../app");

const sign = (body, secret = "whsec_unit") => crypto.createHmac("sha256", secret).update(body).digest("hex");

// ------------------------------------------------------------ trust proxy
test("trust proxy stays off unless TRUST_PROXY is set", () => {
  const fake = { values: {}, set(k, v) { this.values[k] = v; } };
  applyTrustProxy(fake, undefined);
  assert.deepEqual(fake.values, {});
  applyTrustProxy(fake, "1");
  assert.equal(fake.values["trust proxy"], 1);
  applyTrustProxy(fake, "loopback");
  assert.equal(fake.values["trust proxy"], "loopback");
});

// ------------------------------------------------------------ webhook signature
test("webhook signature: only the exact HMAC of the raw body is accepted", () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  assert.equal(verifyWebhookSignature(body, sign(body), "whsec_unit"), true);
  assert.equal(verifyWebhookSignature(body, sign(body, "other"), "whsec_unit"), false);
  assert.equal(verifyWebhookSignature(body, "", "whsec_unit"), false);
  assert.equal(verifyWebhookSignature(body, undefined, "whsec_unit"), false);
  assert.equal(verifyWebhookSignature(body, sign(body), ""), false);
});

// ------------------------------------------------------------ webhook handler
const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const captured = (over = {}) =>
  Buffer.from(JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", order_id: "order_rzp_1", amount: 129900, status: "captured", ...over } } },
  }));
const reqFor = (rawBody, signature = sign(rawBody)) => ({ body: rawBody, get: (h) => (h.toLowerCase() === "x-razorpay-signature" ? signature : undefined) });

test("webhook handler: valid captured payment finalizes the matching order", async () => {
  const calls = [];
  const handler = createWebhookHandler({
    secret: "whsec_unit",
    findOrder: async (id) => (id === "order_rzp_1" ? { _id: "o1", user: "u1", totalPrice: 1299 } : null),
    finalize: async (...args) => calls.push(args),
  });
  const res = makeRes();
  await handler(reqFor(captured()), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "o1");
  assert.equal(calls[0][1], "u1");
  assert.equal(calls[0][2].id, "pay_1");
});

test("webhook handler: wrong amount, unknown order and non-captured payments are ignored", async () => {
  const calls = [];
  const handler = createWebhookHandler({
    secret: "whsec_unit",
    findOrder: async (id) => (id === "order_rzp_1" ? { _id: "o1", user: "u1", totalPrice: 1299 } : null),
    finalize: async (...args) => calls.push(args),
  });
  for (const raw of [captured({ amount: 100 }), captured({ order_id: "order_rzp_missing" }), captured({ status: "failed" })]) {
    const res = makeRes();
    await handler(reqFor(raw), res);
    assert.equal(res.statusCode, 200); // always 200 so Razorpay does not retry forever
  }
  assert.equal(calls.length, 0);
});

test("webhook handler: bad signature is 400, missing secret is 503", async () => {
  const handler = createWebhookHandler({ secret: "whsec_unit", findOrder: async () => null, finalize: async () => {} });
  const res = makeRes();
  await handler(reqFor(captured(), "deadbeef"), res);
  assert.equal(res.statusCode, 400);

  const noSecret = createWebhookHandler({ secret: "", findOrder: async () => null, finalize: async () => {} });
  const res2 = makeRes();
  await noSecret(reqFor(captured()), res2);
  assert.equal(res2.statusCode, 503);
});

// ------------------------------------------------------------ expiry job
const fakeOrderModel = (orders, claimable = true) => ({
  find: () => ({ sort: () => ({ limit: async () => orders }) }),
  findOneAndUpdate: async (filter, update) => {
    if (!claimable) return null;
    const order = orders.find((o) => String(o._id) === String(filter._id));
    Object.assign(order, update.$set);
    order.statusHistory.push(update.$push.statusHistory);
    order.save = async () => { order.saved = true; };
    return order;
  },
});
const stale = (id, over = {}) => ({ _id: id, user: "u1", totalPrice: 500, couponId: "c1", couponReleased: false, statusHistory: [], ...over });

test("expiry job: unpaid stale order is cancelled and its coupon use is released", async () => {
  const order = stale("o1");
  const released = [];
  const summary = await expireStaleOrders({
    deps: {
      Order: fakeOrderModel([order]),
      svc: {
        paymentsEnabled: () => true,
        findCapturedPayment: async () => null,
        toPaise: (n) => n * 100,
        releaseCouponOnce: async (o) => { released.push(o._id); o.couponReleased = true; },
      },
      finalizePayment: async () => assert.fail("must not finalize an unpaid order"),
    },
  });
  assert.deepEqual(summary, { reconciled: 0, cancelled: 1, skipped: 0, errors: 0 });
  assert.equal(order.status, "Cancelled");
  assert.deepEqual(released, ["o1"]);
  assert.equal(order.saved, true);
});

test("expiry job: an order Razorpay says is already paid is finalized, not cancelled", async () => {
  const order = stale("o2");
  const finalized = [];
  const summary = await expireStaleOrders({
    deps: {
      Order: fakeOrderModel([order]),
      svc: {
        paymentsEnabled: () => true,
        findCapturedPayment: async () => ({ id: "pay_9", amount: 50000 }),
        toPaise: (n) => n * 100,
        releaseCouponOnce: async () => assert.fail("must not release coupon of a paid order"),
      },
      finalizePayment: async (...a) => finalized.push(a),
    },
  });
  assert.deepEqual(summary, { reconciled: 1, cancelled: 0, skipped: 0, errors: 0 });
  assert.equal(finalized[0][0], "o2");
  assert.notEqual(order.status, "Cancelled");
});

test("expiry job: skips an order that changed while the job ran, and survives one failing order", async () => {
  const a = stale("o3");
  const skipped = await expireStaleOrders({
    deps: {
      Order: fakeOrderModel([a], false),
      svc: { paymentsEnabled: () => false, toPaise: (n) => n * 100, releaseCouponOnce: async () => {} },
      finalizePayment: async () => {},
    },
  });
  assert.equal(skipped.skipped, 1);
  assert.equal(skipped.cancelled, 0);

  const b = stale("o4");
  const c = stale("o5");
  const summary = await expireStaleOrders({
    deps: {
      Order: fakeOrderModel([b, c]),
      svc: {
        paymentsEnabled: () => true,
        findCapturedPayment: async (o) => { if (o._id === "o4") throw new Error("gateway down"); return null; },
        toPaise: (n) => n * 100,
        releaseCouponOnce: async () => {},
      },
      finalizePayment: async () => {},
    },
  });
  assert.equal(summary.errors, 1);
  assert.equal(summary.cancelled, 1);
});

// ------------------------------------------------------------ share page
test("share page: escapes product text so a product name cannot inject HTML", () => {
  const html = renderShareHtml(
    { _id: "p1", name: 'Phone "X" <script>alert(1)</script>', description: "A & B", image: "https://img.test/a.jpg" },
    { frontendUrl: "http://localhost:5173" }
  );
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('property="og:image" content="https://img.test/a.jpg"'));
  assert.ok(html.includes("http://localhost:5173/products/p1"));
});

// ------------------------------------------------------------ tracking
test("tracking: trims, caps length and only accepts http(s) links", () => {
  assert.deepEqual(normalizeTracking({ courier: "  Delhivery ", trackingNumber: " DL123 ", trackingUrl: "https://t.test/DL123" }), {
    courier: "Delhivery", trackingNumber: "DL123", trackingUrl: "https://t.test/DL123",
  });
  assert.equal(normalizeTracking({ trackingUrl: "javascript:alert(1)" }).trackingUrl, "");
  assert.equal(normalizeTracking({ courier: "x".repeat(200) }).courier.length, 60);
  assert.equal(normalizeTracking(undefined).courier, "");
});

// ------------------------------------------------------------ HTTP wiring
let server;
let baseUrl;
before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

test("webhook route is mounted and rejects an unsigned call", async () => {
  const response = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "payment.captured" }),
  });
  assert.equal(response.status, 400);
});

test("admin refund retry needs an admin login", async () => {
  const response = await fetch(`${baseUrl}/api/admin/orders/64b000000000000000000000/retry-refund`, { method: "POST" });
  assert.equal(response.status, 401);
});

test("share route rejects a malformed product id without touching the database", async () => {
  const response = await fetch(`${baseUrl}/share/p/not-an-id`);
  assert.equal(response.status, 404);
});
