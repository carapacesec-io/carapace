import { describe, it, expect } from "vitest";
import { CWE_OWASP_MAP, getCweOwasp } from "../cwe-mapping.js";
import { getAllRules } from "../registry.js";

describe("CWE_OWASP_MAP", () => {
  it("has an entry for every registered rule", () => {
    const rules = getAllRules();
    for (const rule of rules) {
      expect(
        CWE_OWASP_MAP[rule.id],
        `Missing CWE mapping for rule "${rule.id}"`,
      ).toBeDefined();
    }
  });

  it("every entry has a cweIds array", () => {
    for (const [ruleId, entry] of Object.entries(CWE_OWASP_MAP)) {
      expect(
        Array.isArray(entry.cweIds),
        `cweIds for "${ruleId}" must be an array`,
      ).toBe(true);
    }
  });

  it("CWE IDs match the CWE-NNN format", () => {
    const cwePattern = /^CWE-\d+$/;
    for (const [ruleId, entry] of Object.entries(CWE_OWASP_MAP)) {
      for (const cweId of entry.cweIds) {
        expect(
          cwePattern.test(cweId),
          `Invalid CWE format "${cweId}" in rule "${ruleId}"`,
        ).toBe(true);
      }
    }
  });

  it("OWASP categories match the ANN:2021 format when present", () => {
    const owaspPattern = /^A\d{2}:2021-/;
    for (const [ruleId, entry] of Object.entries(CWE_OWASP_MAP)) {
      if (entry.owaspCategory) {
        expect(
          owaspPattern.test(entry.owaspCategory),
          `Invalid OWASP format "${entry.owaspCategory}" in rule "${ruleId}"`,
        ).toBe(true);
      }
    }
  });

  it("injection rules map to A03:2021-Injection", () => {
    expect(CWE_OWASP_MAP["atk-sqli"].owaspCategory).toBe(
      "A03:2021-Injection",
    );
    expect(CWE_OWASP_MAP["atk-xss"].owaspCategory).toBe(
      "A03:2021-Injection",
    );
    expect(CWE_OWASP_MAP["atk-command-injection"].owaspCategory).toBe(
      "A03:2021-Injection",
    );
  });

  it("atk-ssrf maps to A10:2021-Server-Side Request Forgery", () => {
    expect(CWE_OWASP_MAP["atk-ssrf"].owaspCategory).toBe(
      "A10:2021-Server-Side Request Forgery",
    );
  });

  it("atk-idor maps to CWE-639 and A01", () => {
    expect(CWE_OWASP_MAP["atk-idor"].cweIds).toContain("CWE-639");
    expect(CWE_OWASP_MAP["atk-idor"].owaspCategory).toMatch(/^A01:2021/);
  });

  it("quality/gas rules have empty CWE arrays", () => {
    const qualityOnly = [
      "qual-cyclomatic-complexity",
      "qual-function-length",
      "qual-nesting-depth",
      "qual-file-size",
      "qual-naming-convention",
      "qual-magic-numbers",
      "qual-unclear-names",
      "qual-storage-vs-memory",
      "qual-loop-optimization",
      "qual-struct-packing",
      "qual-calldata-vs-memory",
      "gen-code-quality",
      "gen-performance",
      "sol-gas-optimization",
    ];
    for (const id of qualityOnly) {
      expect(
        CWE_OWASP_MAP[id].cweIds,
        `Expected empty CWE array for "${id}"`,
      ).toHaveLength(0);
    }
  });
});

describe("getCweOwasp", () => {
  it("returns the mapping for a known rule", () => {
    const result = getCweOwasp("atk-sqli");
    expect(result.cweIds).toContain("CWE-89");
    expect(result.owaspCategory).toBe("A03:2021-Injection");
  });

  it("returns empty cweIds for an unknown rule", () => {
    const result = getCweOwasp("nonexistent-rule");
    expect(result.cweIds).toHaveLength(0);
    expect(result.owaspCategory).toBeUndefined();
  });
});
