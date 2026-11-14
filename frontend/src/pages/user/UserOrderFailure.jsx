import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import { useShop } from "../../context/ShopContext";
import { apiFetch, apiJson } from "../../utils/api";
import { payForOrder } from "../../utils/razorpay";
import { formatPrice } from "../../utils/format";
import Icon from "../../components/Icon";

function UserOrderFailureContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("");
  const { user } = useShop();

  const loadOrder = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/orders/${id}`);
      if (data.success && data.order) setOrder(data.order);
    } catch (err) {
      console.error("Order fetch failed:", err);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadOrder();
  }, [id, loadOrder]);

  const handleRetryPayment = async () => {
    if (!order || retrying) return;
    try {
      setRetrying(true);
      // Same order is paid again - no new order is created
      const res = await apiJson(`/api/orders/${order._id}/retry-payment`, "POST", {});
      if (res.paid) {
        navigate(`/order/success/${order._id}`, { replace: true });
        return;
      }
      const result = await payForOrder({ order: res.order, gateway: res, user });
      if (result.status === "paid") {
        navigate(`/order/success/${order._id}`, { replace: true });
      } else {
        setMessage(result.message || "Payment was not completed. You can try again.");
        if (result.status === "soldout") await loadOrder();
      }
    } catch (err) {
      setMessage(err.message || "Retry payment failed");
      if (err.data?.soldOut) await loadOrder();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <div className="vx-page" style={{ maxWidth: "680px" }}>
        <div
          className="vx-state"
          style={{
            padding: "48px 24px",
            borderRadius: "16px",
            border: "1px solid #fee2e2",
            background: "#fffafa",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "#fee2e2",
              color: "#991b1b",
              display: "grid",
              placeItems: "center",
              fontSize: "24px",
              fontWeight: "900",
              margin: "0 auto 16px",
            }}
          >
            <Icon name="x" size={30} strokeWidth={3} />
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: "800", margin: "0 0 10px", color: "#11151b" }}>
            {order?.status === "Cancelled" ? "Order cancelled" : "Payment unsuccessful"}
          </h1>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: "0 0 20px" }}>
            We could not complete your payment for Order #{order?.orderId || id}. Don't worry, your order is
            saved and you can retry without starting over.
          </p>

          {message && <p className="vx-field-error" style={{ marginBottom: "12px" }}>{message}</p>}
          {order?.status === "Cancelled" && (
            <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "16px" }}>
              {order.cancelReason}. {order.paymentStatus === "Refunded" ? "Your refund has been initiated." : ""}
            </p>
          )}

          {order && (
            <p style={{ fontWeight: "700", marginBottom: "24px" }}>
              Payable amount: {formatPrice(order.totalPrice)}
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
            <button
              type="button"
              className="vx-btn-lime"
              style={{ width: "auto", minWidth: "160px" }}
              disabled={retrying || !order || order.status !== "Pending"}
              onClick={handleRetryPayment}
            >
              {retrying ? "Processing..." : "Retry payment"}
            </button>
            <Link to="/cart" className="vx-btn-outline">
              Return to cart
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

// useShop() only works INSIDE <StoreLayout>, so the page content lives in its own component.
export default function UserOrderFailure() {
  return (
    <StoreLayout>
      <UserOrderFailureContent />
    </StoreLayout>
  );
}
