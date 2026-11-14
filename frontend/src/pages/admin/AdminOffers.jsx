import { useCallback, useEffect, useRef, useState } from "react";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminSidebar from "../../components/AdminSidebar";
import { apiFetch, apiForm } from "../../utils/api";
import "./AdminShop.css";
import "./AdminOrders.css";

const EMPTY = {
  name: "", appliesTo: "category", category: "", linkUrl: "", discountLabel: "", description: "",
  startDate: "", endDate: "", showOnHome: false, showOnOffers: true, sortOrder: "0", isActive: true,
};
const PILL = { Active: "green", Scheduled: "blue", Expired: "grey", Disabled: "grey", Deleted: "grey" };
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const niceDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

export default function AdminOffers() {
  const { checkingAuth, handleAuthError } = useAdminAuth();
  const [offers, setOffers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("all");
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    try {
      const [o, cat] = await Promise.all([apiFetch(`/api/admin/offers?status=${status}`), apiFetch("/api/admin/categories/all")]);
      setOffers(o.offers);
      setCategories(cat.items || []);
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message || "Failed to load offers");
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, status]);

  useEffect(() => {
    if (!checkingAuth) load();
  }, [checkingAuth, load]);

  // free the temporary preview address when it changes
  useEffect(() => () => preview.startsWith("blob:") && URL.revokeObjectURL(preview), [preview]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
    setFile(null);
    setPreview("");
    setRemoveImage(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const startEdit = (o) => {
    setEditingId(o._id);
    setError("");
    setNotice("");
    setForm({
      name: o.name, appliesTo: o.appliesTo, category: o.category?._id || "", linkUrl: o.linkUrl || "",
      discountLabel: o.discountLabel || "", description: o.description || "", startDate: day(o.startDate), endDate: day(o.endDate),
      showOnHome: o.showOnHome, showOnOffers: o.showOnOffers, sortOrder: String(o.sortOrder || 0), isActive: o.isActive,
    });
    setFile(null);
    setRemoveImage(false);
    setPreview(o.image?.url || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pickFile = (event) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(picked.type)) return setError("Banner must be a JPG, PNG or WebP image");
    if (picked.size > 5 * 1024 * 1024) return setError("Banner image must be 5 MB or smaller");
    setError("");
    setFile(picked);
    setRemoveImage(false);
    setPreview(URL.createObjectURL(picked));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");
    if (!form.name.trim()) return setError("Offer name is required");
    if (!form.startDate || !form.endDate) return setError("Start and end date are required");
    if (form.showOnHome && !preview) return setError("Add a banner image to show this offer on the home page");

    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => data.append(k, String(v)));
    if (file) data.append("image", file);
    if (removeImage) data.append("removeImage", "true");

    try {
      setSaving(true);
      const res = await apiForm(editingId ? `/api/admin/offers/${editingId}` : "/api/admin/offers", editingId ? "PUT" : "POST", data);
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
      await apiFetch(`/api/admin/offers/${deleting._id}`, { method: "DELETE" });
      setNotice("Offer deleted");
      if (editingId === deleting._id) reset();
      setDeleting(null);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const restore = async (o) => {
    try {
      const result = await apiFetch(`/api/admin/offers/${o._id}/restore`, { method: "PATCH" });
      setNotice(result.message);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    }
  };

  if (checkingAuth) return null;

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Offers" />
      <main className="vx-main">
        <header className="vx-head">
          <div>
            <h1>Offers</h1>
            <p>Run sales and banners shown on the store home page and Offers page</p>
          </div>
        </header>

        {notice && <div className="vx-alert success" role="status">{notice}</div>}
        {error && <div className="vx-alert error" role="alert">{error}</div>}
        {deleting && <section className="vx-card" role="alert">
          <h2>Delete offer “{deleting.name}”?</h2>
          <p>This is a soft delete. The offer will be hidden from normal lists and the store, and can be restored from the Deleted filter.</p>
          <div className="vx-modal-actions">
            <button type="button" className="vx-btn" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button>
            <button type="button" className="vx-btn danger" onClick={remove} disabled={deleteBusy}>{deleteBusy ? "Deleting..." : "Delete offer"}</button>
          </div>
        </section>}

        <div className="vx-form-grid">
          <section className="vx-card flush">
            <div style={{ padding: "20px 18px 0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>{status === "deleted" ? "Deleted offers" : "Current & upcoming offers"}</h2>
              <select aria-label="Offer status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All active</option>
                <option value="deleted">Deleted</option>
              </select>
            </div>
            {loading ? (
              <div className="vx-empty"><strong>Loading offers...</strong></div>
            ) : offers.length === 0 ? (
              <div className="vx-empty"><strong>No offers yet</strong>Create the first one with the form.</div>
            ) : (
              <div className="vx-scroll">
                <table className="vx-table">
                  <thead>
                    <tr><th>Banner</th><th>Offer</th><th>Applies to</th><th>Shown on</th><th>Dates</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {offers.map((o) => (
                      <tr key={o._id}>
                        <td>{o.image?.url ? <img className="ao-thumb-banner" src={o.image.url} alt="" /> : <span className="ao-sub">No image</span>}</td>
                        <td>
                          <span className="ao-id">{o.name}</span>
                          <span className="ao-sub">{o.discountLabel}</span>
                        </td>
                        <td>{o.appliesToLabel}</td>
                        <td>{[o.showOnHome ? "Home" : "", o.showOnOffers ? "Offers page" : ""].filter(Boolean).join(" + ")}</td>
                        <td>{niceDate(o.startDate)} – {niceDate(o.endDate)}</td>
                        <td><span className={`ao-pill ${PILL[o.status]}`}>{o.status}</span></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {o.isDeleted ? <button type="button" className="vx-link" onClick={() => restore(o)}>Restore</button> : <>
                            <button type="button" className="vx-link" onClick={() => startEdit(o)}>Edit</button>
                            <button type="button" className="vx-link red" onClick={() => setDeleting(o)}>Delete</button>
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
            <h2>{editingId ? "Edit offer" : "Create offer"}</h2>

            <div className="vx-field">
              <label htmlFor="o-name">Offer name *</label>
              <input id="o-name" type="text" maxLength={60} placeholder="e.g. Audio fest" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="vx-field">
              <label htmlFor="o-applies">Applies to</label>
              <select id="o-applies" value={form.appliesTo} onChange={(e) => set("appliesTo", e.target.value)}>
                <option value="category">Category</option>
                <option value="all">All products</option>
                <option value="custom">Custom link</option>
              </select>
            </div>
            {form.appliesTo === "category" && (
              <div className="vx-field">
                <label htmlFor="o-cat">Select category</label>
                <select id="o-cat" value={form.category} onChange={(e) => set("category", e.target.value)}>
                  <option value="">Choose a category</option>
                  {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {form.appliesTo === "custom" && (
              <div className="vx-field">
                <label htmlFor="o-link">Link</label>
                <input id="o-link" type="text" placeholder="/products?search=laptop" value={form.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} />
              </div>
            )}
            <div className="vx-field">
              <label htmlFor="o-disc">Discount text</label>
              <input id="o-disc" type="text" maxLength={40} placeholder="e.g. Up to 30% off" value={form.discountLabel} onChange={(e) => set("discountLabel", e.target.value)} />
            </div>
            <div className="vx-field">
              <label htmlFor="o-desc">Short description</label>
              <input id="o-desc" type="text" maxLength={160} placeholder="Earbuds, headphones and speakers" value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="ao-status-form">
              <div className="vx-field">
                <label htmlFor="o-start">Start date</label>
                <input id="o-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </div>
              <div className="vx-field">
                <label htmlFor="o-end">End date</label>
                <input id="o-end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
              </div>
            </div>

            <div className="vx-field">
              <label>Offer banner image</label>
              {preview && <img className="ao-banner-preview" src={preview} alt="Banner preview" />}
              <label className="ao-drop" htmlFor="o-file">
                <strong>{preview ? "Change image" : "Choose an image"}</strong>
                <small>PNG, JPG or WebP up to 5 MB. Best size 1600 × 600 (wide).</small>
              </label>
              <input id="o-file" ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickFile} />
              {preview && editingId && !file && (
                <button type="button" className="vx-link red" onClick={() => { setPreview(""); setRemoveImage(true); }}>Remove image</button>
              )}
            </div>

            <h3 style={{ fontSize: 14, margin: "14px 0 4px" }}>Where should it appear?</h3>
            <label className="ao-check"><input type="checkbox" checked={form.showOnHome} onChange={(e) => set("showOnHome", e.target.checked)} /> Home page banner slider (needs an image)</label>
            <label className="ao-check"><input type="checkbox" checked={form.showOnOffers} onChange={(e) => set("showOnOffers", e.target.checked)} /> Offers page</label>
            <div className="vx-field" style={{ marginTop: 8 }}>
              <label htmlFor="o-sort">Display order (smaller shows first)</label>
              <input id="o-sort" type="number" min="0" max="999" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
            </div>
            <label className="ao-check"><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active</label>

            <div className="ao-actions" style={{ marginTop: 14 }}>
              <button type="submit" className="vx-btn primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Create offer"}
              </button>
              {editingId && <button type="button" className="vx-btn" onClick={reset}>Cancel</button>}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
