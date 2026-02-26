/**
 * CWE / OWASP Top 10 (2021) mapping for every engine rule.
 *
 * Security rules map to specific CWEs and OWASP categories.
 * Quality, gas, and performance rules have empty arrays (not security weaknesses).
 */

export interface CweOwaspEntry {
  cweIds: string[];
  owaspCategory?: string;
}

/**
 * Maps each ruleId to its CWE identifiers and OWASP 2021 category.
 */
export const CWE_OWASP_MAP: Record<string, CweOwaspEntry> = {
  // ── General rules ──────────────────────────────────────────────────────
  "gen-code-quality": { cweIds: [] },
  "gen-potential-bugs": { cweIds: ["CWE-682", "CWE-476"] },
  "gen-performance": { cweIds: [] },
  "gen-security": {
    cweIds: ["CWE-20"],
    owaspCategory: "A03:2021-Injection",
  },
  "gen-error-handling": { cweIds: ["CWE-390", "CWE-754"] },
  "gen-type-safety": { cweIds: ["CWE-843"] },

  // ── Solidity / crypto rules ────────────────────────────────────────────
  "sol-reentrancy": { cweIds: ["CWE-841"] },
  "sol-access-control": {
    cweIds: ["CWE-284"],
    owaspCategory: "A01:2021-Broken Access Control",
  },
  "sol-gas-optimization": { cweIds: [] },
  "sol-integer-overflow": { cweIds: ["CWE-190"] },
  "sol-flash-loan": { cweIds: ["CWE-362"] },
  "sol-oracle-manipulation": { cweIds: ["CWE-345"] },
  "sol-front-running-mev": { cweIds: ["CWE-362"] },
  "sol-unchecked-return": { cweIds: ["CWE-252"] },
  "sol-tx-origin": {
    cweIds: ["CWE-287"],
    owaspCategory: "A07:2021-Identification and Authentication Failures",
  },
  "sol-delegatecall-safety": { cweIds: ["CWE-829"] },

  // ── Attack / recon rules ───────────────────────────────────────────────
  "atk-missing-security-headers": {
    cweIds: ["CWE-693"],
    owaspCategory: "A05:2021-Security Misconfiguration",
  },
  "atk-cors-misconfiguration": {
    cweIds: ["CWE-942"],
    owaspCategory: "A05:2021-Security Misconfiguration",
  },
  "atk-no-rate-limiting": {
    cweIds: ["CWE-770"],
    owaspCategory: "A05:2021-Security Misconfiguration",
  },
  "atk-tech-fingerprint": {
    cweIds: ["CWE-200"],
    owaspCategory: "A05:2021-Security Misconfiguration",
  },
  "atk-tls-weakness": {
    cweIds: ["CWE-326", "CWE-327"],
    owaspCategory: "A02:2021-Cryptographic Failures",
  },

  // ── Attack / auth rules ────────────────────────────────────────────────
  "atk-brute-force-vector": {
    cweIds: ["CWE-307"],
    owaspCategory: "A07:2021-Identification and Authentication Failures",
  },
  "atk-session-management": {
    cweIds: ["CWE-384"],
    owaspCategory: "A07:2021-Identification and Authentication Failures",
  },
  "atk-mfa-weakness": {
    cweIds: ["CWE-308"],
    owaspCategory: "A07:2021-Identification and Authentication Failures",
  },
  "atk-insecure-cookie": {
    cweIds: ["CWE-614"],
    owaspCategory: "A07:2021-Identification and Authentication Failures",
  },

  // ── Attack / injection rules ───────────────────────────────────────────
  "atk-sqli": {
    cweIds: ["CWE-89"],
    owaspCategory: "A03:2021-Injection",
  },
  "atk-xss": {
    cweIds: ["CWE-79"],
    owaspCategory: "A03:2021-Injection",
  },
  "atk-command-injection": {
    cweIds: ["CWE-78"],
    owaspCategory: "A03:2021-Injection",
  },
  "atk-ssrf": {
    cweIds: ["CWE-918"],
    owaspCategory: "A10:2021-Server-Side Request Forgery",
  },
  "atk-path-traversal": {
    cweIds: ["CWE-22"],
    owaspCategory: "A01:2021-Broken Access Control",
  },

  // ── Attack / API rules ─────────────────────────────────────────────────
  "atk-idor": {
    cweIds: ["CWE-639"],
    owaspCategory: "A01:2021-Broken Access Control",
  },
  "atk-mass-assignment": {
    cweIds: ["CWE-915"],
    owaspCategory: "A08:2021-Software and Data Integrity Failures",
  },
  "atk-broken-auth": {
    cweIds: ["CWE-287"],
    owaspCategory: "A07:2021-Identification and Authentication Failures",
  },
  "atk-excessive-data": {
    cweIds: ["CWE-200"],
    owaspCategory: "A01:2021-Broken Access Control",
  },
  "atk-rate-limit-bypass": {
    cweIds: ["CWE-770"],
    owaspCategory: "A05:2021-Security Misconfiguration",
  },

  // ── Quality / complexity rules ─────────────────────────────────────────
  "qual-cyclomatic-complexity": { cweIds: [] },
  "qual-function-length": { cweIds: [] },
  "qual-nesting-depth": { cweIds: [] },
  "qual-file-size": { cweIds: [] },

  // ── Quality / naming rules ─────────────────────────────────────────────
  "qual-naming-convention": { cweIds: [] },
  "qual-magic-numbers": { cweIds: [] },
  "qual-unclear-names": { cweIds: [] },

  // ── Quality / dead-code rules ──────────────────────────────────────────
  "qual-unused-imports": { cweIds: ["CWE-561"] },
  "qual-unreachable-code": { cweIds: ["CWE-561"] },
  "qual-empty-catch": { cweIds: ["CWE-390"] },

  // ── Quality / gas rules (Solidity) ─────────────────────────────────────
  "qual-storage-vs-memory": { cweIds: [] },
  "qual-loop-optimization": { cweIds: [] },
  "qual-struct-packing": { cweIds: [] },
  "qual-calldata-vs-memory": { cweIds: [] },

  // ── Quality / best-practice rules ──────────────────────────────────────
  "qual-error-handling": { cweIds: ["CWE-390", "CWE-754"] },
  "qual-event-emission": { cweIds: [] },
  "qual-natspec": { cweIds: [] },
  "qual-immutable-usage": { cweIds: [] },

  // ── Pattern Scanner — JS/TS Security ───────────────────────────────
  "cp-sec-sql-injection": {
    cweIds: ["CWE-89"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-xss-innerhtml": {
    cweIds: ["CWE-79"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-eval": {
    cweIds: ["CWE-95"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-hardcoded-secret": {
    cweIds: ["CWE-798"],
    owaspCategory: "A07:2021-Identification and Authentication Failures",
  },
  "cp-sec-hardcoded-ip": { cweIds: ["CWE-200"] },
  "cp-sec-path-traversal": {
    cweIds: ["CWE-22"],
    owaspCategory: "A01:2021-Broken Access Control",
  },
  "cp-sec-command-injection": {
    cweIds: ["CWE-78"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-open-redirect": {
    cweIds: ["CWE-601"],
    owaspCategory: "A01:2021-Broken Access Control",
  },
  "cp-sec-cors-wildcard": {
    cweIds: ["CWE-942"],
    owaspCategory: "A05:2021-Security Misconfiguration",
  },
  "cp-sec-jwt-none": {
    cweIds: ["CWE-327"],
    owaspCategory: "A02:2021-Cryptographic Failures",
  },
  "cp-sec-md5-sha1": {
    cweIds: ["CWE-328"],
    owaspCategory: "A02:2021-Cryptographic Failures",
  },
  "cp-sec-http-no-tls": {
    cweIds: ["CWE-319"],
    owaspCategory: "A02:2021-Cryptographic Failures",
  },
  "cp-sec-console-log-sensitive": {
    cweIds: ["CWE-532"],
    owaspCategory: "A09:2021-Security Logging and Monitoring Failures",
  },
  "cp-sec-no-csrf": {
    cweIds: ["CWE-352"],
    owaspCategory: "A01:2021-Broken Access Control",
  },
  "cp-sec-ssrf": {
    cweIds: ["CWE-918"],
    owaspCategory: "A10:2021-Server-Side Request Forgery",
  },
  "cp-sec-unsafe-deserialization": {
    cweIds: ["CWE-502"],
    owaspCategory: "A08:2021-Software and Data Integrity Failures",
  },
  "cp-sec-prototype-pollution": {
    cweIds: ["CWE-1321"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-insecure-random": {
    cweIds: ["CWE-330"],
    owaspCategory: "A02:2021-Cryptographic Failures",
  },
  "cp-sec-xxe": {
    cweIds: ["CWE-611"],
    owaspCategory: "A05:2021-Security Misconfiguration",
  },
  "cp-sec-ldap-injection": {
    cweIds: ["CWE-90"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-regex-dos": {
    cweIds: ["CWE-1333"],
    owaspCategory: "A06:2021-Vulnerable and Outdated Components",
  },
  "cp-sec-timing-attack": {
    cweIds: ["CWE-208"],
    owaspCategory: "A02:2021-Cryptographic Failures",
  },
  "cp-sec-mass-assignment": {
    cweIds: ["CWE-915"],
    owaspCategory: "A08:2021-Software and Data Integrity Failures",
  },
  "cp-sec-header-injection": {
    cweIds: ["CWE-113"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-log-injection": {
    cweIds: ["CWE-117"],
    owaspCategory: "A09:2021-Security Logging and Monitoring Failures",
  },
  "cp-sec-unsafe-regex-constructor": {
    cweIds: ["CWE-1333"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-unvalidated-url": {
    cweIds: ["CWE-20"],
    owaspCategory: "A10:2021-Server-Side Request Forgery",
  },
  "cp-sec-missing-auth-check": {
    cweIds: ["CWE-862"],
    owaspCategory: "A01:2021-Broken Access Control",
  },
  "cp-sec-insecure-cookie": {
    cweIds: ["CWE-614"],
    owaspCategory: "A07:2021-Identification and Authentication Failures",
  },
  "cp-sec-template-injection": {
    cweIds: ["CWE-1336"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-open-cors-credentials": {
    cweIds: ["CWE-942"],
    owaspCategory: "A05:2021-Security Misconfiguration",
  },

  // ── Pattern Scanner — Solidity ─────────────────────────────────────
  "cp-sol-reentrancy": { cweIds: ["CWE-841"] },
  "cp-sol-tx-origin": {
    cweIds: ["CWE-287"],
    owaspCategory: "A07:2021-Identification and Authentication Failures",
  },
  "cp-sol-unchecked-call": { cweIds: ["CWE-252"] },
  "cp-sol-selfdestruct": { cweIds: ["CWE-284"] },
  "cp-sol-delegatecall": { cweIds: ["CWE-829"] },
  "cp-sol-timestamp": { cweIds: ["CWE-330"] },
  "cp-sol-floating-pragma": { cweIds: [] },
  "cp-sol-send-ether": { cweIds: ["CWE-703"] },
  "cp-sol-assembly": { cweIds: [] },
  "cp-sol-private-data": { cweIds: ["CWE-200"] },
  "cp-sol-unchecked-math": { cweIds: ["CWE-190"] },
  "cp-sol-oracle-stale": {
    cweIds: ["CWE-345"],
    owaspCategory: "A08:2021-Software and Data Integrity Failures",
  },
  "cp-sol-flash-loan": {
    cweIds: ["CWE-362"],
    owaspCategory: "A08:2021-Software and Data Integrity Failures",
  },
  "cp-sol-storage-collision": {
    cweIds: ["CWE-829"],
    owaspCategory: "A08:2021-Software and Data Integrity Failures",
  },
  "cp-sol-missing-event": { cweIds: [] },

  // ── Pattern Scanner — Java ─────────────────────────────────────────
  "cp-sec-java-sqli": {
    cweIds: ["CWE-89"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-java-deserialization": {
    cweIds: ["CWE-502"],
    owaspCategory: "A08:2021-Software and Data Integrity Failures",
  },
  "cp-sec-java-xpath": {
    cweIds: ["CWE-643"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-java-log-injection": {
    cweIds: ["CWE-117"],
    owaspCategory: "A09:2021-Security Logging and Monitoring Failures",
  },
  "cp-sec-java-spring-csrf": {
    cweIds: ["CWE-352"],
    owaspCategory: "A01:2021-Broken Access Control",
  },

  // ── Pattern Scanner — Ruby ─────────────────────────────────────────
  "cp-sec-ruby-sqli": {
    cweIds: ["CWE-89"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-ruby-erb-injection": {
    cweIds: ["CWE-79"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-ruby-mass-assign": {
    cweIds: ["CWE-915"],
    owaspCategory: "A08:2021-Software and Data Integrity Failures",
  },

  // ── Pattern Scanner — PHP ──────────────────────────────────────────
  "cp-sec-php-sqli": {
    cweIds: ["CWE-89"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-php-eval": {
    cweIds: ["CWE-95"],
    owaspCategory: "A03:2021-Injection",
  },
  "cp-sec-php-file-include": {
    cweIds: ["CWE-98"],
    owaspCategory: "A03:2021-Injection",
  },

  // ── Pattern Scanner — Quality/Performance ──────────────────────────
  "cp-qual-todo-fixme": { cweIds: [] },
  "cp-qual-console-log": { cweIds: [] },
  "cp-qual-empty-catch": { cweIds: ["CWE-390"] },
  "cp-qual-magic-number": { cweIds: [] },
  "cp-qual-debugger": { cweIds: [] },
  "cp-qual-alert": { cweIds: [] },
  "cp-qual-no-error-handling": { cweIds: ["CWE-754"] },
  "cp-qual-deep-nesting": { cweIds: [] },
  "cp-qual-any-type": { cweIds: ["CWE-843"] },
  "cp-qual-non-null-assertion": { cweIds: [] },
  "cp-qual-var-usage": { cweIds: [] },
  "cp-qual-equality-coercion": { cweIds: ["CWE-843"] },
  "cp-perf-n-plus-one": { cweIds: ["CWE-400"] },
  "cp-perf-no-index": { cweIds: [] },
  "cp-perf-sync-fs": { cweIds: ["CWE-400"] },
  "cp-perf-regex-in-loop": { cweIds: [] },
  "cp-perf-json-parse-loop": { cweIds: [] },
  "cp-perf-await-in-loop": { cweIds: [] },
  "cp-perf-large-bundle-import": { cweIds: [] },

  // ── Pattern Scanner — Code Cleaning (new) ────────────────────────────
  "cp-clean-double-semicolon": { cweIds: [] },
  "cp-clean-unnecessary-else-if": { cweIds: [] },
  "cp-clean-yoda-condition": { cweIds: [] },
  "cp-clean-negative-condition": { cweIds: [] },
  "cp-clean-empty-string-check": { cweIds: [] },
  "cp-clean-callback-hell": { cweIds: [] },
  "cp-clean-commented-out-code": { cweIds: ["CWE-561"] },
  "cp-clean-complex-conditional": { cweIds: [] },
  "cp-clean-cyclomatic-complexity": { cweIds: [] },
  "cp-clean-dead-branch": { cweIds: ["CWE-561"] },
  "cp-clean-deprecated-api": { cweIds: ["CWE-477"] },
  "cp-clean-duplicate-code": { cweIds: [] },
  "cp-clean-empty-block": { cweIds: ["CWE-561"] },
  "cp-clean-file-too-long": { cweIds: [] },
  "cp-clean-function-too-long": { cweIds: [] },
  "cp-clean-implicit-any-return": { cweIds: ["CWE-843"] },
  "cp-clean-inconsistent-naming": { cweIds: [] },
  "cp-clean-mixed-quotes": { cweIds: [] },
  "cp-clean-nested-ternary": { cweIds: [] },
  "cp-clean-no-early-return": { cweIds: [] },
  "cp-clean-redundant-else": { cweIds: [] },
  "cp-clean-too-many-params": { cweIds: [] },

  // ── Pattern Scanner — Quality (new) ──────────────────────────────────
  "cp-qual-return-await": { cweIds: [] },
  "cp-qual-no-optional-chain": { cweIds: [] },
  "cp-qual-redundant-boolean": { cweIds: [] },
  "cp-qual-no-throw-literal": { cweIds: ["CWE-755"] },
  "cp-qual-string-concat": { cweIds: [] },
  "cp-qual-no-await": { cweIds: [] },
  "cp-qual-error-string-only": { cweIds: ["CWE-755"] },
  "cp-qual-unhandled-promise": { cweIds: ["CWE-754"] },
  "cp-qual-swallowed-error": { cweIds: ["CWE-390"] },
  "cp-qual-floating-promise": { cweIds: ["CWE-754"] },
  "cp-qual-no-return-in-finally": { cweIds: ["CWE-584"] },

  // ── Pattern Scanner — Performance (new) ──────────────────────────────
  "cp-perf-unnecessary-clone": { cweIds: [] },
  "cp-perf-spread-in-loop": { cweIds: ["CWE-400"] },
  "cp-perf-string-concat-loop": { cweIds: ["CWE-400"] },
  "cp-perf-dom-in-loop": { cweIds: ["CWE-400"] },

  // ── Pattern Scanner — React ──────────────────────────────────────────
  "cp-react-index-as-key": { cweIds: [] },
  "cp-react-direct-state-mutation": { cweIds: [] },
  "cp-react-missing-key": { cweIds: [] },

  // ── AST Scanner — Quality ────────────────────────────────────────────
  "cp-qual-prefer-const": { cweIds: [] },
  "cp-qual-unsafe-type-assertion": { cweIds: ["CWE-843"] },
};

/**
 * Look up CWE/OWASP data for a given rule. Returns empty arrays for unknown
 * rules so callers never need to null-check.
 */
export function getCweOwasp(ruleId: string): CweOwaspEntry {
  return CWE_OWASP_MAP[ruleId] ?? { cweIds: [] };
}
