import type { Rule } from "../registry.js";

export const reconRules: Rule[] = [
  {
    id: "atk-missing-security-headers",
    name: "Missing Security Headers",
    description:
      "Detect missing HTTP security headers (X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Content-Security-Policy, Referrer-Policy, Permissions-Policy).",
    category: "recon",
    severity: "medium",
    enabled: true,
  },
  {
    id: "atk-cors-misconfiguration",
    name: "CORS Misconfiguration",
    description:
      "Detect overly permissive CORS policies including wildcard origins, credential reflection, and missing origin validation.",
    category: "recon",
    severity: "high",
    enabled: true,
  },
  {
    id: "atk-no-rate-limiting",
    name: "Missing Rate Limiting",
    description:
      "Detect endpoints lacking rate limiting headers (X-RateLimit-*, Retry-After) that are vulnerable to brute force and DoS.",
    category: "recon",
    severity: "medium",
    enabled: true,
  },
  {
    id: "atk-tech-fingerprint",
    name: "Technology Fingerprinting",
    description:
      "Detect exposed technology stack information via Server, X-Powered-By, X-AspNet-Version headers and known response patterns.",
    category: "recon",
    severity: "low",
    enabled: true,
  },
  {
    id: "atk-tls-weakness",
    name: "TLS/Certificate Weakness",
    description:
      "Detect weak TLS configurations including outdated protocols, weak cipher suites, missing HSTS, and certificate issues.",
    category: "recon",
    severity: "high",
    enabled: true,
  },
];
