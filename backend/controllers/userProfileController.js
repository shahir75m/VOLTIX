const User = require("../models/User");

// ======================================
// UPDATE USER PROFILE
// ======================================

const updateUserProfile = async (req, res) => {
  try {
    const { name, phone } = req.body || {};

    // ======================================
    // 1. VALIDATE NAME
    // ======================================

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name is required.",
      });
    }

    const cleanName = name.trim();

    if (cleanName.length < 2 || cleanName.length > 60) {
      return res.status(400).json({
        success: false,
        message: "Name must contain 2 to 60 characters.",
      });
    }

    // Allow Unicode letters, spaces, dots,
    // apostrophes and hyphens.
    const nameRegex = /^[\p{L}\p{M} .'-]+$/u;

    if (
      !nameRegex.test(cleanName) ||
      !/\p{L}/u.test(cleanName)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name can contain letters, spaces, dots, apostrophes and hyphens only.",
      });
    }

    // ======================================
    // 2. VALIDATE PHONE
    // ======================================

    if (
      phone !== undefined &&
      typeof phone !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number.",
      });
    }

    const cleanPhone =
      phone === undefined ? undefined : phone.trim();

    // Phone is optional, matching frontend behavior
    if (
      cleanPhone !== undefined &&
      cleanPhone !== "" &&
      !/^[6-9]\d{9}$/.test(cleanPhone)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid 10-digit Indian mobile number.",
      });
    }

    // ======================================
    // 3. UPDATE LOGGED-IN USER
    // ======================================

    // This controller must be used after protectUser.
    // The query also checks account eligibility.
    const updateFields = {
      name: cleanName,
    };

    if (cleanPhone !== undefined) {
      updateFields.phone = cleanPhone;
    }

    const user = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        role: "user",
        isVerified: true,
        isBlocked: false,
      },
      {
        $set: updateFields,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is unavailable or blocked.",
      });
    }

    // ======================================
    // 4. SUCCESS RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Update Profile Error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid profile details. Please check your inputs.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Failed to update profile. Please try again.",
    });
  }
};

module.exports = {
  updateUserProfile,
};