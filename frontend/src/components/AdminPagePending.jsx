import AdminSidebar from "./AdminSidebar";
import "../pages/admin/AdminShop.css";
export default function AdminPagePending({ active }) {
  return <div className="voltix-admin-layout"><AdminSidebar active={active} /><main className="vx-main" aria-busy="true" aria-label="Admin content"><div className="vx-admin-skeleton" aria-hidden="true"><div /><div /><div /></div></main></div>;
}
