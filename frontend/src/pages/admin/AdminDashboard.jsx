import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminPagePending from "../../components/AdminPagePending";
import AdminSidebar from "../../components/AdminSidebar";
import { apiFetch } from "../../utils/api";
import { formatPrice } from "../../utils/format";
import "./AdminDashboard.css";

const EMPTY_DASHBOARD = { stats: {}, sales: [], orders: [], lowStock: [], pendingReturn: null };
const PROCESSING = new Set(["Pending", "Confirmed"]);

function AdminDashboard() {
  const navigate = useNavigate();
  const { checkingAuth, handleAuthError } = useAdminAuth();
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (checkingAuth) return;
    let active = true;
    apiFetch("/api/admin/dashboard")
      .then((data) => active && setDashboard(data))
      .catch((requestError) => {
        if (!handleAuthError(requestError) && active) setError(requestError.message);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [checkingAuth, handleAuthError]);

  if (checkingAuth) return <AdminPagePending active="Dashboard" />;

  const { stats, sales, orders, lowStock, pendingReturn } = dashboard;
  const maximumSale = Math.max(...sales.map((sale) => sale.amount), 1);
  const statCards = [
    { title: "Revenue (30 days)", value: formatPrice(stats.revenue30Days), description: `${stats.revenueOrderCount || 0} paid order${stats.revenueOrderCount === 1 ? "" : "s"}` },
    { title: "Orders (last 7 days)", value: stats.orders7Days || 0, description: "New orders placed", color: "green" },
    { title: "Processing orders", value: stats.processingOrders || 0, description: "Need packing or confirmation", color: "red" },
    { title: "Low stock items", value: stats.lowStockItems || 0, description: "At or below 10 units", color: "red" },
  ];

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Dashboard" />
      <main className="voltix-admin-main">
        <header className="voltix-dashboard-header">
          <div><h1>Dashboard</h1><p>Live store performance at a glance</p></div>
          <div className="voltix-dashboard-actions">
            <button type="button" className="voltix-view-orders-btn" onClick={() => navigate("/admin/orders")}>View orders</button>
            <button type="button" className="voltix-add-product-btn" onClick={() => navigate("/admin/products/new")}>+ Add product</button>
          </div>
        </header>

        {error && <div className="vx-alert error" role="alert">{error}</div>}
        {loading ? <section className="voltix-dashboard-card voltix-dashboard-loading">Loading live store data…</section> : <>
          <section className="voltix-dashboard-stats">
            {statCards.map((stat) => <div className="voltix-stat-card" key={stat.title}><p>{stat.title}</p><h2>{stat.value}</h2><span className={stat.color || ""}>{stat.description}</span></div>)}
          </section>

          <section className="voltix-dashboard-card voltix-sales-card">
            <h2>Sales — last 7 days</h2>
            <div className="voltix-sales-chart">
              {sales.map((sale) => <div className="voltix-sales-column" key={sale.date}>
                <div className="voltix-sales-bar" style={{ height: `${sale.amount ? Math.max(6, Math.round((sale.amount / maximumSale) * 155)) : 4}px` }} />
                <span className="voltix-sales-amount">{formatPrice(sale.amount)}</span><span className="voltix-sales-day">{sale.label}</span>
              </div>)}
            </div>
          </section>

          <section className="voltix-dashboard-grid">
            <div className="voltix-dashboard-card voltix-orders-card">
              <div className="voltix-card-heading"><h2>Recent orders</h2><button type="button" onClick={() => navigate("/admin/orders")}>View all</button></div>
              <div className="voltix-orders-table-wrapper"><table className="voltix-orders-table"><thead><tr><th>ORDER ID</th><th>CUSTOMER</th><th>TOTAL</th><th>STATUS</th></tr></thead>
                <tbody>{orders.length ? orders.map((order) => <tr key={order._id} style={{ cursor: "pointer" }} onClick={() => navigate(`/admin/orders/${order._id}`)}><td className="voltix-order-id">#{order.orderId}</td><td>{order.customer}</td><td>{formatPrice(order.total)}</td><td><span className={`voltix-status ${PROCESSING.has(order.status) ? "processing" : "shipped"}`}>{order.status}</span></td></tr>) : <tr><td colSpan="4" className="voltix-empty-cell">No orders yet</td></tr>}</tbody>
              </table></div>
            </div>

            <div className="voltix-dashboard-right">
              <div className="voltix-dashboard-card voltix-stock-card"><div className="voltix-card-heading"><h2>Low stock</h2><button type="button" onClick={() => navigate("/admin/products?stock=low")}>Manage</button></div>
                <div className="voltix-stock-list">{lowStock.length ? lowStock.map((product) => <div className="voltix-stock-item" key={product._id}><span>{product.name}</span><span className={`voltix-stock-badge ${product.stock === 0 ? "out" : "low"}`}>{product.status} · {product.stock}</span></div>) : <p className="voltix-empty-state">All products are well stocked.</p>}</div>
              </div>
              <div className="voltix-dashboard-card voltix-returns-card"><div className="voltix-card-heading"><h2>Pending returns</h2><button type="button" onClick={() => navigate("/admin/returns")}>Review</button></div>
                <div className="voltix-return-info">{pendingReturn ? <><strong>R-{pendingReturn.orderId}</strong><p>{pendingReturn.item} — {pendingReturn.reason}</p></> : <p className="voltix-empty-state">No return requests waiting for review.</p>}</div>
              </div>
            </div>
          </section>
        </>}
      </main>
    </div>
  );
}

export default AdminDashboard;
