import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import { useShop } from "../../context/ShopContext";
import { apiFetch } from "../../utils/api";
import { formatPrice } from "../../utils/format";
import Icon from "../../components/Icon";

function UserOrderSuccessContent() {
  const { id } = useParams();
  const { setCartCount } = useShop();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrder = async () => {
      try {
        setLoading(true);
        const data = await apiFetch(`/api/orders/${id}`);
        if (data.success && data.order) {
          setOrder(data.order);
        }
      } catch (err) {
        console.error("Order fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    if (id) loadOrder();
    // the order used up the cart items, so the header counter must be refreshed
    apiFetch("/api/cart/count").then((d) => setCartCount(d.count)).catch(() => {});
  }, [id, setCartCount]);

  if (loading) {
    return (
      <>
        <div className="vx-page">
          <div className="vx-state">
            <strong>Loading order details...</strong>
          </div>
        </div>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <div className="vx-page">
          <div className="vx-state">
            <strong>Order not found</strong>
            <p>Could not retrieve order details.</p>
            <Link to="/products" className="vx-btn-dark">
              Continue shopping
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="vx-page" style={{ maxWidth: "780px" }}>
        {/* SUCCESS CARD matching OrderSuccess.pdf */}
        <div
          className="vx-state"
          style={{
            padding: "40px 24px 32px",
            marginBottom: "28px",
            borderRadius: "16px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "#d5ff32",
              color: "#11151b",
              display: "grid",
              placeItems: "center",
              fontSize: "24px",
              fontWeight: "900",
              margin: "0 auto 16px",
            }}
          >
            <Icon name="check" size={32} strokeWidth={3} />
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: "800", margin: "0 0 10px", color: "#11151b" }}>
            Order placed
          </h1>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: "0 0 20px" }}>
            Thank you. We have received your order and will email a confirmation shortly.
          </p>
          <div
            style={{
              display: "inline-block",
              background: "#f3f4f6",
              padding: "8px 20px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "700",
              color: "#11151b",
            }}
          >
            Order number #{order.orderId}
          </div>
        </div>

        {/* ORDER DETAILS BOX */}
        <div className="vx-card-section" style={{ borderRadius: "14px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "18px" }}>Order details</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
              paddingBottom: "18px",
              borderBottom: "1px solid #e5e7eb",
              marginBottom: "18px",
            }}
          >
            <div>
              <span className="vx-eyebrow">Delivering to</span>
              <p style={{ fontWeight: "700", margin: "4px 0 2px" }}>
                {order.shippingAddress?.fullName}
              </p>
              <p className="vx-sub">
                {order.shippingAddress?.addressLine1},{" "}
                {order.shippingAddress?.addressLine2
                  ? `${order.shippingAddress.addressLine2}, `
                  : ""}
                {order.shippingAddress?.city}
              </p>
              <p className="vx-sub">
                {order.shippingAddress?.state} – {order.shippingAddress?.pincode}
              </p>
              <p className="vx-sub">Phone: {order.shippingAddress?.phone}</p>
            </div>

            <div>
              <span className="vx-eyebrow">Payment</span>
              <p style={{ fontWeight: "700", margin: "4px 0 2px" }}>
                {order.paymentMethod === "COD" ? "Cash on delivery" : order.paymentMethod === "Wallet" ? "VORTIX Wallet" : "Online Payment (Razorpay)"}
              </p>
              <p className="vx-sub">
                Status: {order.isPaid ? "Paid" : "Pending on delivery"}
              </p>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: "18px" }}>
            {order.orderItems.map((item) => (
              <div
                key={item._id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: "1px solid #f3f4f6",
                  fontSize: "14px",
                }}
              >
                <div>
                  <strong>{item.name}</strong>
                  {item.variantLabel && (
                    <span className="vx-sub" style={{ display: "block", fontSize: "12px" }}>
                      {item.variantLabel}
                    </span>
                  )}
                  <span className="vx-sub">Qty: {item.qty}</span>
                </div>
                <strong>{formatPrice(item.lineTotal || item.price * item.qty)}</strong>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "18px",
              fontWeight: "800",
              paddingTop: "10px",
            }}
          >
            <span>Total</span>
            <span>{formatPrice(order.totalPrice)}</span>
          </div>
        </div>

        {/* ACTIONS */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "14px",
            marginTop: "24px",
          }}
        >
          <Link to={`/orders/${id}`} className="vx-btn-dark">
            View order details
          </Link>
          <Link to="/orders" className="vx-btn-outline">
            My orders
          </Link>
          <Link to="/products" className="vx-btn-outline">
            Continue shopping
          </Link>
        </div>
      </div>
    </>
  );
}

// useShop() only works INSIDE <StoreLayout>, so the page content lives in its own component.
export default function UserOrderSuccess() {
  return (
    <StoreLayout>
      <UserOrderSuccessContent />
    </StoreLayout>
  );
}
