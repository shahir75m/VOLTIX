import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";
import { API_BASE_URL } from "../../config/api";
import "./UserLogin.css";

function UserForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // =====================================
  // EMAIL VALIDATION
  // =====================================

  const validateEmail = (value) => {
    const cleanEmail = value.trim();

    if (!cleanEmail) {
      return "Email address is required.";
    }

    if (cleanEmail.length > 254) {
      return "Email address is too long.";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return "Please enter a valid email address.";
    }

    return "";
  };

  const emailError = emailTouched
    ? validateEmail(email)
    : "";

  // =====================================
  // HANDLE EMAIL CHANGE
  // =====================================

  const handleEmailChange = (event) => {
    setEmail(event.target.value);
    setError("");
    setSuccess("");
  };

  // =====================================
  // HANDLE FORM SUBMIT
  // =====================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) return;

    setEmailTouched(true);
    setError("");
    setSuccess("");

    const validationError = validateEmail(email);

    if (validationError) {
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      const response = await fetch(
        `${API_BASE_URL}/api/users/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            email: cleanEmail,
          }),
        }
      );

      // Safely read API response
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            "Unable to send verification code. Please try again."
        );
      }

      // No eligible account: show neutral message
      if (!data.challenge) {
        sessionStorage.removeItem("voltix_password_reset");

        setSuccess(
          data.message ||
            "If an eligible account exists, a reset code will be sent."
        );

        return;
      }

      // Validate server response before storing
      if (
        typeof data.challenge !== "string" ||
        !/^[a-f0-9]{64}$/i.test(data.challenge)
      ) {
        throw new Error(
          "Invalid verification response. Please try again."
        );
      }

      const expiresIn =
        Number.isFinite(Number(data.expiresIn)) &&
        Number(data.expiresIn) > 0
          ? Number(data.expiresIn)
          : 300;

      // Store reset verification details
      sessionStorage.setItem(
        "voltix_password_reset",
        JSON.stringify({
          email: cleanEmail,
          challenge: data.challenge,
          expiresAt: Date.now() + expiresIn * 1000,
        })
      );

      // Navigate to OTP verification page
      navigate("/verify-reset-otp");
    } catch (err) {
      setError(
        err.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="voltix-user-login-page">
      {/* HEADER */}
      <header className="voltix-user-header">
        <div className="voltix-user-navbar">
          <Link to="/" className="voltix-user-logo"><BrandLogo /></Link>

          <nav className="voltix-user-header-links">
            <Link to="/login">Login</Link>
            <Link to="/register">Create account</Link>
          </nav>
        </div>
      </header>

      {/* MAIN */}
      <main className="voltix-user-login-main">
        <section className="voltix-user-login-card">
          <h1>Forgot password?</h1>

          <p className="voltix-user-login-subtitle">
            Enter your registered email address.
            We'll send you a verification code.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {/* EMAIL FIELD */}
            <div className="voltix-user-form-group">
              <label htmlFor="reset-email">
                Email address
              </label>

              <input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                maxLength={254}
                onChange={handleEmailChange}
                onBlur={() => setEmailTouched(true)}
                disabled={loading}
                aria-invalid={Boolean(emailError)}
                aria-describedby={
                  emailError
                    ? "reset-email-error"
                    : undefined
                }
                style={{
                  borderColor: emailError
                    ? "#dc2626"
                    : undefined,
                }}
              />

              {/* INLINE EMAIL ERROR */}
              {emailError && (
                <p
                  id="reset-email-error"
                  role="alert"
                  style={{
                    color: "#dc2626",
                    fontSize: "12px",
                    marginTop: "5px",
                  }}
                >
                  {emailError}
                </p>
              )}
            </div>

            {/* API ERROR MESSAGE */}
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

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              className="voltix-user-login-button"
              disabled={loading}
            >
              {loading
                ? "Sending OTP..."
                : "Send verification code"}
            </button>
          </form>

          <p className="voltix-user-register-link">
            Remember your password?{" "}
            <Link to="/login">Back to login</Link>
          </p>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="voltix-user-footer">
        <div className="voltix-user-footer-bottom">
          © Voltix. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default UserForgotPassword;