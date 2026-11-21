const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const AdminOTP = require("../models/AdminOTP");
const otpService = require("../services/adminOtpService");

const originalEnv = {
  jwtSecret: process.env.JWT_SECRET,
  otpHashSecret: process.env.OTP_HASH_SECRET,
};
const originalMethods = {
  compare: bcrypt.compare,
  hash: bcrypt.hash,
  userFindOne: User.findOne,
  userFindOneAndUpdate: User.findOneAndUpdate,
  otpFindOneAndUpdate: AdminOTP.findOneAndUpdate,
  otpFindOne: AdminOTP.findOne,
  otpFindOneAndDelete: AdminOTP.findOneAndDelete,
  otpUpdateOne: AdminOTP.updateOne,
  sendOTP: otpService.sendAdminPasswordChangeOTP,
};

process.env.JWT_SECRET = "admin-auth-test-secret";
process.env.OTP_HASH_SECRET = "admin-otp-test-secret";

let sentOtp;
let storedRecord;
let passwordUpdate;
const admin = {
  _id: "admin-id",
  name: "Test Admin",
  email: "admin@voltix.test",
  role: "admin",
  isBlocked: false,
  password: "stored-password-hash",
};

bcrypt.compare = async (value, hash) =>
  value === "current-password" && hash === "stored-password-hash";
bcrypt.hash = async (value) => `hashed:${value}`;
otpService.sendAdminPasswordChangeOTP = async (email, otp) => {
  assert.equal(email, admin.email);
  sentOtp = otp;
};

const { adminLogin } = require("../controllers/adminController");
const {
  requestAdminPasswordChangeOTP,
  verifyAdminPasswordChangeOTP,
} = require("../controllers/adminPasswordController");

const makeResponse = () => {
  const res = { statusCode: 200, body: null, cookies: [] };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.cookie = (...args) => {
    res.cookies.push(args);
    return res;
  };
  return res;
};

after(() => {
  bcrypt.compare = originalMethods.compare;
  bcrypt.hash = originalMethods.hash;
  User.findOne = originalMethods.userFindOne;
  User.findOneAndUpdate = originalMethods.userFindOneAndUpdate;
  AdminOTP.findOneAndUpdate = originalMethods.otpFindOneAndUpdate;
  AdminOTP.findOne = originalMethods.otpFindOne;
  AdminOTP.findOneAndDelete = originalMethods.otpFindOneAndDelete;
  AdminOTP.updateOne = originalMethods.otpUpdateOne;
  otpService.sendAdminPasswordChangeOTP = originalMethods.sendOTP;
  if (originalEnv.jwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalEnv.jwtSecret;
  if (originalEnv.otpHashSecret === undefined) delete process.env.OTP_HASH_SECRET;
  else process.env.OTP_HASH_SECRET = originalEnv.otpHashSecret;
});

test("admin login creates a session immediately after correct credentials", async () => {
  User.findOne = () => ({ select: async () => admin });
  let otpDatabaseCalls = 0;
  AdminOTP.findOneAndUpdate = async () => {
    otpDatabaseCalls += 1;
    return null;
  };

  const res = makeResponse();
  await adminLogin(
    { body: { email: " ADMIN@VOLTIX.TEST ", password: "current-password" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.admin.email, admin.email);
  assert.equal(res.body.requiresOTP, undefined);
  assert.equal(res.cookies[0][0], "adminToken");
  assert.equal(otpDatabaseCalls, 0);
});

test("admin password change stores a password hash and requires the emailed OTP", async () => {
  sentOtp = undefined;
  storedRecord = null;
  passwordUpdate = null;
  User.findOne = () => ({ select: async () => admin });
  User.findOneAndUpdate = async (filter, update) => {
    passwordUpdate = { filter, update };
    return admin;
  };
  AdminOTP.findOneAndUpdate = async (filter, update) => {
    storedRecord = {
      _id: "otp-record",
      adminId: filter.adminId,
      ...update.$set,
    };
    return storedRecord;
  };
  AdminOTP.findOne = () => ({
    select: async () => storedRecord,
  });
  AdminOTP.updateOne = async (_filter, update) => {
    storedRecord.attempts += update.$inc.attempts;
  };
  AdminOTP.findOneAndDelete = (filter) => ({
    select: async () => {
      assert.equal(filter.otpHash, storedRecord.otpHash);
      const consumed = storedRecord;
      storedRecord = null;
      return consumed;
    },
  });

  const requestRes = makeResponse();
  await requestAdminPasswordChangeOTP(
    {
      user: { _id: admin._id },
      body: {
        currentPassword: "current-password",
        newPassword: "New-Password-123",
      },
    },
    requestRes
  );

  assert.equal(requestRes.statusCode, 200);
  assert.equal(requestRes.body.success, true);
  assert.match(requestRes.body.challenge, /^[a-f0-9]{64}$/);
  assert.equal(storedRecord.newPasswordHash, "hashed:New-Password-123");
  assert.notEqual(storedRecord.newPasswordHash, "New-Password-123");
  assert.match(sentOtp, /^\d{6}$/);

  const wrongOtpRes = makeResponse();
  await verifyAdminPasswordChangeOTP(
    {
      user: { _id: admin._id },
      body: {
        challenge: requestRes.body.challenge,
        otp: sentOtp === "999999" ? "999998" : "999999",
      },
    },
    wrongOtpRes
  );
  assert.equal(wrongOtpRes.statusCode, 401);
  assert.equal(storedRecord.attempts, 1);
  assert.equal(passwordUpdate, null);

  const verifyRes = makeResponse();
  await verifyAdminPasswordChangeOTP(
    {
      user: { _id: admin._id },
      body: {
        challenge: requestRes.body.challenge,
        otp: sentOtp,
      },
    },
    verifyRes
  );

  assert.equal(verifyRes.statusCode, 200);
  assert.equal(verifyRes.body.success, true);
  assert.equal(passwordUpdate.update.$set.password, "hashed:New-Password-123");
  assert.equal(storedRecord, null);
});

test("admin password change rejects an incorrect current password before sending OTP", async () => {
  sentOtp = undefined;
  let otpRecordsCreated = 0;
  User.findOne = () => ({ select: async () => admin });
  AdminOTP.findOneAndUpdate = async () => {
    otpRecordsCreated += 1;
    return null;
  };

  const res = makeResponse();
  await requestAdminPasswordChangeOTP(
    {
      user: { _id: admin._id },
      body: {
        currentPassword: "incorrect-password",
        newPassword: "New-Password-123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(otpRecordsCreated, 0);
  assert.equal(sentOtp, undefined);
});
