const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  registerUser,
  verifyUserOTP,
  resendUserOTP,
} = require("../controllers/userAuthController");

const {
  loginUser,
  logoutUser,
  getCurrentUser,
} = require("../controllers/userSessionController");

const {
  protectUser,
} = require("../middleware/userAuthMiddleware");

const {
  forgotPassword,
  verifyResetOTP,
  resetPassword,
} = require("../controllers/passwordResetController");

const {
  googleLogin,
} = require("../controllers/googleAuthController");

const {
  updateUserProfile,
} = require("../controllers/userProfileController");

const {
  changePassword,
} = require("../controllers/changePasswordController");

const {
  requestEmailChangeOTP,
  verifyEmailChangeOTP,
} = require("../controllers/emailChangeController");

const profileImageUpload = require("../middleware/profileImageUpload");

const {
  uploadProfileImage,
  removeProfileImage,
} = require("../controllers/profileImageController");


const { getMyWallet } = require("../controllers/walletController");

const router = express.Router();

// =====================================
// RATE LIMITERS
// =====================================

// Registration Rate Limiter
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 5 was easy to hit while testing typo'd email addresses; 10 still blocks abuse.
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many registration attempts. Try again later.",
  },
});

// OTP Verification Rate Limiter
const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification attempts. Try again later.",
  },
});

// OTP Resend Rate Limiter
const resendOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP requests. Try again later.",
  },
});

// Login Rate Limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Try again later.",
  },
});

// Password Reset Rate Limiter
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

// Google Login Rate Limiter
const googleLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many Google login attempts. Try again later.",
  },
});

// =====================================
// REGISTRATION ROUTES
// =====================================

// Register User
router.post(
  "/register",
  registrationLimiter,
  registerUser
);

// Verify Registration OTP
router.post(
  "/verify-otp",
  verifyOtpLimiter,
  verifyUserOTP
);

// Resend Registration OTP
router.post(
  "/resend-otp",
  resendOtpLimiter,
  resendUserOTP
);

// =====================================
// LOGIN & LOGOUT ROUTES
// =====================================

// Login User
router.post(
  "/login",
  loginLimiter,
  loginUser
);

// Logout User
router.post(
  "/logout",
  logoutUser
);

// Get Current User
router.get(
  "/me",
  protectUser,
  getCurrentUser
);

router.get("/wallet", protectUser, getMyWallet);

// =====================================
// FORGOT PASSWORD ROUTES
// =====================================

// Send Password Reset OTP
router.post(
  "/forgot-password",
  passwordResetLimiter,
  forgotPassword
);

// Verify Password Reset OTP
router.post(
  "/verify-reset-otp",
  verifyOtpLimiter,
  verifyResetOTP
);

// Reset Password
router.post(
  "/reset-password",
  verifyOtpLimiter,
  resetPassword
);

// =====================================
// GOOGLE LOGIN ROUTE
// =====================================

router.post(
  "/google",
  googleLoginLimiter,
  googleLogin
);

// =====================================
// USER PROFILE ROUTES
// =====================================

// Update User Profile
router.put(
  "/profile",
  protectUser,
  updateUserProfile
);

// =====================================
// CHANGE PASSWORD ROUTE
// =====================================

// Change Logged-in User Password
router.put(
  "/change-password",
  protectUser,
  passwordResetLimiter,
  changePassword
);

// Request OTP to verify a new email address
router.post(
  "/email-change/request",
  protectUser,
  passwordResetLimiter,
  requestEmailChangeOTP
);

// Verify OTP and update user email
router.post(
  "/email-change/verify",
  protectUser,
  passwordResetLimiter,
  verifyEmailChangeOTP
);


// Upload or change user profile image
router.put(
  "/profile/image",
  protectUser,
  (req, res, next) => {
    profileImageUpload.single("image")(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Image size must not exceed 2 MB"
              : error.message || "Invalid image upload",
        });
      }

      next();
    });
  },
  uploadProfileImage
);

// Remove user profile image
router.delete(
  "/profile/image",
  protectUser,
  removeProfileImage
);

module.exports = router;