import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEmail } from "./emailRules.js";

test("ordinary addresses are accepted", () => {
  for (const email of [
    "name@gmail.com",
    "first.last@outlook.com",
    "student21@nitc.ac.in",
    "a_b+c@example.co.uk",
  ]) {
    assert.equal(validateEmail(email).valid, true, email);
  }
});

test("the domain is lowercased and the address is trimmed", () => {
  const result = validateEmail("  Student@Gmail.COM  ");
  assert.equal(result.valid, true);
  assert.equal(result.email, "Student@gmail.com");
});

test("broken formats are rejected", () => {
  for (const email of [
    "",
    "not-an-email",
    "two@@gmail.com",
    "@gmail.com",
    "name@",
    "name@gmail",
    "name@gmail.c",
    "na me@gmail.com",
    "name..dot@gmail.com",
    ".name@gmail.com",
    "name.@gmail.com",
    "name@-gmail.com",
    "name@gmail..com",
  ]) {
    assert.equal(validateEmail(email).valid, false, email);
  }
});

test("temporary inboxes are rejected", () => {
  const result = validateEmail("test@mailinator.com");
  assert.equal(result.valid, false);
  assert.match(result.message, /temporary email/i);
});

test("common domain typos come back with a suggestion", () => {
  const gmail = validateEmail("student@gmial.com");
  assert.equal(gmail.valid, false);
  assert.equal(gmail.suggestion, "student@gmail.com");
  assert.match(gmail.message, /did you mean student@gmail\.com/i);

  assert.equal(validateEmail("student@yaho.com").suggestion, "student@yahoo.com");
  assert.equal(validateEmail("student@outlok.com").suggestion, "student@outlook.com");
});

test("very long addresses are rejected", () => {
  const longLocal = "a".repeat(65);
  assert.equal(validateEmail(`${longLocal}@gmail.com`).valid, false);
  assert.equal(validateEmail(`${"a".repeat(250)}@gmail.com`).valid, false);
});
