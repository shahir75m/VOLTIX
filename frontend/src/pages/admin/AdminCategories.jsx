import AdminPagePending from "../../components/AdminPagePending";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminSidebar from "../../components/AdminSidebar";
import TaxonomyPanel from "../../components/TaxonomyPanel";
import "./AdminDashboard.css";
import "./AdminShop.css";

export default function AdminCategories() {
  const { checkingAuth, handleAuthError } = useAdminAuth();

  if (checkingAuth) return <AdminPagePending active="Categories & brands" />;

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Categories & brands" />

      <main className="vx-main">
        <header className="vx-head">
          <div>
            <h1>Categories &amp; brands</h1>
            <p>Organise how products are grouped and filtered in the store</p>
          </div>
        </header>

        <div className="vx-two-col">
          <TaxonomyPanel
            endpoint="/api/admin/categories"
            label="Category"
            placeholder="e.g. Tablets"
            imageButton="Upload category image"
            handleAuthError={handleAuthError}
          />
          <TaxonomyPanel
            endpoint="/api/admin/brands"
            label="Brand"
            placeholder="e.g. Realme"
            imageButton="Upload logo"
            handleAuthError={handleAuthError}
          />
        </div>
      </main>
    </div>
  );
}
