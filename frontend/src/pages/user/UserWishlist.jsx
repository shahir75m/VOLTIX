import { useEffect, useState } from "react";
import usePageTitle from "../../hooks/usePageTitle";
import { Link, useNavigate } from "react-router-dom";
import { useShop } from "../../context/ShopContext";
import { apiFetch, apiJson } from "../../utils/api";
import { formatPrice } from "../../utils/format";
import Icon from "../../components/Icon";

function WishlistContent() {
  usePageTitle("Wishlist");
  const navigate = useNavigate();
  const { user, authChecked, setWishlistIds, setCartCount, showToast } = useShop();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [retryKey, setRetryKey] = useState(0);

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
        const data = await apiFetch("/api/wishlist", { signal: controller.signal });
        setProducts(data.products);
        setWishlistIds(data.products.map((p) => p._id));
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [authChecked, user, setWishlistIds, retryKey]);

  const removeLocal = (id) => {
    setProducts((prev) => prev.filter((p) => p._id !== id));
    setWishlistIds((prev) => prev.filter((x) => x !== id));
  };

  const handleRemove = async (product) => {
    if (busyId) return;
    try {
      setBusyId(product._id);
      await apiFetch(`/api/wishlist/${product._id}`, { method: "DELETE" });
      removeLocal(product._id);
      showToast("Removed from wishlist");
    } catch (err) {
      showToast(err.message, "error");
      setRetryKey((k) => k + 1);
    } finally {
      setBusyId("");
    }
  };

  const handleMoveToCart = async (product) => {
    if (busyId) return;
    if (product.hasVariants) {
      showToast("Please choose the product options first", "error");
      navigate(`/products/${product._id}`);
      return;
    }
    try {
      setBusyId(product._id);
      // the server removes the product from the wishlist when it is added to the cart
      const data = await apiJson("/api/cart/items", "POST", { productId: product._id, quantity: 1 });
      setCartCount(data.cart.lineCount);
      removeLocal(product._id);
      showToast("Moved to cart");
    } catch (err) {
      showToast(err.message, "error");
      setRetryKey((k) => k + 1);
    } finally {
      setBusyId("");
    }
  };

  let body;
  if (!authChecked || loading) {
    body = <div className="vx-state"><strong>Loading your wishlist...</strong></div>;
  } else if (!user) {
    body = (
      <div className="vx-state">
        <strong>Please log in to see your wishlist</strong>
        <p>Saved products are kept in your account.</p>
        <Link to="/login" className="vx-btn-dark">Log in</Link>
      </div>
    );
  } else if (error) {
    body = (
      <div className="vx-state">
        <strong>We couldn’t load your wishlist</strong>
        <p>{error}</p>
        <button type="button" className="vx-btn-dark" onClick={() => setRetryKey((k) => k + 1)}>Try again</button>
      </div>
    );
  } else if (products.length === 0) {
    body = (
      <div className="vx-state">
        <strong>Your wishlist is empty</strong>
        <p>Tap the heart on any product to save it here.</p>
        <Link to="/products" className="vx-btn-dark">Browse products</Link>
      </div>
    );
  } else {
    body = (
      <div className="vx-wish-grid">
        {products.map((product) => (
          <div key={product._id}>
            <article className="voltix-store-product-card">
              <div className="voltix-store-product-image">
                {!product.inStock ? (
                  <span className="voltix-store-product-badge vx-badge-out">Out of stock</span>
                ) : product.isOnSale ? (
                  <span className="voltix-store-product-badge">Sale</span>
                ) : null}
                <button type="button" className="voltix-store-wishlist-btn" onClick={() => handleRemove(product)} aria-label={`Remove ${product.name} from wishlist`}><Icon name="heart" size={16} filled /></button>
                <Link to={`/products/${product._id}`} tabIndex={-1} aria-label={product.name}>
                  {product.image ? <img src={product.image} alt={product.imageAlt || product.name} loading="lazy" /> : <span className="vx-noimg">No image</span>}
                </Link>
              </div>
              <div className="voltix-store-product-details">
                <span>{product.category?.name}</span>
                <h3><Link to={`/products/${product._id}`}>{product.name}</Link></h3>
                <div className="voltix-store-price">
                  <strong>{product.priceFrom ? "From " : ""}{formatPrice(product.price)}</strong>
                  {product.mrp > 0 && <del>{formatPrice(product.mrp)}</del>}
                </div>
              </div>
            </article>
            <div className="vx-wish-actions">
              <button type="button" className="vx-btn-dark" disabled={!product.inStock || busyId === product._id} onClick={() => handleMoveToCart(product)}>
                {!product.inStock ? "Out of stock" : product.hasVariants ? "Choose options" : "Move to cart"}
              </button>
              <button type="button" className="vx-btn-remove" disabled={busyId === product._id} onClick={() => handleRemove(product)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section>
      <h2 className="vx-h2" style={{ marginTop: 0 }}>Wishlist</h2>
      {body}
    </section>
  );
}

export default function UserWishlist() {
  return <WishlistContent />;
}
