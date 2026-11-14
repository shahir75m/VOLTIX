import { useCallback, useEffect, useRef, useState } from "react";
import usePageTitle from "../../hooks/usePageTitle";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import { useShop } from "../../context/ShopContext";
import { apiFetch, apiJson } from "../../utils/api";
import { payForOrder } from "../../utils/razorpay";
import { formatPrice } from "../../utils/format";
import Icon from "../../components/Icon";

const EMPTY_ADDRESS = {
  addressType: "Home",
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
};

const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

function UserCheckoutContent() {
  usePageTitle("Checkout");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCoupon = searchParams.get("coupon") || "";
  const { user, authChecked, showToast } = useShop();

  const [cart, setCart] = useState(null);
  const [summary, setSummary] = useState(null); // amounts calculated by the server
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // One key per checkout attempt: clicking "Place order" twice can never create two orders
  const idempotencyKey = useRef(newKey());

  // Addresses
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [savingAddress, setSavingAddress] = useState(false);
  const [pincodeMsg, setPincodeMsg] = useState("");

  // Payment choice shown to the customer: "COD" | "UPI" | "Card" (UPI and card both go through Razorpay)
  const [paymentChoice, setPaymentChoice] = useState("COD");
  const paymentMethod = paymentChoice === "COD" || paymentChoice === "Wallet" ? paymentChoice : "Razorpay";

  // Coupon
  const [couponCode, setCouponCode] = useState(urlCoupon);
  const [appliedCode, setAppliedCode] = useState("");
  const [couponError, setCouponError] = useState("");

  const loadSummary = useCallback(async (code) => {
    const res = await apiJson("/api/orders/summary", "POST", { couponCode: code || "" });
    setSummary(res);
    return res;
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      navigate("/login", { replace: true, state: { message: "Please log in to checkout" } });
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [cartRes, addrRes] = await Promise.all([apiFetch("/api/cart"), apiFetch("/api/addresses")]);

        if (!cartRes.cart || cartRes.cart.items.length === 0) {
          navigate("/cart", { replace: true });
          return;
        }
        setCart(cartRes.cart);
        const first = await loadSummary("");

        // coming from the Offers page with "Use in cart"
        if (urlCoupon) {
          try {
            const applied = await apiJson("/api/orders/apply-coupon", "POST", { code: urlCoupon });
            setAppliedCode(applied.code);
            setSummary({ ...first, totals: applied.totals });
            showToast(applied.message, "success");
          } catch (err) {
            setCouponError(err.message);
          }
        }

        const addresses = addrRes.addresses || [];
        setSavedAddresses(addresses);
        const def = addresses.find((a) => a.isDefault) || addresses[0];
        if (def) setSelectedAddressId(def._id);
        else setShowForm(true);
      } catch (err) {
        showToast(err.message || "Failed to load checkout details", "error");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, authChecked, navigate, showToast, loadSummary, urlCoupon]);

  // ---------------------------------------------------------------- address form
  const openAddForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_ADDRESS, fullName: user?.name || "" });
    setPincodeMsg("");
    setShowForm(true);
  };

  const openEditForm = (addr) => {
    setEditingId(addr._id);
    setForm({
      addressType: addr.addressType || "Home",
      fullName: addr.fullName || "",
      phone: addr.phone || "",
      addressLine1: addr.addressLine1 || "",
      addressLine2: addr.addressLine2 || "",
      city: addr.city || "",
      district: addr.district || "",
      state: addr.state || "",
      pincode: addr.pincode || "",
    });
    setPincodeMsg("");
    setShowForm(true);
  };

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handlePincode = async (value) => {
    const pincode = value.replace(/\D/g, "").slice(0, 6);
    setField("pincode", pincode);
    setPincodeMsg("");
    if (pincode.length !== 6) return;
    try {
      setPincodeMsg("Checking pincode...");
      const data = await apiFetch(`/api/addresses/pincode/${pincode}`);
      setForm((prev) => (prev.pincode === pincode ? { ...prev, state: data.state, district: data.district } : prev));
      setPincodeMsg("");
    } catch (err) {
      setPincodeMsg(err.message || "Invalid pincode");
    }
  };

  const handleSaveAddress = async () => {
    if (savingAddress) return;
    const { fullName, phone, addressLine1, city, district, state, pincode } = form;
    if (!fullName.trim() || !phone || !addressLine1.trim() || !city.trim() || !state || !pincode) {
      showToast("Please fill in all required address fields", "error");
      return;
    }
    if (!district) {
      showToast("Enter a valid pincode so we can verify the district and state", "error");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      showToast("Please enter a valid 10-digit mobile number", "error");
      return;
    }
    if (!/^[1-9]\d{5}$/.test(pincode)) {
      showToast("Please enter a valid 6-digit pincode", "error");
      return;
    }

    try {
      setSavingAddress(true);
      const res = editingId
        ? await apiJson(`/api/addresses/${editingId}`, "PUT", form)
        : await apiJson("/api/addresses", "POST", form);
      const saved = res.address;
      setSavedAddresses((prev) =>
        editingId ? prev.map((a) => (a._id === saved._id ? saved : a)) : [saved, ...prev]
      );
      setSelectedAddressId(saved._id);
      setShowForm(false);
      setEditingId(null);
      showToast(res.message || "Address saved", "success");
    } catch (err) {
      showToast(err.message || "Failed to save address", "error");
    } finally {
      setSavingAddress(false);
    }
  };

  // ---------------------------------------------------------------- coupon
  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    try {
      setCouponError("");
      const res = await apiJson("/api/orders/apply-coupon", "POST", { code: couponCode.trim() });
      setAppliedCode(res.code);
      setSummary((prev) => ({ ...prev, totals: res.totals }));
      showToast(res.message, "success");
    } catch (err) {
      setCouponError(err.message || "Failed to apply coupon");
    }
  };

  const handleRemoveCoupon = async () => {
    setAppliedCode("");
    setCouponCode("");
    setCouponError("");
    try {
      await loadSummary("");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ---------------------------------------------------------------- place order
  const handlePlaceOrder = async () => {
    if (submitting) return;

    if (showForm) {
      showToast("Please save the address first", "error");
      return;
    }
    if (!savedAddresses.find((a) => a._id === selectedAddressId)) {
      showToast("Please select a delivery address", "error");
      return;
    }

    try {
      setSubmitting(true);

      // Only choices are sent. The server reads the cart and calculates every price itself.
      const res = await apiJson("/api/orders", "POST", {
        addressId: selectedAddressId,
        paymentMethod,
        couponCode: appliedCode,
        expectedCartTotal: cart.total,
        idempotencyKey: idempotencyKey.current,
      });

      const order = res.order;

      if (paymentMethod === "COD" || order.isPaid) {
        navigate(`/order/success/${order._id}`, { replace: true });
        return;
      }

      const result = await payForOrder({ order, gateway: res, user, preferredMethod: paymentChoice });
      if (result.status === "paid") {
        navigate(`/order/success/${order._id}`, { replace: true });
      } else {
        navigate(`/order/failed/${order._id}`, { replace: true, state: { soldOut: result.status === "soldout" } });
      }
    } catch (err) {
      showToast(err.message || "Failed to place order", "error");
      // cart changed (409): reload so the customer sees the new prices
      if (err.status === 409) {
        try {
          const cartRes = await apiFetch("/api/cart");
          setCart(cartRes.cart);
          await loadSummary(appliedCode);
        } catch {
          /* ignore */
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !cart || !summary) {
    return (
      <>
        <div className="vx-page">
          <div className="vx-state">
            <strong>Preparing checkout...</strong>
          </div>
        </div>
      </>
    );
  }

  const totals = summary.totals;
  const codBlocked = summary.codAvailable === false;
  const onlineBlocked = summary.onlinePaymentAvailable === false;

  return (
    <>
      <div className="vx-page">
        <h1 className="vx-title">Checkout</h1>

        <div className="vx-checkout-layout">
          {/* LEFT: Address & Payment */}
          <div className="vx-checkout-main">
            {/* 1. DELIVERY ADDRESS */}
            <section className="vx-card-section">
              <h2>1. Delivery address</h2>

              {savedAddresses.map((addr) => {
                const isSelected = !showForm && selectedAddressId === addr._id;
                return (
                  <div
                    key={addr._id}
                    className={`vx-address-select-card ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedAddressId(addr._id);
                      setShowForm(false);
                    }}
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={isSelected}
                      onChange={() => {
                        setSelectedAddressId(addr._id);
                        setShowForm(false);
                      }}
                      id={`addr_${addr._id}`}
                    />
                    <div style={{ flex: 1 }}>
                      <strong>{addr.addressType || "Home"}</strong>
                      <p className="vx-sub" style={{ marginTop: "4px" }}>
                        {addr.addressLine1}
                        {addr.addressLine2 ? `, ${addr.addressLine2}` : ""}, {addr.city}, {addr.state} – {addr.pincode}
                      </p>
                      <p className="vx-sub" style={{ marginTop: "2px" }}>
                        Recipient: {addr.fullName} · {addr.phone}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="vx-btn-outline"
                      style={{ minHeight: "32px", padding: "0 12px", fontSize: "12px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditForm(addr);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                );
              })}

              <div className={`vx-address-select-card ${showForm && !editingId ? "selected" : ""}`} onClick={openAddForm}>
                <input type="radio" name="address" checked={showForm && !editingId} onChange={openAddForm} id="addr_new" />
                <div>
                  <strong>Deliver to a new address</strong>
                </div>
              </div>

              {showForm && (
                <div style={{ marginTop: "16px", padding: "16px", background: "#f9fafb", borderRadius: "10px" }}>
                  {editingId && <h3 style={{ margin: "0 0 12px", fontSize: "15px" }}>Edit address</h3>}
                  <div className="vx-form-grid-2">
                    <div className="vx-field">
                      <label>Full name</label>
                      <input type="text" maxLength={60} value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} />
                    </div>
                    <div className="vx-field">
                      <label>Phone number</label>
                      <input
                        type="text"
                        placeholder="10-digit mobile number"
                        value={form.phone}
                        maxLength={10}
                        onChange={(e) => setField("phone", e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  </div>

                  <div className="vx-field">
                    <label>Address line 1</label>
                    <input type="text" placeholder="House no., street" maxLength={200} value={form.addressLine1} onChange={(e) => setField("addressLine1", e.target.value)} />
                  </div>

                  <div className="vx-field">
                    <label>Address line 2</label>
                    <input type="text" placeholder="Area, landmark (optional)" maxLength={200} value={form.addressLine2} onChange={(e) => setField("addressLine2", e.target.value)} />
                  </div>

                  <div className="vx-form-grid-3">
                    <div className="vx-field">
                      <label>City</label>
                      <input type="text" placeholder="City" maxLength={100} value={form.city} onChange={(e) => setField("city", e.target.value)} />
                    </div>
                    <div className="vx-field">
                      <label>State</label>
                      <input type="text" placeholder="State" maxLength={100} value={form.state} onChange={(e) => setField("state", e.target.value)} />
                    </div>
                    <div className="vx-field">
                      <label>Pincode</label>
                      <input type="text" placeholder="6-digit pincode" value={form.pincode} maxLength={6} onChange={(e) => handlePincode(e.target.value)} />
                    </div>
                  </div>
                  {form.district && <p className="vx-sub">District: {form.district} (filled from the pincode)</p>}
                  {pincodeMsg && <p className="vx-field-error">{pincodeMsg}</p>}

                  <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                    <button type="button" className="vx-btn-dark" disabled={savingAddress} onClick={handleSaveAddress}>
                      {savingAddress ? "Saving..." : "Save & deliver here"}
                    </button>
                    {savedAddresses.length > 0 && (
                      <button type="button" className="vx-btn-outline" onClick={() => setShowForm(false)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* 2. PAYMENT METHOD */}
            <section className="vx-card-section">
              <h2>2. Payment method</h2>

              <div
                className={`vx-pay-option ${paymentChoice === "COD" ? "selected" : ""}`}
                style={codBlocked ? { opacity: 0.5 } : undefined}
                onClick={() => !codBlocked && setPaymentChoice("COD")}
              >
                <input type="radio" name="payment" disabled={codBlocked} checked={paymentChoice === "COD"} onChange={() => setPaymentChoice("COD")} id="pay_cod" />
                <div>
                  <strong>Cash on delivery</strong>
                  <span>{codBlocked ? "Not available for one or more items in your cart." : "Pay in cash when the order arrives."}</span>
                </div>
              </div>

              <div
                className={`vx-pay-option ${paymentChoice === "Wallet" ? "selected" : ""}`}
                style={Number(summary.walletBalance || 0) < Number(summary.totals?.totalPrice || 0) ? { opacity: 0.5 } : undefined}
                onClick={() => Number(summary.walletBalance || 0) >= Number(summary.totals?.totalPrice || 0) && setPaymentChoice("Wallet")}
              >
                <input type="radio" name="payment" disabled={Number(summary.walletBalance || 0) < Number(summary.totals?.totalPrice || 0)} checked={paymentChoice === "Wallet"} onChange={() => setPaymentChoice("Wallet")} id="pay_wallet" />
                <div>
                  <strong>Wallet balance · {formatPrice(summary.walletBalance || 0)}</strong>
                  <span>{Number(summary.walletBalance || 0) >= Number(summary.totals?.totalPrice || 0) ? "Pay instantly using your VORTIX store credit." : "Insufficient wallet balance. Choose COD or online payment."}</span>
                </div>
              </div>

              <div
                className={`vx-pay-option ${paymentChoice === "UPI" ? "selected" : ""}`}
                style={onlineBlocked ? { opacity: 0.5 } : undefined}
                onClick={() => !onlineBlocked && setPaymentChoice("UPI")}
              >
                <input type="radio" name="payment" disabled={onlineBlocked} checked={paymentChoice === "UPI"} onChange={() => setPaymentChoice("UPI")} id="pay_upi" />
                <div>
                  <strong>UPI</strong>
                  <span>{onlineBlocked ? "Online payment is unavailable until Razorpay is configured." : "Pay with any UPI app through secure checkout."}</span>
                </div>
              </div>

              <div
                className={`vx-pay-option ${paymentChoice === "Card" ? "selected" : ""}`}
                style={onlineBlocked ? { opacity: 0.5 } : undefined}
                onClick={() => !onlineBlocked && setPaymentChoice("Card")}
              >
                <input type="radio" name="payment" disabled={onlineBlocked} checked={paymentChoice === "Card"} onChange={() => setPaymentChoice("Card")} id="pay_card" />
                <div>
                  <strong>Credit / debit card</strong>
                  <span>Opens the secure payment window.</span>
                </div>
              </div>
            </section>

            <Link to="/cart" className="vx-back">
              <Icon name="arrow-left" size={15} /> Back to cart
            </Link>
          </div>

          {/* RIGHT: Order summary */}
          <aside className="vx-summary">
            <h2>Order summary</h2>

            <div style={{ marginBottom: "16px" }}>
              {cart.items.map((item) => (
                <div key={item.itemId} className="vx-order-summary-item">
                  <span>
                    {item.name}
                    {item.variantLabel ? ` (${item.variantLabel})` : ""} × {item.quantity}
                  </span>
                  <strong>{formatPrice(item.lineTotal)}</strong>
                </div>
              ))}
            </div>

            <div className="vx-sum-row">
              <span>Subtotal</span>
              <strong>{formatPrice(totals.itemsPrice)}</strong>
            </div>

            <div className="vx-sum-row">
              <span>Delivery</span>
              <strong className="vx-muted-strong">{totals.shippingPrice ? formatPrice(totals.shippingPrice) : "Free"}</strong>
            </div>

            {totals.discountPrice > 0 && (
              <div className="vx-sum-row">
                <span>Discount ({totals.couponCode})</span>
                <strong className="vx-save">-{formatPrice(totals.discountPrice)}</strong>
              </div>
            )}

            {totals.taxPrice > 0 && (
              <div className="vx-sum-row">
                <span>GST (included in price)</span>
                <strong className="vx-muted-strong">{formatPrice(totals.taxPrice)}</strong>
              </div>
            )}

            <div className="vx-coupon-box">
              <label>Coupon code</label>
              {appliedCode ? (
                <p className="vx-save">
                  <Icon name="check" size={14} strokeWidth={3} /> {appliedCode} applied{" "}
                  <button type="button" onClick={handleRemoveCoupon} style={{ background: "none", border: "none", color: "#991b1b", cursor: "pointer", fontSize: "12px" }}>
                    Remove
                  </button>
                </p>
              ) : (
                <form className="vx-coupon-row" onSubmit={handleApplyCoupon}>
                  <input type="text" placeholder="Enter code" maxLength={20} value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} />
                  <button type="submit">Apply</button>
                </form>
              )}
              {couponError && <p className="vx-field-error">{couponError}</p>}
              <Link to="/offers" className="vx-sub" style={{ fontSize: "12px", textDecoration: "underline" }}>See available coupons</Link>
            </div>

            <div className="vx-sum-total">
              <span>Total payable</span>
              <strong>{formatPrice(totals.totalPrice)}</strong>
            </div>

            <button type="button" className="vx-btn-lime" disabled={submitting || !summary.canCheckout} onClick={handlePlaceOrder}>
              {submitting ? "Please wait..." : paymentMethod === "COD" || paymentMethod === "Wallet" ? "Place order" : "Pay & place order"}
            </button>
            {!summary.canCheckout && (
              <p className="vx-field-error" style={{ textAlign: "center" }}>
                Some items in your cart are unavailable. Please review your cart.
              </p>
            )}

            <p className="vx-sub" style={{ marginTop: "12px", textAlign: "center", fontSize: "11px" }}>
              By placing your order you agree to the terms and return policy.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}

// useShop() only works INSIDE <StoreLayout>, so the page content lives in its own component.
export default function UserCheckout() {
  return (
    <StoreLayout>
      <UserCheckoutContent />
    </StoreLayout>
  );
}
