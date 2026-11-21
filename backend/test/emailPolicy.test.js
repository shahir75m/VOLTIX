const assert = require("node:assert/strict");
const { test } = require("node:test");
const { validateEmail } = require("../utils/emailPolicy");

test("accepts ordinary addresses and lowercases the domain", () => {
  const result = validateEmail("  Student@Gmail.COM ");
  assert.equal(result.valid, true);
  assert.equal(result.email, "Student@gmail.com");
});

test("rejects broken formats", () => {
  for (const email of [
    "",
    "not-an-email",
    "two@@gmail.com",
    "@gmail.com",
    "name@",
    "name@gmail",
    "na me@gmail.com",
    "name..dot@gmail.com",
    "name@gmail..com",
    "name@gmail.c",
  ]) {
    assert.equal(validateEmail(email).valid, false, String(email));
  }
});

test("rejects temporary inboxes", () => {
  const result = validateEmail("test@mailinator.com");
  assert.equal(result.valid, false);
  assert.match(result.message, /temporary email/i);
});

test("suggests the right domain for a typo", () => {
  const result = validateEmail("student@gmial.com");
  assert.equal(result.valid, false);
  assert.equal(result.suggestion, "student@gmail.com");
});

test("rejects non-strings without throwing", () => {
  assert.equal(validateEmail(undefined).valid, false);
  assert.equal(validateEmail(null).valid, false);
  assert.equal(validateEmail({}).valid, false);
});
