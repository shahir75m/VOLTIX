import { useCallback, useEffect, useMemo, useState } from "react";
import usePageTitle from "../../hooks/usePageTitle";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import ProductCard from "../../components/ProductCard";
import Pagination from "../../components/Pagination";
import { useShop } from "../../context/ShopContext";
import { apiFetch } from "../../utils/api";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top rated" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name_asc", label: "Name: A–Z" },
  { value: "name_desc", label: "Name: Z–A" },
];

function ProductsContent() {
  usePageTitle("Products");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { categories } = useShop();

  // ---- the URL is the single source of truth for search / filter / sort / page
  const search = params.get("search") || "";
  const sort = SORT_OPTIONS.some((o) => o.value === params.get("sort")) ? params.get("sort") : "newest";
  const minPrice = params.get("minPrice") || "";
  const maxPrice = params.get("maxPrice") || "";
  const categoryParam = params.get("category") || "";
  const brandParam = params.get("brand") || "";
  const selectedCategories = useMemo(() => categoryParam.split(",").filter(Boolean), [categoryParam]);
  const selectedBrands = useMemo(() => brandParam.split(",").filter(Boolean), [brandParam]);
  const tag = params.get("tag") || "";
  const flagFilter = ["featured", "new", "bestSeller"].find((key) => params.get(key) === "true") || "";
  const page = Math.max(1, parseInt(params.get("page"), 10) || 1);

  // ---- draft values of the sidebar (applied with the "Apply filters" button)
  const [draftCategories, setDraftCategories] = useState(selectedCategories);
  const [brands, setBrands] = useState([]);
  const [draftBrands, setDraftBrands] = useState(selectedBrands);
  const [draftMin, setDraftMin] = useState(minPrice);
  const [draftMax, setDraftMax] = useState(maxPrice);
  const [priceError, setPriceError] = useState("");

  useEffect(() => {
    setDraftCategories(selectedCategories);
    setDraftBrands(selectedBrands);
    setDraftMin(minPrice);
    setDraftMax(maxPrice);
    setPriceError("");
  }, [selectedCategories, selectedBrands, minPrice, maxPrice]);

  useEffect(() => {
    apiFetch("/api/products/brands").then((d) => setBrands(d.brands)).catch(() => {});
  }, []);

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalItems: 0, limit: 12 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const updateParams = useCallback(
    (changes, { resetPage = true } = {}) => {
      const next = new URLSearchParams(params);
      Object.entries(changes).forEach(([key, value]) => {
        if (value === "" || value === null || value === undefined) next.delete(key);
        else next.set(key, value);
      });
      if (resetPage) next.delete("page");
      setParams(next);
    },
    [params, setParams]
  );

  // ---- load from the backend whenever the URL changes
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (tag) query.set("tag", tag);
    if (flagFilter) query.set(flagFilter, "true");
    if (search) query.set("search", search);
    if (categoryParam) query.set("category", categoryParam);
    if (brandParam) query.set("brand", brandParam);
    if (minPrice) query.set("minPrice", minPrice);
    if (maxPrice) query.set("maxPrice", maxPrice);
    if (sort !== "newest") query.set("sort", sort);
    query.set("page", String(page));

    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await apiFetch(`/api/products?${query}`, { signal: controller.signal });
        setProducts(data.products);
        setPagination(data.pagination);
        if (data.pagination.currentPage !== page) {
          const next = new URLSearchParams(params);
          if (data.pagination.currentPage <= 1) next.delete("page");
          else next.set("page", String(data.pagination.currentPage));
          setParams(next, { replace: true });
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setProducts([]);
        setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryParam, brandParam, minPrice, maxPrice, sort, page, retryKey, tag, flagFilter]);

  const hasActiveFilters = Boolean(search || categoryParam || brandParam || minPrice || maxPrice || sort !== "newest");

  const applyFilters = (event) => {
    event.preventDefault();

    const min = draftMin.trim();
    const max = draftMax.trim();
    if ((min && (!/^\d+(\.\d{1,2})?$/.test(min))) || (max && !/^\d+(\.\d{1,2})?$/.test(max))) {
      setPriceError("Enter valid prices (numbers only, 0 or more)");
      return;
    }
    if (min && max && Number(min) > Number(max)) {
      setPriceError("Minimum price cannot be greater than maximum price");
      return;
    }
    setPriceError("");
    updateParams({ category: draftCategories.join(","), brand: draftBrands.join(","), minPrice: min, maxPrice: max });
  };

  const clearAll = () => navigate("/products");

  const toggleDraftCategory = (id) =>
    setDraftCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const toggleDraftBrand = (id) =>
    setDraftBrands((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));

  const goToPage = (nextPage) => {
    updateParams({ page: nextPage > 1 ? String(nextPage) : "" }, { resetPage: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const singleCategory =
    selectedCategories.length === 1 ? categories.find((c) => c._id === selectedCategories[0]) : null;

  return (
    <div className="vx-page">
      <nav className="vx-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link> / <Link to="/products">All products</Link>
        {singleCategory && <> / <span>{singleCategory.name}</span></>}
      </nav>

      <div className="vx-list-head">
        <div>
          <h1>{singleCategory ? singleCategory.name : "All products"}</h1>
          <p className="vx-sub">
            {loading ? "Loading..." : `Showing ${pagination.totalItems} product${pagination.totalItems === 1 ? "" : "s"}`}
            {search && <> for “{search}”</>}
          </p>
        </div>

        <label className="vx-sort">
          Sort by
          <select value={sort} onChange={(e) => updateParams({ sort: e.target.value === "newest" ? "" : e.target.value })}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {search && (
        <div className="vx-chips">
          <span className="vx-chip">
            Search: {search}
            <button type="button" onClick={() => updateParams({ search: "" })} aria-label="Clear search">×</button>
          </span>
        </div>
      )}

      <div className="vx-list-layout">
        {/* FILTERS */}
        <aside className="vx-filters-box">
          <form onSubmit={applyFilters} noValidate>
            <h2>Category</h2>
            {categories.length === 0 ? (
              <p className="vx-sub">No categories yet</p>
            ) : (
              categories.map((category) => (
                <label key={category._id} className="vx-check">
                  <input type="checkbox" checked={draftCategories.includes(category._id)} onChange={() => toggleDraftCategory(category._id)} />
                  {category.name}
                </label>
              ))
            )}

            {brands.length > 0 && (
              <>
                <h2 style={{ marginTop: 22 }}>Brand</h2>
                {brands.map((b) => (
                  <label key={b._id} className="vx-check">
                    <input type="checkbox" checked={draftBrands.includes(b._id)} onChange={() => toggleDraftBrand(b._id)} />
                    {b.name}
                  </label>
                ))}
              </>
            )}

            <h2 style={{ marginTop: 22 }}>Price (₹)</h2>
            <div className="vx-price-inputs">
              <label>
                Min
                <input type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={draftMin} onChange={(e) => { setDraftMin(e.target.value); setPriceError(""); }} />
              </label>
              <label>
                Max
                <input type="number" min="0" step="1" inputMode="numeric" placeholder="100000" value={draftMax} onChange={(e) => { setDraftMax(e.target.value); setPriceError(""); }} />
              </label>
            </div>
            {priceError && <p className="vx-field-error">{priceError}</p>}

            <button type="submit" className="vx-btn-dark">Apply filters</button>
            <button type="button" className="vx-link-btn" onClick={clearAll} disabled={!hasActiveFilters && draftCategories.length === 0 && draftBrands.length === 0 && !draftMin && !draftMax}>
              Clear all
            </button>
          </form>
        </aside>

        {/* RESULTS */}
        <section aria-live="polite">
          {error ? (
            <div className="vx-state">
              <strong>We couldn’t load the products</strong>
              <p>{error}</p>
              <button type="button" className="vx-btn-dark" onClick={() => setRetryKey((k) => k + 1)}>Try again</button>
            </div>
          ) : loading && products.length === 0 ? (
            <div className="voltix-store-product-grid vx-grid-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="vx-skeleton" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="vx-state">
              {hasActiveFilters ? (
                <>
                  <strong>No products match your search or filters</strong>
                  <p>Try a different keyword, widen the price range or remove some filters.</p>
                  <button type="button" className="vx-btn-dark" onClick={clearAll}>Clear all filters</button>
                </>
              ) : (
                <>
                  <strong>No products available right now</strong>
                  <p>New gadgets are added regularly. Please check back soon.</p>
                  <Link to="/" className="vx-btn-dark">Back to home</Link>
                </>
              )}
            </div>
          ) : (
            <>
              <div className={`voltix-store-product-grid vx-grid-3 ${loading ? "vx-loading" : ""}`}>
                {products.map((product) => <ProductCard key={product._id} product={product} />)}
              </div>
              <div className="vx-store-pager-wrap">
                <Pagination pagination={pagination} onChange={goToPage} className="vx-store-pager" prevLabel="Prev" nextLabel="Next" />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function UserProducts() {
  return (
    <StoreLayout>
      <ProductsContent />
    </StoreLayout>
  );
}
