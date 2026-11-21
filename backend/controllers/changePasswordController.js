const bcrypt = require("bcrypt");
const User = require("../models/User");
const { checkPassword } = require("../utils/passwordPolicy");

// CHANGE LOGGED-IN USER PASSWORD
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    // Validate inputs
    if (
      typeof currentPassword !== "string" ||
      !currentPassword ||
      typeof newPassword !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password and a new password are required.",
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

    // Get logged-in user with password
    const user = await User.findOne({
      _id: req.user._id,
      role: "user",
      isVerified: true,
      isBlocked: false,
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found or access denied",
      });
    }

    // Google-only accounts may not have a password
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account does not have a password. Use Forgot Password to set one.",
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Prevent reusing the same password
    const isSamePassword = await bcrypt.compare(
      newPassword,
      user.password
    );

    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different",
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Save new password
    user.password = passwordHash;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change password",
    });
  }
};

module.exports = { changePassword };