const nodemailer = require("nodemailer");

const sendPasswordResetOTP = async (email, otp) => {
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
    subject: "VOLTIX - Reset Your Password",

    text: `
Hello,

We received a request to reset your VOLTIX account password.

Your password reset OTP is: ${otp}

This OTP will expire in 5 minutes.

If you did not request a password reset, you can ignore this email.

VOLTIX Security Team
    `,

    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;">
        <h2 style="color:#111827;">VOLTIX</h2>

        <h3>Reset Your Password</h3>

        <p>We received a request to reset your account password.</p>

        <p>Your verification code is:</p>

        <div style="
          background:#f3f4f6;
          padding:20px;
          text-align:center;
          border-radius:8px;
        ">
          <h1 style="letter-spacing:8px;color:#111827;">
            ${otp}
          </h1>
        </div>

        <p>This code expires in <strong>5 minutes</strong>.</p>

        <p style="color:#6b7280;font-size:13px;">
          If you did not request this, simply ignore this email.
        </p>

        <hr />

        <p style="color:#9ca3af;font-size:12px;">
          VOLTIX Security Team
        </p>
      </div>
    `,
  });
};

module.exports = { sendPasswordResetOTP };