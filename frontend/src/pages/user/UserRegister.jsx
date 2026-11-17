import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";
import { API_BASE_URL } from "../../config/api";
import "./UserLogin.css";
import "./UserRegister.css";

const initialForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

const validateField = (field, values) => {
  const value = values[field];

  switch (field) {
    case "name": {
      const cleanName = value.trim().replace(/\s+/g, " ");
      if (cleanName.length < 2 || cleanName.length > 50) {
        return "Full name must contain between 2 and 50 characters.";
      }
      if (!/^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u.test(cleanName)) {
        return "Enter a valid full name using letters and name separators.";
      }
      return "";
    }
    case "email": {
      const cleanEmail = value.trim();
      if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return "Please enter a valid email address.";
      }
      return "";
    }
    case "phone":
      return /^[6-9]\d{9}$/.test(value.trim())
        ? ""
        : "Enter a valid 10-digit Indian mobile number.";
    case "password":
      if (value.length < 8) return "Password must contain at least 8 characters.";
      if (value.length > 128) return "Password cannot exceed 128 characters.";
      if (!value.trim()) return "Password cannot contain only spaces.";
      return "";
    case "confirmPassword":
      if (!value) return "Please confirm your password.";
      return value === values.password ? "" : "Passwords do not match.";
    default:
      return "";
  }
};

const fieldNames = ["name", "email", "phone", "password", "confirmPassword"];

function UserRegister() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(initialForm);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleButtonRef = useRef(null);

  useEffect(() => {
    if (!googleClientId) return;

    const initializeGoogle = () => {
      if (!window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          setError("");
          setSuccess("");
          setLoading(true);

          try {
            const result = await fetch(`${API_BASE_URL}/api/users/google`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ credential: response.credential }),
            });

            const data = await result.json();

            if (!result.ok || !data.success) {
              throw new Error(data.message || "Google registration failed");
            }

            setSuccess("Google login successful!");
            navigate("/home", { replace: true });
          } catch (err) {
            setError(err.message || "Google authentication failed");
          } finally {
            setLoading(false);
          }
        },
      });

      if (googleButtonRef.current) {
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 300,
        });
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
        existingScript.removeEventListener("load", initializeGoogle);
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    const updated = { ...formData, [name]: value };
    setFormData(updated);
    setError("");

    // Revalidate fields already visited; new fields wait until blur or submit.
    setFieldErrors((previous) => {
      const next = { ...previous };
      if (touched[name]) next[name] = validateField(name, updated);
      if (name === "password" && touched.confirmPassword) {
        next.confirmPassword = validateField("confirmPassword", updated);
      }
      return next;
    });
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setTouched((previous) => ({ ...previous, [name]: true }));
    setFieldErrors((previous) => ({
      ...previous,
      [name]: validateField(name, formData),
    }));
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError("");

    const errors = Object.fromEntries(
      fieldNames.map((field) => [field, validateField(field, formData)])
    );
    if (!agreeTerms) errors.terms = "Please agree to the terms and privacy policy.";

    setTouched(Object.fromEntries(fieldNames.map((field) => [field, true])));
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name.trim().replace(/\s+/g, " "),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          password: formData.password,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Registration failed.");
      if (!data.requiresOTP || !data.challenge) {
        throw new Error("Invalid verification response from server.");
      }

      sessionStorage.setItem("voltixRegistrationChallenge", data.challenge);
      sessionStorage.setItem("voltixRegistrationEmail", formData.email.trim().toLowerCase());
      sessionStorage.setItem(
        "voltixRegistrationExpiresAt",
        String(Date.now() + data.expiresIn * 1000)
      );
      sessionStorage.setItem("voltixRegistrationResendAt", String(Date.now() + 60 * 1000));
      navigate("/verify-otp");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const fieldProps = (name) => ({
    name,
    value: formData[name],
    onChange: handleChange,
    onBlur: handleBlur,
    "aria-invalid": Boolean(fieldErrors[name]),
    "aria-describedby": fieldErrors[name] ? `register-${name}-error` : undefined,
    style: { borderColor: fieldErrors[name] ? "#dc2626" : undefined },
  });

  const fieldError = (name) =>
    fieldErrors[name] ? (
      <p
        id={`register-${name}-error`}
        role="alert"
        style={{ color: "#dc2626", fontSize: "12px", marginTop: "5px" }}
      >
        {fieldErrors[name]}
      </p>
    ) : null;

  return (
    <div className="voltix-user-login-page">
      {/* HEADER */}
      <header className="voltix-user-header">
        <div className="voltix-user-navbar">
          <Link to="/" className="voltix-user-logo"><BrandLogo /></Link>
          <div className="voltix-user-search">
            <input type="search" placeholder="Search phones, earbuds, laptops..." aria-label="Search products" />
            <button type="button">Search</button>
          </div>
          <nav className="voltix-user-header-links">
            <a href="#offers">Offers</a>
            <a href="#wishlist">Wishlist</a>
            <a href="#cart">Cart · 2</a>
            <a href="#account">My account</a>
            <Link to="/login">Login</Link>
          </nav>
        </div>
      </header>

      {/* REGISTRATION */}
      <main className="voltix-user-login-main voltix-register-main">
        <section className="voltix-user-login-card voltix-register-card">
          <h1>Create your account</h1>
          <p className="voltix-user-login-subtitle">
            Save addresses, track orders and keep a wishlist.
          </p>

          <form onSubmit={handleRegister} noValidate>
            <div className="voltix-user-form-group">
              <label htmlFor="register-name">Full name</label>
              <input
                id="register-name"
                type="text"
                placeholder="Your name"
                autoComplete="name"
                maxLength={50}
                {...fieldProps("name")}
              />
              {fieldError("name")}
            </div>

            <div className="voltix-user-form-group">
              <label htmlFor="register-email">Email</label>
              <input
                id="register-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={254}
                {...fieldProps("email")}
              />
              {fieldError("email")}
            </div>

            <div className="voltix-user-form-group">
              <label htmlFor="register-phone">Phone number</label>
              <input
                id="register-phone"
                type="tel"
                placeholder="10-digit mobile number"
                autoComplete="tel"
                inputMode="numeric"
                maxLength={10}
                {...fieldProps("phone")}
              />
              {fieldError("phone")}
            </div>

            <div className="voltix-user-form-group">
              <label htmlFor="register-password">Password</label>
              <input
                id="register-password"
                type="password"
                placeholder="Create a password"
                autoComplete="new-password"
                maxLength={128}
                {...fieldProps("password")}
              />
              {fieldError("password")}
            </div>

            <div className="voltix-user-form-group">
              <label htmlFor="register-confirm-password">Confirm password</label>
              <input
                id="register-confirm-password"
                type="password"
                placeholder="Repeat the password"
                autoComplete="new-password"
                maxLength={128}
                {...fieldProps("confirmPassword")}
              />
              {fieldError("confirmPassword")}
            </div>

            <label className="voltix-register-terms">
              <input
                type="checkbox"
                checked={agreeTerms}
                aria-invalid={Boolean(fieldErrors.terms)}
                aria-describedby={fieldErrors.terms ? "register-terms-error" : undefined}
                onChange={(event) => {
                  setAgreeTerms(event.target.checked);
                  setFieldErrors((previous) => ({ ...previous, terms: "" }));
                }}
              />
              <span>I agree to the terms and the privacy policy.</span>
            </label>
            {fieldErrors.terms && (
              <p id="register-terms-error" role="alert" style={{ color: "#dc2626", fontSize: "12px", marginTop: "5px" }}>
                {fieldErrors.terms}
              </p>
            )}

            {error && <p className="voltix-register-error" role="alert">{error}</p>}
            {success && <p style={{ color: "#15803d", fontSize: "13px", marginBottom: "12px" }} role="status">{success}</p>}
            <button type="submit" className="voltix-user-login-button" disabled={loading}>
              {loading ? "Sending OTP..." : "Create account and send OTP"}
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
              marginTop: "16px",
              marginBottom: "16px",
            }}
          />

          <p className="voltix-user-register-link">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="voltix-user-footer">
        <div className="voltix-user-footer-content">
          <div className="voltix-footer-about">
            <h2>Voltix</h2>
            <p>Gadgets only: phones, laptops, audio, wearables, cameras and accessories.</p>
          </div>
          <div className="voltix-footer-column">
            <h3>Shop</h3>
            <a href="#products">All products</a>
            <a href="#wishlist">Wishlist</a>
            <a href="#cart">Cart</a>
          </div>
          <div className="voltix-footer-column">
            <h3>Account</h3>
            <Link to="/login">Login</Link>
            <Link to="/register">Create account</Link>
            <a href="#orders">My orders</a>
          </div>
          <div className="voltix-footer-column">
            <h3>Help</h3>
            <span>Contact: [support email]</span>
            <span>Phone: [support number]</span>
          </div>
        </div>
        <div className="voltix-user-footer-bottom">© Voltix. All rights reserved.</div>
      </footer>
    </div>
  );
}

export default UserRegister;
