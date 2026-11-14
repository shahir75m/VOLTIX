import { useCallback, useEffect, useState } from "react";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminSidebar from "../../components/AdminSidebar";
import { apiFetch, apiJson } from "../../utils/api";
import { formatPrice } from "../../utils/format";
import "./AdminShop.css";
import "./AdminOrders.css";

const EMPTY = {
  code: "", description: "", discountType: "percent", discountValue: "", maxDiscount: "", minOrder: "",
  category: "", validFrom: "", validUntil: "", usageLimit: "", perUserLimit: "1",
  firstOrderOnly: false, showOnOffersPage: true, isActive: true,
};

const PILL = { Active: "green", Scheduled: "blue", Expired: "grey", Disabled: "grey", "Used up": "red", Deleted: "grey" };
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const niceDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function AdminCoupons() {
  const { checkingAuth, handleAuthError } = useAdminAuth();
  const [coupons, setCoupons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("all");
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, cat] = await Promise.all([apiFetch(`/api/admin/coupons?status=${status}`), apiFetch("/api/admin/categories/all")]);
      setCoupons(c.coupons);
      setCategories(cat.items || []);
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message || "Failed to load coupons");
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, status]);

  useEffect(() => {
    if (!checkingAuth) load();
  }, [checkingAuth, load]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const startEdit = (c) => {
    setEditingId(c._id);
    setError("");
    setNotice("");
    setForm({
      code: c.code, description: c.description || "", discountType: c.discountType, discountValue: String(c.discountValue),
      maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "", minOrder: c.minOrder ? String(c.minOrder) : "",
      category: c.category?._id || "", validFrom: day(c.validFrom), validUntil: day(c.validUntil),
      usageLimit: c.usageLimit ? String(c.usageLimit) : "", perUserLimit: String(c.perUserLimit || 1),
      firstOrderOnly: c.firstOrderOnly, showOnOffersPage: c.showOnOffersPage, isActive: c.isActive,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");
    if (!form.code.trim() || !form.discountValue) return setError("Coupon code and discount value are required");
    try {
      setSaving(true);
      const res = editingId
        ? await apiJson(`/api/admin/coupons/${editingId}`, "PUT", form)
        : await apiJson("/api/admin/coupons", "POST", form);
      setNotice(res.message);
      reset();
      await load();
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting || deleteBusy) return;
    try {
      setDeleteBusy(true);
      await apiFetch(`/api/admin/coupons/${deleting._id}`, { method: "DELETE" });
      setNotice(`Coupon ${deleting.code} deleted`);
      if (editingId === deleting._id) reset();
      setDeleting(null);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const toggle = async (c) => {
    try {
      await apiJson(`/api/admin/coupons/${c._id}`, "PUT", {
        ...c, category: c.category?._id || "", validFrom: day(c.validFrom), validUntil: day(c.validUntil), isActive: !c.isActive,
      });
      await load();
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    }
  };

  const restore = async (c) => {
    try {
      const result = await apiJson(`/api/admin/coupons/${c._id}/restore`, "PATCH", {});
      setNotice(result.message);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    }
  };

  if (checkingAuth) return null;

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Coupons" />
      <main className="vx-main">
        <header className="vx-head">
          <div>
            <h1>Coupons</h1>
            <p>Create and manage discount codes</p>
          </div>
        </header>

        {notice && <div className="vx-alert success" role="status">{notice}</div>}
        {error && <div className="vx-alert error" role="alert">{error}</div>}
        {deleting && <section className="vx-card" role="alert">
          <h2>Delete coupon “{deleting.code}”?</h2>
          <p>This is a soft delete. It will be removed from normal lists but can be restored from the Deleted filter. Past orders keep their discount.</p>
          <div className="vx-modal-actions">
            <button type="button" className="vx-btn" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button>
            <button type="button" className="vx-btn danger" onClick={remove} disabled={deleteBusy}>{deleteBusy ? "Deleting..." : "Delete coupon"}</button>
          </div>
        </section>}

        <div className="vx-form-grid">
          <section className="vx-card flush">
            <div style={{ padding: "20px 18px 0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>{status === "deleted" ? "Deleted coupons" : "All coupons"}</h2>
              <select aria-label="Coupon status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All active</option>
                <option value="deleted">Deleted</option>
              </select>
            </div>
            {loading ? (
              <div className="vx-empty"><strong>Loading coupons...</strong></div>
            ) : coupons.length === 0 ? (
              <div className="vx-empty"><strong>No coupons yet</strong>Create the first one with the form.</div>
            ) : (
              <div className="vx-scroll">
                <table className="vx-table">
                  <thead>
                    <tr><th>Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {coupons.map((c) => (
                      <tr key={c._id}>
                        <td>
                          <span className="ao-id">{c.code}</span>
                          <span className="ao-sub">
                            {[c.category?.name ? `${c.category.name} only` : "", c.firstOrderOnly ? "First order only" : "", c.validUntil ? `till ${niceDate(c.validUntil)}` : "No expiry"].filter(Boolean).join(" · ")}
                          </span>
                        </td>
                        <td>{c.discountText}</td>
                        <td>{c.minOrder ? formatPrice(c.minOrder) : "–"}</td>
                        <td>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                        <td><span className={`ao-pill ${PILL[c.status]}`}>{c.status}</span></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {c.isDeleted ? <button type="button" className="vx-link" onClick={() => restore(c)}>Restore</button> : <>
                            <button type="button" className="vx-link" onClick={() => startEdit(c)}>Edit</button>
                            <button type="button" className="vx-link grey" onClick={() => toggle(c)}>{c.isActive ? "Disable" : "Enable"}</button>
                            <button type="button" className="vx-link red" onClick={() => setDeleting(c)}>Delete</button>
                          </>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <form className="vx-card" onSubmit={submit} noValidate>
            <h2>{editingId ? "Edit coupon" : "Create coupon"}</h2>

            <div className="vx-field">
              <label htmlFor="c-code">Coupon code *</label>
              <input id="c-code" type="text" maxLength={20} placeholder="e.g. WELCOME10" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            </div>
            <div className="vx-field">
              <label htmlFor="c-type">Discount type</label>
              <select id="c-type" value={form.discountType} onChange={(e) => set("discountType", e.target.value)}>
                <option value="percent">Percentage (%)</option>
                <option value="flat">Flat amount (₹)</option>
              </select>
            </div>
            <div className="vx-field">
              <label htmlFor="c-val">Discount value *</label>
              <input id="c-val" type="number" min="1" placeholder={form.discountType === "percent" ? "10" : "500"} value={form.discountValue} onChange={(e) => set("discountValue", e.target.value)} />
            </div>
            {form.discountType === "percent" && (
              <div className="vx-field">
                <label htmlFor="c-max">Maximum discount (₹, optional)</label>
                <input id="c-max" type="number" min="0" placeholder="e.g. 2000" value={form.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} />
              </div>
            )}
            <div className="vx-field">
              <label htmlFor="c-min">Minimum order (₹)</label>
              <input id="c-min" type="number" min="0" placeholder="999" value={form.minOrder} onChange={(e) => set("minOrder", e.target.value)} />
            </div>
            <div className="vx-field">
              <label htmlFor="c-cat">Applies to</label>
              <select id="c-cat" value={form.category} onChange={(e) => set("category", e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="ao-status-form">
              <div className="vx-field">
                <label htmlFor="c-from">Valid from</label>
                <input id="c-from" type="date" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} />
              </div>
              <div className="vx-field">
                <label htmlFor="c-until">Valid until</label>
                <input id="c-until" type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
              </div>
              <div className="vx-field">
                <label htmlFor="c-limit">Total usage limit</label>
                <input id="c-limit" type="number" min="0" placeholder="e.g. 500 (empty = no limit)" value={form.usageLimit} onChange={(e) => set("usageLimit", e.target.value)} />
              </div>
              <div className="vx-field">
                <label htmlFor="c-per">Uses per customer</label>
                <input id="c-per" type="number" min="1" value={form.perUserLimit} onChange={(e) => set("perUserLimit", e.target.value)} />
              </div>
            </div>
            <div className="vx-field">
              <label htmlFor="c-desc">Note (optional)</label>
              <input id="c-desc" type="text" maxLength={160} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>

            <label className="ao-check"><input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => set("firstOrderOnly", e.target.checked)} /> First order only</label>
            <label className="ao-check"><input type="checkbox" checked={form.showOnOffersPage} onChange={(e) => set("showOnOffersPage", e.target.checked)} /> Show on the store Offers page</label>
            <label className="ao-check"><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active</label>

            <div className="ao-actions" style={{ marginTop: 14 }}>
              <button type="submit" className="vx-btn primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Create coupon"}
              </button>
              {editingId && <button type="button" className="vx-btn" onClick={reset}>Cancel</button>}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
