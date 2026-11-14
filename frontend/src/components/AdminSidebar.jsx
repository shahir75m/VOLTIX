import { invalidateAdminSession } from "../utils/adminSession";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config/api";
import BrandLogo from "./BrandLogo";
import Icon from "../components/Icon";

const MENU = [
  { label: "Dashboard", path: "/admin/dashboard" },
  { label: "Products", path: "/admin/products" },
  { label: "Categories & brands", path: "/admin/categories" },
  { label: "Orders", path: "/admin/orders" },
  { label: "Returns", path: "/admin/returns" },
  { label: "Reviews", path: "/admin/reviews" },
  { label: "Coupons", path: "/admin/coupons" },
  { label: "Offers", path: "/admin/offers" },
  { label: "Users", path: "/admin/users" },
  { label: "Security", path: "/admin/security" },
];

export default function AdminSidebar({ active }) {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const response = await fetch(`${API_BASE_URL}/api/admin/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Logout failed");
      invalidateAdminSession();
      navigate("/admin/login", { replace: true });
    } catch (error) {
      alert(error.message);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <aside className="voltix-admin-sidebar">
      <div className="voltix-sidebar-brand">
        <BrandLogo />
        <p>Admin panel</p>
      </div>

      <nav className="voltix-sidebar-menu">
        {MENU.map((item) => (
          <button
            key={item.label}
            type="button"
            className={item.label === active ? "voltix-menu-item active" : "voltix-menu-item"}
            onClick={() => item.path && navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="voltix-sidebar-bottom">
        <button type="button" className="voltix-view-store" onClick={() => navigate("/")}>
          <Icon name="arrow-left" size={15} /> View store
        </button>
        <button
          type="button"
          className="voltix-admin-logout"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Logging out..." : "Log out"}
        </button>
      </div>
    </aside>
  );
}
