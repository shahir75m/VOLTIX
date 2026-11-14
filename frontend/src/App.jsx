import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

// ADMIN PAGES
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminSecurity = lazy(() => import("./pages/admin/AdminSecurity"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminProductForm = lazy(() => import("./pages/admin/AdminProductForm"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminOrderDetail = lazy(() => import("./pages/admin/AdminOrderDetail"));
const AdminReturns = lazy(() => import("./pages/admin/AdminReturns"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminOffers = lazy(() => import("./pages/admin/AdminOffers"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews"));

// USER PAGES
import UserHome from "./pages/user/UserHome";
const UserLogin = lazy(() => import("./pages/user/UserLogin"));
const UserRegister = lazy(() => import("./pages/user/UserRegister"));
const UserVerifyOTP = lazy(() => import("./pages/user/UserVerifyOTP"));
const UserForgotPassword = lazy(() => import("./pages/user/UserForgotPassword"));
const UserResetPassword = lazy(() => import("./pages/user/UserResetPassword"));
const UserProfile = lazy(() => import("./pages/user/UserProfile"));
const UserProfileEdit = lazy(() => import("./pages/user/UserProfileEdit"));
const UserProducts = lazy(() => import("./pages/user/UserProducts"));
const UserProductDetail = lazy(() => import("./pages/user/UserProductDetail"));
const UserCart = lazy(() => import("./pages/user/UserCart"));
const UserWishlist = lazy(() => import("./pages/user/UserWishlist"));
const UserWallet = lazy(() => import("./pages/user/UserWallet"));
const UserCheckout = lazy(() => import("./pages/user/UserCheckout"));
const UserOrderSuccess = lazy(() => import("./pages/user/UserOrderSuccess"));
const UserOrderFailure = lazy(() => import("./pages/user/UserOrderFailure"));
const UserOrders = lazy(() => import("./pages/user/UserOrders"));
const UserOrderDetail = lazy(() => import("./pages/user/UserOrderDetail"));
const UserReturnRequest = lazy(() => import("./pages/user/UserReturnRequest"));
import AccountLayout from "./components/AccountLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import PageLoader from "./components/PageLoader";
const UserOffers = lazy(() => import("./pages/user/UserOffers"));
const NotFound = lazy(() => import("./pages/user/NotFound"));

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* CUSTOMER HOME PAGE */}
        <Route path="/" element={<UserHome />} />
        <Route path="/home" element={<Navigate to="/" replace />} />

        {/* CUSTOMER AUTHENTICATION */}
        <Route path="/login" element={<UserLogin />} />
        <Route path="/register" element={<UserRegister />} />
        <Route path="/verify-otp" element={<UserVerifyOTP />} />
        <Route path="/forgot-password" element={<UserForgotPassword />} />
        <Route path="/verify-reset-otp" element={<UserResetPassword />} />

        {/* SHOP: PRODUCTS, CART, WISHLIST, OFFERS, CHECKOUT */}
        <Route path="/products" element={<UserProducts />} />
        <Route path="/products/:id" element={<UserProductDetail />} />
        <Route path="/offers" element={<UserOffers />} />
        <Route path="/cart" element={<UserCart />} />
        <Route path="/checkout" element={<UserCheckout />} />
        <Route path="/order/success/:id" element={<UserOrderSuccess />} />
        <Route path="/order/failed/:id" element={<UserOrderFailure />} />

        {/* CUSTOMER ORDERS & RETURNS */}
        <Route path="/orders/:id" element={<UserOrderDetail />} />
        <Route path="/orders/:id/return" element={<UserReturnRequest />} />

        {/* CUSTOMER PROFILE */}
        <Route path="/profile/edit" element={<UserProfileEdit />} />
        {/* MY ACCOUNT: one shared layout, so the side menu never jumps between these pages */}
        <Route element={<AccountLayout />}>
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/orders" element={<UserOrders />} />
          <Route path="/wishlist" element={<UserWishlist />} />
          <Route path="/wallet" element={<UserWallet />} />
        </Route>

        {/* ADMIN AUTHENTICATION */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/verify-otp" element={<Navigate to="/admin/login" replace />} />

        {/* ADMIN MANAGEMENT */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/security" element={<AdminSecurity />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/categories" element={<AdminCategories />} />
        <Route path="/admin/products" element={<AdminProducts />} />
        <Route path="/admin/products/new" element={<AdminProductForm />} />
        <Route path="/admin/products/:id/edit" element={<AdminProductForm />} />
        <Route path="/admin/orders" element={<AdminOrders />} />
        <Route path="/admin/orders/:id" element={<AdminOrderDetail />} />
        <Route path="/admin/returns" element={<AdminReturns />} />
        <Route path="/admin/coupons" element={<AdminCoupons />} />
        <Route path="/admin/offers" element={<AdminOffers />} />
        <Route path="/admin/reviews" element={<AdminReviews />} />

        {/* UNKNOWN ROUTES */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
