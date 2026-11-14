import { useEffect, useState } from "react";
import usePageTitle from "../../hooks/usePageTitle";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useShop } from "../../context/ShopContext";
import { apiFetch, apiJson } from "../../utils/api";
import { formatPrice } from "../../utils/format";

function UserOrdersContent() {
  usePageTitle("My orders");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, authChecked, setCartCount, showToast } = useShop();
  const [buyingId, setBuyingId] = useState("");

  const handleBuyAgain = async (orderId) => {
    if (buyingId) return;
    try {
      setBuyingId(orderId);
      const res = await apiJson(`/api/orders/${orderId}/buy-again`, "POST", {});
      setCartCount(res.cartCount);
      showToast(res.message, res.skipped?.length ? "error" : "success");
      navigate("/checkout");
    } catch (err) {
      showToast(err.message || "Could not add items to cart", "error");
    } finally {
      setBuyingId("");
    }
  };

  const currentTab = params.get("status") || "All";
  const [search, setSearch] = useState(params.get("search") || "");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const tabs = ["All", "Processing", "Shipped", "Delivered", "Cancelled"];

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      navigate("/login", { replace: true, state: { message: "Please log in to view orders" } });
      return;
    }

    const loadOrders = async () => {
      try {
        setLoading(true);
        setError("");
        const query = new URLSearchParams();
        if (currentTab !== "All") {
          // the server maps "Processing" to Pending + Confirmed
          query.set("status", currentTab);
        }
        if (search.trim()) {
          query.set("search", search.trim());
        }

        const data = await apiFetch(`/api/orders/myorders?${query}`);
        if (data.success) {
          setOrders(data.orders || []);
        }
      } catch (err) {
        setError(err.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [user, authChecked, currentTab, search, navigate]);

  const handleTabClick = (tab) => {
    const next = new URLSearchParams(params);
    if (tab === "All") next.delete("status");
    else next.set("status", tab);
    setParams(next);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (search.trim()) next.set("search", search.trim());
    else next.delete("search");
    setParams(next);
  };

  return (
    <>

          {/* MAIN: ORDERS LIST */}
          <main>
            {/* Filter Tabs */}
            <div className="vx-filter-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`vx-tab-btn ${currentTab === tab ? "active" : ""}`}
                  onClick={() => handleTabClick(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search Orders */}
            <form onSubmit={handleSearchSubmit} style={{ marginBottom: "20px", display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="Search orders by ID or gadget name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  height: "40px",
                  padding: "0 14px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontSize: "13px",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "0 18px",
                  borderRadius: "8px",
                  background: "#11151b",
                  color: "#fff",
                  border: "none",
                  fontWeight: "600",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Search
              </button>
            </form>

            {loading && (
              <div className="vx-state">
                <strong>Loading orders...</strong>
              </div>
            )}

            {error && (
              <div className="vx-state">
                <p>{error}</p>
              </div>
            )}

            {!loading && !error && orders.length === 0 && (
              <div className="vx-state">
                <strong>No orders found</strong>
                <p>You haven't placed any orders in this category yet.</p>
                <Link to="/products" className="vx-btn-dark">
                  Shop gadgets
                </Link>
              </div>
            )}

            {!loading &&
              !error &&
              orders.map((order) => {
                const isDelivered = order.status === "Delivered";
                const itemsCount = order.orderItems?.reduce((sum, i) => sum + i.qty, 0) || 0;
                const itemsNames = order.orderItems?.map((i) => i.name).join(", ");
                const firstThumb = order.orderItems?.[0]?.image;

                const unpaidOnline =
                  order.paymentMethod === "Razorpay" && order.status === "Pending" && !order.isPaid;
                const displayStatus = unpaidOnline
                  ? "Payment pending"
                  : order.status === "Confirmed"
                    ? "Processing"
                    : order.status;

                return (
                  <article key={order._id} className="vx-order-card">
                    <div className="vx-order-head">
                      <div>
                        <strong style={{ fontSize: "16px", color: "#11151b" }}>
                          Order #{order.orderId}
                        </strong>
                        <p className="vx-sub" style={{ marginTop: "3px" }}>
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

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                        marginBottom: "16px",
                      }}
                    >
                      <div
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "8px",
                          background: "#f3f4f6",
                          overflow: "hidden",
                          flexShrink: 0,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        {firstThumb ? (
                          <img
                            src={firstThumb}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "contain" }}
                          />
                        ) : (
                          <span style={{ fontSize: "10px", color: "#9ca3af" }}>Gadget</span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontWeight: "600",
                            fontSize: "14px",
                            margin: "0 0 4px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {itemsNames}
                        </p>
                        <span className="vx-sub">
                          {itemsCount} {itemsCount === 1 ? "item" : "items"}
                        </span>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <span className="vx-sub">Total</span>
                        <strong style={{ display: "block", fontSize: "16px" }}>
                          {formatPrice(order.totalPrice)}
                        </strong>
                      </div>
                    </div>

                    {/* Action buttons matching Orders.pdf */}
                    <div style={{ display: "flex", gap: "10px" }}>
                      <Link to={`/orders/${order._id}`} className="vx-btn-dark" style={{ minHeight: "38px" }}>
                        View details
                      </Link>
                      <button
                        type="button"
                        className="vx-btn-outline"
                        style={{ minHeight: "38px" }}
                        disabled={buyingId === order._id}
                        onClick={() => handleBuyAgain(order._id)}
                      >
                        {buyingId === order._id ? "Adding..." : "Buy again"}
                      </button>
                      {unpaidOnline && (
                        <Link
                          to={`/order/failed/${order._id}`}
                          className="vx-btn-lime"
                          style={{ minHeight: "38px", width: "auto", padding: "0 16px" }}
                        >
                          Pay now
                        </Link>
                      )}
                      {isDelivered && !order.returnRequest?.isRequested && (
                        <Link
                          to={`/orders/${order._id}/return`}
                          className="vx-btn-outline"
                          style={{ minHeight: "38px" }}
                        >
                          Return
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
          </main>
    </>
  );
}

// useShop() only works INSIDE <StoreLayout>, so the page content lives in its own component.
export default function UserOrders() {
  return <UserOrdersContent />;
}
