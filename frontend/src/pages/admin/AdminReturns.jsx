import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminSidebar from "../../components/AdminSidebar";
import Pagination from "../../components/Pagination";
import { apiFetch, apiJson } from "../../utils/api";
import { downloadFile } from "../../utils/download";
import { formatPrice } from "../../utils/format";
import { returnedItems } from "../../utils/orderUi";
import "./AdminShop.css";
import "./AdminOrders.css";

const TABS = ["Requested", "Approved", "Rejected", "Refunded"];
const PILL = { Requested: "yellow", Approved: "blue", Rejected: "red", Refunded: "green" };

export default function AdminReturns() {
  const { checkingAuth, handleAuthError } = useAdminAuth();

  const [tab, setTab] = useState("Requested");
  const [page, setPage] = useState(1);
  const [returns, setReturns] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);

  // approve / reject dialog
  const [review, setReview] = useState(null); // { order, action }
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  // Escape closes the dialog (keyboard users otherwise have to tab to the cancel button)
  useEffect(() => {
    if (!review) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) setReview(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [review, busy]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/admin/returns?tab=${tab}&page=${page}&limit=10`);
      setReturns(data.returns);
      setCounts(data.counts);
      setPagination(data.pagination);
      setError("");
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message || "Failed to load returns");
    } finally {
      setLoading(false);
    }
  }, [tab, page, handleAuthError]);

  useEffect(() => {
    if (!checkingAuth) load();
  }, [checkingAuth, load, reload]);

  const submitReview = async () => {
    if (busy) return;
    if (review.action === "Rejected" && !comment.trim()) {
      setError("Please write a comment explaining why the return is rejected.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const res = await apiJson(`/api/admin/orders/${review.order._id}/return-review`, "PUT", { action: review.action, adminComment: comment });
      setNotice(res.message);
      setReview(null);
      setComment("");
      setReload((n) => n + 1);
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      await downloadFile("/api/admin/returns/export", "returns.csv");
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  if (checkingAuth) return null;

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Returns" />

      <main className="vx-main">
        <header className="vx-head">
          <div>
            <h1>Returns</h1>
            <p>Review return requests and issue refunds</p>
          </div>
          <div className="vx-head-actions">
            <button type="button" className="vx-btn" onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
        </header>

        {notice && <div className="vx-alert success" role="status">{notice}</div>}
        {error && <div className="vx-alert error" role="alert">{error}</div>}

        <div className="ao-chips">
          {TABS.map((t) => (
            <button key={t} type="button" className={`ao-chip ${tab === t ? "active" : ""}`} onClick={() => { setTab(t); setPage(1); setNotice(""); }}>
              {t} {counts[t] ?? 0}
            </button>
          ))}
        </div>

        <section className="vx-card flush">
          {loading ? (
            <div className="vx-empty"><strong>Loading returns...</strong></div>
          ) : returns.length === 0 ? (
            <div className="vx-empty"><strong>No {tab.toLowerCase()} returns</strong></div>
          ) : (
            <div className="vx-scroll">
              <table className="vx-table">
                <thead>
                  <tr><th>Return</th><th>Order</th><th>Customer</th><th>Product</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {returns.map((o) => {
                    const items = returnedItems(o);
                    const first = items[0];
                    const more = items.length - 1;
                    const photos = o.returnRequest.photos?.length || 0;
                    return (
                      <tr key={o._id}>
                        <td className="ao-id">{o.returnId}</td>
                        <td><Link className="vx-link" to={`/admin/orders/${o._id}`}>#{o.orderId}</Link></td>
                        <td>{o.shippingAddress?.fullName || o.user?.name}</td>
                        <td>
                          {first?.name}{more > 0 ? ` +${more} more` : ""}
                          <span className="ao-sub">Qty {items.reduce((n, i) => n + i.qty, 0)} · {formatPrice(o.returnRequest.refundAmount || o.totalPrice)}</span>
                        </td>
                        <td>
                          {o.returnRequest.reason}
                          {photos > 0 && <span className="ao-sub">{photos} photo{photos === 1 ? "" : "s"} attached</span>}
                        </td>
                        <td><span className={`ao-pill ${PILL[o.tab]}`}>{o.tab}</span></td>
                        <td>
                          {o.tab === "Requested" ? (
                            <>
                              <button type="button" className="vx-link" style={{ color: "#166534" }} onClick={() => { setReview({ order: o, action: "Approved" }); setComment(""); setError(""); }}>Approve</button>
                              <button type="button" className="vx-link red" onClick={() => { setReview({ order: o, action: "Rejected" }); setComment(""); setError(""); }}>Reject</button>
                            </>
                          ) : (
                            <Link className="vx-link" to={`/admin/orders/${o._id}`}>View</Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="vx-pager">
            <span>Showing {from}–{to} of {pagination.total} requests</span>
            <Pagination pagination={{ currentPage: pagination.page, totalPages: pagination.totalPages }} onChange={setPage} />
          </div>
        </section>

        {review && (
          <div className="vx-modal-bg" onClick={() => !busy && setReview(null)}>
            <div className="vx-modal" role="dialog" aria-modal="true" aria-label="Review return request" onClick={(e) => e.stopPropagation()}>
              <h3>{review.action === "Approved" ? "Approve return?" : "Reject return?"}</h3>
              <p>
                Order #{review.order.orderId} · {review.order.returnRequest.reason}.{" "}
                {review.action === "Approved" ? "Stock will be restored and the refund will start." : "The customer will see your comment."}
              </p>
              <div className="vx-field">
                <label htmlFor="rc">Comment {review.action === "Rejected" ? "(required)" : "(optional)"}</label>
                <textarea id="rc" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              {error && <div className="vx-alert error">{error}</div>}
              <div className="vx-modal-actions">
                <button type="button" className="vx-btn" disabled={busy} onClick={() => setReview(null)}>Cancel</button>
                <button type="button" className={`vx-btn ${review.action === "Approved" ? "primary" : "danger"}`} disabled={busy} onClick={submitReview}>
                  {busy ? "Saving..." : review.action === "Approved" ? "Approve & refund" : "Reject return"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
