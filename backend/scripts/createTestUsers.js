require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../models/User");

const createTestUsers = async () => {
  try {
    // Safety check
    if (process.env.NODE_ENV === "production") {
      throw new Error("Cannot create test users in production");
    }

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing");
    }

    // Connect MongoDB
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected");
    console.log("Database:", mongoose.connection.name);

    // Safety: run only on the development database
    if (mongoose.connection.name !== "test") {
      throw new Error("Expected development database: test");
    }

    // Hash password
    const password = await bcrypt.hash("TestUser@12345", 12);

    // Create 30 dummy users
    const users = [];

    for (let i = 1; i <= 30; i++) {
      users.push({
        name: `Pagination Test User ${i}`,
        email: `vortix.pagination.test${i}@example.com`,
        phone: `80000${String(i).padStart(5, "0")}`,
        password: password,
        role: "user",
        isBlocked: false,
        isVerified: true,
      });
    }

    // Insert only users that do not already exist
    const result = await User.bulkWrite(
      users.map((user) => ({
        updateOne: {
          filter: { email: user.email },
          update: {
            $setOnInsert: user,
          },
          upsert: true,
        },
      }))
    );

    console.log(`${result.upsertedCount} test users created`);
    console.log("Pagination test data ready!");

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await mongoose.disconnect();
  }
};

createTestUsers();