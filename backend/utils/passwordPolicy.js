// Server-side password policy. Mirrors frontend/src/utils/passwordRules.js —
// the browser check is only a convenience; this one is what actually protects the account.

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

const PASSWORD_RULES = [
  { id: "length", label: `at least ${PASSWORD_MIN_LENGTH} characters`, test: (value) => value.length >= PASSWORD_MIN_LENGTH },
  { id: "uppercase", label: "one uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { id: "lowercase", label: "one lowercase letter", test: (value) => /[a-z]/.test(value) },
  { id: "number", label: "one number", test: (value) => /\d/.test(value) },
  { id: "symbol", label: "one symbol", test: (value) => /[^A-Za-z0-9\s]/.test(value) },
  { id: "spaces", label: "no spaces", test: (value) => value.length > 0 && value.trim() === value && !/\s/.test(value) },
];

const COMMON_PASSWORDS = new Set([
  "1234567890",
  "12345678910",
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword1",
  "qwerty1234",
  "qwertyuiop",
  "abcd123456",
  "admin12345",
  "welcome123",
  "letmein123",
  "iloveyou1",
  "changeme123",
  "computer12",
  "football12",
  "sunshine12",
  "princess12",
  "superman12",
  "trustno1234",
  "michael123",
  "jennifer12",
  "a1b2c3d4e5",
  "aa12345678",
  "abc1234567",
  "testing123",
  "test123456",
  "india12345",
  "kerala1234",
  "malayalam1",
]);

function personalFragments({ name = "", email = "", phone = "" } = {}) {
  const fragments = new Set();

  String(name)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((part) => part.length >= 3)
    .forEach((part) => fragments.add(part));

  const localPart = String(email).toLowerCase().split("@")[0];
  if (localPart && localPart.length >= 3) fragments.add(localPart);

  const digits = String(phone).replace(/\D/g, "");
  if (digits.length >= 6) fragments.add(digits);

  return [...fragments];
}

/**
 * @param {string} password
 * @param {{name?: string, email?: string, phone?: string}} details
 * @returns {{valid: boolean, message: string, problems: string[]}}
 */
function checkPassword(password, details = {}) {
  if (typeof password !== "string" || !password) {
    return { valid: false, message: "Password is required.", problems: ["Password is required."] };
  }

  const problems = [];

  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Password cannot be longer than ${PASSWORD_MAX_LENGTH} characters.`);
  }

  const lowered = password.toLowerCase();

  if (COMMON_PASSWORDS.has(lowered)) {
    problems.push("This password is too common. Choose something harder to guess.");
  } else if (personalFragments(details).some((fragment) => lowered.includes(fragment))) {
    problems.push("Password must not contain your name, email address or phone number.");
  }

  const missing = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
  if (missing.length > 0) {
    problems.push(`Password must contain ${missing.join(", ")}.`);
  }

  return { valid: problems.length === 0, message: problems[0] || "", problems };
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULES,
  checkPassword,
};
