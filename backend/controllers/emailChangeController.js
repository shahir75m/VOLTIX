const User = require("../models/User");
const EmailChangeOTP = require("../models/EmailChangeOTP");
const crypto = require("node:crypto");
const {
  generateUserOTP,
  hashUserOTP,
  sendEmailChangeOTP,
} = require("../services/userOtpService");

// REQUEST EMAIL CHANGE OTP
const requestEmailChangeOTP = async (req, res) => {
  try {
    const { newEmail } = req.body || {};

    // 1. Validate email
    if (typeof newEmail !== "string") {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    const email = newEmail.trim().toLowerCase();

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    // 2. Get logged-in user
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // 3. Prevent changing to current email
    if (email === user.email) {
      return res.status(400).json({
        success: false,
        message: "New email must be different from current email",
      });
    }

    // 4. Check whether email is already registered
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered",
      });
    }
    
    // Prevent frequent OTP requests
const previousRequest = await EmailChangeOTP.findOne({
  userId: user._id,
});

if (
  previousRequest &&
  previousRequest.expiresAt > new Date() &&
  previousRequest.createdAt &&
  Date.now() - previousRequest.createdAt.getTime() < 60 * 1000
) {
  return res.status(429).json({
    success: false,
    message: "Please wait 60 seconds before requesting another OTP",
  });
}

    // 5. Generate and hash OTP
    const otp = generateUserOTP();
    const otpHash = hashUserOTP(otp);

    // 6. Set expiry to 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Store the OTP before sending so a delivered code is immediately usable.
    await EmailChangeOTP.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
         newEmail: email,
         otpHash,
         expiresAt,
         attempts: 0,
         createdAt: new Date(),
    },
      },
      {
        upsert: true,
        returnDocument: "after",
        runValidators: true,
      }
    );

    let delivery;
    try {
      delivery = await sendEmailChangeOTP(email, otp);
    } catch (emailError) {
      await EmailChangeOTP.deleteOne({
        userId: user._id,
        otpHash,
      });

      console.error("Email change OTP delivery failed:", {
        code: emailError.code,
        command: emailError.command,
        responseCode: emailError.responseCode,
        message: emailError.message,
      });

      return res.status(503).json({
        success: false,
        message: "Email service could not send the verification code. Please try again.",
      });
    }

    if (!delivery?.id) {
      await EmailChangeOTP.deleteOne({
        userId: user._id,
        otpHash,
      });

      console.error("Email change OTP was not accepted by the email provider:", {
        response: delivery,
      });

      return res.status(503).json({
        success: false,
        message: "The email provider did not accept the verification email. Please try again.",
      });
    }

    console.info("Email change OTP accepted by the email provider:", {
      messageId: delivery.id,
    });

    return res.status(200).json({
      success: true,
      message: "Verification email submitted to the email provider. Delivery may take a few minutes.",
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Request Email Change OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send verification OTP",
    });
  }
};

// VERIFY EMAIL CHANGE OTP
const verifyEmailChangeOTP = async (req, res) => {
  try {
    const { otp } = req.body || {};

    // 1. Validate OTP
    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 6-digit OTP",
      });
    }

    // 2. Find pending email change request
    const pending = await EmailChangeOTP.findOne({
      userId: req.user._id,
    });

    if (!pending) {
      return res.status(400).json({
        success: false,
        message: "No pending email change request",
      });
    }

    // 3. Check expiry
    if (pending.expiresAt.getTime() <= Date.now()) {
      await EmailChangeOTP.deleteOne({ _id: pending._id });

      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    // 4. Check maximum attempts
    if (pending.attempts >= 5) {
      await EmailChangeOTP.deleteOne({ _id: pending._id });

      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Request a new OTP.",
      });
    }

    // 5. Compare OTP hashes securely
    const submittedHash = hashUserOTP(otp);

    const storedBuffer = Buffer.from(pending.otpHash, "hex");
    const submittedBuffer = Buffer.from(submittedHash, "hex");

    const isValid =
      storedBuffer.length === submittedBuffer.length &&
      crypto.timingSafeEqual(storedBuffer, submittedBuffer);

    if (!isValid) {
      await EmailChangeOTP.updateOne(
        { _id: pending._id },
        { $inc: { attempts: 1 } }
      );

      return res.status(400).json({
        success: false,
        message: "Incorrect OTP",
      });
    }

    // 6. Confirm logged-in user is still available
    const user = await User.findOne({
      _id: req.user._id,
      role: "user",
      isVerified: true,
      isBlocked: false,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account unavailable",
      });
    }

    // 7. Check email uniqueness again
    const existingUser = await User.findOne({
      email: pending.newEmail,
      _id: { $ne: user._id },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered",
      });
    }

    const consumed = await EmailChangeOTP.findOneAndDelete({
      _id: pending._id,
      userId: user._id,
      otpHash: pending.otpHash,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 },
    });

    if (!consumed) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or already used",
      });
    }

    // Consume the OTP before changing the email so it cannot be replayed.
    user.email = consumed.newEmail;

    try {
      await user.save();
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "This email is already registered",
        });
      }

      throw error;
    }

    return res.status(200).json({
      success: true,
      message: "Email changed successfully",
      email: user.email,
    });
  } catch (error) {
    console.error("Verify Email Change OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify email change",
    });
  }
};

module.exports = {
  requestEmailChangeOTP,
  verifyEmailChangeOTP,
};
