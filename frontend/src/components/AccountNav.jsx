import { Link, useLocation } from "react-router-dom";
import { useShop } from "../context/ShopContext";

// The "My account" side menu. One component for Profile, Orders and Wishlist,
// so all three pages always look and work the same. Must be used inside <StoreLayout>.
export default function AccountNav({ style }) {
  const { handleLogout } = useShop();
  const { pathname } = useLocation();
  const active = pathname.startsWith("/orders") ? "orders" : pathname.startsWith("/wishlist") ? "wishlist" : pathname.startsWith("/wallet") ? "wallet" : "profile";
  const items = [
    { key: "profile", to: "/profile", label: "Profile & addresses" },
    { key: "orders", to: "/orders", label: "My orders" },
    { key: "wishlist", to: "/wishlist", label: "Wishlist" },
    { key: "wallet", to: "/wallet", label: "Wallet" },
  ];

  return (
    <nav className="vx-account-nav" aria-label="My account" style={style}>
      {items.map((item) =>
        item.key === active ? (
          <span key={item.key} className="active" aria-current="page">{item.label}</span>
        ) : (
          <Link key={item.key} to={item.to}>{item.label}</Link>
        )
      )}
      <button type="button" className="logout" onClick={handleLogout}>Log out</button>
    </nav>
  );
}
