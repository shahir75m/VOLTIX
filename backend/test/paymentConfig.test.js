const assert = require("node:assert/strict");
const { test } = require("node:test");

test("online payments stay disabled when Razorpay credentials are missing", () => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  const service = require("../services/orderService");
  assert.equal(service.isMock(), false);
  assert.equal(service.paymentsEnabled(), false);
  assert.equal(service.signatureIsValid("order_test", "pay_test", "fake"), false);
});
