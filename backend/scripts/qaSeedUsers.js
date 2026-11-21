// QA helpers: creates two verified customer accounts used by qa/api-tests.mjs.
// Run from backend/: node scripts/qaSeedUsers.js
// Safe to run many times (upsert). Never touches existing accounts' data
// except password/isVerified for the two qa.* addresses.
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../models/User");

const PASSWORD = "QaUser@12345";

const USERS = [
  { name: "QA Customer One", email: "qa.customer1@example.com", phone: "9000000001" },
  { name: "QA Customer Two", email: "qa.customer2@example.com", phone: "9000000002" },
];

// Separate admin used only by the QA suite, so the real admin password is never needed.
const ADMIN = { name: "QA Admin", email: "qa.admin@example.com", phone: "9000000003", role: "admin" };
const ADMIN_PASSWORD = "QaAdmin@12345";

(async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed QA users with NODE_ENV=production");
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing");

  await mongoose.connect(process.env.MONGO_URI);
  const hash = await bcrypt.hash(PASSWORD, 12);

  for (const user of USERS) {
    await User.updateOne(
      { email: user.email },
      {
        $set: {
          ...user,
          password: hash,
          role: "user",
          isVerified: true,
          isBlocked: false,
        },
      },
      { upsert: true }
    );
  }

  await User.updateOne(
    { email: ADMIN.email },
    {
      $set: {
        ...ADMIN,
        password: await bcrypt.hash(ADMIN_PASSWORD, 12),
        isVerified: true,
        isBlocked: false,
      },
    },
    { upsert: true }
  );

  console.log(`QA users ready (${USERS.map((u) => u.email).join(", ")})`);
  console.log(`QA admin ready (${ADMIN.email})`);
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error("QA seed failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
