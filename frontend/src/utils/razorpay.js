import { apiJson } from "./api";

// Opens the Razorpay window for an existing order and resolves with the result.
//   { status: "paid", order }  – payment verified by the server
//   { status: "soldout" }      – paid, but an item sold out meanwhile (server cancels + refunds)
//   { status: "failed" }       – failed / window closed (order is kept so the customer can retry)
// Used by checkout AND by the "retry payment" page, so both behave the same.
export function payForOrder({ order, gateway, user, preferredMethod }) {
  return new Promise((resolve) => {
    const markFailed = async (reason) => {
      try {
        await apiJson(`/api/orders/${order._id}/payment-failed`, "POST", { reason });
      } catch {
        /* the order stays Pending, retry still works */
      }
    };

    const verify = async (response) => {
      try {
        const res = await apiJson(`/api/orders/${order._id}/verify-payment`, "POST", {
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        resolve({ status: "paid", order: res.order });
      } catch (error) {
        resolve({ status: error.data?.soldOut ? "soldout" : "failed", message: error.message });
      }
    };

    if (gateway.mock || !gateway.razorpayKey) {
      resolve({ status: "failed", message: "Online payment is disabled until Razorpay is configured. Please choose Cash on Delivery." });
      return;
    }

    if (!window.Razorpay) {
      markFailed("Razorpay checkout could not be loaded").then(() =>
        resolve({ status: "failed", message: "Payment window could not be loaded. Check your internet connection." })
      );
      return;
    }

    let settled = false;
    // When the shopper picked UPI, show its Razorpay block first instead of
    // dropping them into net-banking. Razorpay decides whether to render a QR
    // (desktop) or an app intent (mobile) for the merchant account.
    const upiOnlyConfig = preferredMethod === "UPI" ? {
      display: {
        blocks: {
          upi: { name: "Pay using UPI", instruments: [{ method: "upi" }] },
        },
        sequence: ["block.upi"],
        preferences: { show_default_blocks: false },
      },
    } : undefined;

    const rzp = new window.Razorpay({
      key: gateway.razorpayKey,
      amount: gateway.razorpayOrder.amount,
      currency: gateway.razorpayOrder.currency || "INR",
      name: "VOLTIX",
      description: `Payment for Order #${order.orderId}`,
      order_id: gateway.razorpayOrder.id,
      prefill: {
        name: order.shippingAddress?.fullName,
        contact: order.shippingAddress?.phone,
        email: user?.email,
      },
      ...(upiOnlyConfig ? { config: upiOnlyConfig } : {}),
      theme: { color: "#11151b" },
      handler: (response) => {
        settled = true;
        verify(response);
      },
      modal: {
        ondismiss: () => {
          if (settled) return;
          settled = true;
          markFailed("Payment window closed by the customer").then(() => resolve({ status: "failed" }));
        },
      },
    });

    // The customer can try again inside the window, so this only records the attempt.
    rzp.on("payment.failed", (response) => {
      markFailed(response?.error?.description || "Payment failed");
    });
    rzp.open();
  });
}
