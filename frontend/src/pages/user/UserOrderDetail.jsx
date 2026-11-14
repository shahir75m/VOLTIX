import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import { useShop } from "../../context/ShopContext";
import { apiFetch, apiJson } from "../../utils/api";
import { API_BASE_URL } from "../../config/api";
import { formatPrice } from "../../utils/format";

function UserOrderDetailContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, authChecked, showToast, setCartCount } = useShop();
  const [buying, setBuying] = useState(false);

  const handleBuyAgain = async () => {
    if (buying) return;
    try {
      setBuying(true);
      const res = await apiJson(`/api/orders/${id}/buy-again`, "POST", {});
      setCartCount(res.cartCount);
      showToast(res.message, res.skipped?.length ? "error" : "success");
      navigate("/checkout");
    } catch (err) {
      showToast(err.message || "Could not add items to cart", "error");
    } finally {
      setBuying(false);
    }
  };

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    const loadOrder = async () => {
      try {
        setLoading(true);
        const data = await apiFetch(`/api/orders/${id}`);
        if (data.success && data.order) {
          setOrder(data.order);
        }
      } catch (err) {
        showToast(err.message || "Failed to load order", "error");
      } finally {
        setLoading(false);
      }
    };

    if (id) loadOrder();
  }, [id, user, authChecked, navigate, showToast]);

  const handleCancelOrder = async () => {
    if (cancelling) return;
    try {
      setCancelling(true);
      const res = await apiJson(`/api/orders/${order._id}/cancel`, "PUT", {
        reason: cancelReason || "Customer cancelled",
      });
      if (res.success) {
        setOrder(res.order);
        setShowCancelModal(false);
        showToast("Order has been cancelled successfully", "success");
      }
    } catch (err) {
      showToast(err.message || "Failed to cancel order", "error");
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadInvoice = () => {
    window.open(`${API_BASE_URL}/api/orders/${order._id}/invoice`, "_blank");
  };

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
            <Link to="/orders" className="vx-btn-dark">
              Back to orders
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Stepper calculations
  // Statuses: Pending -> Confirmed -> Shipped -> Out for Delivery -> Delivered
  const statusLevels = {
    Pending: 1,
    Confirmed: 2,
    Shipped: 3,
    "Out for Delivery": 3,
    Delivered: 4,
    Cancelled: 0,
    Returned: 4,
  };
  const currentLevel = statusLevels[order.status] ?? 1;

  const isCancelable = ["Pending", "Confirmed"].includes(order.status);
  const isDelivered = order.status === "Delivered";
  const unpaidOnline = order.paymentMethod === "Razorpay" && order.status === "Pending" && !order.isPaid;
  const displayStatus = unpaidOnline
    ? "Payment pending"
    : order.status === "Confirmed"
      ? "Processing"
      : order.status;

  return (
    <>
      <div className="vx-page">
        {/* Breadcrumb matching OrderDetail.pdf */}
        <div className="vx-breadcrumb">
          <Link to="/orders">My orders</Link>
          {" / "}
          <span>Order #{order.orderId}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: "800", margin: "0 0 6px", color: "#11151b" }}>
              Order #{order.orderId}
            </h1>
            <p className="vx-sub">
              Placed on{" "}
              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <span className={`vx-status-pill ${displayStatus}`}>{displayStatus}</span>
        </div>

        {/* ORDER STATUS STEPPER (OrderDetail.pdf) */}
        {order.status !== "Cancelled" && (
          <div className="vx-card-section">
            <h2 style={{ fontSize: "16px", marginBottom: "20px" }}>Order status</h2>
            <div className="vx-stepper">
              {/* Step 1 */}
              <div className="vx-step-item">
                <div className={`vx-step-bubble ${currentLevel >= 1 ? "done" : ""}`}>1</div>
                <strong className="vx-step-title">Order placed</strong>
                <span className="vx-step-sub">
                  {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </div>

              {/* Step 2 */}
              <div className="vx-step-item">
                <div
                  className={`vx-step-bubble ${
                    currentLevel === 2 ? "active" : currentLevel > 2 ? "done" : ""
                  }`}
                >
                  2
                </div>
                <strong className="vx-step-title">Processing</strong>
                <span className="vx-step-sub">We are packing your items</span>
              </div>

              {/* Step 3 */}
              <div className="vx-step-item">
                <div
                  className={`vx-step-bubble ${
                    currentLevel === 3 ? "active" : currentLevel > 3 ? "done" : ""
                  }`}
                >
                  3
                </div>
                <strong className="vx-step-title">Shipped</strong>
                <span className="vx-step-sub">
                  {order.status === "Out for Delivery"
                    ? "Out for delivery"
                    : currentLevel >= 3
                      ? "On its way"
                      : "Tracking will appear here"}
                </span>
                {order.tracking?.trackingNumber && (
                  <span className="vx-step-sub">
                    {order.tracking.courier ? `${order.tracking.courier} · ` : ""}
                    {order.tracking.trackingUrl ? (
                      <a href={order.tracking.trackingUrl} target="_blank" rel="noopener noreferrer">{order.tracking.trackingNumber}</a>
                    ) : (
                      order.tracking.trackingNumber
                    )}
                  </span>
                )}
              </div>

              {/* Step 4 */}
              <div className="vx-step-item">
                <div
                  className={`vx-step-bubble ${
                    currentLevel === 4 ? "active done" : ""
                  }`}
                >
                  4
                </div>
                <strong className="vx-step-title">Delivered</strong>
                <span className="vx-step-sub">
                  {order.deliveredAt
                    ? new Date(order.deliveredAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })
                    : "Expected soon"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2-COLUMN LAYOUT matching OrderDetail.pdf */}
        <div className="vx-checkout-layout">
          {/* LEFT: Items & Summary */}
          <div>
            <section className="vx-card-section">
              <h2 style={{ fontSize: "16px", marginBottom: "16px" }}>Items</h2>
              {order.orderItems.map((item) => (
                <div
                  key={item._id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "14px 0",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      borderRadius: "8px",
                      background: "#f3f4f6",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {item.image && (
                      <img
                        src={item.image}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: "15px", color: "#11151b" }}>{item.name}</strong>
                    {item.variantLabel && (
                      <p className="vx-sub" style={{ margin: "2px 0" }}>
                        {item.variantLabel}
                      </p>
                    )}
                    <span className="vx-sub">
                      {formatPrice(item.price)} × {item.qty}
                    </span>
                  </div>

                  <strong style={{ fontSize: "15px" }}>
                    {formatPrice(item.lineTotal || item.price * item.qty)}
                  </strong>
                </div>
              ))}

              <div style={{ marginTop: "18px" }}>
                <div className="vx-sum-row">
                  <span>Subtotal</span>
                  <strong>{formatPrice(order.itemsPrice || order.totalPrice)}</strong>
                </div>
                <div className="vx-sum-row">
                  <span>Delivery</span>
                  <strong className="vx-muted-strong">
                    {order.shippingPrice ? formatPrice(order.shippingPrice) : "Free"}
                  </strong>
                </div>
                {order.discountPrice > 0 && (
                  <div className="vx-sum-row" style={{ color: "#166534" }}>
                    <span>Coupon Discount</span>
                    <strong>-{formatPrice(order.discountPrice)}</strong>
                  </div>
                )}
                {order.taxPrice > 0 && (
                  <div className="vx-sum-row">
                    <span>GST (included in price)</span>
                    <strong className="vx-muted-strong">{formatPrice(order.taxPrice)}</strong>
                  </div>
                )}
                <div className="vx-sum-total">
                  <span>Total</span>
                  <strong>{formatPrice(order.totalPrice)}</strong>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT: Address, Payment & Actions */}
          <aside>
            <div className="vx-card-section">
              <h2 style={{ fontSize: "16px", marginBottom: "12px" }}>Delivery address</h2>
              <strong style={{ display: "block", marginBottom: "4px" }}>
                {order.shippingAddress?.fullName}
              </strong>
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
              <p className="vx-sub" style={{ marginTop: "4px" }}>
                Phone: {order.shippingAddress?.phone}
              </p>

              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
                <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Payment</h2>
                <p style={{ fontWeight: "600", fontSize: "14px", margin: "0 0 4px" }}>
                  {order.paymentMethod === "COD" ? "Cash on delivery" : order.paymentMethod === "Wallet" ? "VORTIX Wallet" : "Online (Razorpay)"}
                </p>
                <p className="vx-sub">
                  Payment status:{" "}
                  {order.paymentStatus === "Refunded"
                    ? "Refunded"
                    : order.paymentStatus === "Completed"
                      ? "Paid"
                      : order.paymentStatus === "Failed"
                        ? "Failed"
                        : "Pending"}
                </p>
                {order.refundStatus && order.refundStatus !== "None" && (
                  <p className="vx-sub">
                    Refund:{" "}
                    {{
                      Initiated: "Initiated – it can take 5-7 working days to reach you",
                      Processed: "Completed",
                      Failed: "Being processed by our team",
                      Manual: "Will be handled by our team",
                    }[order.refundStatus]}
                  </p>
                )}
                {order.status === "Cancelled" && order.cancelReason && (
                  <p className="vx-sub">Cancellation reason: {order.cancelReason}</p>
                )}
              </div>

              {/* ACTION BUTTONS (OrderDetail.pdf) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "24px" }}>
                {unpaidOnline && (
                  <Link to={`/order/failed/${order._id}`} className="vx-btn-lime" style={{ width: "100%" }}>
                    Complete payment
                  </Link>
                )}

                {/* Download PDF Invoice (only once the order is confirmed) */}
                {!["Pending", "Cancelled"].includes(order.status) && (
                  <button
                    type="button"
                    className="vx-btn-outline"
                    onClick={handleDownloadInvoice}
                    style={{ width: "100%" }}
                  >
                    Download invoice (PDF)
                  </button>
                )}

                {isDelivered && !order.returnRequest?.isRequested && (
                  <Link
                    to={`/orders/${order._id}/return`}
                    className="vx-btn-outline"
                    style={{ width: "100%" }}
                  >
                    Request a return
                  </Link>
                )}

                {!isDelivered && !["Cancelled", "Returned", "Pending"].includes(order.status) && !order.returnRequest?.isRequested && (
                  <>
                    <button type="button" className="vx-btn-outline" style={{ width: "100%" }} disabled>
                      Request a return
                    </button>
                    <p className="vx-sub" style={{ fontSize: "12px", margin: "-4px 0 0" }}>
                      Returns open once your order is delivered (within 7 days of delivery).
                    </p>
                  </>
                )}

                {order.returnRequest?.isRequested && (
                  <div
                    style={{
                      padding: "10px",
                      background: "#fef3c7",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#92400e",
                    }}
                  >
                    Return request status: <strong>{order.returnRequest.status}</strong>
                    {order.returnRequest.refundAmount > 0 && (
                      <span style={{ display: "block", marginTop: "4px" }}>
                        Refund amount: {formatPrice(order.returnRequest.refundAmount)}
                      </span>
                    )}
                    {order.returnRequest.adminComment && (
                      <span style={{ display: "block", marginTop: "4px" }}>
                        Note from store: {order.returnRequest.adminComment}
                      </span>
                    )}
                  </div>
                )}

                {isCancelable && (
                  <button
                    type="button"
                    className="vx-btn-remove"
                    onClick={() => setShowCancelModal(true)}
                    style={{ width: "100%" }}
                  >
                    Cancel order
                  </button>
                )}

                <button
                  type="button"
                  className="vx-btn-outline"
                  style={{ width: "100%" }}
                  disabled={buying}
                  onClick={handleBuyAgain}
                >
                  {buying ? "Adding..." : "Buy again"}
                </button>

                <Link
                  to="/orders"
                  className="vx-btn-dark"
                  style={{ width: "100%", textAlign: "center" }}
                >
                  Back to my orders
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {/* Cancel Confirmation Modal */}
        {showCancelModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              display: "grid",
              placeItems: "center",
              zIndex: 999,
              padding: "16px",
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "14px",
                padding: "24px",
                maxWidth: "440px",
                width: "100%",
              }}
            >
              <h2 style={{ fontSize: "18px", margin: "0 0 8px" }}>Cancel order?</h2>
              <p className="vx-sub" style={{ marginBottom: "16px" }}>
                Are you sure you want to cancel Order #{order.orderId}? {order.isPaid && order.paymentMethod === "Razorpay" ? "Your payment will be refunded." : ""}
              </p>

              <div className="vx-field">
                <label>Reason (optional)</label>
                <input
                  type="text"
                  placeholder="Why are you cancelling?"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
                <button
                  type="button"
                  className="vx-btn-remove"
                  style={{ flex: 1 }}
                  disabled={cancelling}
                  onClick={handleCancelOrder}
                >
                  {cancelling ? "Cancelling..." : "Yes, cancel order"}
                </button>
                <button
                  type="button"
                  className="vx-btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => setShowCancelModal(false)}
                >
                  Keep order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// useShop() only works INSIDE <StoreLayout>, so the page content lives in its own component.
export default function UserOrderDetail() {
  return (
    <StoreLayout>
      <UserOrderDetailContent />
    </StoreLayout>
  );
}
