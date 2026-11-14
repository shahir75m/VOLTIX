const mongoose = require("mongoose");

const adminOTPSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
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
  }
);

// Expired OTP documents automatically remove ചെയ്യാൻ
adminOTPSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

module.exports = mongoose.model("AdminOTP", adminOTPSchema);
