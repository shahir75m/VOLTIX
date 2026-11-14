import { useCallback, useEffect, useState } from "react";
import usePageTitle from "../../hooks/usePageTitle";
import { Link, useNavigate } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import { useShop } from "../../context/ShopContext";
import { apiFetch, apiJson } from "../../utils/api";
import { formatPrice } from "../../utils/format";
import Icon from "../../components/Icon";

function CartContent() {
  usePageTitle("Cart");
  const navigate = useNavigate();
  const { user, authChecked, setCartCount, showToast } = useShop();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [checking, setChecking] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Coupon
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");

  const applyCart = useCallback(
    (next) => {
      setCart(next);
      setCartCount(next.lineCount);
    },
    [setCartCount]
  );

  useEffect(() => {
    if (!authChecked || !user) {
      if (authChecked) setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await apiFetch("/api/cart", { signal: controller.signal });
        applyCart(data.cart);
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [authChecked, user, applyCart, retryKey]);

  const changeQuantity = async (item, quantity) => {
    if (busyId) return;
    try {
      setBusyId(item.itemId);
      const data = await apiJson(`/api/cart/items/${item.itemId}`, "PATCH", { quantity });
      applyCart(data.cart);
    } catch (err) {
      showToast(err.message, "error");
      setRetryKey((k) => k + 1); // stock may have changed
    } finally {
      setBusyId("");
    }
  };

  const removeItem = async (item) => {
    if (busyId) return;
    try {
      setBusyId(item.itemId);
      const data = await apiFetch(`/api/cart/items/${item.itemId}`, { method: "DELETE" });
      applyCart(data.cart);
      showToast("Item removed from cart");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusyId("");
    }
  };

  const handleCheckout = async () => {
    if (!cart?.canCheckout || checking) return;
    try {
      setChecking(true);
      // the server re-checks stock and prices from the database
      const data = await apiJson("/api/cart/validate-checkout", "POST", { expectedTotal: cart.total });
      applyCart(data.cart);
      navigate("/checkout");
    } catch (err) {
      if (err.data?.cart) applyCart(err.data.cart);
      showToast(err.message, "error");
    } finally {
      setChecking(false);
    }
  };

  const handleCouponApply = (e) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setCouponMessage("Coupon will be applied at checkout");
  };

  if (!authChecked || (loading && !cart)) {
    return (
      <div className="vx-page">
        <h1 className="vx-title">Your cart</h1>
        <div className="vx-state">
          <strong>Loading your cart...</strong>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="vx-page">
        <h1 className="vx-title">Your cart</h1>
        <div className="vx-state">
          <strong>Please log in to see your cart</strong>
          <p>Your cart is saved to your account.</p>
          <Link to="/login" className="vx-btn-dark">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  if (error && !cart) {
    return (
      <div className="vx-page">
        <h1 className="vx-title">Your cart</h1>
        <div className="vx-state">
          <strong>We couldn’t load your cart</strong>
          <p>{error}</p>
          <button type="button" className="vx-btn-dark" onClick={() => setRetryKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="vx-page">
        <h1 className="vx-title">Your cart</h1>
        <div className="vx-state">
          <strong>Your cart is empty</strong>
          <p>Add a few gadgets and they will show up here.</p>
          <Link to="/products" className="vx-btn-dark">
            Continue shopping
          </Link>
        </div>
        <div className="vx-summary-disabled">
          <button type="button" className="vx-btn-lime" disabled>
            Proceed to checkout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vx-page">
      <h1 className="vx-title">Your cart</h1>

      <div className="vx-cart-layout">
        <div>
          {cart.items.map((item) => (
            <article key={item.itemId} className={`vx-cart-item ${item.valid ? "" : "invalid"}`}>
              <Link to={item.unavailable ? "/products" : `/products/${item.productId}`} className="vx-cart-img">
                {item.image ? <img src={item.image} alt={item.imageAlt || item.name} /> : <span className="vx-noimg">No image</span>}
              </Link>

              <div className="vx-cart-info">
                <span className="vx-eyebrow">{item.category}</span>
                <h3>{item.name}</h3>
                {item.variantLabel && <p className="vx-sub">{item.variantLabel}</p>}
                {!item.unavailable && <p className="vx-sub">{formatPrice(item.unitPrice)} each</p>}
                {item.issues.map((issue) => (
                  <p key={issue} className="vx-field-error">
                    {issue}
                  </p>
                ))}
                <button
                  type="button"
                  className="vx-remove"
                  onClick={() => removeItem(item)}
                  disabled={busyId === item.itemId}
                >
                  Remove
                </button>
              </div>

              {!item.unavailable && (
                <div className="vx-qty">
                  <button
                    type="button"
                    onClick={() => changeQuantity(item, item.quantity - 1)}
                    disabled={item.quantity <= 1 || busyId === item.itemId}
                    aria-label={`Decrease quantity of ${item.name}`}
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQuantity(item, item.quantity + 1)}
                    disabled={item.quantity >= item.maxQuantity || busyId === item.itemId}
                    aria-label={`Increase quantity of ${item.name}`}
                  >
                    +
                  </button>
                </div>
              )}

              <strong className="vx-line-total">{item.unavailable ? "—" : formatPrice(item.lineTotal)}</strong>
            </article>
          ))}

          <Link to="/products" className="vx-back">
            <Icon name="arrow-left" size={15} /> Continue shopping
          </Link>
        </div>

        <aside className="vx-summary">
          <h2>Order summary</h2>
          <div className="vx-sum-row">
            <span>Subtotal</span>
            <strong>{formatPrice(cart.subtotal)}</strong>
          </div>
          <div className="vx-sum-row">
            <span>Delivery</span>
            <strong className="vx-muted-strong">Calculated at checkout</strong>
          </div>

          {/* Coupon Code Section matching Cart.pdf */}
          <div className="vx-coupon-box">
            <label>Coupon code</label>
            <form className="vx-coupon-row" onSubmit={handleCouponApply}>
              <input
                type="text"
                placeholder="Enter code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
              />
              <button type="submit">Apply</button>
            </form>
            {couponMessage && <p className="vx-sub" style={{ marginTop: "4px" }}>{couponMessage}</p>}
          </div>

          <div className="vx-sum-total">
            <span>Total</span>
            <strong>{formatPrice(cart.total)}</strong>
          </div>

          {!cart.canCheckout && (
            <p className="vx-field-error" role="alert">
              Some items need your attention. Update or remove them to continue.
            </p>
          )}

          <button
            type="button"
            className="vx-btn-lime"
            disabled={!cart.canCheckout || checking}
            onClick={handleCheckout}
          >
            {checking ? "Checking..." : "Proceed to checkout"}
          </button>
        </aside>
      </div>
    </div>
  );
}

export default function UserCart() {
  return (
    <StoreLayout>
      <CartContent />
    </StoreLayout>
  );
}
