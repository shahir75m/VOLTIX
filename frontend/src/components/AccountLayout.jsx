import { Outlet } from "react-router-dom";
import StoreLayout from "./StoreLayout";
import AccountNav from "./AccountNav";

// Layout for Profile, Orders and Wishlist. The title and the side menu live here ONCE, so
// clicking a menu item only swaps the right-hand content: nothing else moves.
export default function AccountLayout() {
  return (
    <StoreLayout>
      <div className="vx-page">
        <h1 className="vx-title">My account</h1>
        <div className="vx-account-layout">
          <AccountNav />
          <div className="vx-account-content">
            <Outlet />
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
