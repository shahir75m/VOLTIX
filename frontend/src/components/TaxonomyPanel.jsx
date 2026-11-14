import { useEffect, useState } from "react";
import { getAdminCachedData, setAdminCachedData, clearAdminCachedData } from "../utils/adminSession";
import { apiFetch } from "../utils/api";
import Pagination from "./Pagination";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE = 2 * 1024 * 1024;

const validateName = (raw, label) => {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return `${label} name is required`;
  if (name.length < 2) return `${label} name must be at least 2 characters`;
  if (name.length > 40) return `${label} name must not exceed 40 characters`;
  return "";
};

const checkImage = (file) => {
  if (!ALLOWED.includes(file.type)) return "Only JPG, PNG and WebP images are allowed";
  if (file.size > MAX_IMAGE) return "Image must be 2 MB or smaller";
  return "";
};

// One list-and-form panel. Used for both "Categories" and "Brands" (same rules).
export default function TaxonomyPanel({ endpoint, label, placeholder, imageButton, handleAuthError }) {
  const lower = label.toLowerCase();
  const [categories, setCategories] = useState(() => getAdminCachedData(`${endpoint}:default`)?.items || []);
  const [pagination, setPagination] = useState(() => getAdminCachedData(`${endpoint}:default`)?.pagination || { currentPage: 1, totalPages: 1, totalItems: 0, limit: 10 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  // add form
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [newImage, setNewImage] = useState(null);
  const [newPreview, setNewPreview] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  // edit modal
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState(null);
  const [editPreview, setEditPreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  // delete modal
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // debounce the backend search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // load list from the backend (search + pagination + latest first)
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setPageError("");
        const params = new URLSearchParams({ page: String(page), status });
        if (debouncedSearch) params.set("search", debouncedSearch);
        const data = await apiFetch(`${endpoint}?${params}`, { signal: controller.signal });
        setCategories(data.items);
        if (page === 1 && !debouncedSearch && status === "all") setAdminCachedData(`${endpoint}:default`, data);
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
  }, [endpoint, page, debouncedSearch, status, reloadKey, handleAuthError]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // revoke preview urls
  useEffect(() => () => newPreview && URL.revokeObjectURL(newPreview), [newPreview]);
  useEffect(() => () => editPreview && URL.revokeObjectURL(editPreview), [editPreview]);

  const pickNewImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = checkImage(file);
    if (problem) return setAddError(problem);
    setAddError("");
    setNewImage(file);
    setNewPreview(URL.createObjectURL(file));
  };

  const clearNewImage = () => {
    setNewImage(null);
    setNewPreview("");
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    if (adding) return;

    const problem = validateName(newName, label);
    if (problem) return setAddError(problem);

    const form = new FormData();
    form.append("name", newName.trim());
    if (label === "Category" && newTemplate.trim()) form.append("specTemplate", JSON.stringify(newTemplate.split("\n").map((s) => s.trim()).filter(Boolean)));
    if (newImage) form.append("image", newImage);

    try {
      setAdding(true);
      setAddError("");
      const data = await apiFetch(endpoint, { method: "POST", body: form });
      clearAdminCachedData();
      if (data.item) setCategories((previous) => [data.item, ...(page === 1 && !debouncedSearch ? previous : [])].slice(0, pagination.limit));
      setNewName("");
      setNewTemplate("");
      clearNewImage();
      setNotice(`${label} added successfully`);
      setSearch("");
      setDebouncedSearch("");
      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (error) {
      if (!handleAuthError(error)) setAddError(error.errors?.name || error.message);
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (category) => {
    setEditing(category);
    setEditName(category.name);
    setEditTemplate((category.specTemplate || []).join("\n"));
    setEditImage(null);
    setEditPreview("");
    setRemoveImage(false);
    setEditError("");
  };

  const pickEditImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = checkImage(file);
    if (problem) return setEditError(problem);
    setEditError("");
    setEditImage(file);
    setEditPreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (saving || !editing) return;

    const problem = validateName(editName, label);
    if (problem) return setEditError(problem);

    const form = new FormData();
    form.append("name", editName.trim());
    if (label === "Category") form.append("specTemplate", JSON.stringify(editTemplate.split("\n").map((s) => s.trim()).filter(Boolean)));
    if (editImage) form.append("image", editImage);
    if (removeImage) form.append("removeImage", "true");

    try {
      setSaving(true);
      setEditError("");
      const data = await apiFetch(`${endpoint}/${editing._id}`, { method: "PUT", body: form });
      clearAdminCachedData();
      if (data.item) setCategories((previous) => previous.map((item) => item._id === editing._id ? { ...item, ...data.item } : item));
      setEditing(null);
      setNotice(`${label} updated successfully`);
      setReloadKey((k) => k + 1);
    } catch (error) {
      if (!handleAuthError(error)) setEditError(error.errors?.name || error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting || deleteBusy) return;
    try {
      setDeleteBusy(true);
      await apiFetch(`${endpoint}/${deleting._id}`, { method: "DELETE" });
      clearAdminCachedData();
      setCategories((previous) => previous.filter((item) => item._id !== deleting._id));
      const totalItems = Math.max(0, pagination.totalItems - 1);
      const totalPages = Math.max(1, Math.ceil(totalItems / pagination.limit));
      setPagination((previous) => ({ ...previous, totalItems, totalPages }));
      setPage(Math.min(page, totalPages));
      setDeleting(null);
      setNotice(`${label} deleted`);
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

  const handleRestore = async (item) => {
    try {
      setPageError("");
      const data = await apiFetch(`${endpoint}/${item._id}/restore`, { method: "PATCH" });
      clearAdminCachedData();
      setCategories((previous) => previous.filter((current) => current._id !== item._id));
      setNotice(data.message || `${label} restored`);
      setReloadKey((key) => key + 1);
    } catch (error) {
      if (!handleAuthError(error)) setPageError(error.message);
    }
  };

  const from = pagination.totalItems === 0 ? 0 : (pagination.currentPage - 1) * pagination.limit + 1;
  const to = Math.min(pagination.currentPage * pagination.limit, pagination.totalItems);

  return (
    <div className="vx-panel-col">
      {notice && <div className="vx-alert success" role="status">{notice}</div>}
      {pageError && <div className="vx-alert error" role="alert">{pageError}</div>}
      {deleting && <section className="vx-card" role="alert">
        <h2>Delete “{deleting.name}”?</h2>
        <p>
          This is a soft delete. The {lower} will be hidden from normal lists and can be restored from the Deleted filter.
          {deleting.productCount > 0 ? ` Its ${deleting.productCount} product(s) will also stop showing in the store.` : ""}
        </p>
        <div className="vx-modal-actions">
          <button type="button" className="vx-btn" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button>
          <button type="button" className="vx-btn danger" onClick={handleDelete} disabled={deleteBusy}>{deleteBusy ? "Deleting..." : `Delete ${lower}`}</button>
        </div>
      </section>}

        {/* ADD */}
        <section className="vx-card">
          <h2>{`New ${lower}`}</h2>
          <form onSubmit={handleAdd} noValidate>
            {label === "Category" && <div className="vx-field"><label htmlFor="new-spec-template">Specification template (one field per line)</label><textarea id="new-spec-template" value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)} placeholder="RAM\nStorage\nBattery" rows={3} /><span className="vx-hint">Leave empty to use the Mobile, Laptop or Earbuds template when the category name matches.</span></div>}
            <div className="vx-add-cat">
              <div className={`vx-field ${addError ? "has-error" : ""}`}>
                <input
                  type="text"
                  placeholder={placeholder}
                  value={newName}
                  maxLength={60}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setAddError("");
                  }}
                  aria-label={`New ${lower} name`}
                />
                {addError && <span className="vx-err">{addError}</span>}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {newPreview && <img src={newPreview} alt="" className="vx-cat-preview" />}
                <label className="vx-btn vx-file-btn" style={{ display: "inline-flex", alignItems: "center" }}>
                  {newImage ? "Change image" : imageButton}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickNewImage} />
                </label>
                {newImage && (
                  <button type="button" className="vx-link red" onClick={clearNewImage}>Remove</button>
                )}
                <button type="submit" className="vx-btn primary" disabled={adding}>
                  {adding ? "Adding..." : "Add"}
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* SEARCH */}
        <section className="vx-card">
          <div className="vx-field" style={{ marginBottom: 0 }}>
            <label htmlFor={`${lower}-search`}>{`Search ${lower}s`}</label>
            <div className="vx-search-row">
              <input
                id={`${lower}-search`}
                className="vx-input"
                type="search"
                placeholder={`Search by ${lower} name`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="vx-btn" onClick={() => setSearch("")}>
                  Clear search
                </button>
              )}
              <select aria-label={`${label} status`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="all">All active</option>
                <option value="deleted">Deleted</option>
              </select>
            </div>
          </div>
        </section>

        {/* TABLE */}
        <section className="vx-card flush">
          <div className="vx-scroll">
            <table className="vx-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Products</th>
                                    <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && categories.length === 0 ? (
                  <tr><td colSpan={3}><div className="vx-empty">Loading...</div></td></tr>
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="vx-empty">
                        <strong>{debouncedSearch ? `No ${lower}s match your search` : `No ${lower}s yet`}</strong>
                        {debouncedSearch ? "Try a different name or clear the search." : `Add your first ${lower} above.`}
                      </div>
                    </td>
                  </tr>
                ) : (
                  categories.map((category) => (
                    <tr key={category._id}>
                      <td>
                        <div className="vx-cell">
                          {category.image ? (
                            <img className="vx-thumb" src={category.image} alt="" />
                          ) : (
                            <span className="vx-thumb vx-thumb-empty">No img</span>
                          )}
                          <strong>{category.name}</strong>
                        </div>
                      </td>
                      <td>{category.productCount}</td>
                      <td>
                        {category.isDeleted ? (
                          <button type="button" className="vx-link" onClick={() => handleRestore(category)}>Restore</button>
                        ) : <>
                          <button type="button" className="vx-link" onClick={() => openEdit(category)}>Edit</button>
                          <button type="button" className="vx-link red" onClick={() => setDeleting(category)}>Delete</button>
                        </>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="vx-pager">
            <span>
              {pagination.totalItems === 0
                ? `No ${lower}s`
                : `Showing ${from}–${to} of ${pagination.totalItems}`}
            </span>
            <Pagination pagination={pagination} onChange={setPage} />
          </div>
        </section>

      {/* EDIT MODAL */}
      {editing && (
        <div className="vx-modal-bg" role="dialog" aria-modal="true" aria-label={`Edit ${lower}`}>
          <form className="vx-modal" onSubmit={handleSave} noValidate>
            <h3>{`Edit ${lower}`}</h3>
            <div className={`vx-field ${editError ? "has-error" : ""}`}>
              <label htmlFor={`edit-${lower}-name`}>{`${label} name`}</label>
              <input
                id={`edit-${lower}-name`}
                type="text"
                value={editName}
                maxLength={60}
                autoFocus
                onChange={(e) => {
                  setEditName(e.target.value);
                  setEditError("");
                }}
              />
              {editError && <span className="vx-err">{editError}</span>}
            </div>

            <div className="vx-field">
              <label>{`${label} image`}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {(editPreview || (!removeImage && editing.image)) ? (
                  <img className="vx-thumb" src={editPreview || editing.image} alt="" />
                ) : (
                  <span className="vx-thumb vx-thumb-empty">No img</span>
                )}
                <label className="vx-btn vx-file-btn" style={{ display: "inline-flex", alignItems: "center" }}>
                  Choose image
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickEditImage} />
                </label>
                {(editPreview || (!removeImage && editing.image)) && (
                  <button
                    type="button"
                    className="vx-link red"
                    onClick={() => {
                      setEditImage(null);
                      setEditPreview("");
                      setRemoveImage(true);
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {label === "Category" && <div className="vx-field"><label htmlFor="edit-spec-template">Specification template (one field per line)</label><textarea id="edit-spec-template" value={editTemplate} onChange={(e) => setEditTemplate(e.target.value)} rows={5} /></div>}
            <div className="vx-modal-actions">
              <button type="button" className="vx-btn" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="vx-btn primary" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
