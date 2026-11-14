const crypto = require("node:crypto");
const { sendEmail } = require("./emailApiService");

// Generate a secure 6-digit OTP
const generateUserOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

// Hash OTP before storing in MongoDB
const hashUserOTP = (otp) => {
  const secret = process.env.OTP_HASH_SECRET;

  if (!secret) {
    throw new Error("OTP_HASH_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(otp)
    .digest("hex");
};

// Send registration verification OTP
const sendUserOTP = async (email, otp) => {
  await sendEmail({
    to: email,

    subject: "VOLTIX - Verify Your Email",

    text: `Welcome to VOLTIX!

Your email verification code is: ${otp}

This code expires in 5 minutes.

If you did not create a VOLTIX account, please ignore this email.`,

    html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 500px;
        margin: auto;
        padding: 30px;
        background: #ffffff;
      ">

        <h1 style="
          color: #101419;
          font-size: 30px;
          margin-bottom: 8px;
        ">
          VOLTIX
        </h1>

        <p style="color: #667085;">
          Welcome to VOLTIX!
        </p>

        <h2 style="color: #101419;">
          Verify your email
        </h2>

        <p style="color: #667085;">
          Enter this verification code to complete
          your registration.
        </p>

        <div style="
          background: #f3f4f6;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          margin: 25px 0;
        ">

          <h1 style="
            font-size: 36px;
            letter-spacing: 8px;
            color: #101419;
            margin: 0;
          ">
            ${otp}
          </h1>

        </div>

        <p style="color: #667085;">
          This code expires in
          <strong>5 minutes</strong>.
        </p>

        <p style="
          color: #98a2b3;
          font-size: 13px;
          margin-top: 30px;
        ">
          If you did not request this code,
          you can safely ignore this email.
        </p>

      </div>
    `,
  });
};

// Send OTP for changing account email
const sendEmailChangeOTP = async (email, otp) => {
  const result = await sendEmail({
    to: email,

    subject: "VOLTIX - Verify Your New Email",

    text: `VOLTIX Email Change Verification

You requested to change your VOLTIX account email.

Your verification code is: ${otp}

This code expires in 5 minutes.

If you did not request this change, please ignore this email.`,

    html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 500px;
        margin: auto;
        padding: 30px;
        background: #ffffff;
      ">

        <h1 style="color: #101419;">
          VOLTIX
        </h1>

        <h2 style="color: #101419;">
          Verify Your New Email
        </h2>

        <p style="color: #667085;">
          You requested to change your VOLTIX
          account email address.
        </p>

        <p style="color: #667085;">
          Enter the verification code below
          to confirm your new email.
        </p>

        <div style="
          background: #f3f4f6;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          margin: 25px 0;
        ">

          <h1 style="
            font-size: 36px;
            letter-spacing: 8px;
            color: #101419;
            margin: 0;
          ">
            ${otp}
          </h1>

        </div>

        <p style="color: #667085;">
          This code expires in
          <strong>5 minutes</strong>.
        </p>

        <p style="
          color: #98a2b3;
          font-size: 13px;
          margin-top: 30px;
        ">
          If you did not request this change,
          you can safely ignore this email.
        </p>

      </div>
    `,
  });

  return {
    id: result.id,
  };
};

module.exports = {
  generateUserOTP,
  hashUserOTP,
  sendUserOTP,
  sendEmailChangeOTP,
};