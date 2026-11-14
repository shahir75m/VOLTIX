import AdminPagePending from "../../components/AdminPagePending";
import { getAdminCachedData, setAdminCachedData, clearAdminCachedData } from "../../utils/adminSession";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch, apiJson } from "../../utils/api";
import { formatPrice } from "../../utils/format";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminSidebar from "../../components/AdminSidebar";
import Pagination from "../../components/Pagination";
import "./AdminDashboard.css";
import "./AdminShop.css";

const STOCK_BADGE = {
  in_stock: { label: "In stock", cls: "green" },
  low_stock: { label: "Low stock", cls: "yellow" },
  out_of_stock: { label: "Out of stock", cls: "red" },
};

const STATUS_BADGE = {
  published: { label: "Published", cls: "green" },
  draft: { label: "Draft", cls: "grey" },
  unpublished: { label: "Draft", cls: "grey" },
  blocked: { label: "Blocked", cls: "red" },
  deleted: { label: "Deleted", cls: "grey" },
};

export default function AdminProducts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { checkingAuth, handleAuthError } = useAdminAuth();

  const [products, setProducts] = useState(() => getAdminCachedData("products:default")?.products || []);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [brand, setBrand] = useState("");
  const [pagination, setPagination] = useState(() => getAdminCachedData("products:default")?.pagination || { currentPage: 1, totalPages: 1, totalItems: 0, limit: 10 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState(location.state?.message || "");
  const [busyId, setBusyId] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    // clear the "saved" message from history so it does not show again on refresh
    if (location.state?.message) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (checkingAuth) return;
    Promise.all([apiFetch("/api/admin/categories/all"), apiFetch("/api/admin/brands/all")])
      .then(([cats, brs]) => {
        setCategories(cats.items);
        setBrands(brs.items);
      })
      .catch((error) => handleAuthError(error));
  }, [checkingAuth, handleAuthError]);

  useEffect(() => {
    if (checkingAuth) return;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setPageError("");
        const params = new URLSearchParams({ page: String(page), stock, status });
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (category) params.set("category", category);
        if (brand) params.set("brand", brand);
        const data = await apiFetch(`/api/admin/products?${params}`, { signal: controller.signal });
        setProducts(data.products);
        if (page === 1 && !debouncedSearch && !category && !brand && stock === "all" && status === "all") setAdminCachedData("products:default", data);
        setPagination(data.pagination);
        if (data.pagination.currentPage !== page) setPage(data.pagination.currentPage);
      } catch (error) {
        if (error.name === "AbortError") return;
        if (!handleAuthError(error)) setPageError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [checkingAuth, page, debouncedSearch, category, brand, stock, status, reloadKey, handleAuthError]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const hasFilters = Boolean(search || category || brand || stock !== "all" || status !== "all");

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setCategory("");
    setBrand("");
    setStock("all");
    setStatus("all");
    setPage(1);
  };

  const toggle = async (product, kind) => {
    if (busyId) return;
    const isPublish = kind === "publish";
    const body = isPublish ? { isPublished: !product.isPublished } : { isBlocked: !product.isBlocked };
    try {
      setBusyId(product._id);
      setPageError("");
      const data = await apiJson(`/api/admin/products/${product._id}/${kind}`, "PATCH", body);
      clearAdminCachedData();
      setProducts((previous) => previous.map((item) => {
        if (item._id !== product._id) return item;
        const updated = { ...item, ...data.product };
        updated.status = updated.isBlocked ? "blocked" : updated.isPublished ? "published" : "draft";
        return updated;
      }));
      setNotice(data.message);
      setReloadKey((k) => k + 1);
    } catch (error) {
      if (!handleAuthError(error)) setPageError(error.message);
    } finally {
      setBusyId("");
    }
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    try {
      setDeleteBusy(true);
      await apiFetch(`/api/admin/products/${deleting._id}`, { method: "DELETE" });
      clearAdminCachedData();
      setProducts((previous) => previous.filter((item) => item._id !== deleting._id));
      const totalItems = Math.max(0, pagination.totalItems - 1);
      const totalPages = Math.max(1, Math.ceil(totalItems / pagination.limit));
      setPagination((previous) => ({ ...previous, totalItems, totalPages }));
      setPage(Math.min(page, totalPages));
      setDeleting(null);
      setNotice("Product deleted");
      setReloadKey((k) => k + 1);
    } catch (error) {
      if (!handleAuthError(error)) {
        setPageError(error.message);
        setDeleting(null);
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const restore = async (product) => {
    if (busyId) return;
    try {
      setBusyId(product._id);
      setPageError("");
      const data = await apiJson(`/api/admin/products/${product._id}/restore`, "PATCH", {});
      clearAdminCachedData();
      // A restored product no longer belongs in the Deleted-only result set.
      setProducts((previous) => previous.filter((item) => item._id !== product._id));
      setNotice(data.message);
      setReloadKey((key) => key + 1);
    } catch (error) {
      if (!handleAuthError(error)) setPageError(error.message);
    } finally {
      setBusyId("");
    }
  };

  if (checkingAuth) return <AdminPagePending active="Products" />;

  const from = pagination.totalItems === 0 ? 0 : (pagination.currentPage - 1) * pagination.limit + 1;
  const to = Math.min(pagination.currentPage * pagination.limit, pagination.totalItems);

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Products" />

      <main className="vx-main">
        <header className="vx-head">
          <div>
            <h1>Products</h1>
            <p>Manage your gadget catalogue — {pagination.totalItems} product{pagination.totalItems === 1 ? "" : "s"}</p>
          </div>
          <div className="vx-head-actions">
            <button type="button" className="vx-btn primary" onClick={() => navigate("/admin/products/new")}>
              + Add product
            </button>
          </div>
        </header>

        {notice && <div className="vx-alert success" role="status">{notice}</div>}
        {pageError && <div className="vx-alert error" role="alert">{pageError}</div>}
        {deleting && <section className="vx-card" role="alert">
          <h2>Delete “{deleting.name}”?</h2>
          <p>This is a soft delete. The product will be hidden from customers and normal admin lists, and can be restored from the Deleted filter.</p>
          <div className="vx-modal-actions">
            <button type="button" className="vx-btn" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button>
            <button type="button" className="vx-btn danger" onClick={confirmDelete} disabled={deleteBusy}>{deleteBusy ? "Deleting..." : "Delete product"}</button>
          </div>
        </section>}

        <section className="vx-card">
          <div className="vx-filters">
            <div className="vx-field">
              <label htmlFor="p-search">Search</label>
              <input id="p-search" type="search" placeholder="Search by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="vx-field">
              <label htmlFor="p-cat">Category</label>
              <select id="p-cat" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="vx-field">
              <label htmlFor="p-brand">Brand</label>
              <select id="p-brand" value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}>
                <option value="">All brands</option>
                {brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div className="vx-field">
              <label htmlFor="p-stock">Stock</label>
              <select id="p-stock" value={stock} onChange={(e) => { setStock(e.target.value); setPage(1); }}>
                <option value="all">All</option>
                <option value="in">In stock</option>
                <option value="low">Low stock</option>
                <option value="out">Out of stock</option>
              </select>
            </div>
            <div className="vx-field">
              <label htmlFor="p-status">Status</label>
              <select id="p-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="all">All</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="blocked">Blocked</option>
                <option value="deleted">Deleted</option>
              </select>
            </div>
            <button type="button" className="vx-btn" onClick={clearFilters} disabled={!hasFilters} style={{ height: 42 }}>
              Clear filters
            </button>
          </div>
        </section>

        <section className="vx-card flush">
          <div className="vx-scroll">
            <table className="vx-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && products.length === 0 ? (
                  <tr><td colSpan={7}><div className="vx-empty">Loading products...</div></td></tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="vx-empty">
                        <strong>{hasFilters ? "No products match your filters" : "No products yet"}</strong>
                        {hasFilters ? "Try changing or clearing the filters." : "Click “Add product” to create your first product."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  products.map((product) => {
                    const stockBadge = STOCK_BADGE[product.stockStatus];
                    const statusBadge = STATUS_BADGE[product.status] || STATUS_BADGE.draft;
                    return (
                      <tr key={product._id}>
                        <td>
                          <div className="vx-cell">
                            {product.image ? <img className="vx-thumb" src={product.image} alt="" /> : <span className="vx-thumb vx-thumb-empty">No img</span>}
                            <div>
                              <strong>{product.name}</strong>
                              <small>
                                {product.sku || "No SKU"}
                                {product.variants.length > 0 ? ` · ${product.variants.length} variants` : ""}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {product.category?.name || "—"}
                          {product.category?.isDeleted && <span className="vx-muted vx-red">Category deleted</span>}
                        </td>
                        <td>
                          {product.brand?.name || "Select brand in Edit"}
                          {product.brand?.isDeleted && <span className="vx-muted vx-red">Brand deleted</span>}
                        </td>
                        <td>
                          {product.variants.length > 1 && <span className="vx-muted" style={{ marginBottom: 2 }}>From</span>}
                          {formatPrice(product.price)}
                          {product.mrp > product.price && <span className="vx-muted">MRP {formatPrice(product.mrp)}</span>}
                        </td>
                        <td>
                          <span className={product.stock <= 10 ? "vx-red" : ""}>{product.stock}</span>
                          <span className={`vx-badge ${stockBadge.cls}`} style={{ marginLeft: 8 }}>{stockBadge.label}</span>
                        </td>
                        <td><span className={`vx-badge ${statusBadge.cls}`}>{statusBadge.label}</span></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {product.isDeleted ? (
                            <button type="button" className="vx-link" disabled={busyId === product._id} onClick={() => restore(product)}>
                              {busyId === product._id ? "Restoring..." : "Restore"}
                            </button>
                          ) : <>
                            <button type="button" className="vx-link" onClick={() => navigate(`/admin/products/${product._id}/edit`)}>Edit</button>
                            <button type="button" className="vx-link grey" disabled={busyId === product._id} onClick={() => toggle(product, "publish")}>
                              {product.isPublished ? "Move to draft" : "Publish"}
                            </button>
                            <button type="button" className="vx-link grey" disabled={busyId === product._id} onClick={() => toggle(product, "block")}>
                              {product.isBlocked ? "Unblock" : "Block"}
                            </button>
                            <button type="button" className="vx-link red" onClick={() => setDeleting(product)}>Delete</button>
                          </>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="vx-pager">
            <span>
              {pagination.totalItems === 0 ? "No products" : `Showing ${from}–${to} of ${pagination.totalItems} products`}
            </span>
            <Pagination pagination={pagination} onChange={setPage} />
          </div>
        </section>
      </main>
    </div>
  );
}
