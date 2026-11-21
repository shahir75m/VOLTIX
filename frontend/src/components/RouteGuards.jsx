import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import PageLoader from "./PageLoader";
import { peekUserSession, readUserSession } from "../utils/userSession";
import { getAdminSession, hasAdminSession } from "../utils/adminSession";

const LOGIN_MESSAGE = "Please log in to continue.";

// Wraps every customer-only page (cart, checkout, orders, profile, wallet, wishlist).
// It checks the session BEFORE the page renders, so a logged-out visitor never sees a
// flash of order/cart content, and pressing Back to a protected page goes to /login.
export function RequireUser({ children }) {
  const location = useLocation();

  const [state, setState] = useState(() => {
    const cached = peekUserSession();
    return cached
      ? { checking: false, user: cached, message: "" }
      : { checking: true, user: null, message: "" };
  });

  useEffect(() => {
    if (peekUserSession()) return undefined;

    let active = true;

    (async () => {
      const result = await readUserSession();
      if (active) setState({ checking: false, user: result.user, message: result.message });
    })();

    return () => {
      active = false;
    };
  }, []);

  if (state.checking) return <PageLoader />;

  if (!state.user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}`,
          message: state.message || LOGIN_MESSAGE,
        }}
      />
    );
  }

  return children;
}

// Login / register / OTP pages: a customer who is already signed in is sent away
// instead of being shown a form that can only fail.
export function GuestOnly({ children }) {
  const location = useLocation();

  const [checking, setChecking] = useState(() => !peekUserSession());
  const [user, setUser] = useState(() => peekUserSession());

  useEffect(() => {
    if (peekUserSession()) return undefined;

    let active = true;

    (async () => {
      const result = await readUserSession();
      if (!active) return;
      setUser(result.user);
      setChecking(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  if (checking) return <PageLoader />;

  if (user) {
    return <Navigate to={location.state?.from || "/"} replace />;
  }

  return children;
}

// /admin/login: an admin who is already signed in goes straight to the dashboard
// instead of seeing a login form that would only create a second session.
export function GuestOnlyAdmin({ children }) {
  const [checking, setChecking] = useState(() => !hasAdminSession());
  const [signedIn, setSignedIn] = useState(() => hasAdminSession());

  useEffect(() => {
    if (hasAdminSession()) return undefined;

    let active = true;

    (async () => {
      try {
        await getAdminSession();
        if (active) setSignedIn(true);
      } catch {
        if (active) setSignedIn(false);
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (checking) return <PageLoader />;

  if (signedIn) return <Navigate to="/admin/dashboard" replace />;

  return children;
}
