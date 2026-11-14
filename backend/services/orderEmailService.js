const nodemailer = require("nodemailer");

const smtpReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

// Best-effort: an email problem must never break an order update, so errors are only logged.
async function sendOrderStatusEmail(order, user, note) {
  if (!smtpReady() || !user?.email) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const status = order.status === "Confirmed" ? "Processing" : order.status;
    const escape = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: user.email,
      subject: `VOLTIX - Order #${order.orderId} is ${status}`,
      text: `Hello ${user.name || ""},\n\nYour order #${order.orderId} is now: ${status}.\n${note ? `\nNote from the store: ${note}\n` : ""}\nVOLTIX`,
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px">
        <h2>VOLTIX</h2>
        <p>Hello ${escape(user.name || "")},</p>
        <p>Your order <strong>#${escape(order.orderId)}</strong> is now <strong>${escape(status)}</strong>.</p>
        ${note ? `<p>Note from the store: ${escape(note)}</p>` : ""}
      </div>`,
    });
    return true;
  } catch (error) {
    console.error("Order email failed:", error.message);
    return false;
  }
}

module.exports = { sendOrderStatusEmail };
