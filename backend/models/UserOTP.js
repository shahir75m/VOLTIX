const mongoose = require("mongoose");

const userOTPSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    phone: {
  type: String,
  required: true,
  trim: true,
  match: [/^[0-9]{10}$/, "Invalid phone number"],
},

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    otpHash: {
      type: String,
      required: true,
      select: false,
    },

    challengeHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

// Expired registration records are removed automatically.
userOTPSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

module.exports = mongoose.model("UserOTP", userOTPSchema);