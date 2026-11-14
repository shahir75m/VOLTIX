import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useShop } from "../context/ShopContext";
import { apiFetch, apiForm } from "../utils/api";
import StarRating from "./StarRating";
import Icon from "../components/Icon";

const niceDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// Rating summary, review list and the write / edit form of one product. Inside <StoreLayout>.
export default function ProductReviews({ productId, onChanged }) {
  const { user, showToast } = useShop();
  const [summary, setSummary] = useState({ average: 0, count: 0, distribution: {} });
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState(null);
  const [canReview, setCanReview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ rating: 0, title: "", comment: "" });
  const [hover, setHover] = useState(0);
  const [keepPhotos, setKeepPhotos] = useState([]); // photos of my existing review that stay
  const [newPhotos, setNewPhotos] = useState([]); // files chosen now
  const previews = useMemo(() => newPhotos.map((f) => URL.createObjectURL(f)), [newPhotos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const addPhotos = (fileList) => {
    const next = [...newPhotos];
    for (const file of Array.from(fileList || [])) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { showToast("Photos must be JPG, PNG or WebP", "error"); continue; }
      if (file.size > 3 * 1024 * 1024) { showToast(`${file.name} is bigger than 3 MB`, "error"); continue; }
      if (keepPhotos.length + next.length >= 3) { showToast("You can add up to 3 photos", "error"); break; }
      next.push(file);
    }
    setNewPhotos(next);
  };
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/reviews/product/${productId}?page=${page}&sort=${sort}`);
      setSummary(data.summary);
      setReviews(data.reviews);
      setPagination(data.pagination);
    } catch {
      /* the product page itself still works without reviews */
    } finally {
      setLoading(false);
    }
  }, [productId, page, sort]);

  useEffect(() => {
    load();
  }, [load, reload]);

  useEffect(() => {
    if (!user) {
      setMine(null);
      setCanReview(false);
      return;
    }
    apiFetch(`/api/reviews/product/${productId}/mine`)
      .then((d) => {
        setMine(d.review);
        setCanReview(d.canReview);
      })
      .catch(() => {});
  }, [user, productId, reload]);

  const startEdit = () => {
    setForm(mine ? { rating: mine.rating, title: mine.title || "", comment: mine.comment || "" } : { rating: 0, title: "", comment: "" });
    setKeepPhotos((mine?.photos || []).map((p) => p.url));
    setNewPhotos([]);
    setEditing(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.rating) return showToast("Please choose a star rating", "error");
    try {
      setSaving(true);
      const body = new FormData();
      body.append("rating", String(form.rating));
      body.append("title", form.title);
      body.append("comment", form.comment);
      if (mine) body.append("keepPhotos", JSON.stringify(keepPhotos));
      newPhotos.forEach((file) => body.append("photos", file));
      const res = mine
        ? await apiForm(`/api/reviews/${mine._id}`, "PUT", body)
        : await apiForm(`/api/reviews/product/${productId}`, "POST", body);
      showToast(res.message);
      setEditing(false);
      setReload((n) => n + 1);
      onChanged?.();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete your review?")) return;
    try {
      await apiFetch(`/api/reviews/${mine._id}`, { method: "DELETE" });
      showToast("Review deleted");
      setEditing(false);
      setReload((n) => n + 1);
      onChanged?.();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const total = summary.count || 1;

  return (
    <section className="vx-panel vx-reviews" id="reviews">
      <h2>Ratings &amp; reviews</h2>

      <div className="vx-review-top">
        <div className="vx-review-score">
          <strong>{summary.count ? summary.average.toFixed(1) : "–"}</strong>
          <StarRating value={summary.average} />
          <small>{summary.count} review{summary.count === 1 ? "" : "s"}</small>
        </div>
        <div className="vx-review-bars">
          {[5, 4, 3, 2, 1].map((star) => (
            <div key={star} className="vx-review-bar">
              <span className="vx-bar-star">{star}<Icon name="star" size={11} filled /></span>
              <i><b style={{ width: `${((summary.distribution[star] || 0) / total) * 100}%` }} /></i>
              <span>{summary.distribution[star] || 0}</span>
            </div>
          ))}
        </div>
        <div className="vx-review-cta">
          {!user ? (
            <Link to="/login" className="vx-btn-outline">Log in to write a review</Link>
          ) : mine && !editing ? (
            <button type="button" className="vx-btn-outline" onClick={startEdit}>Edit your review</button>
          ) : canReview && !editing ? (
            <button type="button" className="vx-btn-dark" onClick={startEdit}>Write a review</button>
          ) : !editing ? (
            <small className="vx-sub">You can review this product after it is delivered to you.</small>
          ) : null}
        </div>
      </div>

      {editing && (
        <form className="vx-review-form" onSubmit={submit} noValidate>
          <div className="vx-review-pick" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={(hover || form.rating) >= n ? "on" : ""} onMouseEnter={() => setHover(n)} onClick={() => setForm((f) => ({ ...f, rating: n }))}><Icon name="star" size={30} filled /></button>
            ))}
          </div>
          <div className="vx-field">
            <label htmlFor="rv-title">Title (optional)</label>
            <input id="rv-title" type="text" maxLength={80} placeholder="Sum it up in a few words" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="vx-field">
            <label htmlFor="rv-comment">Your review (optional)</label>
            <textarea id="rv-comment" rows={4} maxLength={1000} placeholder="What did you like or dislike? How is the quality?" value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
            <small className="vx-sub">{form.comment.length}/1000</small>
          </div>
          <div className="vx-field">
            <label htmlFor="rv-photos">Photos (optional, up to 3)</label>
            <input id="rv-photos" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            <div className="vx-review-photos">
              {keepPhotos.map((url) => (
                <span key={url} style={{ position: "relative" }}>
                  <img src={url} alt="Your review" />
                  <button type="button" aria-label="Remove photo" onClick={() => setKeepPhotos(keepPhotos.filter((u) => u !== url))} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#11151b", color: "#fff", cursor: "pointer" }}>×</button>
                </span>
              ))}
              {previews.map((url, i) => (
                <span key={url} style={{ position: "relative" }}>
                  <img src={url} alt={`New photo ${i + 1}`} />
                  <button type="button" aria-label="Remove photo" onClick={() => setNewPhotos(newPhotos.filter((_, n) => n !== i))} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#11151b", color: "#fff", cursor: "pointer" }}>×</button>
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" className="vx-btn-dark" disabled={saving}>{saving ? "Saving..." : mine ? "Save changes" : "Submit review"}</button>
            <button type="button" className="vx-btn-outline" onClick={() => setEditing(false)}>Cancel</button>
            {mine && <button type="button" className="vx-btn-outline" style={{ color: "#b91c1c" }} onClick={remove}>Delete review</button>}
          </div>
        </form>
      )}

      {loading ? (
        <p className="vx-sub">Loading reviews...</p>
      ) : reviews.length === 0 ? (
        <p className="vx-sub">No reviews yet. Be the first to review this product after you receive it.</p>
      ) : (
        <>
          <label className="vx-sort" style={{ marginBottom: 8 }}>
            Sort by{" "}
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
              <option value="newest">Newest</option>
              <option value="highest">Highest rating</option>
              <option value="lowest">Lowest rating</option>
            </select>
          </label>
          <ul className="vx-review-list">
            {reviews.map((r) => (
              <li key={r._id}>
                <div className="vx-review-head">
                  <StarRating value={r.rating} />
                  {r.title && <strong>{r.title}</strong>}
                </div>
                {r.comment && <p>{r.comment}</p>}
                {r.photos?.length > 0 && (
                  <div className="vx-review-photos">
                    {r.photos.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Customer photo" /></a>
                    ))}
                  </div>
                )}
                <small>
                  {r.name} · {niceDate(r.createdAt)}{r.edited ? " (edited)" : ""}
                  {r.verified && <span className="vx-verified"><Icon name="check" size={13} strokeWidth={3} /> Verified purchase</span>}
                </small>
              </li>
            ))}
          </ul>
          {pagination.totalPages > 1 && (
            <div className="vx-review-pager">
              <button type="button" className="vx-btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button type="button" className="vx-btn-outline" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
