require("dotenv").config();

const nodemailer = require("nodemailer");

const testEmail = async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,

      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Check SMTP connection
    await transporter.verify();

    console.log("✅ Gmail SMTP Connection Successful!");

    // Send test email
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.SMTP_USER,
      subject: "VOLTIX Email Test",
      text: "Congratulations! VOLTIX email service is working successfully.",
    });

    console.log("✅ Test Email Sent Successfully!");
  } catch (error) {
    console.error("❌ SMTP Test Failed:", error.message);
    process.exitCode = 1;
  }
};

testEmail();