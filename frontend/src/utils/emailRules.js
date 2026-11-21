// Email validation shared by the login, register and forgot-password forms.
// It rejects broken formats and the addresses that can never receive an OTP
// (disposable inboxes) and suggests a fix for the usual Gmail / Yahoo typos.

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "dispostable.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempail.com",
  "tempmail.com",
  "tempmail.net",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
  "yopmail.fr",
]);

const DOMAIN_TYPOS = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmeil.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "homail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "icloud.co": "icloud.com",
  "iclod.com": "icloud.com",
  "protonmai.com": "protonmail.com",
  "rediffmial.com": "rediffmail.com",
  "rediffmai.com": "rediffmail.com",
};

const LOCAL_PART_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_PATTERN = /^[A-Za-z]{2,24}$/;

/**
 * @returns {{valid: boolean, message: string, email: string, suggestion: string}}
 */
export function validateEmail(value) {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return { valid: false, message: "Email address is required.", email: "", suggestion: "" };
  }

  if (raw.length > 254) {
    return { valid: false, message: "Email address is too long.", email: raw, suggestion: "" };
  }

  if (/\s/.test(raw)) {
    return {
      valid: false,
      message: "Email address cannot contain spaces.",
      email: raw,
      suggestion: "",
    };
  }

  const atIndex = raw.lastIndexOf("@");
  if (atIndex < 1 || atIndex !== raw.indexOf("@") || atIndex === raw.length - 1) {
    return {
      valid: false,
      message: "Enter a valid email address, for example name@gmail.com.",
      email: raw,
      suggestion: "",
    };
  }

  const localPart = raw.slice(0, atIndex);
  const domain = raw.slice(atIndex + 1).toLowerCase();

  if (localPart.length > 64) {
    return {
      valid: false,
      message: "The part before @ cannot be longer than 64 characters.",
      email: raw,
      suggestion: "",
    };
  }

  if (
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !LOCAL_PART_PATTERN.test(localPart)
  ) {
    return {
      valid: false,
      message: "Enter a valid email address, for example name@gmail.com.",
      email: raw,
      suggestion: "",
    };
  }

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))) {
    return {
      valid: false,
      message: "Enter a valid email address, for example name@gmail.com.",
      email: raw,
      suggestion: "",
    };
  }

  const tld = labels[labels.length - 1];
  if (!TLD_PATTERN.test(tld)) {
    return {
      valid: false,
      message: "Enter a valid email address with a real domain, for example name@gmail.com.",
      email: raw,
      suggestion: "",
    };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: false,
      message: "Temporary email addresses cannot be used. Please use your real email.",
      email: raw,
      suggestion: "",
    };
  }

  const fixedDomain = DOMAIN_TYPOS[domain];
  if (fixedDomain) {
    const suggestion = `${localPart}@${fixedDomain}`;
    return {
      valid: false,
      message: `Did you mean ${suggestion}?`,
      email: raw,
      suggestion,
    };
  }

  return { valid: true, message: "", email: `${localPart}@${domain}`, suggestion: "" };
}

export function emailErrorMessage(value) {
  return validateEmail(value).message;
}
