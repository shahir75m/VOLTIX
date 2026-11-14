import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";
import { API_BASE_URL } from "../../config/api";
import "./AdminLogin.css";
import Icon from "../../components/Icon";

function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
  throw new Error(data.message || "Login failed");
}

if (data.requiresOTP && data.challenge) {
  setPassword("");

  navigate("/admin/verify-otp", {
    replace: true,
    state: {
      challenge: data.challenge,
      email: email.trim(),
      expiresIn: data.expiresIn,
    },
  });

  return;
}

throw new Error("Unexpected login response");
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="voltix-admin-login">
      <div className="voltix-login-container">

        {/* Brand */}
        <header className="voltix-login-brand">
          <BrandLogo size="lg" />
          <p>Admin panel</p>
        </header>

        {/* Login Card */}
        <section className="voltix-login-card">
          <h2>Admin login</h2>

          <p className="voltix-login-description">
            Step 1 of 2. After your password, we send a
            one-time code to confirm it is you.
          </p>

          <form onSubmit={handleSubmit}>

            <div className="voltix-form-group">
              <label htmlFor="admin-email">
                Admin email
              </label>

              <input
                id="admin-email"
                type="email"
                placeholder="admin@yourstore.com"
                value={email}
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="voltix-form-group">
              <label htmlFor="admin-password">
                Password
              </label>

              <input
                id="admin-password"
                type="password"
                placeholder="Your password"
                value={password}
                maxLength={128}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <p className="voltix-login-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="voltix-login-button"
              disabled={loading}
            >
              {loading
                ? "Signing in..."
                : "Continue and send OTP"}
            </button>

          </form>

          <div className="voltix-forgot-password">
            <span>Forgot password?</span>
          </div>
        </section>

        <div className="voltix-back-store">
          <Link to="/"><Icon name="arrow-left" size={15} /> Back to the store</Link>
        </div>

      </div>
    </main>
  );
}

export default AdminLogin;