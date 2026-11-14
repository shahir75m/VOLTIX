import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../../config/api";
import StoreLayout from "../../components/StoreLayout";
import "./UserProfile.css";

function UserProfileEdit() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const [touched, setTouched] = useState({
    name: false,
    phone: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // =====================================
  // VALIDATION FUNCTIONS
  // =====================================

  const validateName = (value) => {
    const name = value.trim();

    if (!name) {
      return "Full name is required.";
    }

    if (name.length < 2 || name.length > 60) {
      return "Name must contain 2 to 60 characters.";
    }

    // Allow Unicode letters, spaces, apostrophes,
    // dots and hyphens. Require at least one letter.
    if (
      !/^[\p{L}\p{M} .'-]+$/u.test(name) ||
      !/\p{L}/u.test(name)
    ) {
      return "Name can contain letters, spaces, dots, apostrophes and hyphens only.";
    }

    return "";
  };

  const validatePhone = (value) => {
    const phone = value.trim();

    // Phone is optional in the existing form
    if (!phone) {
      return "";
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return "Enter a valid 10-digit Indian mobile number.";
    }

    return "";
  };

  const nameError = touched.name
    ? validateName(profile.name)
    : "";

  const phoneError = touched.phone
    ? validatePhone(profile.phone)
    : "";

  // =====================================
  // LOAD PROFILE
  // =====================================

  useEffect(() => {
    const controller = new AbortController();

    const loadProfile = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/users/me`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );

        const data = await response
          .json()
          .catch(() => ({}));

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          navigate("/login", {
            replace: true,
            state: {
              message:
                data.message ||
                "Please log in to continue.",
            },
          });
          return;
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || "Failed to load profile."
          );
        }

        setProfile({
          name: data.user?.name || "",
          email: data.user?.email || "",
          phone: data.user?.phone || "",
        });
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(
            loadError.message ||
              "Unable to load profile. Please try again."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => controller.abort();
  }, [navigate]);

  // =====================================
  // HANDLE INPUT CHANGE
  // =====================================

  const handleChange = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));

    setError("");
  };

  // =====================================
  // HANDLE SUBMIT
  // =====================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (saving || loading) return;

    setError("");

    setTouched({
      name: true,
      phone: true,
    });

    const name = profile.name.trim();
    const phone = profile.phone.trim();

    const currentNameError = validateName(name);
    const currentPhoneError = validatePhone(phone);

    if (currentNameError || currentPhoneError) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/profile`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            phone,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      // Handle expired or blocked session
      if (
        response.status === 401 ||
        response.status === 403
      ) {
        navigate("/login", {
          replace: true,
          state: {
            message:
              data.message ||
              "Your session is no longer valid. Please log in again.",
          },
        });

        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to update profile."
        );
      }

      // Navigate with success message
      navigate("/profile", {
        replace: true,
        state: {
          message: "Profile updated successfully.",
        },
      });
    } catch (saveError) {
      setError(
        saveError.message ||
          "Unable to save profile. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  // =====================================
  // LOADING SCREEN
  // =====================================

  if (loading) {
    return (
      <div className="voltix-profile-loading">
        Loading your profile...
      </div>
    );
  }

  // =====================================
  // JSX
  // =====================================

  return (
    <StoreLayout>
    <div className="voltix-profile-page">

      {/* MAIN */}
      <main className="voltix-profile-content">
        <h1>Edit profile</h1>

        <section className="voltix-profile-card">
          <form
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="voltix-profile-fields">
              {/* FULL NAME */}
              <label>
                Full name

                <input
                  type="text"
                  value={profile.name}
                  maxLength={60}
                  autoComplete="name"
                  onChange={(event) =>
                    handleChange(
                      "name",
                      event.target.value
                    )
                  }
                  onBlur={() =>
                    setTouched((current) => ({
                      ...current,
                      name: true,
                    }))
                  }
                  disabled={saving}
                  aria-invalid={Boolean(nameError)}
                  style={{
                    borderColor: nameError
                      ? "#dc2626"
                      : undefined,
                  }}
                />

                {nameError && (
                  <small
                    role="alert"
                    style={{
                      color: "#dc2626",
                      display: "block",
                      marginTop: "5px",
                    }}
                  >
                    {nameError}
                  </small>
                )}
              </label>

              {/* EMAIL - READ ONLY */}
              <label>
                Email

                <input
                  type="email"
                  value={profile.email}
                  readOnly
                />

                <small>
                  To change your email, use the
                  verification form in{" "}
                  <Link to="/profile">
                    Profile &amp; addresses
                  </Link>.
                </small>
              </label>

              {/* PHONE NUMBER */}
              <label>
                Phone number

                <input
                  type="tel"
                  value={profile.phone}
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="tel"
                  onChange={(event) =>
                    handleChange(
                      "phone",
                      event.target.value
                    )
                  }
                  onBlur={() =>
                    setTouched((current) => ({
                      ...current,
                      phone: true,
                    }))
                  }
                  disabled={saving}
                  aria-invalid={Boolean(phoneError)}
                  style={{
                    borderColor: phoneError
                      ? "#dc2626"
                      : undefined,
                  }}
                />

                {phoneError && (
                  <small
                    role="alert"
                    style={{
                      color: "#dc2626",
                      display: "block",
                      marginTop: "5px",
                    }}
                  >
                    {phoneError}
                  </small>
                )}
              </label>
            </div>

            {/* API ERROR */}
            {error && (
              <p
                className="voltix-profile-error"
                role="alert"
              >
                {error}
              </p>
            )}

            {/* ACTION BUTTONS */}
            <div className="voltix-profile-form-actions">
              <Link
                to="/profile"
                className="voltix-profile-outline-btn"
              >
                Cancel
              </Link>

              <button
                type="submit"
                className="voltix-profile-primary-btn"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : "Save changes"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
    </StoreLayout>
  );
}

export default UserProfileEdit;