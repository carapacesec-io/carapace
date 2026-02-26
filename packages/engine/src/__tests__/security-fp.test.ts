/**
 * Security Rule False Positive Reduction Tests.
 *
 * Validates that tightened security and quality rules correctly
 * filter false positives while still catching real issues.
 */

import { describe, it, expect } from "vitest";
import {
  _scanFile as scanFile,
  _ALL_RULES as ALL_RULES,
  _isFalsePositive as isFalsePositive,
  type PatternRule,
} from "../static/pattern-scanner.js";

function findingsForCode(code: string, ruleId: string, file = "src/app.ts") {
  return scanFile(file, code, ALL_RULES, undefined).filter(
    (f) => f.ruleId === ruleId,
  );
}

function ruleById(id: string): PatternRule {
  const rule = ALL_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  return rule;
}

// ---------------------------------------------------------------------------
// cp-sec-hardcoded-secret (3a)
// ---------------------------------------------------------------------------

describe("cp-sec-hardcoded-secret — FP reduction", () => {
  it("flags a real AWS-style secret", () => {
    const code = `const secret = "AKIAIOSFODNN7EXAMPLE1";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-secret");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("flags a real long API key", () => {
    const code = `const api_key = "sk-proj-abc123def456ghi789";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-secret");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag placeholder values", () => {
    const code = `const api_key = "your-api-key-here";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-secret");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag 'changeme' placeholder", () => {
    const code = `const password = "changeme-default";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-secret");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag TODO placeholders", () => {
    const code = `const token = "TODO: replace this with real token";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-secret");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag test/fixture/mock data", () => {
    const code = `const mock_password = "testpassword12345";`;
    const rule = ruleById("cp-sec-hardcoded-secret");
    const fp = isFalsePositive({ filePath: "src/app.ts", line: code, rule });
    expect(fp).toBe(true);
  });

  it("does NOT flag schema definitions", () => {
    const code = `  password: { type: "string12345678" }`;
    const rule = ruleById("cp-sec-hardcoded-secret");
    const fp = isFalsePositive({ filePath: "src/app.ts", line: code, rule });
    expect(fp).toBe(true);
  });

  it("does NOT flag docs files", () => {
    const code = `const secret = "AKIAIOSFODNN7EXAMPLE1";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-secret", "README.md");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag config files", () => {
    const code = `{"secret": "AKIAIOSFODNN7EXAMPLE1"}`;
    const rule = ruleById("cp-sec-hardcoded-secret");
    const fp = isFalsePositive({ filePath: "config.json", line: code, rule });
    expect(fp).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cp-sec-hardcoded-ip (3b)
// ---------------------------------------------------------------------------

describe("cp-sec-hardcoded-ip — FP reduction", () => {
  it("flags a real internal IP", () => {
    const code = `const host = "10.0.5.42";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-ip");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag 127.0.0.1 (loopback)", () => {
    const code = `const host = "127.0.0.1";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-ip");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag 0.0.0.0 (bind all)", () => {
    const code = `const host = "0.0.0.0";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-ip");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag 255.255.255.255 (broadcast)", () => {
    const code = `const mask = "255.255.255.255";`;
    const hits = findingsForCode(code, "cp-sec-hardcoded-ip");
    expect(hits.length).toBe(0);
  });

  it("does NOT have a fixFn (removed dangerous auto-fix)", () => {
    const rule = ruleById("cp-sec-hardcoded-ip");
    expect(rule.fixFn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cp-sec-missing-auth-check (3c) — REMOVED
// ---------------------------------------------------------------------------

describe("cp-sec-missing-auth-check — removed", () => {
  it("rule no longer exists in ALL_RULES", () => {
    const rule = ALL_RULES.find((r) => r.id === "cp-sec-missing-auth-check");
    expect(rule).toBeUndefined();
  });

  it("does NOT flag route handlers", () => {
    const code = `app.get("/health", (req, res) => { res.send("ok"); });`;
    const hits = findingsForCode(code, "cp-sec-missing-auth-check");
    expect(hits.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cp-sec-timing-attack (3d)
// ---------------------------------------------------------------------------

describe("cp-sec-timing-attack — FP reduction", () => {
  it("flags comparison of secret with another variable", () => {
    const code = `if (token === userInput) { grant(); }`;
    const hits = findingsForCode(code, "cp-sec-timing-attack");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag null check", () => {
    const code = `if (token === null) { throw new Error(); }`;
    const hits = findingsForCode(code, "cp-sec-timing-attack");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag undefined check", () => {
    const code = `if (token === undefined) { throw new Error(); }`;
    const hits = findingsForCode(code, "cp-sec-timing-attack");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag boolean check", () => {
    const code = `if (token === false) { return; }`;
    const hits = findingsForCode(code, "cp-sec-timing-attack");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag empty string check", () => {
    const code = `if (token === "") { return; }`;
    const hits = findingsForCode(code, "cp-sec-timing-attack");
    expect(hits.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cp-sec-eval (3e) — fixFn removed
// ---------------------------------------------------------------------------

describe("cp-sec-eval — dangerous fixFn removed", () => {
  it("still detects eval() usage", () => {
    const code = `const result = eval(userCode);`;
    const hits = findingsForCode(code, "cp-sec-eval");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT have a fixFn", () => {
    const rule = ruleById("cp-sec-eval");
    expect(rule.fixFn).toBeUndefined();
  });

  it("finding has empty fixDiff (no auto-fix)", () => {
    const code = `const result = eval(userCode);`;
    const hits = findingsForCode(code, "cp-sec-eval");
    expect(hits[0].fixDiff).toBe("");
  });
});

// ---------------------------------------------------------------------------
// cp-qual-magic-number (3f)
// ---------------------------------------------------------------------------

describe("cp-qual-magic-number — expanded exclusions", () => {
  it("flags unexplained magic number", () => {
    const code = `if (x === 42) { return; }`;
    const hits = findingsForCode(code, "cp-qual-magic-number");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag HTTP 404", () => {
    const code = `if (status === 404) { return notFound(); }`;
    const hits = findingsForCode(code, "cp-qual-magic-number");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag HTTP 200", () => {
    const code = `if (res.status === 200) { return ok(); }`;
    const hits = findingsForCode(code, "cp-qual-magic-number");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag HTTP 500", () => {
    const code = `if (status === 500) { return error(); }`;
    const hits = findingsForCode(code, "cp-qual-magic-number");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag port 3000", () => {
    const code = `if (port === 3000) { return; }`;
    const hits = findingsForCode(code, "cp-qual-magic-number");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag timeout 1000", () => {
    const code = `if (timeout >= 1000) { warn(); }`;
    const hits = findingsForCode(code, "cp-qual-magic-number");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag common size 1024", () => {
    const code = `if (size >= 1024) { return; }`;
    const hits = findingsForCode(code, "cp-qual-magic-number");
    expect(hits.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cp-sec-console-log-sensitive (3g)
// ---------------------------------------------------------------------------

describe("cp-sec-console-log-sensitive — FP reduction", () => {
  it("flags direct logging of password variable", () => {
    const code = `console.log(password);`;
    const hits = findingsForCode(code, "cp-sec-console-log-sensitive");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("does NOT flag logging of redacted value", () => {
    const code = `console.log(redact(password));`;
    const hits = findingsForCode(code, "cp-sec-console-log-sensitive");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag logging of boolean coercion (!!)", () => {
    const code = `console.log(!!password);`;
    const hits = findingsForCode(code, "cp-sec-console-log-sensitive");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag logging .length check", () => {
    const code = `console.log(password.length);`;
    const hits = findingsForCode(code, "cp-sec-console-log-sensitive");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag logging existence check", () => {
    const code = `console.log("has token:", token !== null);`;
    const hits = findingsForCode(code, "cp-sec-console-log-sensitive");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag [REDACTED] marker in isFalsePositive", () => {
    const code = `console.log("password: [REDACTED]");`;
    const rule = ruleById("cp-sec-console-log-sensitive");
    const fp = isFalsePositive({ filePath: "src/app.ts", line: code, rule });
    expect(fp).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isFalsePositive enhancements (Phase 4)
// ---------------------------------------------------------------------------

describe("isFalsePositive — enhanced checks", () => {
  it("skips config files for security rules", () => {
    const rule = ruleById("cp-sec-eval");
    expect(isFalsePositive({ filePath: "config.json", line: `eval("code")`, rule })).toBe(true);
    expect(isFalsePositive({ filePath: "settings.yml", line: `eval("code")`, rule })).toBe(true);
    expect(isFalsePositive({ filePath: "config.yaml", line: `eval("code")`, rule })).toBe(true);
  });

  it("skips commented-out code lines", () => {
    const rule = ruleById("cp-sec-eval");
    expect(isFalsePositive({ filePath: "src/app.ts", line: `// const result = eval("code")`, rule })).toBe(true);
  });

  it("does NOT skip non-code comments for other rules", () => {
    // Regular comments are already handled by isCommentLine
    const rule = ruleById("cp-qual-todo-fixme");
    // TODO comments should NOT be false positives for the TODO rule
    expect(isFalsePositive({ filePath: "src/app.ts", line: `// TODO: fix this`, rule })).toBe(false);
  });
});
