import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminSidebar from "../../components/AdminSidebar";
import Pagination from "../../components/Pagination";
import { apiFetch } from "../../utils/api";
import { downloadFile } from "../../utils/download";
import { formatPrice } from "../../utils/format";
import { statusPill, paymentLabel } from "../../utils/orderUi";
import "./AdminShop.css";
import "./AdminOrders.css";

const TABS = ["All", "Processing", "Shipped", "Delivered", "Cancelled"];

export default function AdminOrders() {
  const { checkingAuth, handleAuthError } = useAdminAuth();
  const [params, setParams] = useSearchParams();

  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalOrders: 0, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const group = params.get("group") || "All";
  const days = params.get("days") || "";
  const payment = params.get("payment") || "";
  const sort = params.get("sort") || "newest";
  const page = Number(params.get("page")) || 1;
  const urlSearch = params.get("search") || "";
  const [search, setSearch] = useState(urlSearch);

  const setParam = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      if (!("page" in changes)) next.set("page", "1");
      setParams(next);
    },
    [params, setParams]
  );

  // search box: wait until the admin stops typing
  useEffect(() => {
    if (search.trim() === urlSearch) return undefined;
    const timer = setTimeout(() => setParam({ search: search.trim() }), 400);
    return () => clearTimeout(timer);
  }, [search, urlSearch, setParam]);

  const buildQuery = useCallback(() => {
    const query = new URLSearchParams();
    if (group !== "All") query.set("group", group);
    if (days) query.set("days", days);
    if (payment) query.set("paymentMethod", payment);
    if (urlSearch) query.set("search", urlSearch);
    return query;
  }, [group, days, payment, urlSearch]);

  useEffect(() => {
    if (checkingAuth) return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const query = buildQuery();
        query.set("sort", sort);
        query.set("page", String(page));
        query.set("limit", "10");
        const data = await apiFetch(`/api/admin/orders?${query}`);
        if (!active) return;
        setOrders(data.orders || []);
        setCounts(data.counts || {});
        setPagination(data.pagination);
      } catch (err) {
        if (active && !handleAuthError(err)) setError(err.message || "Failed to load orders");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [checkingAuth, buildQuery, sort, page, handleAuthError]);

  const handleExport = async () => {
    try {
      setExporting(true);
      await downloadFile(`/api/admin/orders/export?${buildQuery()}`, "orders.csv");
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  if (checkingAuth) return null;

  const from = pagination.totalOrders === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.page * pagination.limit, pagination.totalOrders);

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Orders" />

      <main className="vx-main">
        <header className="vx-head">
          <div>
            <h1>Orders</h1>
            <p>Track and update customer orders — {counts.All ?? 0} total</p>
          </div>
          <div className="vx-head-actions">
            <button type="button" className="vx-btn" onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
        </header>

        {error && <div className="vx-alert error" role="alert">{error}</div>}

        <div className="ao-chips">
          {TABS.map((tab) => (
            <button key={tab} type="button" className={`ao-chip ${group === tab ? "active" : ""}`} onClick={() => setParam({ group: tab === "All" ? "" : tab })}>
              {tab} {counts[tab] ?? 0}
            </button>
          ))}
        </div>

        <section className="vx-card">
          <div className="ao-filters">
            <div className="vx-field">
              <label htmlFor="o-search">Search</label>
              <input id="o-search" type="search" placeholder="Order number or customer name" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="vx-field">
              <label htmlFor="o-days">Date range</label>
              <select id="o-days" value={days} onChange={(e) => setParam({ days: e.target.value })}>
                <option value="">All time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
            <div className="vx-field">
              <label htmlFor="o-pay">Payment</label>
              <select id="o-pay" value={payment} onChange={(e) => setParam({ payment: e.target.value })}>
                <option value="">All payments</option>
                <option value="COD">Cash on delivery</option>
                <option value="Razorpay">Online (Razorpay)</option>
                <option value="Wallet">VORTIX Wallet</option>
              </select>
            </div>
            <div className="vx-field">
              <label htmlFor="o-sort">Sort by</label>
              <select id="o-sort" value={sort} onChange={(e) => setParam({ sort: e.target.value === "newest" ? "" : e.target.value })}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="total_desc">Total: high to low</option>
                <option value="total_asc">Total: low to high</option>
              </select>
            </div>
          </div>
        </section>

        <section className="vx-card flush">
          {loading ? (
            <div className="vx-empty"><strong>Loading orders...</strong></div>
          ) : orders.length === 0 ? (
            <div className="vx-empty"><strong>No orders found</strong>Try changing the filters.</div>
          ) : (
            <div className="vx-scroll">
              <table className="vx-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const pill = statusPill(o);
                    const pay = paymentLabel(o);
                    return (
                      <tr key={o._id}>
                        <td className="ao-id">#{o.orderId}</td>
                        <td>
                          {o.shippingAddress?.fullName || o.user?.name}
                          {o.user?.email && <span className="ao-sub">{o.user.email}</span>}
                        </td>
                        <td>{new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td>{o.orderItems.reduce((n, i) => n + i.qty, 0)}</td>
                        <td>{formatPrice(o.totalPrice)}</td>
                        <td>
                          {pay.method}
                          <span className="ao-sub">{pay.state}</span>
                        </td>
                        <td><span className={`ao-pill ${pill.cls}`}>{pill.label}</span></td>
                        <td><Link className="vx-link" to={`/admin/orders/${o._id}`}>View</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="vx-pager">
            <span>Showing {from}–{to} of {pagination.totalOrders} orders</span>
            <Pagination pagination={{ currentPage: pagination.page, totalPages: pagination.totalPages }} onChange={(p) => setParam({ page: String(p) })} />
          </div>
        </section>
      </main>
    </div>
  );
}
