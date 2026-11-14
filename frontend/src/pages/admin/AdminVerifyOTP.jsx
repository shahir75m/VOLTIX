import { invalidateAdminSession } from "../../utils/adminSession";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";
import { API_BASE_URL } from "../../config/api";
import "./AdminVerifyOTP.css";
import Icon from "../../components/Icon";

function AdminVerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();

  const [challenge, setChallenge] = useState(
    location.state?.challenge || ""
  );

  const [otp, setOtp] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  const [secondsLeft, setSecondsLeft] = useState(
    location.state?.expiresIn || 300
  );
  const [resendSeconds, setResendSeconds] = useState(60);

  const inputRefs = useRef([]);

  useEffect(() => {
    if (!challenge) {
      navigate("/admin/login", { replace: true });
    }
  }, [challenge, navigate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((remaining) => Math.max(0, remaining - 1));
      setResendSeconds((remaining) => Math.max(0, remaining - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remaining
    ).padStart(2, "0")}`;
  };

  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);

    const updated = [...otp];
    updated[index] = digit;

    setOtp(updated);
    setError("");

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, event) => {
    if (
      event.key === "Backspace" &&
      !otp[index] &&
      index > 0
    ) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!pasted) return;

    event.preventDefault();

    const updated = Array(6).fill("");

    pasted.split("").forEach((digit, index) => {
      updated[index] = digit;
    });

    setOtp(updated);
    setError("");

    inputRefs.current[
      Math.min(pasted.length, 5)
    ]?.focus();
  };

  const handleVerify = async (event) => {
    event.preventDefault();

    const code = otp.join("");

    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    if (secondsLeft === 0) {
      setError("OTP expired. Please login again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/verify-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            challenge,
            otp: code,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "OTP verification failed");
      }

      if (!data.success) {
        throw new Error("OTP verification failed");
      }

      invalidateAdminSession();
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
      setOtp(Array(6).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resending || resendSeconds > 0 || secondsLeft === 0) {
      return;
    }

    setResending(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/resend-otp`,
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

      if (!response.ok) {
        if (data.retryAfter) {
          setResendSeconds(data.retryAfter);
        }

        throw new Error(data.message || "Failed to resend OTP");
      }

      setChallenge(data.challenge);
      setSecondsLeft(data.expiresIn);
      setResendSeconds(60);
      setOtp(Array(6).fill(""));

      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="voltix-otp-page">
      <div className="voltix-otp-container">

        <header className="voltix-otp-brand">
          <BrandLogo size="lg" />
          <p>Admin panel</p>
        </header>

        <section className="voltix-otp-card">
          <h2>Verify it is you</h2>

          <p className="voltix-otp-description">
            Step 2 of 2. Enter the 6-digit code sent to your
            admin email.
          </p>

          <form onSubmit={handleVerify}>
            <div
              className="voltix-otp-inputs"
              onPaste={handlePaste}
            >
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputRefs.current[index] = element;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={
                    index === 0 ? "one-time-code" : "off"
                  }
                  maxLength={1}
                  value={digit}
                  onChange={(event) =>
                    handleChange(index, event.target.value)
                  }
                  onKeyDown={(event) =>
                    handleKeyDown(index, event)
                  }
                  aria-label={`OTP digit ${index + 1}`}
                  required
                />
              ))}
            </div>

            {error && (
              <p className="voltix-otp-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="voltix-otp-verify-button"
              type="submit"
              disabled={loading || secondsLeft === 0}
            >
              {loading
                ? "Verifying..."
                : "Verify and open dashboard"}
            </button>
          </form>

          <div className="voltix-otp-resend">
            <span>
  {secondsLeft === 0
    ? "Code expired"
    : `Code expires in ${formatTime(secondsLeft)}`}
</span>

            <button
              type="button"
              onClick={handleResend}
              disabled={
                resending ||
                resendSeconds > 0 ||
                secondsLeft === 0
              }
            >
              {resending ? "Sending..." : "Resend OTP"}
            </button>
          </div>
        </section>

        <div className="voltix-otp-back">
          <Link to="/admin/login">
            <Icon name="arrow-left" size={15} /> Back to admin login
          </Link>
        </div>

      </div>
    </main>
  );
}

export default AdminVerifyOTP;