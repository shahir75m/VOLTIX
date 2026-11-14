const crypto = require("crypto");

// Razorpay signs the RAW request body with the webhook secret (not the API key secret).
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== "string" || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const HANDLED_EVENTS = new Set(["payment.captured", "order.paid"]);

// Safety net for customers who paid and then closed the tab before the browser could confirm.
// `findOrder(razorpayOrderId)` and `finalize(orderId, userId, payment, signature)` are injected
// so the handler can be tested without a database.
function createWebhookHandler({ secret, findOrder, finalize, toPaise = (n) => Math.round(Number(n) * 100) }) {
  return async (req, res) => {
    try {
      if (!secret) {
        return res.status(503).json({ success: false, message: "Webhook is not configured" });
      }
      const signature = req.get("x-razorpay-signature");
      if (!verifyWebhookSignature(req.body, signature, secret)) {
        return res.status(400).json({ success: false, message: "Invalid signature" });
      }

      let event;
      try {
        event = JSON.parse(req.body.toString("utf8"));
      } catch {
        return res.status(400).json({ success: false, message: "Invalid payload" });
      }

      const payment = event?.payload?.payment?.entity;
      if (HANDLED_EVENTS.has(event?.event) && payment?.status === "captured" && payment.order_id) {
        const order = await findOrder(payment.order_id);
        // amount must match what we asked Razorpay to collect
        if (order && Number(payment.amount) === toPaise(order.totalPrice)) {
          await finalize(order._id, order.user, payment, "");
        }
      }
      // Always acknowledge a signed event, otherwise Razorpay keeps retrying it.
      return res.status(200).json({ success: true, received: true });
    } catch (error) {
      console.error("Razorpay webhook error:", error);
      // 500 makes Razorpay retry later, which is what we want for a temporary failure.
      return res.status(500).json({ success: false, message: "Webhook processing failed" });
    }
  };
}

module.exports = { verifyWebhookSignature, createWebhookHandler };
