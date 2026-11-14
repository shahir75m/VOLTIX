const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
  type: String,
  trim: true,
  validate: {
    validator: function (value) {
      return !value || /^[0-9]{10}$/.test(value);
    },
    message: "Phone number must contain exactly 10 digits",
  },
},

    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
      select: false,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
    // USER PROFILE IMAGE
profileImage: {
  url: {
    type: String,
    default: "",
  },

  publicId: {
    type: String,
    default: "",
  },
},
  },
  {
    timestamps: true,
  },
  
);

module.exports = mongoose.model("User", userSchema);