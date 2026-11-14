const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

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

    if (!admin.password) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

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
    console.error("Admin login error:", error);

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
  adminLogout,
};