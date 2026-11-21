import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";
import PasswordInput from "../../components/PasswordInput";
import { API_BASE_URL } from "../../config/api";
import { validateEmail } from "../../utils/emailRules";
import { primeUserSession } from "../../utils/userSession";
import "./UserLogin.css";

function UserLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = useRef(location.state?.from || "/");
  const [toastMessage, setToastMessage] = useState(location.state?.message || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

useEffect(() => {
  if (location.state?.message) {
    navigate(location.pathname, {
      replace: true,
      // Keep `from` so a successful login can still return to the page that asked for it.
      state: location.state?.from ? { from: location.state.from } : null,
    });
  }
}, [location.pathname, location.state, navigate]);
  useEffect(() => {
  if (!toastMessage) return;

  const timer = setTimeout(() => {
    setToastMessage("");
  }, 4000);

  return () => clearTimeout(timer);
}, [toastMessage]);

  // Show any error messages from the location state
  useEffect(() => {
    if (location.state?.message) {
      setError(location.state.message);
    }
  }, [location.state]);

  const handleLogin = async (event) => {
    event.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }

    const emailCheck = validateEmail(cleanEmail);
    if (!emailCheck.valid) {
      setError(emailCheck.message);
      return;
    }

    if (!password.trim()) {
      setError("Password cannot contain only spaces.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            email: cleanEmail,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Login failed. Please try again."
        );
      }

      setSuccess("Login successful! Redirecting...");

      setPassword("");
      primeUserSession(data.user);

      // Navigate after successful login. `from` is set when a protected page sent the
      // customer here, so they land where they wanted to go; otherwise the home page.
      setTimeout(() => {
        navigate(from.current, { replace: true });
      }, 700);

    } catch (err) {
      setError(
        err.message || "Unable to connect to server."
      );
    } finally {
      setLoading(false);
    }
  };

  

 const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const googleButtonRef = useRef(null);

useEffect(() => {
  if (!googleClientId) {
    console.error("Google Client ID is missing");
    return;
  }

  const initializeGoogle = () => {
    if (!window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: googleClientId,

      callback: async (response) => {
        setError("");
        setSuccess("");
        setLoading(true);

        try {
          const result = await fetch(
            `${API_BASE_URL}/api/users/google`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({
                credential: response.credential,
              }),
            }
          );

          const data = await result.json();

          if (!result.ok || !data.success) {
            throw new Error(
              data.message || "Google login failed"
            );
          }

          setSuccess("Google login successful!");
          primeUserSession(data.user);

          navigate(from.current, { replace: true });
        } catch (error) {
          setError(
            error.message || "Google authentication failed"
          );
        } finally {
          setLoading(false);
        }
      },
    });

    if (googleButtonRef.current) {
      window.google.accounts.id.renderButton(
        googleButtonRef.current,
        {
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 300,
        }
      );
    }
  };

  const existingScript = document.querySelector(
    'script[src="https://accounts.google.com/gsi/client"]'
  );

  if (existingScript) {
    if (window.google?.accounts?.id) {
      initializeGoogle();
    } else {
      existingScript.addEventListener("load", initializeGoogle);
    }

    return () => {
      existingScript.removeEventListener(
        "load",
        initializeGoogle
      );
    };
  }

  const script = document.createElement("script");

  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;

  script.addEventListener("load", initializeGoogle);

  document.body.appendChild(script);

  return () => {
    script.removeEventListener("load", initializeGoogle);
  };
}, [googleClientId, navigate]);

  return (
    <div className="voltix-user-login-page">
    
      {toastMessage && (
  <div
    role="alert"
    style={{
      position: "fixed",
      top: "20px",
      right: "20px",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      backgroundColor: "#ffffff",
      color: "#333333",
      border: "1px solid #fecaca",
      borderLeft: "4px solid #e52d2d",
      padding: "14px 18px",
      borderRadius: "10px",
      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.15)",
      zIndex: 9999,
      maxWidth: "380px",
      fontSize: "14px",
      fontWeight: "500",
    }}
  >
    {/* RED CIRCLE WITH WHITE CROSS SVG */}
    <svg
  width="32"
  height="32"
  viewBox="0 0 100 100"
  xmlns="http://www.w3.org/2000/svg"
  style={{ flexShrink: 0 }}
  aria-hidden="true"
>
  {/* Red Circle */}
  <circle
    cx="50"
    cy="50"
    r="50"
    fill="#e52d2d"
  />

  {/* White Cross */}
  <path
    d="M35 25
       L50 40
       L65 25
       Q70 20 75 25
       Q80 30 75 35
       L60 50
       L75 65
       Q80 70 75 75
       Q70 80 65 75
       L50 60
       L35 75
       Q30 80 25 75
       Q20 70 25 65
       L40 50
       L25 35
       Q20 30 25 25
       Q30 20 35 25Z"
    fill="#ffffff"
  />
</svg>

    {/* TOAST MESSAGE */}
    <span>{toastMessage}</span>
  </div>
)}

      {/* HEADER */}

      <header className="voltix-user-header">
        <div className="voltix-user-navbar">

          <Link to="/" className="voltix-user-logo"><BrandLogo /></Link>

          <div className="voltix-user-search">
            <input
              type="search"
              placeholder="Search phones, earbuds, laptops..."
              aria-label="Search products"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const term = search.trim();
                navigate(term ? `/products?search=${encodeURIComponent(term)}` : "/products");
              }}
            />
            <button
              type="button"
              onClick={() => {
                const term = search.trim();
                navigate(term ? `/products?search=${encodeURIComponent(term)}` : "/products");
              }}
            >
              Search
            </button>
          </div>

          <nav className="voltix-user-header-links">
            <Link to="/products">Shop</Link>
            <Link to="/offers">Offers</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/cart">Cart</Link>
            <Link to="/register">Register</Link>
          </nav>

        </div>

      </header>

      {/* LOGIN CONTENT */}

      <main className="voltix-user-login-main">

        <section className="voltix-user-login-card">

          <h1>Welcome back</h1>

          <p className="voltix-user-login-subtitle">
            Log in to see your orders, wishlist and saved addresses.
          </p>

          <form onSubmit={handleLogin}>

            <div className="voltix-user-form-group">
              <label htmlFor="user-email">Email</label>

              <input
                id="user-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>

            <div className="voltix-user-form-group">

              <div className="voltix-user-password-label">
                <label htmlFor="user-password">Password</label>

                <Link to="/forgot-password">
                  Forgot password?
                </Link>
              </div>

              <PasswordInput
                id="user-password"
                placeholder="Your password"
                value={password}
                maxLength={128}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={loading}
                required
              />
            </div>

            {/* ERROR MESSAGE */}
             
            

            {error && (
              <p
                role="alert"
                style={{
                  color: "#dc2626",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                {error}
              </p>
            )}

            {/* SUCCESS MESSAGE */}

            {success && (
              <p
                role="status"
                style={{
                  color: "#15803d",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                {success}
              </p>
            )}

            <button
              type="submit"
              className="voltix-user-login-button"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Log in"}
            </button>

          </form>

          {/* GOOGLE LOGIN */}

          <div className="voltix-user-divider">
            <span>or</span>
          </div>

          <div
  ref={googleButtonRef}
  className="voltix-google-login-container"
  style={{
    display: "flex",
    justifyContent: "center",
    marginTop: "12px",
  }}
/>

          <p className="voltix-user-register-link">
            New to Voltix?{" "}
            <Link to="/register">Create an account</Link>
          </p>

        </section>

      </main>

      {/* FOOTER */}

      <footer className="voltix-user-footer">

        <div className="voltix-user-footer-content">

          <div className="voltix-footer-about">
            <h2>Voltix</h2>
            <p>
              Gadgets only: phones, laptops, audio,
              wearables, cameras and accessories.
            </p>
          </div>

          <div className="voltix-footer-column">
            <h3>Shop</h3>
            <Link to="/products">All products</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/cart">Cart</Link>
          </div>

          <div className="voltix-footer-column">
            <h3>Account</h3>
            <Link to="/login">Login</Link>
            <Link to="/register">Create account</Link>
            <Link to="/orders">My orders</Link>
          </div>

          <div className="voltix-footer-column">
            <h3>Help</h3>
            <span>Contact: [support email]</span>
            <span>Phone: [support number]</span>
          </div>

        </div>

        <div className="voltix-user-footer-bottom">
          © Voltix. All rights reserved.
        </div>

      </footer>

    </div>
  );
}

export default UserLogin;