import type { Rule } from "../registry.js";

export const apiRules: Rule[] = [
  {
    id: "atk-idor",
    name: "IDOR (Insecure Direct Object Reference)",
    description:
      "Detect endpoints using predictable resource IDs without ownership verification, allowing access to other users' data by ID manipulation.",
    category: "api",
    severity: "critical",
    enabled: true,
  },
  {
    id: "atk-mass-assignment",
    name: "Mass Assignment",
    description:
      "Detect endpoints accepting unfiltered request bodies that could allow users to set privileged fields (role, isAdmin, balance) by including them in requests.",
    category: "api",
    severity: "high",
    enabled: true,
  },
  {
    id: "atk-broken-auth",
    name: "Broken Authentication",
    description:
      "Detect authentication weaknesses including missing auth on sensitive endpoints, JWT validation gaps, and token exposure in URLs or logs.",
    category: "api",
    severity: "critical",
    enabled: true,
  },
  {
    id: "atk-excessive-data",
    name: "Excessive Data Exposure",
    description:
      "Detect API responses returning more data than the client needs, including internal IDs, password hashes, tokens, or PII in list endpoints.",
    category: "api",
    severity: "medium",
    enabled: true,
  },
  {
    id: "atk-rate-limit-bypass",
    name: "Rate Limit Bypass",
    description:
      "Detect rate limiting implementations that can be bypassed via header manipulation (X-Forwarded-For), HTTP method switching, or parameter variation.",
    category: "api",
    severity: "medium",
    enabled: true,
  },
];
