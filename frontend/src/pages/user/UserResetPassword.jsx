import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";
import { API_BASE_URL } from "../../config/api";
import "./UserLogin.css";

function UserResetPassword() {
  const navigate = useNavigate();

  const [resetData] = useState(() => {
    try {
      const saved = sessionStorage.getItem(
        "voltix_password_reset"
      );

      if (!saved) return null;

      const data = JSON.parse(saved);

      if (
        typeof data.challenge !== "string" ||
        !/^[a-f0-9]{64}$/.test(data.challenge) ||
        typeof data.email !== "string" ||
        !data.email.trim() ||
        !Number.isFinite(data.expiresAt)
      ) {
        throw new Error("Invalid reset session");
      }

      return data;
    } catch {
      sessionStorage.removeItem(
        "voltix_password_reset"
      );

      return null;
    }
  });

  const [otp, setOtp] = useState("");
  const [verified, setVerified] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [otpTouched, setOtpTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] =
    useState(false);
  const [confirmTouched, setConfirmTouched] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  // =====================================
  // VALIDATION FUNCTIONS
  // =====================================

  const validateOTP = (value) => {
    if (!value) {
      return "Verification code is required.";
    }

    if (!/^\d{6}$/.test(value)) {
      return "Enter a valid 6-digit OTP.";
    }

    return "";
  };

  const validatePassword = (value) => {
    if (!value) {
      return "New password is required.";
    }

    if (value.length < 8 || value.length > 128) {
      return "Password must contain 8–128 characters.";
    }

    if (!value.trim()) {
      return "Password cannot contain only spaces.";
    }

    return "";
  };

  const validateConfirmPassword = (value) => {
    if (!value) {
      return "Please confirm your new password.";
    }

    if (value !== newPassword) {
      return "Passwords do not match.";
    }

    return "";
  };

  const otpError = otpTouched
    ? validateOTP(otp)
    : "";

  const passwordError = passwordTouched
    ? validatePassword(newPassword)
    : "";

  const confirmError = confirmTouched
    ? validateConfirmPassword(confirmPassword)
    : "";

  // =====================================
  // REDIRECT IF RESET SESSION MISSING
  // =====================================

  useEffect(() => {
    if (!resetData) {
      navigate("/forgot-password", {
        replace: true,
      });
    }
  }, [navigate, resetData]);

  // =====================================
  // OTP EXPIRY TIMER
  // =====================================

  useEffect(() => {
    if (!resetData) return;

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil(
          (resetData.expiresAt - Date.now()) / 1000
        )
      );

      setSecondsLeft(remaining);
    };

    updateTimer();

    const timer = setInterval(
      updateTimer,
      1000
    );

    return () => clearInterval(timer);
  }, [resetData]);

  // =====================================
  // VERIFY OTP
  // =====================================

  const handleVerifyOTP = async (event) => {
    event.preventDefault();

    if (loading || !resetData) return;

    setError("");
    setOtpTouched(true);

    if (secondsLeft <= 0) {
      setError(
        "OTP expired. Please request a new code."
      );
      return;
    }

    const validationError = validateOTP(otp);

    if (validationError) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/verify-reset-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            challenge: resetData.challenge,
            otp,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            "OTP verification failed."
        );
      }

      setVerified(true);
      setError("");
    } catch (err) {
      setError(
        err.message ||
          "Unable to verify OTP. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================
  // RESET PASSWORD
  // =====================================

  const handleResetPassword = async (event) => {
    event.preventDefault();

    if (
      loading ||
      !resetData ||
      !verified
    ) {
      return;
    }

    setError("");
    setPasswordTouched(true);
    setConfirmTouched(true);

    if (secondsLeft <= 0) {
      setError(
        "OTP expired. Please request a new code."
      );
      return;
    }

    const passwordValidationError =
      validatePassword(newPassword);

    const confirmValidationError =
      validateConfirmPassword(confirmPassword);

    if (
      passwordValidationError ||
      confirmValidationError
    ) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            challenge: resetData.challenge,
            otp,
            newPassword,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            "Password reset failed."
        );
      }

      // Clear reset session
      sessionStorage.removeItem(
        "voltix_password_reset"
      );

      // Clear sensitive form values
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");

      // Redirect to login with success message
      navigate("/login", {
        replace: true,
        state: {
          message:
            "Password reset successful. Please log in.",
        },
      });
    } catch (err) {
      setError(
        err.message ||
          "Unable to reset password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================
  // FORMAT TIMER
  // =====================================

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(
      2,
      "0"
    )}:${String(remainingSeconds).padStart(2, "0")}`;
  };

  // =====================================
  // JSX
  // =====================================

  return (
    <div className="voltix-user-login-page">
      <header className="voltix-user-header">
        <div className="voltix-user-navbar">
          <Link
            to="/"
            className="voltix-user-logo"
          ><BrandLogo /></Link>

          <nav className="voltix-user-header-links">
            <Link to="/login">Login</Link>
            <Link to="/register">
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main className="voltix-user-login-main">
        <section className="voltix-user-login-card">
          <h1>
            {verified
              ? "Create new password"
              : "Verify reset code"}
          </h1>

          <p className="voltix-user-login-subtitle">
            {verified
              ? "Enter a new password for your VOLTIX account."
              : `Enter the 6-digit code sent to ${
                  resetData?.email || "your email"
                }.`}
          </p>

          {/* OTP TIMER */}
          <p
            style={{
              textAlign: "center",
              marginBottom: "20px",
              color:
                secondsLeft > 0
                  ? "#374151"
                  : "#dc2626",
            }}
          >
            {secondsLeft > 0
              ? `Code expires in ${formatTime(
                  secondsLeft
                )}`
              : "Verification code expired"}
          </p>

          {/* API ERROR */}
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

          {!verified ? (
            // =====================================
            // OTP FORM
            // =====================================

            <form
              onSubmit={handleVerifyOTP}
              noValidate
            >
              <div className="voltix-user-form-group">
                <label htmlFor="reset-otp">
                  Verification code
                </label>

                <input
                  id="reset-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(event) => {
                    setOtp(
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6)
                    );
                    setError("");
                  }}
                  onBlur={() =>
                    setOtpTouched(true)
                  }
                  disabled={
                    loading ||
                    secondsLeft <= 0
                  }
                  aria-invalid={Boolean(
                    otpError
                  )}
                  aria-describedby={
                    otpError
                      ? "reset-otp-error"
                      : undefined
                  }
                  style={{
                    borderColor: otpError
                      ? "#dc2626"
                      : undefined,
                  }}
                />

                {otpError && (
                  <p
                    id="reset-otp-error"
                    role="alert"
                    style={{
                      color: "#dc2626",
                      fontSize: "12px",
                      marginTop: "5px",
                    }}
                  >
                    {otpError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="voltix-user-login-button"
                disabled={
                  loading ||
                  secondsLeft <= 0
                }
              >
                {loading
                  ? "Verifying..."
                  : "Verify OTP"}
              </button>
            </form>
          ) : (
            // =====================================
            // NEW PASSWORD FORM
            // =====================================

            <form
              onSubmit={handleResetPassword}
              noValidate
            >
              {/* NEW PASSWORD */}
              <div className="voltix-user-form-group">
                <label htmlFor="new-password">
                  New password
                </label>

                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  maxLength={128}
                  onChange={(event) => {
                    setNewPassword(
                      event.target.value
                    );
                    setError("");
                  }}
                  onBlur={() =>
                    setPasswordTouched(true)
                  }
                  disabled={
                    loading ||
                    secondsLeft <= 0
                  }
                  aria-invalid={Boolean(
                    passwordError
                  )}
                  aria-describedby={
                    passwordError
                      ? "new-password-error"
                      : undefined
                  }
                  style={{
                    borderColor: passwordError
                      ? "#dc2626"
                      : undefined,
                  }}
                />

                {passwordError && (
                  <p
                    id="new-password-error"
                    role="alert"
                    style={{
                      color: "#dc2626",
                      fontSize: "12px",
                      marginTop: "5px",
                    }}
                  >
                    {passwordError}
                  </p>
                )}
              </div>

              {/* CONFIRM PASSWORD */}
              <div className="voltix-user-form-group">
                <label htmlFor="confirm-password">
                  Confirm new password
                </label>

                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  maxLength={128}
                  onChange={(event) => {
                    setConfirmPassword(
                      event.target.value
                    );
                    setError("");
                  }}
                  onBlur={() =>
                    setConfirmTouched(true)
                  }
                  disabled={
                    loading ||
                    secondsLeft <= 0
                  }
                  aria-invalid={Boolean(
                    confirmError
                  )}
                  aria-describedby={
                    confirmError
                      ? "confirm-password-error"
                      : undefined
                  }
                  style={{
                    borderColor: confirmError
                      ? "#dc2626"
                      : undefined,
                  }}
                />

                {confirmError && (
                  <p
                    id="confirm-password-error"
                    role="alert"
                    style={{
                      color: "#dc2626",
                      fontSize: "12px",
                      marginTop: "5px",
                    }}
                  >
                    {confirmError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="voltix-user-login-button"
                disabled={
                  loading ||
                  secondsLeft <= 0
                }
              >
                {loading
                  ? "Resetting..."
                  : "Reset password"}
              </button>
            </form>
          )}

          <p className="voltix-user-register-link">
            {secondsLeft <= 0 ? (
              <Link to="/forgot-password">
                Request a new code
              </Link>
            ) : (
              <Link to="/login">
                Back to login
              </Link>
            )}
          </p>
        </section>
      </main>

      <footer className="voltix-user-footer">
        <div className="voltix-user-footer-bottom">
          © Voltix. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default UserResetPassword;