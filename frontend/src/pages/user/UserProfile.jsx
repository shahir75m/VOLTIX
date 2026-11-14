import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { API_BASE_URL } from "../../config/api";
import "./UserProfile.css";
import Icon from "../../components/Icon";
function UserProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profileSuccess, setProfileSuccess] = useState(() => location.state?.message || "");
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [profileImage, setProfileImage] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageSuccess, setImageSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addressesError, setAddressesError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState("");
  // Address validation only. Existing pincode lookup and autofill are unchanged.
  const [addFieldErrors, setAddFieldErrors] = useState({});
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const addressLabels = {
    addressType: "Address type", fullName: "Full name", phone: "Phone number",
    addressLine1: "Address line 1", addressLine2: "Address line 2",
    city: "City", district: "District", state: "State", pincode: "Pincode",
  };
  const validateAddressField = (field, raw) => {
    const value = String(raw ?? "").trim();
    if (field !== "addressLine2" && !value) return `${addressLabels[field]} is required.`;
    if (field === "addressType" && (value.length < 2 || value.length > 30)) return "Address type must be 2–30 characters.";
    if (field === "fullName" && (!/^[\p{L}][\p{L} .'-]*$/u.test(value) || value.length > 60)) return "Enter a valid full name (up to 60 characters).";
    if (field === "phone" && !/^[6-9]\d{9}$/.test(value)) return "Enter a valid 10-digit Indian mobile number.";
    if (field === "pincode" && !/^[1-9]\d{5}$/.test(value)) return "Enter a valid 6-digit Indian pincode.";
    const max = { addressLine1: 200, addressLine2: 200, city: 100, district: 100, state: 100 }[field];
    if (max && value.length > max) return `${addressLabels[field]} must be ${max} characters or fewer.`;
    return "";
  };
  const validateAddress = (values) => Object.fromEntries(
    Object.keys(addressLabels).map((field) => [field, validateAddressField(field, values[field])])
      .filter(([, message]) => Boolean(message))
  );
  const inlineAddressError = (field, errors) => errors[field] ? (
    <small role="alert" style={{ color: "#dc2626", display: "block", marginTop: 5 }}>
      {errors[field]}
    </small>
  ) : null;
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [editAddressData, setEditAddressData] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [passwordData, setPasswordData] = useState({currentPassword: "",newPassword: "",confirmPassword: "",});
  const [passwordTouched, setPasswordTouched] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const validatePasswordField = (field, values) => {
    const { currentPassword, newPassword, confirmPassword } = values;
    if (field === "currentPassword") {
      return currentPassword ? "" : "Current password is required.";
    }
    if (field === "newPassword") {
      if (!newPassword) return "New password is required.";
      if (!newPassword.trim()) return "Password cannot contain only spaces.";
      if (newPassword.length < 8 || newPassword.length > 128) {
        return "New password must contain 8–128 characters.";
      }
      if (newPassword === currentPassword) {
        return "New password must be different from current password.";
      }
      return "";
    }
    if (!confirmPassword) return "Please confirm your new password.";
    if (confirmPassword !== newPassword) return "New passwords do not match.";
    return "";
  };
  const passwordFieldError = (field) =>
    passwordTouched[field] ? validatePasswordField(field, passwordData) : "";
  const changePasswordInput = (field, value) => {
    setPasswordData((previous) => ({ ...previous, [field]: value }));
    setPasswordError("");
    setPasswordSuccess("");
  };
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");const [newEmail, setNewEmail] = useState("");
  const [emailChangeOTP, setEmailChangeOTP] = useState("");
  const [emailOTPSent, setEmailOTPSent] = useState(false);
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState("");
  const [emailChangeSuccess, setEmailChangeSuccess] = useState("");
  const [emailOTPExpiresAt, setEmailOTPExpiresAt] = useState(null);
  const [emailOTPSecondsLeft, setEmailOTPSecondsLeft] = useState(0);
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState("");
  const pincodeRequestId = useRef(0);
  useEffect(() => {
    if (!profileSuccess) return;
    const timer = setTimeout(() => setProfileSuccess(""), 4000);
    return () => clearTimeout(timer);
  }, [profileSuccess]);
  // keep the navbar avatar/name in sync after the photo or name changes
  useEffect(() => {
    if (!loading) window.dispatchEvent(new Event("voltix:user-updated"));
  }, [profileImage, profile.name, loading]);
  // Fetch logged-in user
  useEffect(() => {
    const controller = new AbortController();
    const fetchProfile = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/users/me`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await response.json();
        if (response.status === 401) {
  navigate("/login", {
    replace: true,
    state: {
      message: "Your session has expired. Please log in again.",
    },
  });
  return;
}
if (response.status === 403) {
  navigate("/login", {
    replace: true,
    state: {
      message: data.message || "Your account has been blocked.",
    },
  });
  return;
}
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Failed to load profile");
        }
        setProfile({
          name: data.user.name || "",
          email: data.user.email || "",
          phone: data.user.phone || "",
        });
        // Load saved profile image from MongoDB
        setProfileImage(data.user.profileImage?.url || "");
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    fetchProfile();
    return () => controller.abort();
  }, [navigate]);
  useEffect(() => {
  const controller = new AbortController();
  const fetchAddresses = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/addresses`,
        {
          credentials: "include",
          signal: controller.signal,
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to fetch addresses");
      }
      setAddresses(data.addresses);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Address Fetch Error:", error);
        setAddressesError("Failed to load saved addresses. Please refresh and try again.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setAddressesLoading(false);
      }
    }
  };
  fetchAddresses();
  return () => controller.abort();
}, []);
// EMAIL OTP COUNTDOWN TIMER
useEffect(() => {
  if (!emailOTPExpiresAt) return;
  const updateCountdown = () => {
    const remaining = Math.max(
      0,
      Math.ceil((emailOTPExpiresAt - Date.now()) / 1000)
    );
    setEmailOTPSecondsLeft(remaining);
  };
  updateCountdown();
  const timer = setInterval(updateCountdown, 1000);
  return () => clearInterval(timer);
}, [emailOTPExpiresAt]);
const lookupPincode = async (pincode, onSuccess) => {
  const requestId = ++pincodeRequestId.current;
  setPincodeError("");
  if (!/^[0-9]{6}$/.test(pincode)) {
    setPincodeLoading(false);
    return;
  }
  setPincodeLoading(true);
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/addresses/pincode/${pincode}`,
      { credentials: "include" }
    );
    const data = await response.json();
    if (requestId !== pincodeRequestId.current) return;
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Invalid pincode");
    }
    onSuccess(data.state, data.district);
  } catch (error) {
    if (requestId !== pincodeRequestId.current) return;
    setPincodeError(error.message);
  } finally {
    if (requestId === pincodeRequestId.current) {
      setPincodeLoading(false);
    }
  }
};
const handleAddAddress = async (event) => {
  event.preventDefault();
  setAddressError("");
  setAddressSaving(true);
  const form = event.currentTarget;
  const formData = new FormData(form);
  const addressData = {
    addressType: String(formData.get("addressType") || "").trim(),
    fullName: String(formData.get("fullName") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    addressLine1: String(formData.get("addressLine1") || "").trim(),
    addressLine2: String(formData.get("addressLine2") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    district: String(formData.get("district") || "").trim(),
    state: String(formData.get("state") || "").trim(),
    pincode: String(formData.get("pincode") || "").trim(),
  };
  const errors = validateAddress(addressData);
  setAddFieldErrors(errors);
  if (Object.keys(errors).length) {
    setAddressSaving(false);
    return;
  }
  if (pincodeLoading || pincodeError) {
    setAddressError(pincodeError || "Please wait for pincode verification.");
    setAddressSaving(false);
    return;
  }
  const makeDefault = formData.get("isDefault") === "on";
  try {
    const response = await fetch(`${API_BASE_URL}/api/addresses`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(addressData),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to add address");
    }
    if (makeDefault && !data.address.isDefault) {
      const defaultResponse = await fetch(
        `${API_BASE_URL}/api/addresses/${data.address._id}/default`,
        {
          method: "PATCH",
          credentials: "include",
        }
      );
      const defaultData = await defaultResponse.json();
      if (!defaultResponse.ok || !defaultData.success) {
        throw new Error(
          "Address saved, but setting it as default failed. Please try again."
        );
      }
    }
    // Fetch latest addresses from MongoDB
    const refreshResponse = await fetch(
      `${API_BASE_URL}/api/addresses`,
      { credentials: "include" }
    );
    const refreshData = await refreshResponse.json();
    if (!refreshResponse.ok || !refreshData.success) {
      throw new Error("Address saved, but refreshing the list failed.");
    }
    setAddresses(refreshData.addresses);
    setShowAddressForm(false);
  } catch (error) {
    setAddressError(error.message);
  } finally {
    setAddressSaving(false);
  }
};
// OPEN EDIT ADDRESS FORM
const handleEditAddress = (address) => {
  pincodeRequestId.current += 1;
  setPincodeLoading(false);
  setPincodeError("");
  setEditingAddressId(address._id);
  setEditIsDefault(address.isDefault);
  setEditAddressData({
    addressType: address.addressType,
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 || "",
    city: address.city,
    district: address.district || "",
    state: address.state,
    pincode: address.pincode,
  });
  setEditError("");
  setShowAddressForm(false);
};
// SAVE EDITED ADDRESS
const handleUpdateAddress = async (event) => {
  event.preventDefault();
  if (!editingAddressId || !editAddressData) return;
  const errors = validateAddress(editAddressData);
  setEditFieldErrors(errors);
  if (Object.keys(errors).length) return;
  if (pincodeLoading || pincodeError) {
    setEditError(pincodeError || "Please wait for pincode verification.");
    return;
  }
  setEditSaving(true);
  setEditError("");
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/addresses/${editingAddressId}`,
      {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editAddressData),
      }
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to update address");
    }
// Change default address if checkbox is selected
if (editIsDefault && !data.address.isDefault) {
  const defaultResponse = await fetch(
    `${API_BASE_URL}/api/addresses/${editingAddressId}/default`,
    {
      method: "PATCH",
      credentials: "include",
    }
  );
  const defaultData = await defaultResponse.json();
  if (!defaultResponse.ok || !defaultData.success) {
    throw new Error(
      defaultData.message || "Failed to set default address"
    );
  }
}
// Refresh all address cards
const refreshResponse = await fetch(
  `${API_BASE_URL}/api/addresses`,
  {
    credentials: "include",
  }
);
const refreshData = await refreshResponse.json();
if (!refreshResponse.ok || !refreshData.success) {
  throw new Error("Failed to refresh addresses");
}
setAddresses(refreshData.addresses);
    setEditingAddressId(null);
    setEditAddressData(null);
  } catch (error) {
    setEditError(error.message);
  } finally {
    setEditSaving(false);
  }
};
   // DELETE ADDRESS
const handleDeleteAddress = async (address) => {
  if (deleteSaving) return;
  setDeleteSaving(true);
  setDeleteError("");
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/addresses/${address._id}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to delete address");
    }
    // Refresh addresses to reflect any new default address
    const refreshResponse = await fetch(
      `${API_BASE_URL}/api/addresses`,
      {
        credentials: "include",
      }
    );
    const refreshData = await refreshResponse.json();
    if (!refreshResponse.ok || !refreshData.success) {
      throw new Error("Address deleted, but refreshing the list failed.");
    }
    setAddresses(refreshData.addresses);
    if (editingAddressId === address._id) {
      setEditingAddressId(null);
      setEditAddressData(null);
    }
    setDeleteTarget(null);
  } catch (error) {
    console.error("Delete Address Error:", error);
    setDeleteError(error.message);
  } finally {
    setDeleteSaving(false);
  }
};
// CHANGE USER PASSWORD
const handleChangePassword = async (event) => {
  event.preventDefault();
  if (passwordSaving) return;
  setPasswordError("");
  setPasswordSuccess("");
  setPasswordTouched({
    currentPassword: true,
    newPassword: true,
    confirmPassword: true,
  });
  const fields = ["currentPassword", "newPassword", "confirmPassword"];
  if (fields.some((field) => validatePasswordField(field, passwordData))) {
    return;
  }
  setPasswordSaving(true);
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/change-password`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      navigate("/login", {
        replace: true,
        state: {
          message: data.message || "Your session is no longer valid. Please log in again.",
        },
      });
      return;
    }
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to change password.");
    }
    setPasswordSuccess("Password changed successfully!");
    setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordTouched({ currentPassword: false, newPassword: false, confirmPassword: false });
  } catch (error) {
    setPasswordError(error.message || "Unable to change password. Please try again.");
  } finally {
    setPasswordSaving(false);
  }
};
// REQUEST EMAIL CHANGE OTP
const handleRequestEmailChangeOTP = async (event) => {
  event.preventDefault();
  setEmailChangeError("");
  setEmailChangeSuccess("");
  const email = newEmail.trim().toLowerCase();
  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setEmailChangeError("Please enter a valid email address");
    return;
  }
  // Prevent using current email
  if (email === profile?.email?.toLowerCase()) {
    setEmailChangeError(
      "New email must be different from current email"
    );
    return;
  }
  setEmailChangeLoading(true);
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/users/email-change/request`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newEmail: email,
        }),
      }
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(
        data.message || "Failed to send verification OTP"
      );
    }
    // OTP sent successfully
    setNewEmail(email);
    setEmailOTPSent(true);
    setEmailChangeOTP("");
    // Store OTP expiry time
    setEmailOTPExpiresAt(
      Date.now() + (data.expiresIn || 300) * 1000
    );
    setEmailChangeSuccess(
      data.message ||
        "Verification email submitted. Delivery may take a few minutes."
    );
  } catch (error) {
    setEmailChangeError(
      error.message || "Something went wrong"
    );
  } finally {
    setEmailChangeLoading(false);
  }
};
// VERIFY EMAIL CHANGE OTP
const handleVerifyEmailChangeOTP = async (event) => {
  event.preventDefault();
  setEmailChangeError("");
  setEmailChangeSuccess("");
  const otp = emailChangeOTP.trim();
  // Validate OTP
  if (!/^\d{6}$/.test(otp)) {
    setEmailChangeError("Please enter a valid 6-digit OTP");
    return;
  }
  // Check OTP expiry
  if (
    emailOTPExpiresAt &&
    Date.now() >= emailOTPExpiresAt
  ) {
    setEmailChangeError(
      "OTP expired. Please request a new one."
    );
    return;
  }
  setEmailChangeLoading(true);
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/users/email-change/verify`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ otp }),
      }
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(
        data.message || "Failed to verify OTP"
      );
    }
    // Update profile email on screen
    setProfile((previous) => ({
      ...previous,
      email: data.email,
    }));
    // Reset email change form
    setNewEmail("");
    setEmailChangeOTP("");
    setEmailOTPSent(false);
    setEmailOTPExpiresAt(null);
    setEmailOTPSecondsLeft(0);
    setEmailChangeSuccess(
      "Email changed successfully!"
    );
  } catch (error) {
    setEmailChangeError(
      error.message || "Something went wrong"
    );
  } finally {
    setEmailChangeLoading(false);
  }
};
    // UPLOAD OR CHANGE PROFILE IMAGE
const handleProfileImageUpload = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setImageError("");
  setImageSuccess("");
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];
  // Validate image type
  if (!allowedTypes.includes(file.type)) {
    setImageError("Only JPG, PNG and WebP images are allowed");
    event.target.value = "";
    return;
  }
  // Validate image size (2 MB)
  if (file.size > 2 * 1024 * 1024) {
    setImageError("Image size must not exceed 2 MB");
    event.target.value = "";
    return;
  }
  const formData = new FormData();
  formData.append("image", file);
  setImageUploading(true);
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/users/profile/image`,
      {
        method: "PUT",
        credentials: "include",
        body: formData,
      }
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(
        data.message || "Failed to upload profile image"
      );
    }
    // Update profile photo immediately
    setProfileImage(data.profileImage?.url || "");
    setImageSuccess("Profile photo updated successfully!");
  } catch (error) {
    setImageError(
      error.message || "Something went wrong"
    );
  } finally {
    setImageUploading(false);
    // Allow selecting the same file again
    event.target.value = "";
  }
};
// REMOVE PROFILE IMAGE
const handleRemoveProfileImage = async () => {
  if (imageUploading) return;
  const confirmed = window.confirm(
    "Are you sure you want to remove your profile photo?"
  );
  if (!confirmed) return;
  setImageError("");
  setImageSuccess("");
  setImageUploading(true);
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/users/profile/image`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(
        data.message || "Failed to remove profile photo"
      );
    }
    // Remove photo from React state
    setProfileImage("");
    setImageSuccess("Profile photo removed successfully!");
  } catch (error) {
    setImageError(
      error.message || "Something went wrong"
    );
  } finally {
    setImageUploading(false);
  }
};
  // Logout
  if (loading) {
    return (
      <div className="voltix-profile-loading">
        Loading your profile...
      </div>
    );
  }
  return (
    <div className="voltix-profile-page voltix-profile-embedded">
      {/* CONTENT (the "My account" title and side menu come from AccountLayout) */}
      <div className="voltix-profile-content">
        {profileSuccess && (
          <p className="voltix-profile-success" role="status">
            {profileSuccess}
          </p>
        )}
        {error && (
          <p className="voltix-profile-error" role="alert">
            {error}
          </p>
        )}
        <div className="voltix-profile-main">
          {/* RIGHT CONTENT */}
          <div className="voltix-profile-sections">
            {/* PERSONAL DETAILS */}
            <section className="voltix-profile-card">
              <h2>Personal details</h2>
                {/* PROFILE PHOTO */}
<div className="voltix-profile-photo-section">
  <div className="voltix-profile-avatar">
    {profileImage ? (
      <img
        src={profileImage}
        alt="Your profile"
        className="voltix-profile-avatar-image"
      />
    ) : (
      <span className="voltix-profile-avatar-placeholder">
        {profile.name?.trim()?.charAt(0)?.toUpperCase() || "U"}
      </span>
    )}
  </div>
  <div className="voltix-profile-photo-info">
  <strong>Profile photo</strong>
  <p>JPG, PNG or WebP. Maximum 2 MB.</p>
  {/* Hidden file input */}
  <input
    type="file"
    id="voltix-profile-image-input"
    accept="image/jpeg,image/png,image/webp"
    onChange={handleProfileImageUpload}
    disabled={imageUploading}
    style={{ display: "none" }}
  />
  {/* Change photo button */}
 <div className="voltix-profile-photo-actions">
  <button
    type="button"
    className="voltix-change-photo-btn"
    onClick={() =>
      document.getElementById("voltix-profile-image-input")?.click()
    }
    disabled={imageUploading}
  >
    {imageUploading ? "Uploading..." : "Change photo"}
  </button>
  {profileImage && (
    <button
      type="button"
      className="voltix-remove-photo-btn"
      onClick={handleRemoveProfileImage}
      disabled={imageUploading}
    >
      Remove photo
    </button>
  )}
</div>
  {/* Upload error */}
  {imageError && (
    <p className="voltix-profile-error" role="alert">
      {imageError}
    </p>
  )}
  {/* Upload success */}
  {imageSuccess && (
    <p className="voltix-profile-success" role="status">
      {imageSuccess}
    </p>
  )}
</div>
</div>
              <div>
                <div className="voltix-profile-fields">
                  <label>
                    Full name
                    <input
                      type="text"
                      value={profile.name}
                      readOnly
                    />
                  </label>
                  <label>
  Email
  <input
    type="email"
    value={profile.email}
    readOnly
    title="Email changes require verification"
  />
</label>
                  <label>
                    Phone number
                    <input
                      type="tel"
                      value={profile.phone}
                      readOnly
                    />
                  </label>
                </div>
                <div className="voltix-profile-form-actions">
  <Link to="/profile/edit" className="voltix-profile-primary-btn">
    Edit profile
  </Link>
  <button
    type="button"
    className="voltix-change-email-btn"
    onClick={() => {
      document
        .getElementById("voltix-change-email")
        ?.scrollIntoView({ behavior: "smooth" });
    }}
  >
    Change email
  </button>
</div>
              </div>
            </section>
            {/* SAVED ADDRESSES */}
           <section className="voltix-profile-card">
  <div className="voltix-profile-card-heading">
    <h2>Saved addresses</h2>
    <button
  type="button"
  className="voltix-profile-outline-btn"
  onClick={() => setShowAddressForm(true)}
>
  Add new address
</button>
  </div>
{showAddressForm && (
  <form
  className="voltix-address-form"
  onSubmit={handleAddAddress}
    noValidate
>
    <div className="voltix-address-form-header">
      <h3>Add new address</h3>
      <button
        type="button"
        onClick={() => setShowAddressForm(false)}
      >
        <Icon name="x" size={18} />
      </button>
    </div>
    <div className="voltix-address-form-fields">
     <label>
  Address type
  <input
    type="text"
    name="addressType"
    placeholder="Home, Work, Hostel, College..."
    maxLength={30}
    required
   onChange={() => setAddFieldErrors((previous) => ({ ...previous, addressType: "" }))} />
{inlineAddressError("addressType", addFieldErrors)}
</label>
      <label>
        Full name
        <input type="text" placeholder="Full name" name="fullName" required  onChange={() => setAddFieldErrors((previous) => ({ ...previous, fullName: "" }))} />
      {inlineAddressError("fullName", addFieldErrors)}
</label>
      <label>
        Phone number
        <input type="tel" placeholder="10-digit phone number" name="phone" required pattern="^[0-9]{10}$" maxLength={10}  onChange={() => setAddFieldErrors((previous) => ({ ...previous, phone: "" }))} />
      {inlineAddressError("phone", addFieldErrors)}
</label>
      <label>
        Address line 1
        <input type="text" placeholder="House name, street" name="addressLine1" required  onChange={() => setAddFieldErrors((previous) => ({ ...previous, addressLine1: "" }))} />
      {inlineAddressError("addressLine1", addFieldErrors)}
</label>
      <label>
        Address line 2 (optional)
        <input type="text" placeholder="Apartment, landmark" name="addressLine2"  onChange={() => setAddFieldErrors((previous) => ({ ...previous, addressLine2: "" }))} />
      {inlineAddressError("addressLine2", addFieldErrors)}
</label>
      <label>
        City
        <input type="text" placeholder="City" name="city" required  onChange={() => setAddFieldErrors((previous) => ({ ...previous, city: "" }))} />
      {inlineAddressError("city", addFieldErrors)}
</label>
      <label>
  District
  <input type="text" name="district" placeholder="District" required maxLength={100}
    onChange={() => setAddFieldErrors((previous) => ({ ...previous, district: "" }))} />
  {inlineAddressError("district", addFieldErrors)}
</label>
      <label>
  State
  <input
    type="text"
    placeholder="State"
    name="state"
    required
   onChange={() => setAddFieldErrors((previous) => ({ ...previous, state: "" }))} />
{inlineAddressError("state", addFieldErrors)}
</label>
<label>
  Pincode
  <input
    type="text"
    placeholder="6-digit pincode"
    name="pincode"
    required
    pattern="[0-9]{6}"
    maxLength={6}
    inputMode="numeric"
    onChange={(event) => {
      const pincode = event.target.value;
      const form = event.target.form;
      // Clear the old state when the pincode changes
      const stateInput = form.elements.namedItem("state");
      const districtInput = form.elements.namedItem("district");
      if (stateInput) stateInput.value = "";
      if (districtInput) districtInput.value = "";
      setAddFieldErrors((previous) => ({ ...previous, pincode: "", state: "", district: "" }));
      lookupPincode(pincode, (state, district) => {
        if (stateInput) stateInput.value = state;
        if (districtInput) districtInput.value = district || "";
      });
    }}
  />
{inlineAddressError("pincode", addFieldErrors)}
</label>
{pincodeLoading && <p>Checking pincode...</p>}
{pincodeError && (
  <p className="voltix-profile-error" role="alert">
    {pincodeError}
  </p>
)}
      <label className="voltix-address-default-option">
        <input type="checkbox" name="isDefault" />
           Set as default address
      </label>
    </div>
    {/* Address Error Message */}
{addressError && (
  <p className="voltix-profile-error" role="alert">
    {addressError}
  </p>
)}
<div className="voltix-address-form-actions">
  <button
    type="button"
    onClick={() => setShowAddressForm(false)}
  >
    Cancel
  </button>
  <button type="submit" disabled={addressSaving || pincodeLoading}>
    {addressSaving ? "Saving..." : "Save address"}
  </button>
</div>
  </form>
)}
  {addressesLoading ? (
    <p className="voltix-profile-muted">
      Loading addresses...
    </p>
  ) : addressesError ? (
    <p className="voltix-profile-error" role="alert">
      {addressesError}
    </p>
  ) : addresses.length === 0 ? (
    <p className="voltix-profile-muted">
      No saved addresses yet.
    </p>
  ) : (
  <>
    {editingAddressId && editAddressData && (
      <form
        className="voltix-address-form"
        onSubmit={handleUpdateAddress}
          noValidate
      >
        <div className="voltix-address-form-header">
          <h3>Edit address</h3>
          <button
            type="button"
            onClick={() => {
              setEditingAddressId(null);
              setEditAddressData(null);
              setEditError("");
            }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="voltix-address-form-fields">
          {[
            ["addressType", "Address type"],
            ["fullName", "Full name"],
            ["phone", "Phone number"],
            ["addressLine1", "Address line 1"],
            ["addressLine2", "Address line 2 (optional)"],
            ["city", "City"],
            ["district", "District"],
            ["state", "State"],
            ["pincode", "Pincode"],
          ].map(([field, label]) => (
            <label key={field}>
              {label}
              <input
                type="text"
                value={editAddressData[field]}
                required={field !== "addressLine2"}
                maxLength={
                  field === "phone"
                    ? 10
                    : field === "pincode"
                    ? 6
                    : field === "addressType"
                    ? 30
                    : field === "fullName"
                    ? 60
                    : field === "addressLine1" || field === "addressLine2"
                    ? 200
                    : 100
                }
                pattern={
                  field === "phone"
                    ? "[0-9]{10}"
                    : field === "pincode"
                    ? "[0-9]{6}"
                    : undefined
                }
                onChange={(event) => {
  const value = event.target.value;
  setEditFieldErrors((previous) => ({ ...previous, [field]: "" }));
  if (field === "pincode") {
    setEditAddressData((previous) => ({
      ...previous,
      pincode: value,
      state: "",
      district: "",
    }));
    setEditFieldErrors((previous) => ({ ...previous, state: "", district: "" }));
    lookupPincode(value, (state, district) => {
      setEditAddressData((previous) => {
        if (previous?.pincode !== value) {
          return previous;
        }
        return {
          ...previous,
          state,
          district: district || "",
        };
      });
    });
  } else {
    setEditAddressData((previous) => ({
      ...previous,
      [field]: value,
    }));
  }
}}
              />
            {inlineAddressError(field, editFieldErrors)}
</label>
          ))}
                </div>
        {pincodeLoading && (
          <p>Checking pincode...</p>
        )}
        {pincodeError && (
          <p className="voltix-profile-error" role="alert">
            {pincodeError}
          </p>
        )}
        <label className="voltix-address-default-option">
  <input
    type="checkbox"
    checked={editIsDefault}
    onChange={(event) => setEditIsDefault(event.target.checked)}
    disabled={
      addresses.find((a) => a._id === editingAddressId)?.isDefault === true
    }
  />
  Set as default address
</label>
        {editError && (
          <p className="voltix-profile-error" role="alert">
            {editError}
          </p>
        )}
        <div className="voltix-address-form-actions">
          <button
            type="button"
            onClick={() => {
              setEditingAddressId(null);
              setEditAddressData(null);
              setEditError("");
            }}
          >
            Cancel
          </button>
          <button type="submit" disabled={editSaving || pincodeLoading}>
            {editSaving ? "Saving..." : "Update address"}
          </button>
        </div>
      </form>
    )}
    <div className="voltix-address-list">
      {addresses.map((address) => (
        <div
          className="voltix-address-card"
          key={address._id}
        >
          <div className="voltix-address-top">
            <strong>{address.addressType}</strong>
            <span
              className={
                address.isDefault
                  ? "voltix-address-default"
                  : "voltix-address-saved"
              }
            >
              {address.isDefault ? "Default" : "Saved"}
            </span>
          </div>
          <p>{address.fullName}</p>
          <p>{address.addressLine1}</p>
          {address.addressLine2 && (
            <p>{address.addressLine2}</p>
          )}
          <p>
            {address.city}{address.district ? `, ${address.district}` : ""}, {address.state} - {address.pincode}
          </p>
          <p>Phone: {address.phone}</p>
          <div className="voltix-address-actions">
            <button
  type="button"
  onClick={() => handleEditAddress(address)}
>
  Edit
</button>
            <button
  type="button"
  onClick={() => { setDeleteTarget(address); setDeleteError(""); }}
>
  Delete
</button>
          </div>
        </div>
            ))}
    </div>
  </>
)}
</section>
{/* CHANGE EMAIL */}
<section
  id="voltix-change-email"
  className="voltix-profile-card"
>
  <h2>Change email address</h2>
  <p className="voltix-profile-muted">
    Current email: {profile?.email}
  </p>
  {!emailOTPSent ? (
    /* REQUEST OTP FORM */
    <form onSubmit={handleRequestEmailChangeOTP}>
      <div className="voltix-profile-fields two-columns">
        <label>
          New email address
          <input
            type="email"
            value={newEmail}
            onChange={(event) =>
              setNewEmail(event.target.value)
            }
            placeholder="Enter new email address"
            autoComplete="email"
            disabled={emailChangeLoading}
            required
          />
        </label>
      </div>
      <div className="voltix-profile-password-actions">
        <button
          type="submit"
          className="voltix-profile-primary-btn"
          disabled={emailChangeLoading}
        >
          {emailChangeLoading
            ? "Sending OTP..."
            : "Send verification OTP"}
        </button>
      </div>
    </form>
  ) : (
    /* VERIFY OTP FORM */
    <form onSubmit={handleVerifyEmailChangeOTP}>
      <p className="voltix-profile-muted">
        Enter the 6-digit verification code sent to
        <strong> {newEmail}</strong>
      </p>
      {/* OTP COUNTDOWN */}
<p className="voltix-profile-muted">
  {emailOTPSecondsLeft > 0 ? (
    <>
      OTP expires in{" "}
      <strong>
        {String(Math.floor(emailOTPSecondsLeft / 60)).padStart(2, "0")}:
        {String(emailOTPSecondsLeft % 60).padStart(2, "0")}
      </strong>
    </>
  ) : (
    <span className="voltix-profile-error">
      OTP expired. Please request a new one.
    </span>
  )}
</p>
      <div className="voltix-profile-fields two-columns">
        <label>
          Verification code
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            value={emailChangeOTP}
            onChange={(event) =>
              setEmailChangeOTP(
                event.target.value.replace(/\D/g, "")
              )
            }
            placeholder="Enter 6-digit OTP"
            autoComplete="one-time-code"
            disabled={emailChangeLoading}
            required
          />
        </label>
      </div>
      <div className="voltix-profile-password-actions">
        <button
  type="submit"
  className="voltix-profile-primary-btn"
  disabled={emailChangeLoading || emailOTPSecondsLeft === 0}
>
  {emailChangeLoading
    ? "Verifying..."
    : "Verify & change email"}
</button>
<button
  type="button"
  className="voltix-profile-outline-btn"
  disabled={emailChangeLoading || emailOTPSecondsLeft > 0}
  onClick={handleRequestEmailChangeOTP}
>
  Resend OTP
</button>
        <button
          type="button"
          disabled={emailChangeLoading}
          onClick={() => {
            setEmailOTPSent(false);
            setEmailChangeOTP("");
            setEmailOTPExpiresAt(null);
            setEmailOTPSecondsLeft(0);
            setEmailChangeError("");
            setEmailChangeSuccess("");
          }}
        >
          Change email
        </button>
      </div>
    </form>
  )}
  {/* ERROR MESSAGE */}
  {emailChangeError && (
    <p className="voltix-profile-error" role="alert">
      {emailChangeError}
    </p>
  )}
  {/* SUCCESS MESSAGE */}
  {emailChangeSuccess && (
    <p className="voltix-profile-success" role="status">
      {emailChangeSuccess}
    </p>
  )}
</section>
            {/* CHANGE PASSWORD */}
<section className="voltix-profile-card">
  <h2>Change password</h2>
  <form onSubmit={handleChangePassword} noValidate>
    <div className="voltix-profile-fields two-columns">
      {[
        ["currentPassword", "Current password", "Enter current password", "current-password"],
        ["newPassword", "New password", "Enter new password", "new-password"],
        ["confirmPassword", "Confirm new password", "Confirm new password", "new-password"],
      ].map(([field, label, placeholder, autoComplete]) => {
        const fieldError = passwordFieldError(field);
        return (
          <label key={field}>
            {label}
            <input
              type="password"
              value={passwordData[field]}
              onChange={(event) => changePasswordInput(field, event.target.value)}
              onBlur={() => setPasswordTouched((previous) => ({ ...previous, [field]: true }))}
              placeholder={placeholder}
              autoComplete={autoComplete}
              maxLength={field === "currentPassword" ? undefined : 128}
              disabled={passwordSaving}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? `${field}-error` : undefined}
              style={{ borderColor: fieldError ? "#dc2626" : undefined }}
            />
            {fieldError && (
              <small
                id={`${field}-error`}
                role="alert"
                style={{ color: "#dc2626", display: "block", marginTop: 5 }}
              >
                {fieldError}
              </small>
            )}
          </label>
        );
      })}
    </div>
    {/* ERROR MESSAGE */}
    {passwordError && (
      <p className="voltix-profile-error" role="alert">
        {passwordError}
      </p>
    )}
    {/* SUCCESS MESSAGE */}
    {passwordSuccess && (
      <p className="voltix-profile-success" role="status">
        {passwordSuccess}
      </p>
    )}
    <div className="voltix-profile-password-actions">
      <button
        type="submit"
        className="voltix-profile-primary-btn"
        disabled={passwordSaving}
      >
        {passwordSaving ? "Updating..." : "Update password"}
      </button>
      <Link to="/forgot-password">
        Forgot your current password?
      </Link>
    </div>
  </form>
</section>
          </div>
        </div>
      </div>
      {/* Address delete confirmation modal */}
      {deleteTarget && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleteSaving) setDeleteTarget(null);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-address-title" aria-describedby="delete-address-description"
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: 26, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
            <h3 id="delete-address-title" style={{ margin: "0 0 12px", color: "#111827" }}>Delete address?</h3>
            <p id="delete-address-description" style={{ color: "#475569", lineHeight: 1.6 }}>
              Are you sure you want to delete your {deleteTarget.addressType || "saved"} address? This action cannot be undone.
            </p>
            {deleteError && <p role="alert" style={{ color: "#dc2626" }}>{deleteError}</p>}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button type="button" disabled={deleteSaving} onClick={() => setDeleteTarget(null)}
                style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Cancel</button>
              <button type="button" disabled={deleteSaving} onClick={() => handleDeleteAddress(deleteTarget)}
                style={{ border: 0, background: "#dc2626", color: "white", borderRadius: 8, padding: "10px 18px", cursor: deleteSaving ? "wait" : "pointer" }}>
                {deleteSaving ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserProfile;
