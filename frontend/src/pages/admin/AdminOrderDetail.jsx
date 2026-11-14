import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminSidebar from "../../components/AdminSidebar";
import { apiFetch, apiJson } from "../../utils/api";
import { downloadFile } from "../../utils/download";
import { formatPrice } from "../../utils/format";
import { statusPill, paymentLabel, returnedItems } from "../../utils/orderUi";
import "./AdminShop.css";
import "./AdminOrders.css";
import Icon from "../../components/Icon";

// Must match ALLOWED_TRANSITIONS in the backend (the server checks it again)
const NEXT = {
  Pending: ["Cancelled"],
  Confirmed: ["Shipped", "Cancelled"],
  Shipped: ["Out for Delivery", "Cancelled"],
  "Out for Delivery": ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: [],
  Returned: [],
};

const LEVEL = { Pending: 1, Confirmed: 2, Shipped: 3, "Out for Delivery": 3, Delivered: 4, Returned: 4, Cancelled: 0 };
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const fmtTime = (d) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AdminOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { checkingAuth, handleAuthError } = useAdminAuth();

  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState("");
  const [notify, setNotify] = useState("no");
  const [note, setNote] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [track, setTrack] = useState({ courier: "", trackingNumber: "", trackingUrl: "" });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/admin/orders/${id}`);
      setOrder(data.order);
      setStatus(data.order.status);
      setTrack({ courier: "", trackingNumber: "", trackingUrl: "", ...(data.order.tracking || {}) });
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message || "Failed to load order");
    }
  }, [id, handleAuthError]);

  useEffect(() => {
    if (!checkingAuth) load();
  }, [checkingAuth, load]);

  const saveStatus = async (target) => {
    if (busy) return;
    setError("");
    setNotice("");
    try {
      setBusy(true);
      const res = await apiJson(`/api/admin/orders/${id}/status`, "PUT", { status: target, comment: note, notify: notify === "email", ...track });
      setOrder(res.order);
      setStatus(res.order.status);
      setNote("");
      setNotice(res.message + (res.emailed ? " Customer notified by email." : ""));
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = () => setPendingConfirmation({ type: "cancel" });

  // a refund Razorpay rejected stays "Failed" until someone retries it
  const retryRefund = async () => {
    if (busy) return;
    setError("");
    setNotice("");
    try {
      setBusy(true);
      const res = await apiJson(`/api/admin/orders/${id}/retry-refund`, "POST");
      setOrder(res.order);
      setNotice(res.message);
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
      load();
    } finally {
      setBusy(false);
    }
  };

  const submitReturnReview = async (action) => {
    if (busy) return;
    setError("");
    setNotice("");
    try {
      setBusy(true);
      const res = await apiJson(`/api/admin/orders/${id}/return-review`, "PUT", { action, adminComment: returnNote });
      setOrder(res.order);
      setStatus(res.order.status);
      setReturnNote("");
      setNotice(res.message);
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reviewReturn = (action) => {
    if (action === "Rejected" && !returnNote.trim()) {
      setError("Please write a comment explaining why the return is rejected.");
      return;
    }
    if (action === "Approved") {
      setPendingConfirmation({ type: "approve-return" });
      return;
    }
    submitReturnReview(action);
  };

  const printInvoice = async () => {
    try {
      await downloadFile(`/api/admin/orders/${id}/invoice`, `Invoice-${order.orderId}.pdf`);
    } catch (err) {
      setError(err.message);
    }
  };

  if (checkingAuth) return null;

  if (!order) {
    return (
      <div className="voltix-admin-layout">
        <AdminSidebar active="Orders" />
        <main className="vx-main">
          {error ? <div className="vx-alert error">{error}</div> : <div className="vx-empty"><strong>Loading order...</strong></div>}
          <Link className="vx-link" to="/admin/orders"><Icon name="arrow-left" size={15} /> Back to orders</Link>
        </main>
      </div>
    );
  }

  const pill = statusPill(order);
  const pay = paymentLabel(order);
  const level = LEVEL[order.status] ?? 1;
  const options = [order.status, ...(NEXT[order.status] || [])];
  const r = order.returnRequest;

  // one list for status changes + payment events, newest first (for troubleshooting)
  const activity = [
    ...(order.statusHistory || []).map((h) => ({ at: h.at, text: `Status: ${h.status}`, by: h.by, note: h.note })),
    ...(order.paymentLogs || []).map((p) => ({ at: p.at, text: `Payment: ${p.event.replace(/_/g, " ")}`, by: "payment", note: [p.razorpayPaymentId, p.note].filter(Boolean).join(" · ") })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const steps = [
    { title: "Order placed", sub: fmtDate(order.createdAt), done: level >= 1 },
    { title: "Packing your items", sub: level === 2 ? "In progress" : level > 2 ? "Done" : "Waiting", done: level >= 2 },
    { title: "Shipped", sub: order.status === "Out for Delivery" ? "Out for delivery" : level >= 3 ? "On its way" : "Tracking will appear here", done: level >= 3 },
    { title: "Delivered", sub: order.deliveredAt ? fmtDate(order.deliveredAt) : "Expected date appears here", done: level >= 4 },
  ];

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Orders" />

      <main className="vx-main">
        <header className="vx-head">
          <div>
            <h1>Order #{order.orderId}</h1>
            <p>
              Placed on {fmtDate(order.createdAt)} · {order.paymentMethod === "COD" ? "Cash on delivery" : order.paymentMethod === "Wallet" ? "VORTIX Wallet" : "Online payment (Razorpay)"} ·{" "}
              <span className={`ao-pill ${pill.cls}`}>{pill.label}</span>
            </p>
          </div>
          <div className="vx-head-actions">
            <button type="button" className="vx-btn" onClick={() => navigate("/admin/orders")}><Icon name="arrow-left" size={15} /> Back to orders</button>
            {!["Pending", "Cancelled"].includes(order.status) && (
              <button type="button" className="vx-btn" onClick={printInvoice}>Print invoice</button>
            )}
          </div>
        </header>

        {notice && <div className="vx-alert success" role="status">{notice}</div>}
        {error && <div className="vx-alert error" role="alert">{error}</div>}
        {pendingConfirmation && <section className="vx-card" role="alert">
          <h2>{pendingConfirmation.type === "cancel" ? `Cancel order #${order.orderId}?` : "Approve this return?"}</h2>
          <p>{pendingConfirmation.type === "cancel"
            ? `Stock will be restored${order.isPaid && order.paymentMethod === "Razorpay" ? " and the payment refunded" : ""}.`
            : "Stock will be restored and the refund process will start."}</p>
          <div className="vx-modal-actions">
            <button type="button" className="vx-btn" onClick={() => setPendingConfirmation(null)} disabled={busy}>Cancel</button>
            <button type="button" className="vx-btn danger" disabled={busy} onClick={() => {
              const action = pendingConfirmation.type === "cancel" ? saveStatus("Cancelled") : submitReturnReview("Approved");
              setPendingConfirmation(null);
              return action;
            }}>{busy ? "Saving..." : "Confirm"}</button>
          </div>
        </section>}

        <div className="ao-detail">
          <div className="ao-col">
            <section className="vx-card flush">
              <h2 style={{ padding: "20px 18px 0" }}>Items ({order.orderItems.length})</h2>
              <div className="vx-scroll">
                <table className="vx-table ao-items">
                  <thead>
                    <tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {order.orderItems.map((item) => (
                      <tr key={item._id}>
                        <td>
                          <div className="ao-prod">
                            {item.image ? <img className="vx-thumb" src={item.image} alt="" /> : <span className="vx-thumb vx-thumb-empty">IMG</span>}
                            <div>
                              <strong style={{ color: "#111827" }}>{item.name}</strong>
                              {item.variantLabel && <span className="ao-sub">{item.variantLabel}</span>}
                            </div>
                          </div>
                        </td>
                        <td>{item.qty}</td>
                        <td>{formatPrice(item.price)}</td>
                        <td>{formatPrice(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ao-sum">
                <div><span>Subtotal</span><span>{formatPrice(order.itemsPrice)}</span></div>
                <div><span>Delivery</span><span>{order.shippingPrice ? formatPrice(order.shippingPrice) : "Free"}</span></div>
                {order.discountPrice > 0 && <div><span>Discount ({order.couponCode})</span><span>-{formatPrice(order.discountPrice)}</span></div>}
                {order.taxPrice > 0 && <div><span>GST (included)</span><span>{formatPrice(order.taxPrice)}</span></div>}
                <div className="total"><span>Total</span><span>{formatPrice(order.totalPrice)}</span></div>
              </div>
            </section>

            {r?.isRequested && (
              <section className="vx-card">
                <h2>Return request · {r.status === "Pending" ? "Requested" : r.status}</h2>
                <p className="ao-text">
                  <strong>Items to return:</strong> {returnedItems(order).map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} × ${i.qty}`).join(", ")}
                </p>
                <p className="ao-text"><strong>Refund amount:</strong> {formatPrice(r.refundAmount || order.totalPrice)}</p>
                <p className="ao-text"><strong>Reason:</strong> {r.reason}</p>
                {r.details && <p className="ao-text"><strong>Details:</strong> {r.details}</p>}
                <p className="ao-text"><strong>Refund to:</strong> {r.refundMethod}</p>
                {r.photos?.length > 0 && (
                  <div style={{ display: "flex", gap: 8, margin: "8px 0", flexWrap: "wrap" }}>
                    {r.photos.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="Return photo" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                      </a>
                    ))}
                  </div>
                )}
                {r.adminComment && <p className="ao-text"><strong>Admin note:</strong> {r.adminComment}</p>}
                {r.status === "Pending" && (
                  <>
                    <div className="vx-field" style={{ marginTop: 14 }}>
                      <label htmlFor="rnote">Note to customer (required when rejecting)</label>
                      <input id="rnote" type="text" maxLength={300} value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
                    </div>
                    <div className="ao-actions">
                      <button type="button" className="vx-btn primary" disabled={busy} onClick={() => reviewReturn("Approved")}>Approve return</button>
                      <button type="button" className="vx-btn outline-red" disabled={busy} onClick={() => reviewReturn("Rejected")}>Reject return</button>
                    </div>
                  </>
                )}
              </section>
            )}

            <section className="vx-card">
              <h2>Update order status</h2>
              {options.length === 1 ? (
                <p className="ao-text">No further status changes are possible for this order{order.status === "Pending" ? " until the payment is completed" : ""}.</p>
              ) : null}
              <div className="ao-status-form">
                <div className="vx-field">
                  <label htmlFor="st">Status</label>
                  <select id="st" value={status} onChange={(e) => setStatus(e.target.value)} disabled={options.length === 1}>
                    {options.map((s) => <option key={s} value={s}>{s === "Confirmed" ? "Processing" : s}</option>)}
                  </select>
                </div>
                <div className="vx-field">
                  <label htmlFor="nt">Notify customer</label>
                  <select id="nt" value={notify} onChange={(e) => setNotify(e.target.value)}>
                    <option value="no">Do not send email</option>
                    <option value="email">Send email update</option>
                  </select>
                </div>
              </div>
              {["Shipped", "Out for Delivery"].includes(status) && (
                <div className="ao-status-form">
                  <div className="vx-field">
                    <label htmlFor="tk-courier">Courier</label>
                    <input id="tk-courier" type="text" maxLength={60} placeholder="e.g. Delhivery" value={track.courier} onChange={(e) => setTrack({ ...track, courier: e.target.value })} />
                  </div>
                  <div className="vx-field">
                    <label htmlFor="tk-number">Tracking ID</label>
                    <input id="tk-number" type="text" maxLength={60} value={track.trackingNumber} onChange={(e) => setTrack({ ...track, trackingNumber: e.target.value })} />
                  </div>
                  <div className="vx-field">
                    <label htmlFor="tk-url">Tracking link (optional)</label>
                    <input id="tk-url" type="url" maxLength={300} placeholder="https://" value={track.trackingUrl} onChange={(e) => setTrack({ ...track, trackingUrl: e.target.value })} />
                  </div>
                </div>
              )}
              <div className="vx-field">
                <label htmlFor="note">Note (optional)</label>
                <textarea id="note" maxLength={300} placeholder="Add a note for the customer..." value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="ao-actions">
                <button type="button" className="vx-btn primary" disabled={busy || status === order.status} onClick={() => saveStatus(status)}>
                  {busy ? "Saving..." : "Save status"}
                </button>
                {NEXT[order.status]?.includes("Cancelled") && (
                  <button type="button" className="vx-btn outline-red" disabled={busy} onClick={cancelOrder}>Cancel order</button>
                )}
              </div>
            </section>
          </div>

          <div className="ao-col">
            <section className="vx-card">
              <h2>Customer</h2>
              <p className="ao-text"><strong>{order.user?.name || order.shippingAddress?.fullName}</strong></p>
              <p className="ao-text">{order.user?.email}</p>
              <p className="ao-text">{order.user?.phone}</p>
            </section>

            <section className="vx-card">
              <h2>Shipping address</h2>
              <p className="ao-text">
                <strong>{order.shippingAddress?.fullName}</strong><br />
                {order.shippingAddress?.addressLine1}{order.shippingAddress?.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ""}<br />
                {order.shippingAddress?.city}{order.shippingAddress?.district ? `, ${order.shippingAddress.district}` : ""}<br />
                {order.shippingAddress?.state} – {order.shippingAddress?.pincode}<br />
                Phone: {order.shippingAddress?.phone}
              </p>
            </section>

            <section className="vx-card">
              <h2>Payment</h2>
              <div className="ao-kv"><span>Method</span><strong>{order.paymentMethod === "COD" ? "Cash on delivery" : order.paymentMethod === "Wallet" ? "VORTIX Wallet" : "Razorpay"}</strong></div>
              <div className="ao-kv"><span>Status</span><span className={`ao-pill ${pay.state === "Paid" ? "green" : pay.state === "Failed" ? "red" : "yellow"}`}>{pay.state}</span></div>
              {order.razorpayPaymentId && <div className="ao-kv"><span>Payment ID</span><strong>{order.razorpayPaymentId}</strong></div>}
              {order.paymentMethod === "Razorpay" && <div className="ao-kv"><span>Attempts</span><strong>{order.paymentAttempts}</strong></div>}
              {order.refundStatus !== "None" && <div className="ao-kv"><span>Refund</span><strong>{order.refundStatus}{order.refundId ? ` (${order.refundId})` : ""}</strong></div>}
              {order.refundStatus === "Failed" && (
                <>
                  <p className="vx-err">Automatic refund failed. Retry it here, or refund it from the Razorpay dashboard.</p>
                  <button type="button" className="vx-btn primary" disabled={busy} onClick={retryRefund}>{busy ? "Retrying..." : "Retry refund"}</button>
                </>
              )}
              {order.refundStatus === "Manual" && <p className="vx-hint">Cash order: refund the customer manually.</p>}
            </section>

            <section className="vx-card">
              <h2>Timeline</h2>
              {order.status === "Cancelled" ? (
                <p className="ao-text">Cancelled on {order.cancelledAt ? fmtDate(order.cancelledAt) : ""}{order.cancelReason ? ` — ${order.cancelReason}` : ""}</p>
              ) : (
                <ul className="ao-timeline">
                  {steps.map((s) => (
                    <li key={s.title} className={s.done ? "done" : ""}>
                      <strong>{s.title}</strong>
                      <small>{s.sub}</small>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="vx-card">
              <h2>Order &amp; payment history</h2>
              <ul className="ao-log">
                {activity.length === 0 && <li>No history yet.</li>}
                {activity.map((a, i) => (
                  <li key={i}>
                    <b>{a.text}</b> <span style={{ color: "#94a3b8" }}>({a.by})</span>
                    <span className="ao-sub">{fmtTime(a.at)}{a.note ? ` · ${a.note}` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
