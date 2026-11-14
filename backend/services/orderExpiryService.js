// Cleans up online-payment orders the customer never finished paying for.
// Without this, the order stays Pending forever and a limited-use coupon stays "used".
//
// For every stale order we first ask Razorpay whether the money actually arrived (customer paid but
// closed the browser). If yes the order is confirmed; if not it is cancelled and the coupon given back.
// A payment that arrives after cancellation is refunded automatically by finalizePayment.
const DEFAULT_MINUTES = 30;

const minutesFromEnv = () => {
  const n = Number(process.env.ORDER_EXPIRY_MINUTES);
  return Number.isFinite(n) && n >= 5 ? n : DEFAULT_MINUTES;
};

function defaultDeps() {
  return {
    Order: require("../models/Order"),
    svc: require("./orderService"),
    finalizePayment: require("../controllers/orderController").finalizePayment,
  };
}

async function expireStaleOrders({ olderThanMs = minutesFromEnv() * 60000, now = new Date(), limit = 50, deps = {} } = {}) {
  const { Order, svc, finalizePayment } = { ...defaultDeps(), ...deps };
  const summary = { reconciled: 0, cancelled: 0, skipped: 0, errors: 0 };
  const openPayment = ["Pending", "Failed"];

  const stale = await Order.find({
    paymentMethod: "Razorpay",
    status: "Pending",
    paymentStatus: { $in: openPayment },
    createdAt: { $lt: new Date(now.getTime() - olderThanMs) },
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  for (const order of stale) {
    try {
      if (svc.paymentsEnabled()) {
        const captured = await svc.findCapturedPayment(order);
        if (captured && Number(captured.amount) === svc.toPaise(order.totalPrice)) {
          await finalizePayment(order._id, order.user, captured, "");
          summary.reconciled += 1;
          continue;
        }
      }

      // Claim the cancellation atomically: if the customer paid a moment ago, this matches nothing.
      const reason = "Payment was not completed in time";
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, status: "Pending", paymentStatus: { $in: openPayment } },
        {
          $set: { status: "Cancelled", cancelReason: reason, cancelledAt: now },
          $push: { statusHistory: { status: "Cancelled", by: "system", note: reason } },
        },
        { new: true }
      );
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }
      await svc.releaseCouponOnce(claimed);
      await claimed.save();
      summary.cancelled += 1;
    } catch (error) {
      summary.errors += 1;
      console.error("Order expiry failed for", String(order._id), error?.error || error);
    }
  }
  return summary;
}

// Runs once shortly after start and then every 10 minutes. unref() so it never keeps the process alive.
function startOrderExpiryJob({ intervalMs = 10 * 60 * 1000 } = {}) {
  const run = () =>
    expireStaleOrders()
      .then((s) => {
        if (s.reconciled || s.cancelled || s.errors) console.log("Order expiry job:", s);
      })
      .catch((error) => console.error("Order expiry job failed:", error));
  setTimeout(run, 30 * 1000).unref();
  return setInterval(run, intervalMs).unref();
}

module.exports = { expireStaleOrders, startOrderExpiryJob };
