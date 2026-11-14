const MAILJET_API_URL = "https://api.mailjet.com/v3.1/send";
const EMAIL_REQUEST_TIMEOUT_MS = 10_000;

const sendEmail = async ({ to, subject, text, html }) => {
  const apiKey = process.env.MAILJET_API_KEY?.trim();
  const secretKey = process.env.MAILJET_SECRET_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey) {
    throw new Error("MAILJET_API_KEY is not configured");
  }
  if (!secretKey) {
    throw new Error("MAILJET_SECRET_KEY is not configured");
  }
  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }

  const authorization = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    EMAIL_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(MAILJET_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: from, Name: "VOLTIX" },
            To: [{ Email: to }],
            Subject: subject,
            TextPart: text,
            HTMLPart: html,
          },
        ],
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      throw new Error(
        `Email API returned invalid JSON (HTTP ${response.status})`,
        { cause: error }
      );
    }

    const message = result?.Messages?.[0];
    if (!response.ok || message?.Status !== "success") {
      const providerError = message?.Errors?.[0];
      const error = new Error(
        providerError?.ErrorMessage ||
          result?.ErrorMessage ||
          result?.message ||
          `Email API request failed with status ${response.status}`
      );
      error.code = providerError?.ErrorCode || `HTTP_${response.status}`;
      throw error;
    }

    const recipient = message.To?.[0];
    const id = recipient?.MessageID ?? recipient?.MessageUUID;
    if (id === undefined || id === null) {
      throw new Error("Email API response did not include a message ID");
    }

    return { id: String(id) };
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { sendEmail };
