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
    subject: "VOLTIX Admin - Password Change Verification",

    text: `Your VOLTIX admin password-change verification code is ${otp}. It expires in 5 minutes. If you did not request this change, ignore this email.`,

    html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 500px;
        margin: auto;
        padding: 30px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
      ">
        <h1 style="
          color: #111827;
          font-size: 24px;
          margin: 0 0 4px 0;
          font-weight: 700;
        ">
          VOLTIX
        </h1>
        <p style="
          color: #6b7280;
          font-size: 13px;
          margin: 0 0 24px 0;
          text-transform: uppercase;
          letter-spacing: 1px;
        ">
          Admin Security
        </p>

        <h2 style="color: #111827; font-size: 18px; margin-bottom: 8px;">
          Password Change Verification
        </h2>

        <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">
          Use the secure verification code below to confirm your administrator password change:
        </p>

        <div style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 20px;
          text-align: center;
          margin: 24px 0;
        ">
          <span style="
            font-size: 36px;
            font-weight: 700;
            letter-spacing: 8px;
            color: #0f172a;
          ">
            ${otp}
          </span>
        </div>

        <p style="color: #4b5563; font-size: 14px;">
          This code expires in <strong>5 minutes</strong>.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

        <p style="
          color: #9ca3af;
          font-size: 12px;
          line-height: 1.4;
          margin: 0;
        ">
          If you did not request this administrative change, please secure your account immediately.<br />
          &copy; VOLTIX Security Team. All rights reserved.
        </p>
      </div>
    `,
  });
};

module.exports = {
  generateOTP,
  hashOTP,
  sendAdminPasswordChangeOTP,
};