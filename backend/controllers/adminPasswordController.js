const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const User = require("../models/User");
const AdminOTP = require("../models/AdminOTP");
const {
  generateOTP,
  hashOTP,
  sendAdminPasswordChangeOTP,
} = require("../services/adminOtpService");
const { checkPassword } = require("../utils/passwordPolicy");

const OTP_EXPIRY = 5 * 60 * 1000;
const RESEND_COOLDOWN = 60 * 1000;
const MAX_ATTEMPTS = 5;

const createChallenge = () => crypto.randomBytes(32).toString("hex");
const hashChallenge = (challenge) =>
  crypto.createHash("sha256").update(challenge).digest("hex");

const validOtpRequest = (challenge, otp) =>
  typeof challenge === "string" &&
  /^[a-f0-9]{64}$/.test(challenge) &&
  typeof otp === "string" &&
  /^\d{6}$/.test(otp);

const requestAdminPasswordChangeOTP = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (
      typeof currentPassword !== "string" ||
      currentPassword.length < 1 ||
      currentPassword.length > 128 ||
      typeof newPassword !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password and a new password are required",
      });
    }

    const passwordCheck = checkPassword(newPassword);

    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        message: passwordCheck.message,
        errors: { newPassword: passwordCheck.message },
      });
    }

    const admin = await User.findOne({
      _id: req.user._id,
      role: "admin",
      isBlocked: false,
    }).select("+password");

    if (!admin || !admin.password) {
      return res.status(403).json({
        success: false,
        message: "Admin account unavailable",
      });
    }

    if (!(await bcrypt.compare(currentPassword, admin.password))) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    if (await bcrypt.compare(newPassword, admin.password)) {
      return res.status(400).json({
        success: false,
        message: "New password must be different",
      });
    }

    const otp = generateOTP();
    const challenge = createChallenge();
    const now = new Date();
    const challengeHash = hashChallenge(challenge);
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await AdminOTP.findOneAndUpdate(
      { adminId: admin._id },
      {
        $set: {
          otpHash: hashOTP(otp),
          challengeHash,
          newPasswordHash,
          expiresAt: new Date(now.getTime() + OTP_EXPIRY),
          attempts: 0,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );

    try {
      await sendAdminPasswordChangeOTP(admin.email, otp);
    } catch (emailError) {
      await AdminOTP.deleteOne({ adminId: admin._id, challengeHash });
      console.error("Admin password-change OTP email error:", emailError.message);
      return res.status(503).json({
        success: false,
        message: "Unable to send verification code. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Verification code sent to your admin email",
      challenge,
      expiresIn: OTP_EXPIRY / 1000,
    });
  } catch (error) {
    console.error("Admin password-change OTP request error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to start password change",
    });
  }
};

const verifyAdminPasswordChangeOTP = async (req, res) => {
  try {
    const { challenge, otp } = req.body || {};
    if (!validOtpRequest(challenge, otp)) {
      return res.status(400).json({
        success: false,
        message: "Valid challenge and 6-digit verification code are required",
      });
    }

    const challengeHash = hashChallenge(challenge);
    const record = await AdminOTP.findOne({
      adminId: req.user._id,
      challengeHash,
    }).select("+otpHash +challengeHash +newPasswordHash");

    if (
      !record ||
      !record.newPasswordHash ||
      typeof record.otpHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(record.otpHash) ||
      record.expiresAt <= new Date()
    ) {
      return res.status(401).json({
        success: false,
        message: "Verification code expired or invalid. Start again.",
      });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Maximum verification attempts reached. Start again.",
      });
    }

    const submittedHash = hashOTP(otp);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(submittedHash, "hex"),
      Buffer.from(record.otpHash, "hex")
    );

    if (!isValid) {
      await AdminOTP.updateOne(
        {
          _id: record._id,
          challengeHash,
          attempts: { $lt: MAX_ATTEMPTS },
        },
        { $inc: { attempts: 1 } }
      );
      return res.status(401).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    const consumed = await AdminOTP.findOneAndDelete({
      _id: record._id,
      adminId: req.user._id,
      challengeHash,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: MAX_ATTEMPTS },
      otpHash: submittedHash,
    }).select("+newPasswordHash");

    if (!consumed?.newPasswordHash) {
      return res.status(401).json({
        success: false,
        message: "Verification code already used or expired. Start again.",
      });
    }

    const updatedAdmin = await User.findOneAndUpdate(
      { _id: req.user._id, role: "admin", isBlocked: false },
      { $set: { password: consumed.newPasswordHash } },
      { returnDocument: "after", runValidators: true }
    );

    if (!updatedAdmin) {
      return res.status(403).json({
        success: false,
        message: "Admin account unavailable",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Admin password changed successfully",
    });
  } catch (error) {
    console.error("Admin password-change verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to change admin password",
    });
  }
};

const resendAdminPasswordChangeOTP = async (req, res) => {
  try {
    const { challenge } = req.body || {};
    if (typeof challenge !== "string" || !/^[a-f0-9]{64}$/.test(challenge)) {
      return res.status(400).json({
        success: false,
        message: "Valid password-change challenge is required",
      });
    }

    const challengeHash = hashChallenge(challenge);
    const record = await AdminOTP.findOne({
      adminId: req.user._id,
      challengeHash,
    }).select("+newPasswordHash");

    if (
      !record ||
      !record.newPasswordHash ||
      !record.createdAt ||
      record.expiresAt <= new Date()
    ) {
      return res.status(401).json({
        success: false,
        message: "Password-change session expired. Start again.",
      });
    }

    const elapsed = Date.now() - record.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another verification code",
        retryAfter: Math.ceil((RESEND_COOLDOWN - elapsed) / 1000),
      });
    }

    const admin = await User.findOne({
      _id: req.user._id,
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
    const newChallengeHash = hashChallenge(newChallenge);
    const updated = await AdminOTP.findOneAndUpdate(
      {
        _id: record._id,
        adminId: req.user._id,
        challengeHash,
        createdAt: { $lte: new Date(now.getTime() - RESEND_COOLDOWN) },
        expiresAt: { $gt: now },
      },
      {
        $set: {
          otpHash: hashOTP(otp),
          challengeHash: newChallengeHash,
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
        message: "Please wait before requesting another verification code",
      });
    }

    try {
      await sendAdminPasswordChangeOTP(admin.email, otp);
    } catch (emailError) {
      await AdminOTP.deleteOne({
        _id: updated._id,
        challengeHash: newChallengeHash,
      });
      console.error("Admin password-change OTP resend error:", emailError.message);
      return res.status(503).json({
        success: false,
        message: "Unable to resend verification code. Start again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "New verification code sent",
      challenge: newChallenge,
      expiresIn: OTP_EXPIRY / 1000,
    });
  } catch (error) {
    console.error("Admin password-change OTP resend error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to resend verification code",
    });
  }
};

module.exports = {
  requestAdminPasswordChangeOTP,
  verifyAdminPasswordChangeOTP,
  resendAdminPasswordChangeOTP,
};
