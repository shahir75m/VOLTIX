import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import { useShop } from "../../context/ShopContext";
import { apiFetch, apiForm } from "../../utils/api";
import { formatPrice } from "../../utils/format";

function UserReturnRequestContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, authChecked, showToast } = useShop();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedItems, setSelectedItems] = useState([]);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [refundMethod, setRefundMethod] = useState("Original payment method");
  const [photos, setPhotos] = useState([]); // up to 3 image files

  const addPhotos = (fileList) => {
    const next = [...photos];
    for (const file of Array.from(fileList || [])) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        showToast("Photos must be JPG, PNG or WebP", "error");
        continue;
      }
      if (file.size > 3 * 1024 * 1024) {
        showToast(`${file.name} is bigger than 3 MB`, "error");
        continue;
      }
      if (next.length >= 3) {
        showToast("You can attach up to 3 photos", "error");
        break;
      }
      next.push(file);
    }
    setPhotos(next);
  };

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const returnReasons = [
    "Defective / Damaged gadget",
    "Wrong item or variant delivered",
    "Quality not as expected",
    "Missing accessories or warranty card",
    "Item no longer needed",
  ];

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    const loadOrder = async () => {
      try {
        setLoading(true);
        const data = await apiFetch(`/api/orders/${id}`);
        if (data.success && data.order) {
          if (data.order.status !== "Delivered") {
            showToast("Returns are only eligible for delivered orders", "error");
            navigate(`/orders/${id}`, { replace: true });
            return;
          }
          setOrder(data.order);
          // Default select all items
          setSelectedItems(data.order.orderItems.map((i) => i._id));
        }
      } catch (err) {
        showToast(err.message || "Failed to load order", "error");
      } finally {
        setLoading(false);
      }
    };

    if (id) loadOrder();
  }, [id, user, authChecked, navigate, showToast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) {
      showToast("Please select a reason for the return", "error");
      return;
    }

    if (selectedItems.length === 0) {
      showToast("Select at least one item to return", "error");
      return;
    }

    try {
      setSubmitting(true);
      const body = new FormData();
      selectedItems.forEach((itemId) => body.append("itemIds", itemId));
      body.append("reason", reason);
      body.append("details", details);
      body.append("refundMethod", refundMethod);
      photos.forEach((file) => body.append("photos", file));
      const res = await apiForm(`/api/orders/${order._id}/return`, "POST", body);

      if (res.success) {
        showToast("Return request submitted successfully!", "success");
        navigate(`/orders/${order._id}`, { replace: true });
      }
    } catch (err) {
      showToast(err.message || "Failed to submit return request", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <div className="vx-page">
          <div className="vx-state">
            <strong>Loading order details...</strong>
          </div>
        </div>
      </>
    );
  }

  if (!order) return null;

  return (
    <>
      <div className="vx-page" style={{ maxWidth: "780px" }}>
        <div className="vx-breadcrumb">
          <Link to="/orders">My orders</Link>
          {" / "}
          <Link to={`/orders/${order._id}`}>Order #{order.orderId}</Link>
          {" / "}
          <span>Return</span>
        </div>

        <h1 className="vx-title">Request a return</h1>

        <form onSubmit={handleSubmit}>
          {/* 1. CHOOSE ITEMS TO RETURN */}
          <section className="vx-card-section">
            <h2>1. Choose items to return</h2>
            {order.orderItems.map((item) => {
              const isChecked = selectedItems.includes(item._id);
              return (
                <div
                  key={item._id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px 16px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
                    marginBottom: "10px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedItems([...selectedItems, item._id]);
                      else setSelectedItems(selectedItems.filter((i) => i !== item._id));
                    }}
                    style={{ width: "18px", height: "18px", accentColor: "#11151b" }}
                  />
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: "14px" }}>{item.name}</strong>
                    <span className="vx-sub" style={{ display: "block" }}>
                      Qty: {item.qty}
                    </span>
                  </div>
                  <strong>{formatPrice(item.lineTotal || item.price * item.qty)}</strong>
                </div>
              );
            })}
          </section>

          {/* 2. TELL US WHAT WENT WRONG */}
          <section className="vx-card-section">
            <h2>2. Tell us what went wrong</h2>

            <div className="vx-field">
              <label>Reason for return *</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} required>
                <option value="">Select a reason ▾</option>
                {returnReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="vx-field">
              <label>Details</label>
              <textarea
                placeholder="Describe the problem so we can process it faster."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>

            <div className="vx-field">
              <label>Photos (optional, up to 3)</label>
              <label
                htmlFor="return-photos"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addPhotos(e.dataTransfer.files);
                }}
                style={{ display: "block", border: "2px dashed #cbd5e1", borderRadius: "12px", padding: "26px", textAlign: "center", background: "#f8fafc", cursor: "pointer", color: "#64748b", fontSize: "14px" }}
              >
                Drop photos of the item or choose files
              </label>
              <input id="return-photos" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              {previews.length > 0 && (
                <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                  {previews.map((url, i) => (
                    <div key={url} style={{ position: "relative" }}>
                      <img src={url} alt={`Return photo ${i + 1}`} style={{ width: "84px", height: "84px", objectFit: "cover", borderRadius: "10px", border: "1px solid #e5e7eb" }} />
                      <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, n) => n !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", width: "22px", height: "22px", borderRadius: "50%", border: "none", background: "#11151b", color: "#fff", cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 3. HOW SHOULD WE REFUND YOU */}
          <section className="vx-card-section">
            <h2>3. How should we refund you?</h2>

            <div
              className={`vx-pay-option ${
                refundMethod === "Original payment method" ? "selected" : ""
              }`}
              onClick={() => setRefundMethod("Original payment method")}
            >
              <input
                type="radio"
                name="refund"
                checked={refundMethod === "Original payment method"}
                onChange={() => setRefundMethod("Original payment method")}
              />
              <div>
                <strong>Original payment method</strong>
                <span>For cash on delivery orders we ask for bank or UPI details after approval.</span>
              </div>
            </div>

            <div
              className={`vx-pay-option ${refundMethod === "Store credit" ? "selected" : ""}`}
              onClick={() => setRefundMethod("Store credit")}
            >
              <input
                type="radio"
                name="refund"
                checked={refundMethod === "Store credit"}
                onChange={() => setRefundMethod("Store credit")}
              />
              <div>
                <strong>Store credit</strong>
                <span>Use the balance on your next order.</span>
              </div>
            </div>
          </section>

          <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
            <button
              type="submit"
              className="vx-btn-dark"
              disabled={submitting}
              style={{ minWidth: "200px" }}
            >
              {submitting ? "Submitting..." : "Submit return request"}
            </button>
            <Link to={`/orders/${order._id}`} className="vx-btn-outline">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}

// useShop() only works INSIDE <StoreLayout>, so the page content lives in its own component.
export default function UserReturnRequest() {
  return (
    <StoreLayout>
      <UserReturnRequestContent />
    </StoreLayout>
  );
}
