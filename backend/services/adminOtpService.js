const crypto = require("node:crypto");
const { sendEmail } = require("./emailApiService");

// Generate secure 6-digit OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

// Hash OTP before storing in MongoDB
const hashOTP = (otp) => {
  const secret = process.env.OTP_HASH_SECRET;

  if (!secret) {
    throw new Error("OTP_HASH_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(otp)
    .digest("hex");
};

// Send an OTP to confirm an admin password change.
const sendAdminPasswordChangeOTP = async (email, otp) => {
  await sendEmail({
    to: email,
    subject: "VOLTIX Admin Password Change Verification",

    text: `Your VOLTIX admin password-change verification code is ${otp}. It expires in 5 minutes. If you did not request this change, ignore this email.`,

    html: `
      <div style="font-family:Arial,sans-serif;padding:24px">
        <h2>VOLTIX Admin Password Change</h2>

        <p>Use this code to confirm your admin password change:</p>

        <h1 style="letter-spacing:6px">
          ${otp}
        </h1>

        <p>This code expires in 5 minutes.</p>

        <p>If you did not request this change, ignore this email.</p>
      </div>
    `,
  });
};

module.exports = {
  generateOTP,
  hashOTP,
  sendAdminPasswordChangeOTP,
};