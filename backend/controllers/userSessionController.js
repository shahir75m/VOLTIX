const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Cookie configuration
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite:
    process.env.COOKIE_SAME_SITE ||
    (process.env.NODE_ENV === "production" ? "none" : "strict"),
  path: "/",
};

// Generate user authentication cookie
const createUserCookie = (res, user) => {
  const token = jwt.sign(
    {
      id: user._id.toString(),
      type: "user",
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "7d",
    }
  );

  res.cookie("userToken", token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// USER LOGIN
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
  typeof email !== "string" ||
  typeof password !== "string"
) {
  return res.status(400).json({
    success: false,
    message: "Email and password are required.",
  });
}

const cleanEmail = email.trim().toLowerCase();

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

if (
  password.length < 1 ||
  password.length > 128 ||
  !password.trim()
) {
  return res.status(400).json({
    success: false,
    message: "Please enter a valid password.",
  });
}


    const user = await User.findOne({
      email: cleanEmail,
      role: "user",
    }).select("+password");

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    createUserCookie(res, user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("User Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
    });
  }
};

// USER LOGOUT
const logoutUser = (req, res) => {
  res.clearCookie("userToken", cookieOptions);

  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
};

// GET CURRENT USER
const getCurrentUser = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      role: req.user.role,

      // PROFILE IMAGE
      profileImage: {
        url: req.user.profileImage?.url || "",
        publicId: req.user.profileImage?.publicId || "",
      },
    },
  });
};

module.exports = {
  loginUser,
  logoutUser,
  getCurrentUser,
};