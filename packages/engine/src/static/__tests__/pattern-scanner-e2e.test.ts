/**
 * End-to-end integration test — reads real vulnerable files from disk
 * and verifies the pattern scanner catches them.
 *
 * This is NOT a regex-unit test. Each fixture contains real-world-style
 * vulnerable code; the scanner must actually read the file, match lines,
 * filter false positives, and produce the expected findings.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  _scanFile as scanFile,
  _ALL_RULES as ALL_RULES,
} from "../pattern-scanner.js";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf-8");
}

function scanFixture(name: string) {
  const content = readFixture(name);
  return scanFile(name, content, ALL_RULES, undefined);
}

function hasRule(findings: ReturnType<typeof scanFixture>, ruleId: string) {
  return findings.some((f) => f.ruleId === ruleId);
}

/* ------------------------------------------------------------------ */
/*  JS/TS — 15 rules                                                   */
/* ------------------------------------------------------------------ */

describe("E2E: vuln-js.ts (15 JS/TS rules)", () => {
  let findings: ReturnType<typeof scanFixture>;

  beforeAll(() => {
    findings = scanFixture("vuln-js.ts");
  });

  it("produces findings", () => {
    expect(findings.length).toBeGreaterThan(0);
    console.log(`  JS/TS findings: ${findings.length} total`);
    for (const f of findings) {
      console.log(`    [${f.severity.padEnd(8)}] ${f.ruleId}  (L${f.startLine})`);
    }
  });

  // --- Each of the 15 new JS/TS rules ---

  it("case 1: cp-sec-sql-injection", () => {
    expect(hasRule(findings, "cp-sec-sql-injection")).toBe(true);
  });

  it("case 2: cp-sec-prototype-pollution", () => {
    expect(hasRule(findings, "cp-sec-prototype-pollution")).toBe(true);
  });

  it("case 3: cp-sec-insecure-random", () => {
    expect(hasRule(findings, "cp-sec-insecure-random")).toBe(true);
  });

  it("case 4: cp-sec-xxe", () => {
    expect(hasRule(findings, "cp-sec-xxe")).toBe(true);
  });

  it("case 5: cp-sec-ldap-injection", () => {
    expect(hasRule(findings, "cp-sec-ldap-injection")).toBe(true);
  });

  it("case 6: cp-sec-timing-attack", () => {
    expect(hasRule(findings, "cp-sec-timing-attack")).toBe(true);
  });

  it("case 7: cp-sec-mass-assignment", () => {
    expect(hasRule(findings, "cp-sec-mass-assignment")).toBe(true);
  });

  it("case 8: cp-sec-header-injection", () => {
    expect(hasRule(findings, "cp-sec-header-injection")).toBe(true);
  });

  it("case 9: cp-sec-log-injection", () => {
    expect(hasRule(findings, "cp-sec-log-injection")).toBe(true);
  });

  it("case 10: cp-sec-unsafe-regex-constructor", () => {
    expect(hasRule(findings, "cp-sec-unsafe-regex-constructor")).toBe(true);
  });

  it("case 11: cp-sec-unvalidated-url", () => {
    expect(hasRule(findings, "cp-sec-unvalidated-url")).toBe(true);
  });

  // case 12 removed: cp-sec-missing-auth-check was deleted (85% FP rate)

  it("case 13: cp-sec-insecure-cookie", () => {
    expect(hasRule(findings, "cp-sec-insecure-cookie")).toBe(true);
  });

  it("case 14: cp-sec-template-injection", () => {
    expect(hasRule(findings, "cp-sec-template-injection")).toBe(true);
  });

  it("case 15: cp-sec-open-cors-credentials", () => {
    expect(hasRule(findings, "cp-sec-open-cors-credentials")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Java — 5 rules                                                     */
/* ------------------------------------------------------------------ */

describe("E2E: vuln-java.java (5 Java rules)", () => {
  let findings: ReturnType<typeof scanFixture>;

  beforeAll(() => {
    findings = scanFixture("vuln-java.java");
  });

  it("produces findings", () => {
    expect(findings.length).toBeGreaterThan(0);
    console.log(`  Java findings: ${findings.length} total`);
    for (const f of findings) {
      console.log(`    [${f.severity.padEnd(8)}] ${f.ruleId}  (L${f.startLine})`);
    }
  });

  it("case 16: cp-sec-java-sqli", () => {
    expect(hasRule(findings, "cp-sec-java-sqli")).toBe(true);
  });

  it("case 17: cp-sec-java-deserialization", () => {
    expect(hasRule(findings, "cp-sec-java-deserialization")).toBe(true);
  });

  it("case 18: cp-sec-java-xpath", () => {
    expect(hasRule(findings, "cp-sec-java-xpath")).toBe(true);
  });

  it("case 19: cp-sec-java-log-injection", () => {
    expect(hasRule(findings, "cp-sec-java-log-injection")).toBe(true);
  });

  it("case 20: cp-sec-java-spring-csrf", () => {
    expect(hasRule(findings, "cp-sec-java-spring-csrf")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Ruby — 3 rules                                                     */
/* ------------------------------------------------------------------ */

describe("E2E: vuln-ruby.rb (3 Ruby rules)", () => {
  let findings: ReturnType<typeof scanFixture>;

  beforeAll(() => {
    findings = scanFixture("vuln-ruby.rb");
  });

  it("produces findings", () => {
    expect(findings.length).toBeGreaterThan(0);
    console.log(`  Ruby findings: ${findings.length} total`);
    for (const f of findings) {
      console.log(`    [${f.severity.padEnd(8)}] ${f.ruleId}  (L${f.startLine})`);
    }
  });

  it("case 21: cp-sec-ruby-sqli", () => {
    expect(hasRule(findings, "cp-sec-ruby-sqli")).toBe(true);
  });

  it("case 22: cp-sec-ruby-erb-injection", () => {
    expect(hasRule(findings, "cp-sec-ruby-erb-injection")).toBe(true);
  });

  it("case 23: cp-sec-ruby-mass-assign", () => {
    expect(hasRule(findings, "cp-sec-ruby-mass-assign")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  PHP — 3 rules                                                      */
/* ------------------------------------------------------------------ */

describe("E2E: vuln-php.php (3 PHP rules)", () => {
  let findings: ReturnType<typeof scanFixture>;

  beforeAll(() => {
    findings = scanFixture("vuln-php.php");
  });

  it("produces findings", () => {
    expect(findings.length).toBeGreaterThan(0);
    console.log(`  PHP findings: ${findings.length} total`);
    for (const f of findings) {
      console.log(`    [${f.severity.padEnd(8)}] ${f.ruleId}  (L${f.startLine})`);
    }
  });

  it("case 24: cp-sec-php-sqli", () => {
    expect(hasRule(findings, "cp-sec-php-sqli")).toBe(true);
  });

  it("case 25: cp-sec-php-eval", () => {
    expect(hasRule(findings, "cp-sec-php-eval")).toBe(true);
  });

  it("case 26: cp-sec-php-file-include", () => {
    expect(hasRule(findings, "cp-sec-php-file-include")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Solidity — 4 rules                                                 */
/* ------------------------------------------------------------------ */

describe("E2E: vuln-sol.sol (4 Solidity rules)", () => {
  let findings: ReturnType<typeof scanFixture>;

  beforeAll(() => {
    findings = scanFixture("vuln-sol.sol");
  });

  it("produces findings", () => {
    expect(findings.length).toBeGreaterThan(0);
    console.log(`  Solidity findings: ${findings.length} total`);
    for (const f of findings) {
      console.log(`    [${f.severity.padEnd(8)}] ${f.ruleId}  (L${f.startLine})`);
    }
  });

  it("case 27: cp-sol-oracle-stale", () => {
    expect(hasRule(findings, "cp-sol-oracle-stale")).toBe(true);
  });

  it("case 28: cp-sol-flash-loan", () => {
    expect(hasRule(findings, "cp-sol-flash-loan")).toBe(true);
  });

  it("case 29: cp-sol-storage-collision", () => {
    expect(hasRule(findings, "cp-sol-storage-collision")).toBe(true);
  });

  it("case 30: cp-sol-missing-event", () => {
    expect(hasRule(findings, "cp-sol-missing-event")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  False positive sanity checks                                       */
/* ------------------------------------------------------------------ */

describe("E2E: false positive sanity", () => {
  it("does NOT flag eval in a docs file", () => {
    const content = 'Example: eval("1 + 1") returns 2';
    const findings = scanFile("docs/guide.md", content, ALL_RULES, undefined);
    expect(findings.length).toBe(0);
  });

  it("does NOT flag SQL injection in a test file (downgrades to info)", () => {
    const content = 'db.query(`SELECT * FROM users WHERE id = ${testId}`)';
    const findings = scanFile("src/__tests__/db.test.ts", content, ALL_RULES, undefined);
    const sqli = findings.filter((f) => f.ruleId === "cp-sec-sql-injection");
    expect(sqli.length).toBe(1);
    expect(sqli[0].severity).toBe("info"); // downgraded
  });

  it("does NOT flag http URL in an import line", () => {
    const content = "import pkg from 'http://cdn.example.com/lib.js'";
    const findings = scanFile("src/index.ts", content, ALL_RULES, undefined);
    const httpFindings = findings.filter((f) => f.ruleId === "cp-sec-http-no-tls");
    expect(httpFindings.length).toBe(0);
  });

  it("does NOT flag eval inside a comment", () => {
    const content = "// eval(dangerousCode) — removed for security";
    const findings = scanFile("src/index.ts", content, ALL_RULES, undefined);
    const evalFindings = findings.filter((f) => f.ruleId === "cp-sec-eval");
    expect(evalFindings.length).toBe(0);
  });
});
