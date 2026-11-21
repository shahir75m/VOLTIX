import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePassword, PASSWORD_RULES } from "./passwordRules.js";

const strong = "Voltix@2026Safe";

test("a long password with upper, lower, number and symbol passes", () => {
  const result = evaluatePassword(strong);
  assert.equal(result.valid, true);
  assert.equal(result.message, "");
  assert.equal(result.checks.every((check) => check.passed), true);
  assert.equal(result.strength, "Strong");
});

test("short passwords are rejected with a readable message", () => {
  const result = evaluatePassword("Ab@1");
  assert.equal(result.valid, false);
  assert.match(result.message, /at least 10 characters/i);
});

test("a password without a symbol, number or uppercase is rejected", () => {
  assert.equal(evaluatePassword("alllowercase").valid, false);
  assert.equal(evaluatePassword("alllowercase1").valid, false);
  assert.equal(evaluatePassword("ALLUPPERCASE1").valid, false);
  assert.equal(evaluatePassword("NoNumbersHere!").valid, false);
});

test("spaces are not allowed", () => {
  const result = evaluatePassword("Good Pass@123");
  assert.equal(result.valid, false);
  assert.match(result.message, /no spaces/i);
});

test("common passwords fail even when they match the character rules", () => {
  const result = evaluatePassword("P@ssw0rd");
  assert.equal(result.valid, false);
  assert.match(result.message, /too common/i);
});

test("the customer's own name, email or phone cannot be inside the password", () => {
  const details = { name: "Shahir Zaman", email: "shahir@example.com", phone: "9876543210" };

  assert.equal(evaluatePassword("Shahir@12345", details).valid, false);
  assert.equal(evaluatePassword("shahir@12345", details).valid, false);
  assert.equal(evaluatePassword("9876543210@Aa", details).valid, false);
  assert.equal(evaluatePassword("Voltix@2026Safe", details).valid, true);
});

test("every rule is exposed for the live checklist", () => {
  assert.equal(PASSWORD_RULES.length, 6);
  assert.deepEqual(
    PASSWORD_RULES.map((rule) => rule.id),
    ["length", "uppercase", "lowercase", "number", "symbol", "spaces"]
  );
});

test("non-string input does not crash", () => {
  assert.equal(evaluatePassword(undefined).valid, false);
  assert.equal(evaluatePassword(null).valid, false);
});
