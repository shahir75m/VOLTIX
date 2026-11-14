const crypto = require("crypto");
const bcrypt = require("bcrypt");

const User = require("../models/User");
const UserOTP = require("../models/UserOTP");

const {
  generateUserOTP,
  hashUserOTP,
  sendUserOTP,
} = require("../services/userOtpService");

const OTP_EXPIRY = 5 * 60 * 1000;
const RESEND_COOLDOWN = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

// Generate a secure registration challenge
const createChallenge = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Hash registration challenge
const hashChallenge = (challenge) => {
  return crypto
    .createHash("sha256")
    .update(challenge)
    .digest("hex");
};

// REGISTER USER - STEP 1

const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};

    // 1. Validate input types
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof phone !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, phone and password are required.",
      });
    }

    // 2. Normalize input values
    const cleanName = name.trim().replace(/\s+/g, " ");
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    // 3. Validate full name
    if (cleanName.length < 2 || cleanName.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Full name must contain between 2 and 50 characters.",
      });
    }

    // Supports English, Malayalam and other Unicode letters
    const nameRegex =
      /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u;

    if (!nameRegex.test(cleanName)) {
      return res.status(400).json({
        success: false,
        message:
          "Full name can contain only letters and valid name separators.",
      });
    }

    // 4. Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !cleanEmail ||
      cleanEmail.length > 254 ||
      !emailRegex.test(cleanEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // 5. Validate Indian mobile number
    const phoneRegex = /^[6-9]\d{9}$/;

    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit Indian mobile number.",
      });
    }

    // 6. Validate password length
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Password must contain 8 to 128 characters.",
      });
    }

    // 7. Reject passwords containing only spaces
    if (!password.trim()) {
      return res.status(400).json({
        success: false,
        message: "Password cannot contain only spaces.",
      });
    }

    // 8. Check whether the email already exists
    const existingUser = await User.findOne({
      email: cleanEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // 9. Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // 10. Generate OTP
    const otp = generateUserOTP();

    // 11. Generate registration challenge
    const challenge = createChallenge();
    const challengeHash = hashChallenge(challenge);

    const now = new Date();

    // 12. Save temporary registration details
    await UserOTP.findOneAndUpdate(
      { email: cleanEmail },
      {
        $set: {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          passwordHash,
          otpHash: hashUserOTP(otp),
          challengeHash,
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

    // 13. Send OTP to email
    try {
      await sendUserOTP(cleanEmail, otp);
    } catch (emailError) {
      // Remove pending registration if email sending fails
      await UserOTP.deleteOne({
        email: cleanEmail,
        challengeHash,
      });

      console.error(
        "User OTP email error:",
        emailError.message
      );

      return res.status(503).json({
        success: false,
        message: "Unable to send OTP. Please try again.",
      });
    }

    // 14. Send successful response
    return res.status(200).json({
      success: true,
      requiresOTP: true,
      message: "Verification code sent to your email.",
      challenge,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("User registration error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Registration conflict. Please try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal Server Error.",
    });
  }
};

// VERIFY USER OTP - STEP 2

const verifyUserOTP = async (req, res) => {
  try {
    const { challenge, otp } = req.body || {};

    // 1. Validate challenge and OTP
    if (
      typeof challenge !== "string" ||
      !/^[a-f0-9]{64}$/i.test(challenge) ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification request.",
      });
    }

    // 2. Hash challenge
    const challengeHash = hashChallenge(challenge);

    // 3. Find pending registration
    const pendingUser = await UserOTP.findOne({
      challengeHash,
    }).select("+otpHash +passwordHash");

    if (!pendingUser) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification session.",
      });
    }

    // 4. Check OTP expiry
    if (pendingUser.expiresAt.getTime() <= Date.now()) {
      await UserOTP.deleteOne({
        _id: pendingUser._id,
      });

      return res.status(400).json({
        success: false,
        message: "OTP expired. Please register again.",
      });
    }

    // 5. Check maximum attempts
    if (pendingUser.attempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts. Please register again.",
      });
    }

    // 6. Hash submitted OTP
    const submittedHash = hashUserOTP(otp);

    const expectedBuffer = Buffer.from(
      pendingUser.otpHash,
      "hex"
    );

    const submittedBuffer = Buffer.from(
      submittedHash,
      "hex"
    );

    // 7. Compare OTP hashes securely
    const isValid =
      expectedBuffer.length === submittedBuffer.length &&
      crypto.timingSafeEqual(
        expectedBuffer,
        submittedBuffer
      );

    if (!isValid) {
      await UserOTP.updateOne(
        {
          _id: pendingUser._id,
          attempts: { $lt: MAX_OTP_ATTEMPTS },
        },
        {
          $inc: { attempts: 1 },
        }
      );

      return res.status(400).json({
        success: false,
        message: "Incorrect OTP.",
      });
    }

    // 8. Check if account already exists
    const existingUser = await User.findOne({
      email: pendingUser.email,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Account already exists.",
      });
    }

    // 9. Create verified user account
    const user = await User.create({
      name: pendingUser.name,
      email: pendingUser.email,
      phone: pendingUser.phone,
      password: pendingUser.passwordHash,
      isVerified: true,
      role: "user",
    });

    // 10. Remove temporary registration
    await UserOTP.deleteOne({
      _id: pendingUser._id,
    });

    // 11. Return success response
    return res.status(201).json({
      success: true,
      message: "Account verified and created successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Account already exists.",
      });
    }

    console.error(
      "User OTP Verification Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "OTP verification failed.",
    });
  }
};

// RESEND USER OTP

const resendUserOTP = async (req, res) => {
  try {
    const { challenge } = req.body || {};

    // 1. Validate challenge
    if (
      typeof challenge !== "string" ||
      !/^[a-f0-9]{64}$/i.test(challenge)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification session.",
      });
    }

    // 2. Hash challenge
    const challengeHash = hashChallenge(challenge);

    // 3. Find pending registration
    const pendingUser = await UserOTP.findOne({
      challengeHash,
    });

    if (!pendingUser) {
      return res.status(400).json({
        success: false,
        message:
          "Verification session not found. Please register again.",
      });
    }

    // 4. Check resend cooldown
    const lastSentAt = pendingUser.createdAt.getTime();
    const elapsed = Date.now() - lastSentAt;

    if (elapsed < RESEND_COOLDOWN) {
      const retryAfter = Math.ceil(
        (RESEND_COOLDOWN - elapsed) / 1000
      );

      return res.status(429).json({
        success: false,
        message: `Please wait ${retryAfter} seconds before resending OTP.`,
        retryAfter,
      });
    }

    // 5. Generate new OTP
    const otp = generateUserOTP();

    const expiresAt = new Date(
      Date.now() + OTP_EXPIRY
    );

    // 6. Update OTP only if cooldown has passed
    const updated = await UserOTP.findOneAndUpdate(
      {
        _id: pendingUser._id,
        challengeHash,
        createdAt: {
          $lte: new Date(Date.now() - RESEND_COOLDOWN),
        },
      },
      {
        $set: {
          otpHash: hashUserOTP(otp),
          expiresAt,
          createdAt: new Date(),
          attempts: 0,
        },
      },
      {
        new: true,
      }
    );

    if (!updated) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP.",
      });
    }

    // 7. Send new OTP
    await sendUserOTP(pendingUser.email, otp);

    // 8. Return success response
    return res.status(200).json({
      success: true,
      message: "A new OTP has been sent to your email.",
      expiresIn: 300,
      resendAfter: 60,
    });
  } catch (error) {
    console.error("Resend User OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to resend OTP. Please try again.",
    });
  }
};


module.exports = {
  registerUser,
  verifyUserOTP,
  resendUserOTP,
};