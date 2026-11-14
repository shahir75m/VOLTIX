import { useCallback, useEffect, useState } from "react";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminSidebar from "../../components/AdminSidebar";
import Pagination from "../../components/Pagination";
import StarRating from "../../components/StarRating";
import { apiFetch, apiJson } from "../../utils/api";
import "./AdminShop.css";
import "./AdminOrders.css";

const niceDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function AdminReviews() {
  const { checkingAuth, handleAuthError } = useAdminAuth();
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState("");
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      if (query) params.set("search", query);
      if (rating) params.set("rating", rating);
      if (status) params.set("status", status);
      const data = await apiFetch(`/api/admin/reviews?${params}`);
      setReviews(data.reviews);
      setPagination(data.pagination);
      setError("");
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message || "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }, [page, query, rating, status, handleAuthError]);

  useEffect(() => {
    if (!checkingAuth) load();
  }, [checkingAuth, load, reload]);

  const toggle = async (r) => {
    try {
      const res = await apiJson(`/api/admin/reviews/${r._id}/visibility`, "PUT", { isHidden: !r.isHidden });
      setNotice(res.message);
      setReload((n) => n + 1);
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    }
  };

  const remove = async () => {
    if (!deleting || deleteBusy) return;
    try {
      setDeleteBusy(true);
      await apiFetch(`/api/admin/reviews/${deleting._id}`, { method: "DELETE" });
      setNotice("Review deleted");
      setDeleting(null);
      setReload((n) => n + 1);
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const restore = async (r) => {
    try {
      const result = await apiJson(`/api/admin/reviews/${r._id}/restore`, "PATCH", {});
      setNotice(result.message);
      setReload((n) => n + 1);
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    }
  };

  if (checkingAuth) return null;

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Reviews" />
      <main className="vx-main">
        <header className="vx-head">
          <div>
            <h1>Reviews</h1>
            <p>Customer ratings and reviews. Hide or delete anything inappropriate.</p>
          </div>
        </header>

        {notice && <div className="vx-alert success" role="status">{notice}</div>}
        {error && <div className="vx-alert error" role="alert">{error}</div>}
        {deleting && <section className="vx-card" role="alert">
          <h2>Delete this review?</h2>
          <p>The review will be hidden from the store and normal admin list. You can restore it later from the Deleted filter.</p>
          <div className="vx-modal-actions">
            <button type="button" className="vx-btn" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button>
            <button type="button" className="vx-btn danger" onClick={remove} disabled={deleteBusy}>{deleteBusy ? "Deleting..." : "Delete review"}</button>
          </div>
        </section>}

        <section className="vx-card">
          <div className="ao-filters" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
            <div className="vx-field">
              <label htmlFor="rv-s">Search</label>
              <input id="rv-s" type="search" placeholder="Product, customer or review text" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="vx-field">
              <label htmlFor="rv-r">Rating</label>
              <select id="rv-r" value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }}>
                <option value="">All ratings</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <div className="vx-field">
              <label htmlFor="rv-st">Status</label>
              <select id="rv-st" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">All</option>
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
                <option value="deleted">Deleted</option>
              </select>
            </div>
          </div>
        </section>

        <section className="vx-card flush">
          {loading ? (
            <div className="vx-empty"><strong>Loading reviews...</strong></div>
          ) : reviews.length === 0 ? (
            <div className="vx-empty"><strong>No reviews found</strong></div>
          ) : (
            <div className="vx-scroll">
              <table className="vx-table">
                <thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr key={r._id}>
                      <td className="ao-id">{r.product?.name || "Deleted product"}</td>
                      <td>{r.user?.name}<span className="ao-sub">{r.user?.email}</span></td>
                      <td><StarRating value={r.rating} small /></td>
                      <td style={{ maxWidth: 320 }}>
                        {r.title && <strong>{r.title}</strong>}
                        <span className="ao-sub" style={{ whiteSpace: "normal" }}>{r.comment || "(no text)"}</span>
                      </td>
                      <td>{niceDate(r.createdAt)}</td>
                      <td><span className={`ao-pill ${r.isDeleted || r.isHidden ? "grey" : "green"}`}>{r.isDeleted ? "Deleted" : r.isHidden ? "Hidden" : "Visible"}</span></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {r.isDeleted ? <button type="button" className="vx-link" onClick={() => restore(r)}>Restore</button> : <>
                          <button type="button" className="vx-link" onClick={() => toggle(r)}>{r.isHidden ? "Show" : "Hide"}</button>
                          <button type="button" className="vx-link red" onClick={() => setDeleting(r)}>Delete</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="vx-pager">
            <span>{pagination.total} review{pagination.total === 1 ? "" : "s"}</span>
            <Pagination pagination={{ currentPage: pagination.page, totalPages: pagination.totalPages }} onChange={setPage} />
          </div>
        </section>
      </main>
    </div>
  );
}
