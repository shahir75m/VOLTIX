const assert = require("node:assert/strict");
const { test } = require("node:test");
const { checkPassword, PASSWORD_MIN_LENGTH } = require("../utils/passwordPolicy");

test("accepts a strong password", () => {
  const result = checkPassword("Voltix@2026Safe");
  assert.equal(result.valid, true);
  assert.equal(result.message, "");
});

test("rejects short passwords", () => {
  const result = checkPassword("Ab@1");
  assert.equal(result.valid, false);
  assert.match(result.message, new RegExp(`at least ${PASSWORD_MIN_LENGTH} characters`, "i"));
});

test("requires upper, lower, number, symbol and no spaces", () => {
  assert.equal(checkPassword("alllowercase1!").valid, false);
  assert.equal(checkPassword("ALLUPPERCASE1!").valid, false);
  assert.equal(checkPassword("NoNumbersHere!").valid, false);
  assert.equal(checkPassword("NoSymbolsHere12").valid, false);
  assert.equal(checkPassword("Good Pass@123").valid, false);
});

test("rejects common passwords", () => {
  const result = checkPassword("P@ssw0rd");
  assert.equal(result.valid, false);
  assert.match(result.message, /too common/i);
});

test("rejects the customer's own details", () => {
  const details = { name: "Shahir Zaman", email: "shahir@example.com", phone: "9876543210" };
  assert.equal(checkPassword("Shahir@12345", details).valid, false);
  assert.equal(checkPassword("9876543210@Aa", details).valid, false);
  assert.equal(checkPassword("Voltix@2026Safe", details).valid, true);
});

test("never throws on missing input", () => {
  assert.equal(checkPassword(undefined).valid, false);
  assert.equal(checkPassword(null).valid, false);
  assert.equal(checkPassword("").valid, false);
});
