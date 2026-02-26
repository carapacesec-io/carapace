import type { Rule } from "../registry.js";

export const authRules: Rule[] = [
  {
    id: "atk-brute-force-vector",
    name: "Brute Force Vector",
    description:
      "Detect login endpoints without account lockout, progressive delays, or CAPTCHA protection that are vulnerable to credential stuffing.",
    category: "auth",
    severity: "high",
    enabled: true,
  },
  {
    id: "atk-session-management",
    name: "Session Management Weakness",
    description:
      "Detect weak session handling including missing HttpOnly/Secure/SameSite cookie flags, predictable session IDs, and missing session expiry.",
    category: "auth",
    severity: "high",
    enabled: true,
  },
  {
    id: "atk-mfa-weakness",
    name: "MFA/TOTP Weakness",
    description:
      "Detect MFA bypass vectors including missing rate limits on TOTP validation, lack of backup code rotation, and MFA enrollment gaps.",
    category: "auth",
    severity: "critical",
    enabled: true,
  },
  {
    id: "atk-insecure-cookie",
    name: "Insecure Cookie Configuration",
    description:
      "Detect cookies missing security attributes (Secure, HttpOnly, SameSite=Strict) that expose session tokens to theft via XSS or CSRF.",
    category: "auth",
    severity: "high",
    enabled: true,
  },
];
