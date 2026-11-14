const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const app = require("../app");

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("health route responds with API status", async () => {
  const response = await fetch(`${baseUrl}/`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.message, "VORTIX API is running");
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("unknown API route returns a JSON 404", async () => {
  const response = await fetch(`${baseUrl}/not-a-route`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    success: false,
    message: "Route not found",
  });
});

test("state-changing requests from untrusted origins are rejected", async () => {
  const response = await fetch(`${baseUrl}/api/users/logout`, {
    method: "POST",
    headers: { Origin: "https://untrusted.example" },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(body, {
    success: false,
    message: "Request origin is not allowed",
  });
});

test("malformed JSON returns a consistent JSON error", async () => {
  const response = await fetch(`${baseUrl}/api/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    success: false,
    message: "Invalid JSON request body",
  });
});

test("protected customer and admin routes reject unauthenticated requests", async () => {
  const customerResponse = await fetch(`${baseUrl}/api/users/me`);
  const adminResponse = await fetch(`${baseUrl}/api/admin/dashboard`);
  const walletResponse = await fetch(`${baseUrl}/api/users/wallet`);

  assert.equal(customerResponse.status, 401);
  assert.equal(adminResponse.status, 401);
  assert.equal(walletResponse.status, 401);
  assert.equal((await customerResponse.json()).success, false);
  assert.equal((await adminResponse.json()).success, false);
  assert.equal((await walletResponse.json()).success, false);
});

test("login endpoints reject invalid email input before querying", async () => {
  const customerResponse = await fetch(`${baseUrl}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", password: "valid1234" }),
  });
  const adminResponse = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", password: "valid1234" }),
  });

  assert.equal(customerResponse.status, 400);
  assert.equal(adminResponse.status, 400);
});

test("admin password change requires an authenticated session and login OTP endpoint is removed", async () => {
  const passwordChangeResponse = await fetch(
    `${baseUrl}/api/admin/password-change/request-otp`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "current-password",
        newPassword: "new-password-123",
      }),
    }
  );
  const oldOtpResponse = await fetch(`${baseUrl}/api/admin/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge: "a".repeat(64), otp: "123456" }),
  });

  assert.equal(passwordChangeResponse.status, 401);
  assert.equal(oldOtpResponse.status, 404);
});
