const crypto = require("crypto");
const bcrypt = require("bcrypt");

const User = require("../models/User");
const PasswordResetOTP = require("../models/PasswordResetOTP");

const {
  sendPasswordResetOTP,
} = require("../services/passwordResetEmailService");

const {
  generateUserOTP,
  hashUserOTP,
} = require("../services/userOtpService");

// ==================================
// CONSTANTS
// ==================================

const OTP_EXPIRY = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// ==================================
// HELPER FUNCTIONS
// ==================================

// Generate secure challenge hash
const hashChallenge = (challenge) => {
  return crypto
    .createHash("sha256")
    .update(challenge)
    .digest("hex");
};

// Validate email address
const isValidEmail = (email) => {
  if (typeof email !== "string") {
    return false;
  }

  const cleanEmail = email.trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return (
    cleanEmail.length > 0 &&
    cleanEmail.length <= 254 &&
    emailRegex.test(cleanEmail)
  );
};

// Validate challenge
const isValidChallenge = (challenge) => {
  return (
    typeof challenge === "string" &&
    /^[a-f0-9]{64}$/.test(challenge)
  );
};

// Validate 6-digit OTP
const isValidOTP = (otp) => {
  return (
    typeof otp === "string" &&
    /^\d{6}$/.test(otp)
  );
};

// Securely compare OTP hashes
const compareOTPHashes = (providedHash, storedHash) => {
  if (
    typeof providedHash !== "string" ||
    typeof storedHash !== "string" ||
    !/^[a-f0-9]+$/i.test(providedHash) ||
    !/^[a-f0-9]+$/i.test(storedHash)
  ) {
    return false;
  }

  const providedBuffer = Buffer.from(
    providedHash,
    "hex"
  );

  const storedBuffer = Buffer.from(
    storedHash,
    "hex"
  );

  if (
    providedBuffer.length === 0 ||
    providedBuffer.length !== storedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    providedBuffer,
    storedBuffer
  );
};

// ==================================
// 1. FORGOT PASSWORD
// ==================================

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};

    // Check whether email is provided
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    // Validate email format and length
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // Normalize email
    const cleanEmail = email.trim().toLowerCase();

    // Find eligible user
    const user = await User.findOne({
      email: cleanEmail,
      role: "user",
      isVerified: true,
      isBlocked: false,
    });

    // Do not reveal whether an account exists
    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          "If an eligible account exists, a reset code will be sent.",
        challenge: null,
        expiresIn: 300,
      });
    }

    // Generate OTP
    const otp = generateUserOTP();

    // Generate secure challenge
    const challenge = crypto
      .randomBytes(32)
      .toString("hex");

    const challengeHash = hashChallenge(challenge);

    // Hash OTP before storing
    const otpHash = hashUserOTP(otp);

    const now = new Date();

    // Store temporary password reset details
    await PasswordResetOTP.findOneAndUpdate(
      {
        email: cleanEmail,
      },
      {
        $set: {
          email: cleanEmail,
          otpHash,
          challengeHash,
          expiresAt: new Date(
            now.getTime() + OTP_EXPIRY
          ),
          attempts: 0,
          createdAt: now,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    // Send password reset OTP
    try {
      await sendPasswordResetOTP(
        cleanEmail,
        otp
      );
    } catch (emailError) {
      console.error(
        "Password Reset Email Error:",
        emailError
      );

      // Remove pending reset if sending fails
      await PasswordResetOTP.deleteOne({
        email: cleanEmail,
        challengeHash,
      });

      return res.status(503).json({
        success: false,
        message:
          "Unable to send reset email. Please try again later.",
      });
    }

    // Return success
    return res.status(200).json({
      success: true,
      message:
        "If an eligible account exists, a reset code will be sent.",
      challenge,
      expiresIn: 300,
    });
  } catch (error) {
    console.error(
      "Forgot Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong. Please try again.",
    });
  }
};

// ==================================
// 2. VERIFY RESET OTP
// ==================================

const verifyResetOTP = async (req, res) => {
  try {
    const { challenge, otp } = req.body || {};

    // Validate challenge
    if (!isValidChallenge(challenge)) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification session.",
      });
    }

    // Validate OTP
    if (!isValidOTP(otp)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 6-digit OTP.",
      });
    }

    const challengeHash = hashChallenge(challenge);

    // Find valid pending password reset
    const pending = await PasswordResetOTP.findOne({
      challengeHash,
      expiresAt: {
        $gt: new Date(),
      },
      attempts: {
        $lt: MAX_ATTEMPTS,
      },
    }).select("+otpHash");

    if (!pending) {
      return res.status(400).json({
        success: false,
        message:
          "OTP expired or invalid. Please request a new code.",
      });
    }

    // Hash submitted OTP
    const providedHash = hashUserOTP(otp);

    // Compare OTP hashes securely
    const isValid = compareOTPHashes(
      providedHash,
      pending.otpHash
    );

    // Handle incorrect OTP
    if (!isValid) {
      await PasswordResetOTP.updateOne(
        {
          _id: pending._id,
          challengeHash,
          expiresAt: {
            $gt: new Date(),
          },
          attempts: {
            $lt: MAX_ATTEMPTS,
          },
        },
        {
          $inc: {
            attempts: 1,
          },
        }
      );

      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    // OTP verified
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully.",
    });
  } catch (error) {
    console.error(
      "Verify Reset OTP Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "OTP verification failed. Please try again.",
    });
  }
};

// ==================================
// 3. RESET PASSWORD
// ==================================

const resetPassword = async (req, res) => {
  try {
    const {
      challenge,
      otp,
      newPassword,
    } = req.body || {};

    // Validate challenge
    if (!isValidChallenge(challenge)) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification session.",
      });
    }

    // Validate OTP
    if (!isValidOTP(otp)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 6-digit OTP.",
      });
    }

    // Validate password type
    if (typeof newPassword !== "string") {
      return res.status(400).json({
        success: false,
        message: "New password is required.",
      });
    }

    // Validate password length
    if (
      newPassword.length < 8 ||
      newPassword.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain between 8 and 128 characters.",
      });
    }

    // Reject spaces-only passwords
    if (!newPassword.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Password cannot contain only spaces.",
      });
    }

    const challengeHash = hashChallenge(challenge);

    // Find pending password reset
    const pending = await PasswordResetOTP.findOne({
      challengeHash,
      expiresAt: {
        $gt: new Date(),
      },
      attempts: {
        $lt: MAX_ATTEMPTS,
      },
    }).select("+otpHash");

    if (!pending) {
      return res.status(400).json({
        success: false,
        message:
          "OTP expired or invalid. Please request a new code.",
      });
    }

    // Hash submitted OTP
    const providedHash = hashUserOTP(otp);

    // Secure OTP comparison
    const isValid = compareOTPHashes(
      providedHash,
      pending.otpHash
    );

    // Handle incorrect OTP
    if (!isValid) {
      await PasswordResetOTP.updateOne(
        {
          _id: pending._id,
          challengeHash,
          expiresAt: {
            $gt: new Date(),
          },
          attempts: {
            $lt: MAX_ATTEMPTS,
          },
        },
        {
          $inc: {
            attempts: 1,
          },
        }
      );

      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    // Hash new password before saving
    const passwordHash = await bcrypt.hash(
      newPassword,
      12
    );

    // Atomically consume the OTP
    const consumed =
      await PasswordResetOTP.findOneAndDelete({
        _id: pending._id,
        challengeHash,
        otpHash: providedHash,
        expiresAt: {
          $gt: new Date(),
        },
        attempts: {
          $lt: MAX_ATTEMPTS,
        },
      });

    if (!consumed) {
      return res.status(400).json({
        success: false,
        message:
          "OTP expired or already used. Please request a new code.",
      });
    }

    // Update user password
    const updatedUser = await User.findOneAndUpdate(
      {
        email: consumed.email,
        role: "user",
        isVerified: true,
        isBlocked: false,
      },
      {
        $set: {
          password: passwordHash,
        },
      },
      {
        new: true,
      }
    );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message:
          "Unable to reset password. Please try again.",
      });
    }

    // Return success
    return res.status(200).json({
      success: true,
      message:
        "Password reset successful. Please log in.",
    });
  } catch (error) {
    console.error(
      "Reset Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Password reset failed. Please try again.",
    });
  }
};

// ==================================
// EXPORT CONTROLLERS
// ==================================

module.exports = {
  forgotPassword,
  verifyResetOTP,
  resetPassword,
};