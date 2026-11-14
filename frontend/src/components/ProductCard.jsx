import { Link } from "react-router-dom";
import { useShop } from "../context/ShopContext";
import { formatPrice } from "../utils/format";
import StarRating from "./StarRating";
import Icon from "../components/Icon";

// One product tile (listing, related products). Uses the Home page card styles.
export default function ProductCard({ product }) {
  const { wishlistIds, toggleWishlist } = useShop();
  const wished = wishlistIds.includes(product._id);
  const badge = !product.inStock ? "Out of stock" : product.isBestSeller ? "Best seller" : product.isFeatured ? "Featured" : product.isOnSale ? "Sale" : product.isNew ? "New" : "";

  return (
    <article className={`voltix-store-product-card ${product.inStock ? "" : "vx-card-soldout"}`}>
      <div className="voltix-store-product-image">
        {badge && (
          <span className={`voltix-store-product-badge ${!product.inStock ? "vx-badge-out" : ""}`}>{badge}</span>
        )}

        <button
          type="button"
          className="voltix-store-wishlist-btn"
          onClick={() => toggleWishlist(product._id)}
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          aria-pressed={wished}
        >
          <Icon name="heart" size={18} filled={wished} />
        </button>

        <Link to={`/products/${product.slug || product._id}`} aria-label={product.name} tabIndex={-1}>
          {product.image ? (
            <img src={product.image} alt={product.imageAlt || product.name} loading="lazy" />
          ) : (
            <span className="vx-noimg">No image</span>
          )}
        </Link>
      </div>

      <div className="voltix-store-product-details">
        <span>{product.category?.name}{product.brand?.name ? ` · ${product.brand.name}` : ""}</span>
        <h3>
          <Link to={`/products/${product.slug || product._id}`}>{product.name}</Link>
        </h3>
        {product.ratingCount > 0 && <StarRating value={product.ratingAverage} count={product.ratingCount} small />}
        <div className="voltix-store-price">
          <strong>{product.priceFrom ? "From " : ""}{formatPrice(product.price)}</strong>
          {product.mrp > 0 && <del>{formatPrice(product.mrp)}</del>}
        </div>
      </div>
    </article>
  );
}
