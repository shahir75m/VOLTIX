// One place for the password rules, used by the register form, the reset form and the
// "change password" form. The backend has the same rules in utils/passwordPolicy.js —
// keep both in sync.
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// `test` runs on the raw value so the checklist can show which rule is still missing.
export const PASSWORD_RULES = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "uppercase",
    label: "One uppercase letter (A–Z)",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    id: "lowercase",
    label: "One lowercase letter (a–z)",
    test: (value) => /[a-z]/.test(value),
  },
  {
    id: "number",
    label: "One number (0–9)",
    test: (value) => /\d/.test(value),
  },
  {
    id: "symbol",
    label: "One symbol (! @ # $ % …)",
    test: (value) => /[^A-Za-z0-9\s]/.test(value),
  },
  {
    id: "spaces",
    label: "No spaces",
    test: (value) => value.length > 0 && value.trim() === value && !/\s/.test(value),
  },
];

// Passwords that are the first thing an attacker tries. The list is intentionally small;
// the real defence is the length + character rules above.
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

// Fragments of the customer's own details that must not appear inside the password.
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

function scorePassword(value, passedCount, hasPersonalInfo, isCommon) {
  if (!value) return 0;
  if (isCommon || hasPersonalInfo) return 1;
  if (value.length >= 14 && passedCount >= 5) return 4;
  if (passedCount >= 5) return 3;
  if (passedCount >= 4) return 2;
  return 1;
}

/**
 * Validates a password and returns everything the UI needs.
 * @returns {{valid: boolean, problems: string[], message: string, checks: Array<{id: string, label: string, passed: boolean}>, score: number, strength: string}}
 */
export function evaluatePassword(password, details = {}) {
  const value = typeof password === "string" ? password : "";
  const checks = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    passed: rule.test(value),
  }));

  const problems = [];

  if (!value) {
    problems.push("Password is required.");
  } else if (value.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Password cannot be longer than ${PASSWORD_MAX_LENGTH} characters.`);
  }

  if (value) {
    const lowered = value.toLowerCase();
    const usesPersonalInfo = personalFragments(details).some((fragment) => lowered.includes(fragment));

    if (COMMON_PASSWORDS.has(lowered)) {
      problems.push("This password is too common. Choose something harder to guess.");
    } else if (usesPersonalInfo) {
      problems.push("Password must not contain your name, email address or phone number.");
    }

    const missing = checks.filter((check) => !check.passed).map((check) => check.label.toLowerCase());
    if (missing.length > 0) {
      problems.push(`Password needs: ${missing.join(", ")}.`);
    }
  }

  const passedCount = checks.filter((check) => check.passed).length;
  const lowered = value.toLowerCase();
  const hasPersonalInfo = personalFragments(details).some((fragment) => lowered.includes(fragment));
  const score = scorePassword(value, passedCount, hasPersonalInfo, COMMON_PASSWORDS.has(lowered));
  const strength = ["", "Weak", "Fair", "Good", "Strong"][score] || "";

  return {
    valid: problems.length === 0,
    problems,
    message: problems[0] || "",
    checks,
    score,
    strength,
  };
}

export function passwordErrorMessage(password, details) {
  return evaluatePassword(password, details).message;
}
