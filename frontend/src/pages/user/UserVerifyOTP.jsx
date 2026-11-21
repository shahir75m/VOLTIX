import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";

import { API_BASE_URL } from "../../config/api";
import "./UserLogin.css";
import "./UserVerifyOTP.css";

function UserVerifyOTP() {
  const navigate = useNavigate();

  const [otp, setOtp] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [timeLeft, setTimeLeft] = useState(() => {
  const expiresAt = Number(
    sessionStorage.getItem("voltixRegistrationExpiresAt")
  );

  if (!expiresAt) return 0;

  return Math.max(
    0,
    Math.ceil((expiresAt - Date.now()) / 1000)
  );
});
  const [resendTimeLeft, setResendTimeLeft] = useState(() => {
    const resendAt = Number(
      sessionStorage.getItem("voltixRegistrationResendAt")
    );

    return resendAt
      ? Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))
      : 0;
  });

  const inputRefs = useRef([]);

  const email =
    sessionStorage.getItem("voltixRegistrationEmail") || "";

  const challenge = sessionStorage.getItem(
    "voltixRegistrationChallenge"
  );

  useEffect(() => {
    if (!challenge) {
      navigate("/register", { replace: true });
    }
  }, [challenge, navigate]);

  // OTP Expiry Countdown

  useEffect(() => {
  const updateTimer = () => {
    const expiresAt = Number(
      sessionStorage.getItem("voltixRegistrationExpiresAt")
    );
    const resendAt = Number(
      sessionStorage.getItem("voltixRegistrationResendAt")
    );

    if (!expiresAt) {
      setTimeLeft(0);
    } else {
      setTimeLeft(
        Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      );
    }

    setResendTimeLeft(
      resendAt
        ? Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))
        : 0
    );
  };

  updateTimer();

  const interval = setInterval(updateTimer, 1000);

  return () => clearInterval(interval);
}, []);

  const handleResendOTP = async () => {
    if (!challenge || loading || resendTimeLeft > 0) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/resend-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ challenge }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.retryAfter) {
          sessionStorage.setItem(
            "voltixRegistrationResendAt",
            String(Date.now() + data.retryAfter * 1000)
          );
          setResendTimeLeft(data.retryAfter);
        }

        throw new Error(data.message || "Unable to resend OTP");
      }

      const expiresAt = Date.now() + data.expiresIn * 1000;
      const resendAt =
        Date.now() + (data.resendAfter || 60) * 1000;

      sessionStorage.setItem(
        "voltixRegistrationExpiresAt",
        String(expiresAt)
      );
      sessionStorage.setItem(
        "voltixRegistrationResendAt",
        String(resendAt)
      );
      setTimeLeft(data.expiresIn);
      setResendTimeLeft(data.resendAfter || 60);
      setOtp(Array(6).fill(""));
      setSuccess("A new verification code has been sent.");
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err.message || "Unable to resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  };

  // Handle OTP Input

  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);

    const updatedOTP = [...otp];
    updatedOTP[index] = digit;

    setOtp(updatedOTP);
    setError("");

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle Backspace

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle Paste

  const handlePaste = (event) => {
    event.preventDefault();

    const pastedOTP = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!pastedOTP) return;

    const updatedOTP = Array(6).fill("");

    pastedOTP.split("").forEach((digit, index) => {
      updatedOTP[index] = digit;
    });

    setOtp(updatedOTP);
    setError("");

    inputRefs.current[Math.min(pastedOTP.length, 5)]?.focus();
  };

  // Verify OTP

  const handleVerify = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const enteredOTP = otp.join("");

    if (!challenge) {
      setError("Verification session missing. Please register again.");
      return;
    }

    if (timeLeft <= 0) {
      setError("OTP expired. Please register again.");
      return;
    }

    if (!/^\d{6}$/.test(enteredOTP)) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/verify-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            challenge,
            otp: enteredOTP,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "OTP verification failed");
      }

      sessionStorage.removeItem("voltixRegistrationChallenge");
      sessionStorage.removeItem("voltixRegistrationEmail");
      sessionStorage.removeItem("voltixRegistrationExpiresAt");
      sessionStorage.removeItem("voltixRegistrationResendAt");

      setSuccess("Account created successfully!");

      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err) {
      setError(err.message || "Something went wrong.");
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

          <div className="voltix-user-search">
            <input
              type="search"
              placeholder="Search phones, earbuds, laptops..."
              aria-label="Search products"
            />
            <button type="button">Search</button>
          </div>

          <nav className="voltix-user-header-links">
            <Link to="/products">Shop</Link>
            <Link to="/offers">Offers</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/cart">Cart</Link>
            <Link to="/login">Login</Link>
          </nav>
        </div>

      </header>

      {/* OTP VERIFICATION */}

      <main className="voltix-user-login-main voltix-otp-main">
        <section className="voltix-user-login-card voltix-otp-card">

          <h1>Enter the code</h1>

          <p className="voltix-otp-description">
            We sent a 6-digit one-time password to{" "}
            {email || "your email"}.
            It expires in 5 minutes.
          </p>

          <p className="voltix-otp-description" style={{ fontSize: "12px" }}>
            Use “Resend OTP” if you need another code.
          </p>

          <form onSubmit={handleVerify}>

            <div className="voltix-otp-inputs" onPaste={handlePaste}>
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputRefs.current[index] = element;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={digit}
                  onChange={(event) =>
                    handleChange(index, event.target.value)
                  }
                  onKeyDown={(event) =>
                    handleKeyDown(index, event)
                  }
                  aria-label={`OTP digit ${index + 1}`}
                  disabled={loading || timeLeft === 0}
                />
              ))}
            </div>

            {error && (
              <p className="voltix-otp-error" role="alert">
                {error}
              </p>
            )}

            {success && (
              <p className="voltix-otp-success" role="status">
                {success}
              </p>
            )}

            <button
              type="submit"
              className="voltix-user-login-button voltix-otp-verify-button"
              disabled={loading || timeLeft === 0}
            >
              {loading ? "Verifying..." : "Verify and continue"}
            </button>
          </form>

          {/* TIMER AND RESEND */}

          <div className="voltix-otp-resend">
            <span>
              {timeLeft > 0
                ? `Code expires in ${formatTime(timeLeft)}`
                : "Code expired"}
            </span>

            <button
              type="button"
              onClick={handleResendOTP}
              disabled={resendTimeLeft > 0 || loading}
            >
              {resendTimeLeft > 0
                ? `Resend in ${formatTime(resendTimeLeft)}`
                : "Resend OTP"}
            </button>
          </div>

          {/* BACK LINK */}

          <div className="voltix-otp-back">
            Wrong number or email?{" "}
            <Link to="/register">Go back</Link>
          </div>

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

export default UserVerifyOTP;