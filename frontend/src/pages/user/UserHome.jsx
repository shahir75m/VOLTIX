import { useEffect, useState } from "react";
import usePageTitle from "../../hooks/usePageTitle";
import { Link } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import ProductCard from "../../components/ProductCard";
import { useShop } from "../../context/ShopContext";
import { apiFetch } from "../../utils/api";
import heroImage from "../../assets/hero.png";
import OfferBannerSlider from "../../components/OfferBannerSlider";
import "./UserHome.css";
import Icon from "../../components/Icon";

function HomeContent() {
  usePageTitle();
  const { categories } = useShop();
  const [data, setData] = useState({ products: [], featured: [], bestSellers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError("");
        const [latest, featured, best] = await Promise.all([
          apiFetch("/api/products", { signal: controller.signal }),
          apiFetch("/api/products?featured=true", { signal: controller.signal }),
          apiFetch("/api/products?bestSeller=true", { signal: controller.signal }),
        ]);
        setData({ products: latest.products, featured: featured.products, bestSellers: best.products });
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [retry]);

  const section = (title, products, query = "") => (
    <section className="voltix-store-section">
      <div className="voltix-store-section-heading">
        <h2>{title}</h2>
        <Link to={`/products${query}`}>View all</Link>
      </div>
      <div className="voltix-store-product-grid">
        {products.slice(0, 8).map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="voltix-store-main">
      <OfferBannerSlider />

      <section className="voltix-store-hero">
        <div className="voltix-store-hero-content">
          <span className="voltix-store-eyebrow">NEW ARRIVALS</span>
          <h1>
            Gadgets that earn
            <br />
            their place on your
            <br />
            desk.
          </h1>
          <p>
            Phones, audio, wearables and accessories in one store, with cash on
            delivery and easy returns.
          </p>
          <div className="voltix-store-hero-actions">
            <Link to="/products" className="voltix-store-primary-btn">
              Shop all gadgets
            </Link>
            <a href="#categories" className="voltix-store-secondary-btn">
              Browse categories
            </a>
          </div>
        </div>
        <div className="voltix-store-hero-image">
          <img src={heroImage} alt="Explore our gadgets" />
        </div>
      </section>

      <section id="categories" className="voltix-store-section">
        <h2>Shop by category</h2>
        <div className="voltix-store-category-grid">
          {categories.map((category) => (
            <Link
              key={category._id}
              to={`/products?category=${category._id}`}
              className="voltix-store-category-card"
            >
              <strong>{category.name}</strong>
              <span>Shop now <Icon name="arrow-right" size={16} /></span>
            </Link>
          ))}
        </div>
      </section>

      {loading && <p role="status">Loading products...</p>}
      {error && (
        <div className="vx-state" role="alert">
          <p>{error}</p>
          <button type="button" className="vx-btn-dark" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {data.featured.length > 0 && section("Featured gadgets", data.featured, "?featured=true")}
          <div id="new-arrivals">{section("Latest gadgets", data.products)}</div>
          {!data.products.length && <p>Products will appear here once published.</p>}
          {data.bestSellers.length > 0 && section("Best sellers", data.bestSellers, "?bestSeller=true")}
        </>
      )}

      {/* 4 Value Props from Home.pdf */}
      <section className="voltix-store-value-props">
        <div className="voltix-store-value-prop">
          <h3>Cash on delivery</h3>
          <p>Pay when your gadget arrives.</p>
        </div>
        <div className="voltix-store-value-prop">
          <h3>Easy returns</h3>
          <p>Return eligible items from your orders page.</p>
        </div>
        <div className="voltix-store-value-prop">
          <h3>Secure checkout</h3>
          <p>UPI, cards and net banking supported.</p>
        </div>
        <div className="voltix-store-value-prop">
          <h3>Warranty included</h3>
          <p>Every gadget ships with a warranty card.</p>
        </div>
      </section>
    </div>
  );
}

export default function UserHome() {
  return (
    <StoreLayout>
      <HomeContent />
    </StoreLayout>
  );
}
