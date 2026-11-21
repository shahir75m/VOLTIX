import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ShopContext } from "../context/ShopContext";
import { apiFetch, apiJson } from "../utils/api";
import { API_BASE_URL } from "../config/api";
import { clearUserSession, primeUserSession } from "../utils/userSession";
import voltixLogo from "../assets/voltix-logo.svg";
import "../pages/user/UserHome.css";
import "./StoreShop.css";

// Last known counters survive page changes (every page mounts its own StoreLayout),
// so the header never flashes a wrong number while the fresh count is loading.
const countCache = { cart: 0, wishlist: [] };

// Header + category bar + footer shared by the shop pages
// (products, product detail, cart, wishlist). Also owns the logged-in user,
// cart counter, wishlist ids and the toast messages.
export default function StoreLayout({ children, hideFooter = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [cartCount, setCartCountState] = useState(countCache.cart);
  const [wishlistIds, setWishlistIdsState] = useState(countCache.wishlist);

  const setCartCount = useCallback((value) => {
    setCartCountState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      countCache.cart = next;
      return next;
    });
  }, []);

  const setWishlistIds = useCallback((value) => {
    setWishlistIdsState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      countCache.wishlist = next;
      return next;
    });
  }, []);
  const [categories, setCategories] = useState([]);
  const [toast, setToast] = useState(null);
  const [headerSearch, setHeaderSearch] = useState(searchParams.get("search") || "");

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  // message passed through navigation (e.g. "product no longer available")
  useEffect(() => {
    if (location.state?.message) {
      showToast(location.state.message, location.state.type || "error");
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.state, location.pathname, location.search, navigate, showToast]);

  // keep the header search box in sync with the URL
  useEffect(() => {
    if (location.pathname === "/products") setHeaderSearch(searchParams.get("search") || "");
  }, [location.pathname, searchParams]);

  // logged-in user (re-loaded when the profile page changes the name / photo)
  const [userReload, setUserReload] = useState(0);
  useEffect(() => {
    const reload = () => setUserReload((n) => n + 1);
    window.addEventListener("voltix:user-updated", reload);
    return () => window.removeEventListener("voltix:user-updated", reload);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/users/me`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (response.status === 403) {
          const data = await response.json().catch(() => ({}));
          clearUserSession();
          navigate("/login", { replace: true, state: { message: data.message || "Your account has been blocked." } });
          return;
        }
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setUser(data.user);
            primeUserSession(data.user);
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") console.error("User session check failed:", error);
      } finally {
        if (!controller.signal.aborted) setAuthChecked(true);
      }
    })();
    return () => controller.abort();
  }, [navigate, userReload]);

  // cart counter + wishlist hearts (only for logged-in customers)
  useEffect(() => {
    if (!user) return undefined;
    const refresh = () => {
      apiFetch("/api/cart/count").then((d) => setCartCount(d.count)).catch(() => {});
      apiFetch("/api/wishlist/ids").then((d) => setWishlistIds(d.ids)).catch(() => {});
    };
    refresh();
    // another tab / a long time on the page: sync again when the customer comes back
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [user, setCartCount, setWishlistIds]);

  // logged out (or session expired): never show the previous customer's numbers
  useEffect(() => {
    if (authChecked && !user) {
      setCartCount(0);
      setWishlistIds([]);
    }
  }, [authChecked, user, setCartCount, setWishlistIds]);

  useEffect(() => {
    apiFetch("/api/products/categories").then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  const requireLogin = useCallback(() => {
    showToast("Please log in to continue", "error");
    navigate("/login", { state: { from: `${location.pathname}${location.search}` } });
  }, [navigate, showToast, location.pathname, location.search]);

  const toggleWishlist = useCallback(
    async (productId) => {
      if (!user) {
        requireLogin();
        return;
      }
      const has = wishlistIds.includes(productId);
      try {
        if (has) {
          await apiFetch(`/api/wishlist/${productId}`, { method: "DELETE" });
          setWishlistIds((prev) => prev.filter((id) => id !== productId));
          showToast("Removed from wishlist");
        } else {
          await apiJson("/api/wishlist", "POST", { productId });
          setWishlistIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
          showToast("Added to wishlist");
        }
      } catch (error) {
        showToast(error.message, "error");
      }
    },
    [user, wishlistIds, requireLogin, showToast]
  );

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch("/api/users/logout", { method: "POST" });
      // clear the counters first, then leave the page. (Clearing `user` before navigating made
      // protected pages redirect to /login on their own and win over the redirect to home.)
      countCache.cart = 0;
      countCache.wishlist = [];
      clearUserSession();
      navigate("/", { replace: true });
      setUser(null);
      setCartCount(0);
      setWishlistIds([]);
    } catch (error) {
      showToast(error.message || "Logout failed. Please try again.", "error");
    }
  }, [navigate, showToast, setCartCount, setWishlistIds]);

  const submitSearch = (event) => {
    event.preventDefault();
    const term = headerSearch.trim();
    navigate(term ? `/products?search=${encodeURIComponent(term)}` : "/products");
  };

  const context = useMemo(
    () => ({ user, authChecked, cartCount, setCartCount, wishlistIds, setWishlistIds, toggleWishlist, showToast, requireLogin, categories, handleLogout }),
    [user, authChecked, cartCount, setCartCount, wishlistIds, setWishlistIds, toggleWishlist, showToast, requireLogin, categories, handleLogout]
  );

  const avatar =
    typeof user?.profileImage === "string" ? user.profileImage.trim() : user?.profileImage?.url?.trim() || "";

  return (
    <ShopContext.Provider value={context}>
      <div className="voltix-store vx-shop">
        <header className="voltix-store-header">
          <div className="voltix-store-header-inner">
            <Link to="/" className="voltix-store-logo">
              <img src={voltixLogo} alt="VOLTIX" className="voltix-navbar-logo" />
            </Link>

            <form className="voltix-store-search" onSubmit={submitSearch} role="search">
              <input
                type="text"
                placeholder="Search phones, earbuds, laptops..."
                value={headerSearch}
                maxLength={100}
                onChange={(e) => setHeaderSearch(e.target.value)}
                aria-label="Search products"
              />
              <button type="submit">Search</button>
            </form>

            <nav className="voltix-store-header-links">
              <Link to="/products">Shop</Link>
              <Link to="/offers">Offers</Link>
              <Link to="/wishlist">Wishlist{wishlistIds.length > 0 ? ` · ${wishlistIds.length}` : ""}</Link>
              <Link to="/cart">Cart{cartCount > 0 ? ` · ${cartCount}` : ""}</Link>

              {user ? (
                <>
                  <Link to="/orders">Orders</Link>
                  <button type="button" onClick={handleLogout}>Log out</button>
                  <Link to="/profile" className="voltix-profile-button" title="View profile" aria-label="View profile">
                    {avatar ? (
                      <img src={avatar} alt="Profile" className="voltix-profile-avatar" />
                    ) : (
                      <span className="voltix-profile-initial">{user.name?.charAt(0).toUpperCase() || "U"}</span>
                    )}
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/login">Login</Link>
                  <Link to="/register">Register</Link>
                </>
              )}
            </nav>
          </div>
        </header>


        <main className="vx-shop-main">{children}</main>

        {!hideFooter && (
        <footer className="voltix-store-footer">
          <div className="voltix-store-footer-inner">
            <div>
              <img src={voltixLogo} alt="VOLTIX" className="voltix-footer-logo" />
              <p>Gadgets only: phones, laptops, audio, wearables, cameras and accessories.</p>
            </div>
            <div>
              <h4>Shop</h4>
              <Link to="/products">All products</Link>
              <Link to="/offers">Offers</Link>
              <Link to="/wishlist">Wishlist</Link>
              <Link to="/cart">Cart</Link>
            </div>
            <div>
              <h4>Account</h4>
              <Link to="/login">Login</Link>
              <Link to="/register">Create account</Link>
              <Link to="/profile">My account</Link>
              <Link to="/orders">My orders</Link>
            </div>
            <div>
              <h4>Help</h4>
              <p>Contact: support email</p>
              <p>Phone: support number</p>
            </div>
          </div>
          <div className="voltix-store-copyright">© 2026 Voltix. All rights reserved.</div>
        </footer>
        )}

        {toast && (
          <div key={toast.id} className={`vx-toast ${toast.type}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        )}
      </div>
    </ShopContext.Provider>
  );
}
