require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../models/User");
const connectDB = require("../config/db");

// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD.
// If the account already exists nothing is changed — the .env password is only used on
// creation, so an old account can keep a different password than `.env` says.
//
//   node scripts/createAdmin.js                    # create only
//   node scripts/createAdmin.js --reset-password   # make .env credentials valid again
const RESET = process.argv.includes("--reset-password");

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

    const existingUser = await User.findOne({ email }).select("+password");

    if (existingUser && !RESET) {
      console.log(`An account with ${email} already exists (role: ${existingUser.role}).`);
      console.log("Its password was NOT changed: ADMIN_PASSWORD is only used when the account is created.");
      console.log("To make the current ADMIN_PASSWORD work, run:  node scripts/createAdmin.js --reset-password");
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    if (existingUser) {
      existingUser.password = hashedPassword;
      existingUser.role = "admin";
      existingUser.isVerified = true;
      existingUser.isBlocked = false;
      await existingUser.save();
      console.log(`Password for ${email} reset from .env and the account is an active admin.`);
      return;
    }

    await User.create({
      name: "VORTIX Admin",
      email,
      password: hashedPassword,
      role: "admin",
      isBlocked: false,
      isVerified: true,
    });

    console.log("Admin Account Created Successfully");
  } catch (error) {
    console.error("Admin Creation Failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createAdmin();
