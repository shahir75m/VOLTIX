const User = require("../models/User");
const AdminOTP = require("../models/AdminOTP");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const {
  generateOTP,
  hashOTP,
  sendAdminOTP,
} = require("../services/adminOtpService");

const OTP_EXPIRY = 5 * 60 * 1000;
const RESEND_COOLDOWN = 60 * 1000;
const MAX_ATTEMPTS = 5;

const createAdminCookie = (res, admin) => {
  const token = jwt.sign(
    { id: admin._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.cookie("adminToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite:
      process.env.COOKIE_SAME_SITE ||
      (process.env.NODE_ENV === "production" ? "none" : "strict"),
    maxAge: 60 * 60 * 1000,
    path: "/",
  });
};

// Generate an unpredictable temporary login challenge
const createChallenge = () => {
  return crypto.randomBytes(32).toString("hex");
};

const hashChallenge = (challenge) => {
  return crypto
    .createHash("sha256")
    .update(challenge)
    .digest("hex");
};

// STEP 1: Admin Email + Password
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      password.length < 1 ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email and password",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const admin = await User.findOne({
      email: cleanEmail,
      role: "admin",
    }).select("+password");

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(
      password,
      admin.password
    );

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (admin.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Account is blocked",
      });
    }

    const otp = generateOTP();
    const challenge = createChallenge();
    const now = new Date();

    // One pending OTP per admin.
    // New login invalidates the previous OTP.
    await AdminOTP.findOneAndUpdate(
      { adminId: admin._id },
      {
        $set: {
          otpHash: hashOTP(otp),
          challengeHash: hashChallenge(challenge),
          expiresAt: new Date(now.getTime() + OTP_EXPIRY),
          attempts: 0,
          createdAt: now,
        },
      },
      {
  upsert: true,
  returnDocument: "after",
  runValidators: true,
}
    );

    try {
      await sendAdminOTP(admin.email, otp);
    } catch (emailError) {
      await AdminOTP.deleteOne({
        adminId: admin._id,
        challengeHash: hashChallenge(challenge),
      });

      console.error("OTP email error:", emailError.message);

      return res.status(503).json({
        success: false,
        message: "Unable to send OTP. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      requiresOTP: true,
      message: "Verification code sent to your email",
      challenge,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// STEP 2: Verify OTP
const verifyAdminOTP = async (req, res) => {
  try {
    const { challenge, otp } = req.body || {};

    if (
      typeof challenge !== "string" ||
      !/^[a-f0-9]{64}$/.test(challenge) ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid challenge and 6-digit OTP are required",
      });
    }

    const challengeHash = hashChallenge(challenge);

    const record = await AdminOTP.findOne({
      challengeHash,
    }).select("+otpHash");

    if (!record || record.expiresAt <= new Date()) {
      return res.status(401).json({
        success: false,
        message: "OTP expired or invalid. Please login again.",
      });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Maximum OTP attempts reached. Please login again.",
      });
    }

    const submittedHash = hashOTP(otp);

    const isValid = crypto.timingSafeEqual(
      Buffer.from(submittedHash, "hex"),
      Buffer.from(record.otpHash, "hex")
    );

    if (!isValid) {
      // Atomic increment prevents simultaneous requests
      // from bypassing the attempt limit.
      await AdminOTP.updateOne(
        {
          _id: record._id,
          attempts: { $lt: MAX_ATTEMPTS },
        },
        { $inc: { attempts: 1 } }
      );

      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const admin = await User.findOne({
      _id: record.adminId,
      role: "admin",
      isBlocked: false,
    });

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Admin account unavailable",
      });
    }

    // Consume OTP before creating the authenticated session.
    const consumed = await AdminOTP.findOneAndDelete({
      _id: record._id,
      challengeHash,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: MAX_ATTEMPTS },
      otpHash: submittedHash,
    });

    if (!consumed) {
      return res.status(401).json({
        success: false,
        message: "OTP already used, expired, or invalid",
      });
    }

    createAdminCookie(res, admin);

    return res.status(200).json({
      success: true,
      message: "Admin Login Successful",
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// Resend OTP after cooldown
const resendAdminOTP = async (req, res) => {
  try {
    const { challenge } = req.body || {};

    if (
      typeof challenge !== "string" ||
      !/^[a-f0-9]{64}$/.test(challenge)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid login challenge required",
      });
    }

    const challengeHash = hashChallenge(challenge);

    const record = await AdminOTP.findOne({
      challengeHash,
    });

    if (!record || record.expiresAt <= new Date()) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    const elapsed = Date.now() - record.createdAt.getTime();

    if (elapsed < RESEND_COOLDOWN) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP",
        retryAfter: Math.ceil(
          (RESEND_COOLDOWN - elapsed) / 1000
        ),
      });
    }

    const admin = await User.findOne({
      _id: record.adminId,
      role: "admin",
      isBlocked: false,
    });

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Admin account unavailable",
      });
    }

    const otp = generateOTP();
    const newChallenge = createChallenge();
    const now = new Date();

    // Only one simultaneous resend can update this challenge.
    const updated = await AdminOTP.findOneAndUpdate(
      {
        _id: record._id,
        challengeHash,
        createdAt: {
          $lte: new Date(Date.now() - RESEND_COOLDOWN),
        },
        expiresAt: { $gt: now },
      },
      {
        $set: {
          otpHash: hashOTP(otp),
          challengeHash: hashChallenge(newChallenge),
          expiresAt: new Date(now.getTime() + OTP_EXPIRY),
          attempts: 0,
          createdAt: now,
        },
      },
      { returnDocument: "after" }
    );

    if (!updated) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP",
      });
    }

    try {
      await sendAdminOTP(admin.email, otp);
    } catch (emailError) {
      await AdminOTP.deleteOne({
        _id: updated._id,
        challengeHash: hashChallenge(newChallenge),
      });

      console.error("OTP resend email error:", emailError.message);

      return res.status(503).json({
        success: false,
        message: "Unable to resend OTP. Please login again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "New verification code sent",
      challenge: newChallenge,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("OTP resend error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// Admin Logout
const adminLogout = (req, res) => {
  res.clearCookie("adminToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite:
      process.env.COOKIE_SAME_SITE ||
      (process.env.NODE_ENV === "production" ? "none" : "strict"),
    path: "/",
  });

  return res.status(200).json({
    success: true,
    message: "Admin Logout Successful",
  });
};

module.exports = {
  adminLogin,
  verifyAdminOTP,
  resendAdminOTP,
  adminLogout,
};