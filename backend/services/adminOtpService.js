const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

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

// Send OTP to admin email
const sendAdminOTP = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "VOLTIX Admin Login Verification",

    text: `Your VOLTIX admin verification code is ${otp}. It expires in 5 minutes. If you did not request this code, ignore this email.`,

    html: `
      <div style="font-family:Arial,sans-serif;padding:24px">
        <h2>VOLTIX Admin Verification</h2>

        <p>Use this code to complete your admin login:</p>

        <h1 style="letter-spacing:6px">
          ${otp}
        </h1>

        <p>This code expires in 5 minutes.</p>

        <p>If you did not request this code, ignore this email.</p>
      </div>
    `,
  });
};

module.exports = {
  generateOTP,
  hashOTP,
  sendAdminOTP,
};