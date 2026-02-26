import type { Rule } from "../registry.js";

export const injectionRules: Rule[] = [
  {
    id: "atk-sqli",
    name: "SQL Injection",
    description:
      "Detect SQL injection vectors including string concatenation in queries, missing parameterization, and ORM raw query misuse.",
    category: "injection",
    severity: "critical",
    enabled: true,
  },
  {
    id: "atk-xss",
    name: "Cross-Site Scripting (XSS)",
    description:
      "Detect reflected, stored, and DOM-based XSS vectors including unsanitized user input in HTML output, innerHTML usage, and missing Content-Security-Policy.",
    category: "injection",
    severity: "high",
    enabled: true,
  },
  {
    id: "atk-command-injection",
    name: "Command Injection",
    description:
      "Detect OS command injection via unsanitized user input passed to exec(), spawn(), system(), or shell commands.",
    category: "injection",
    severity: "critical",
    enabled: true,
  },
  {
    id: "atk-ssrf",
    name: "Server-Side Request Forgery",
    description:
      "Detect SSRF vectors where user-controlled URLs are fetched server-side without allowlist validation, enabling internal network scanning.",
    category: "injection",
    severity: "high",
    enabled: true,
  },
  {
    id: "atk-path-traversal",
    name: "Path Traversal",
    description:
      "Detect directory traversal via user-controlled file paths containing ../ sequences or absolute paths that bypass intended directory restrictions.",
    category: "injection",
    severity: "high",
    enabled: true,
  },
];
