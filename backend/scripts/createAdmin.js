require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../models/User");
const connectDB = require("../config/db");

const createAdmin = async () => {
  try {
    await connectDB();

    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password || password.length < 12) {
      throw new Error(
        "Valid ADMIN_EMAIL and ADMIN_PASSWORD (minimum 12 characters) required"
      );
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log("An account with this email already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await User.create({
      name: "VORTIX Admin",
      email,
      password: hashedPassword,
      role: "admin",
      isBlocked: false,
      isVerified: true
    });

    console.log("Admin Account Created Successfully");
  } catch (error) {
    console.error("Admin Creation Failed:", error.message);
  } finally {
    await mongoose.disconnect();
  }
};

createAdmin();