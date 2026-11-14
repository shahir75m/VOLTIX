import { useEffect, useState } from "react";
import AdminPagePending from "../../components/AdminPagePending";
import AdminSidebar from "../../components/AdminSidebar";
import useAdminAuth from "../../hooks/useAdminAuth";
import { apiJson } from "../../utils/api";
import "./AdminDashboard.css";
import "./AdminSecurity.css";

const formatTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;

export default function AdminSecurity() {
  const { checkingAuth, handleAuthError } = useAdminAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [otp, setOtp] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!challenge) return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((remaining) => Math.max(0, remaining - 1));
      setResendSeconds((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  const handleAuthFailure = (requestError) => {
    if (handleAuthError(requestError)) return true;
    setError(requestError.message);
    return false;
  };

  const requestCode = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const data = await apiJson(
        "/api/admin/password-change/request-otp",
        "POST",
        { currentPassword, newPassword }
      );
      if (
        !data?.success ||
        !data.challenge ||
        !Number.isInteger(data.expiresIn) ||
        typeof data.message !== "string"
      ) {
        throw new Error("Invalid password-change verification response");
      }
      setChallenge(data.challenge);
      setSecondsLeft(data.expiresIn);
      setResendSeconds(60);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOtp("");
      setNotice(data.message);
    } catch (requestError) {
      handleAuthFailure(requestError);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the complete 6-digit verification code");
      return;
    }
    if (secondsLeft === 0) {
      setError("The code expired. Start the password change again.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiJson(
        "/api/admin/password-change/verify-otp",
        "POST",
        { challenge, otp }
      );
      if (!data?.success || typeof data.message !== "string") {
        throw new Error("Invalid password-change response");
      }
      setChallenge("");
      setOtp("");
      setSecondsLeft(0);
      setResendSeconds(0);
      setNotice(data.message);
    } catch (requestError) {
      handleAuthFailure(requestError);
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (resending || resendSeconds > 0 || secondsLeft === 0) return;
    setError("");
    setNotice("");
    setResending(true);

    try {
      const data = await apiJson(
        "/api/admin/password-change/resend-otp",
        "POST",
        { challenge }
      );
      if (
        !data?.success ||
        !data.challenge ||
        !Number.isInteger(data.expiresIn) ||
        typeof data.message !== "string"
      ) {
        throw new Error("Invalid password-change verification response");
      }
      setChallenge(data.challenge);
      setSecondsLeft(data.expiresIn);
      setResendSeconds(60);
      setOtp("");
      setNotice(data.message);
    } catch (requestError) {
      if (requestError.data?.retryAfter) {
        setResendSeconds(requestError.data.retryAfter);
      }
      handleAuthFailure(requestError);
    } finally {
      setResending(false);
    }
  };

  const startOver = () => {
    setChallenge("");
    setOtp("");
    setSecondsLeft(0);
    setResendSeconds(0);
    setError("");
    setNotice("");
  };

  if (checkingAuth) return <AdminPagePending active="Security" />;

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Security" />
      <main className="voltix-admin-main">
        <header className="voltix-dashboard-header">
          <div>
            <h1>Security</h1>
            <p>Update your admin password securely</p>
          </div>
        </header>

        <section className="admin-security-card">
          <h2>Change password</h2>
          <p>
            Enter your current password and choose a new one. We will email a
            verification code to your admin email before saving the change.
          </p>

          {error && <div className="admin-security-alert error" role="alert">{error}</div>}
          {notice && <div className="admin-security-alert success" role="status">{notice}</div>}

          {challenge ? (
            <form className="admin-security-form" onSubmit={verifyCode}>
              <label className="admin-security-field" htmlFor="admin-password-otp">
                <span>6-digit verification code</span>
                <input
                  id="admin-password-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                />
              </label>

              <div className="admin-security-code-meta">
                <span>
                  {secondsLeft === 0
                    ? "Code expired"
                    : `Code expires in ${formatTime(secondsLeft)}`}
                </span>
                <button
                  className="admin-security-text-button"
                  type="button"
                  onClick={resendCode}
                  disabled={resending || resendSeconds > 0 || secondsLeft === 0}
                >
                  {resending
                    ? "Sending..."
                    : resendSeconds > 0
                      ? `Resend in ${formatTime(resendSeconds)}`
                      : "Resend code"}
                </button>
              </div>

              <div className="admin-security-actions">
                <button
                  className="admin-security-secondary-button"
                  type="button"
                  onClick={startOver}
                  disabled={loading || resending}
                >
                  Start over
                </button>
                <button
                  className="admin-security-submit"
                  type="submit"
                  disabled={loading || secondsLeft === 0}
                >
                  {loading ? "Verifying..." : "Verify and change password"}
                </button>
              </div>
            </form>
          ) : (
            <form className="admin-security-form" onSubmit={requestCode}>
              <label className="admin-security-field" htmlFor="current-admin-password">
                <span>Current password</span>
                <input
                  id="current-admin-password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </label>
              <label className="admin-security-field" htmlFor="new-admin-password">
                <span>New password</span>
                <input
                  id="new-admin-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
                <small>Use 8–128 characters.</small>
              </label>
              <label className="admin-security-field" htmlFor="confirm-admin-password">
                <span>Confirm new password</span>
                <input
                  id="confirm-admin-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </label>
              <button
                className="admin-security-submit"
                type="submit"
                disabled={loading}
              >
                {loading ? "Sending code..." : "Send verification code"}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
