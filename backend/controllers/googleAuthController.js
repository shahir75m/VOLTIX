const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);

// ==================================
// GOOGLE LOGIN
// ==================================

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body || {};

    // 1. Validate Google credential
    if (
      typeof credential !== "string" ||
      !credential ||
      credential.length > 10000
    ) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required",
      });
    }

    // 2. Verify Google ID Token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (
      !payload ||
      !payload.email_verified ||
      !payload.email ||
      !payload.sub
    ) {
      return res.status(401).json({
        success: false,
        message: "Google account verification failed",
      });
    }

    const email = payload.email.trim().toLowerCase();
    const googleId = payload.sub;

    // 3. Find existing user
    let user = await User.findOne({
      googleId,
    }).select("+googleId");

    if (!user) {
      user = await User.findOne({
        email,
      }).select("+googleId");
    }

    // 4. Check existing account
    if (user) {
      if (user.role !== "user") {
        return res.status(403).json({
          success: false,
          message: "This account cannot use customer login",
        });
      }

      if (user.isBlocked) {
        return res.status(403).json({
          success: false,
          message: "Your account has been blocked",
        });
      }

      // Do not replace an existing Google account link
      if (user.googleId && user.googleId !== googleId) {
        return res.status(403).json({
          success: false,
          message: "This email is linked to another Google account",
        });
      }

      // Prevent automatic linking of existing password accounts
if (!user.googleId) {
  return res.status(409).json({
    success: false,
    message:
      "An account already exists with this email. Please log in using your password. You can connect Google later from Profile Settings.",
  });
}

// Existing Google account
if (!user.isVerified) {
  user.isVerified = true;
  await user.save();
}
    } else {
      // 5. Create new Google user
      user = await User.create({
        name: payload.name || email.split("@")[0],
        email,
        googleId,
        role: "user",
        isVerified: true,
        isBlocked: false,
      });
    }

    // 6. Create user session
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
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite:
        process.env.COOKIE_SAME_SITE ||
        (process.env.NODE_ENV === "production" ? "none" : "strict"),
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 7. Send response
    return res.status(200).json({
      success: true,
      message: "Google login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Google Login Error:", error);

    return res.status(401).json({
      success: false,
      message: "Google authentication failed",
    });
  }
};

module.exports = {
  googleLogin,
};
