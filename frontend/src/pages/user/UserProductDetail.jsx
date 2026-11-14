import { useEffect, useState } from "react";
import usePageTitle from "../../hooks/usePageTitle";
import { Link, useNavigate, useParams } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import ProductCard from "../../components/ProductCard";
import ProductVariantSelector from "../../components/ProductVariantSelector";
import StarRating from "../../components/StarRating";
import ShareButton from "../../components/ShareButton";
import RecentlyViewed from "../../components/RecentlyViewed";
import { rememberProduct } from "../../utils/recentlyViewed";
import ProductReviews from "../../components/ProductReviews";
import { BoughtTogether, DeliveryChecker, KeySpecStrip, ProductOffers, ProductVideo, SpecTable, TrustBadges } from "../../components/ProductExtras";
import Icon from "../../components/Icon";
import { useShop } from "../../context/ShopContext";
import { apiFetch, apiJson } from "../../utils/api";
import { formatPrice } from "../../utils/format";

function DetailContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, wishlistIds, setWishlistIds, setCartCount, toggleWishlist, showToast, requireLogin } = useShop();

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const [imageIndex, setImageIndex] = useState(0);
  const [zoom, setZoom] = useState({ on: false, x: 50, y: 50 });
  const [selection, setSelection] = useState({}); // { Colour: "Black", Storage: "128 GB" }
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  usePageTitle(product?.name);

  useEffect(() => {
    const controller = new AbortController();
    window.scrollTo({ top: 0 });

    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await apiFetch(`/api/products/${id}`, { signal: controller.signal });
        setProduct(data.product);
        rememberProduct(data.product);
        setRelated(data.relatedProducts);
        setImageIndex(0);
        setQuantity(1);
        const first = data.product.variants.find((v) => v.inStock) || data.product.variants[0];
        setSelection(first ? Object.fromEntries(first.attributes.map((a) => [a.name, a.value])) : {});
        if (first?.image) setImageIndex(Math.max(0, data.product.images.indexOf(first.image)));
      } catch (err) {
        if (err.name === "AbortError") return;
        if (err.status === 404) {
          // unavailable / deleted / unpublished product -> back to the listing
          navigate("/products", { replace: true, state: { message: err.message, type: "error" } });
          return;
        }
        setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [id, navigate, retryKey]);

  if (loading && !product) {
    return (
      <div className="vx-page" role="status" aria-busy="true" aria-label="Loading product">
        <div className="voltix-store-product-grid vx-grid-3">
          <div className="vx-skeleton" style={{ minHeight: 320 }} />
          <div className="vx-skeleton" style={{ minHeight: 320 }} />
          <div className="vx-skeleton" style={{ minHeight: 320 }} />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="vx-page">
        <div className="vx-state">
          <strong>We couldn’t load this product</strong>
          <p>{error}</p>
          <button type="button" className="vx-btn-dark" onClick={() => setRetryKey((k) => k + 1)}>Try again</button>
        </div>
      </div>
    );
  }

  const selectedVariant =
    product.variants.find((v) => v.attributes.every((a) => selection[a.name] === a.value)) || null;

  // price / stock shown on the page follow the selected variant
  const shown = selectedVariant || product;
  const available = product.hasVariants ? Boolean(selectedVariant?.inStock) : product.inStock;
  const stockLeft = product.hasVariants ? selectedVariant?.stockLeft ?? null : product.stockLeft;
  const maxQty = Math.max(1, (product.hasVariants ? selectedVariant?.maxQuantity : product.maxQuantity) || 1);
  const wished = wishlistIds.includes(product._id);
  const images = product.images;
  const saving = shown.mrp > shown.price ? shown.mrp - shown.price : 0;

  const selectVariant = (variant) => {
    if (!variant || adding) return;
    setSelection(Object.fromEntries(variant.attributes.map((a) => [a.name, a.value])));
    setImageIndex(Math.max(0, images.indexOf(variant.image)));
    setZoom({ on: false, x: 50, y: 50 });
    setQuantity((q) => Math.min(q, Math.max(1, variant.maxQuantity || 1)));
  };

  // returns true when the item is in the cart (used by "Add to cart" and "Buy now")
  const addToCart = async ({ silent = false } = {}) => {
    if (!user) return requireLogin();
    if (adding) return false;
    if (product.hasVariants && !selectedVariant) {
      showToast("Please select all product options", "error");
      return false;
    }

    try {
      setAdding(true);
      const data = await apiJson("/api/cart/items", "POST", {
        productId: product._id,
        variantId: product.hasVariants ? selectedVariant._id : undefined,
        quantity,
      });
      setCartCount(data.cart.lineCount);
      if (data.removedFromWishlist) setWishlistIds((prev) => prev.filter((x) => x !== product._id));
      if (!silent) showToast(data.removedFromWishlist ? "Added to cart and removed from wishlist" : data.message);
      return true;
    } catch (err) {
      if (err.status === 401) return requireLogin();
      showToast(err.message, "error");
      if (err.status === 404) navigate("/products", { replace: true, state: { message: err.message, type: "error" } });
      else setRetryKey((k) => k + 1); // stock may have changed – reload fresh data
      return false;
    } finally {
      setAdding(false);
    }
  };

  const handleAddToCart = () => addToCart();

  // Buy now = put it in the cart and open the checkout page straight away
  const handleBuyNow = async () => {
    if (await addToCart({ silent: true })) navigate("/checkout");
  };

  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setZoom({
      on: true,
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  };

  const brandName = product.brand?.name;

  return (
    <div className="vx-page vx-product-detail-page">
      <nav className="vx-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link> <Icon name="arrow-right" size={11} />{" "}
        <Link to={`/products?category=${product.category._id}`}>{product.category.name}</Link> <Icon name="arrow-right" size={11} />{" "}
        <span>{product.name}</span>
      </nav>

      <div className="vx-detail">
        {/* GALLERY: thumbnails on the left, big zoomable picture on the right (like Amazon / Flipkart) */}
        <div className="vx-gallery">
          {images.length > 1 && (
            <div className="vx-thumbs">
              {images.map((src, i) => (
                <button key={src} type="button" className={i === imageIndex ? "active" : ""} onMouseEnter={() => setImageIndex(i)} onClick={() => { setImageIndex(i); setZoom((z) => ({ ...z, on: false })); }} aria-label={`Show image ${i + 1}`}>
                  <img src={src} alt={product.imageDetails?.[i]?.alt || product.name} />
                </button>
              ))}
            </div>
          )}
          <div
            className="vx-zoom"
            onMouseMove={onMove}
            onMouseLeave={() => setZoom((z) => ({ ...z, on: false }))}
            onClick={() => setZoom((z) => ({ ...z, on: !z.on }))}
            role="img"
            aria-label={`${product.name} image ${imageIndex + 1} of ${images.length || 1}. Hover or tap to zoom.`}
          >
            {images[imageIndex] ? (
              <img
                src={images[imageIndex]}
                alt={product.imageDetails?.[imageIndex]?.alt || product.name}
                draggable={false}
                style={{ transform: zoom.on ? "scale(2.2)" : "scale(1)", transformOrigin: `${zoom.x}% ${zoom.y}%` }}
              />
            ) : (
              <span className="vx-noimg">No image</span>
            )}
            {images[imageIndex] && !zoom.on && <span className="vx-zoom-hint">Hover to zoom</span>}
          </div>
        </div>

        {/* INFO */}
        <div className="vx-info">
          {brandName && <Link className="vx-brand-link" to={`/products?brand=${product.brand._id}`}>{brandName}</Link>}
          <h1>{product.name}</h1>

          <div className="vx-rating-share">
            <a href="#reviews" className="vx-rating-link">
              {product.ratingCount > 0 ? <StarRating value={product.ratingAverage} count={product.ratingCount} /> : <span className="vx-sub">No reviews yet</span>}
            </a>
            <div className="vx-icon-row">
              <button type="button" className={`vx-icon-btn ${wished ? "on" : ""}`} onClick={() => toggleWishlist(product._id)} aria-pressed={wished} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"} title={wished ? "In your wishlist" : "Add to wishlist"}>
                <Icon name="heart" size={18} filled={wished} />
              </button>
              <ShareButton title={product.name} path={`/products/${product.slug || product._id}`} productId={product._id} />
            </div>
          </div>

          {(product.isFeatured || product.isNew || product.isBestSeller) && (
            <div className="vx-product-labels">{product.isBestSeller && <span>Best seller</span>}{product.isNew && <span>New</span>}{product.isFeatured && <span>Featured</span>}</div>
          )}

          <div className="vx-price-box">
            <div className="vx-detail-price">
              {shown.discountPercent > 0 && <span className="vx-off">-{shown.discountPercent}%</span>}
              <strong>{formatPrice(shown.price)}</strong>
              {shown.mrp > 0 && shown.mrp > shown.price && <del>M.R.P. {formatPrice(shown.mrp)}</del>}
            </div>
            <p className="vx-sub">Inclusive of all taxes{product.gstPercent ? ` (GST ${product.gstPercent}%)` : ""}</p>
            {saving > 0 && <p className="vx-save">You save {formatPrice(saving)}</p>}
          </div>

          <ProductOffers />

          <span className={`vx-stock ${available ? (stockLeft ? "low" : "in") : "out"}`}>
            {!available ? "Out of stock" : stockLeft ? `Only ${stockLeft} left in stock` : "In stock"}
          </span>

          <ProductVariantSelector product={product} selectedVariant={selectedVariant} onSelect={selectVariant} disabled={adding} />

          {available && (
            <div className="vx-qty-block">
              <p>Quantity</p>
              <div className="vx-qty">
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Decrease quantity">−</button>
                <span aria-live="polite">{quantity}</span>
                <button type="button" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty} aria-label="Increase quantity">+</button>
              </div>
              {quantity >= maxQty && <small className="vx-sub">Maximum {maxQty} per order</small>}
            </div>
          )}

          <div className="vx-actions">
            <button type="button" className="vx-btn-dark" onClick={handleAddToCart} disabled={!available || adding}>
              {adding ? "Adding..." : available ? "Add to cart" : "Out of stock"}
            </button>
            <button type="button" className="vx-btn-lime vx-buy-now" onClick={handleBuyNow} disabled={!available || adding}>Buy now</button>
          </div>

          <DeliveryChecker codAvailable={product.codAvailable} />

          <TrustBadges product={product} />

          {product.keyFeatures?.length > 0 && (
            <div className="vx-about">
              <h2>About this item</h2>
              <ul className="vx-features">{product.keyFeatures.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
          <KeySpecStrip highlights={product.highlights} />
        </div>
      </div>

      {/* sticky section tabs, like the big shopping sites */}
      <nav className="vx-detail-tabs" aria-label="Product sections">
        <a href="#overview">Overview</a>
        <a href="#specs">Specifications</a>
        <a href="#reviews">Reviews{product.ratingCount > 0 ? ` (${product.ratingCount})` : ""}</a>
      </nav>

      <div id="overview" className="vx-anchor">
        {(product.description || product.shortDescription) && (
          <section className="vx-panel">
            <h2>About this product</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{product.description || product.shortDescription}</p>
            {product.modelNumber && <p className="vx-sub">Model number: {product.modelNumber}</p>}
          </section>
        )}
        <ProductVideo url={product.videoUrl} title={product.name} />
        {product.boxContents?.length > 0 && <section className="vx-panel"><h2>What's in the box</h2><ul>{product.boxContents.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        {product.tags?.length > 0 && <div className="vx-product-labels">{product.tags.map((tag) => <Link key={tag} to={`/products?tag=${encodeURIComponent(tag)}`}>{tag}</Link>)}</div>}
      </div>

      <div id="specs" className="vx-anchor"><SpecTable product={product} /></div>

      <ProductReviews productId={product._id} onChanged={() => setRetryKey((k) => k + 1)} />

      <BoughtTogether productId={product._id} />

      {related.length > 0 && (
        <section>
          <h2 className="vx-h2">You may also like</h2>
          <div className="voltix-store-product-grid">
            {related.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        </section>
      )}
      <RecentlyViewed currentId={product._id} />
    </div>
  );
}

export default function UserProductDetail() {
  return (
    <StoreLayout>
      <DetailContent />
    </StoreLayout>
  );
}
