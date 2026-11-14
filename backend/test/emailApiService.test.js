const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sendEmail } = require("../services/emailApiService");

const withEmailEnvironment = async (values, callback) => {
  const keys = ["MAILJET_API_KEY", "MAILJET_SECRET_KEY", "EMAIL_FROM"];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  );
  const originalFetch = global.fetch;

  try {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        process.env[key] = values[key];
      } else {
        delete process.env[key];
      }
    }
    return await callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    global.fetch = originalFetch;
  }
};

test("email API requires server-side credentials and a verified sender", async () => {
  await withEmailEnvironment({}, async () => {
    await assert.rejects(sendEmail({ to: "person@example.com", subject: "Code" }), {
      message: "MAILJET_API_KEY is not configured",
    });
  });

  await withEmailEnvironment(
    { MAILJET_API_KEY: "test-key" },
    async () => {
      await assert.rejects(
        sendEmail({ to: "person@example.com", subject: "Code" }),
        { message: "MAILJET_SECRET_KEY is not configured" }
      );
    }
  );

  await withEmailEnvironment(
    { MAILJET_API_KEY: "test-key", MAILJET_SECRET_KEY: "test-secret" },
    async () => {
      await assert.rejects(
        sendEmail({ to: "person@example.com", subject: "Code" }),
        { message: "EMAIL_FROM is not configured" }
      );
    }
  );
});

test("email API submits the configured sender and message over HTTPS", async () => {
  await withEmailEnvironment(
    {
      MAILJET_API_KEY: "public-test-key",
      MAILJET_SECRET_KEY: "private-test-key",
      EMAIL_FROM: "support@example.com",
    },
    async () => {
      let request;
      global.fetch = async (url, options) => {
        request = { url, options };
        return new Response(
          JSON.stringify({
            Messages: [
              {
                Status: "success",
                To: [{ Email: "person@example.com", MessageID: 456 }],
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      };

      const result = await sendEmail({
        to: "person@example.com",
        subject: "Verification code",
        text: "123456",
        html: "<p>123456</p>",
      });

      assert.equal(result.id, "456");
      assert.equal(request.url, "https://api.mailjet.com/v3.1/send");
      assert.equal(request.options.method, "POST");
      assert.equal(
        request.options.headers.Authorization,
        `Basic ${Buffer.from("public-test-key:private-test-key").toString("base64")}`
      );
      assert.deepEqual(JSON.parse(request.options.body), {
        Messages: [
          {
            From: { Email: "support@example.com", Name: "VOLTIX" },
            To: [{ Email: "person@example.com" }],
            Subject: "Verification code",
            TextPart: "123456",
            HTMLPart: "<p>123456</p>",
          },
        ],
      });
    }
  );
});

test("email API provider errors are returned explicitly", async () => {
  await withEmailEnvironment(
    {
      MAILJET_API_KEY: "public-test-key",
      MAILJET_SECRET_KEY: "private-test-key",
      EMAIL_FROM: "support@example.com",
    },
    async () => {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            Messages: [
              {
                Status: "error",
                Errors: [
                  {
                    ErrorCode: "sender_not_verified",
                    ErrorMessage: "Sender is not verified",
                  },
                ],
              },
            ],
          }),
          {
            status: 422,
            headers: { "Content-Type": "application/json" },
          }
        );

      await assert.rejects(
        sendEmail({ to: "person@example.com", subject: "Code" }),
        { message: "Sender is not verified", code: "sender_not_verified" }
      );
    }
  );
});
