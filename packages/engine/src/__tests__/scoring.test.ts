import { describe, it, expect } from "vitest";
import { computeScore } from "../scoring.js";
import type { Finding } from "../ai/schemas.js";

function makeFinding(
  severity: Finding["severity"],
  overrides: Partial<Finding> = {},
): Finding {
  return {
    severity,
    category: "test",
    title: `Test ${severity}`,
    description: "Test finding",
    filePath: "test.ts",
    startLine: 1,
    endLine: 1,
    codeSnippet: "x",
    suggestion: "fix it",
    fixDiff: "",
    ruleId: "gen-security",
    ...overrides,
  };
}

describe("computeScore", () => {
  it("returns 100/A for zero findings", () => {
    const result = computeScore([]);
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
  });

  it("deducts 15 per critical finding (high confidence)", () => {
    const result = computeScore([makeFinding("critical", { confidence: "high" })]);
    expect(result.score).toBe(85);
    expect(result.grade).toBe("B");
  });

  it("deducts 8 per high finding (high confidence)", () => {
    const result = computeScore([makeFinding("high", { confidence: "high" })]);
    expect(result.score).toBe(92);
    expect(result.grade).toBe("A");
  });

  it("deducts 3 per medium finding (high confidence)", () => {
    const result = computeScore([makeFinding("medium", { confidence: "high" })]);
    expect(result.score).toBe(97);
    expect(result.grade).toBe("A");
  });

  it("deducts 1 per low finding (high confidence)", () => {
    const result = computeScore([makeFinding("low", { confidence: "high" })]);
    expect(result.score).toBe(99);
    expect(result.grade).toBe("A");
  });

  it("deducts 0 for info findings", () => {
    const result = computeScore([makeFinding("info"), makeFinding("info")]);
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
  });

  it("clamps score at 0 (never negative)", () => {
    // 20 criticals with different ruleIds → 20 × 15 = 300, tier-capped to 100
    const findings = Array.from({ length: 20 }, (_, i) =>
      makeFinding("critical", { ruleId: `rule-${i}`, confidence: "high" }),
    );
    const result = computeScore(findings);
    expect(result.score).toBe(0);
    expect(result.grade).toBe("F");
  });

  // ── Per-rule cap tests ─────────────────────────────────────────────

  it("caps deduction at 30 points per ruleId", () => {
    // 10 critical findings with same ruleId: 10 * 15 = 150, per-rule cap → 30
    const findings = Array.from({ length: 10 }, () =>
      makeFinding("critical", { ruleId: "same-rule", confidence: "high" }),
    );
    const result = computeScore(findings);
    expect(result.score).toBe(70); // 100 - 30 = 70
    expect(result.grade).toBe("C");
  });

  it("allows full deduction across different ruleIds", () => {
    // 2 critical findings with different ruleIds: 2 * 15 = 30
    const findings = [
      makeFinding("critical", { ruleId: "rule-a", confidence: "high" }),
      makeFinding("critical", { ruleId: "rule-b", confidence: "high" }),
    ];
    const result = computeScore(findings);
    expect(result.score).toBe(70); // 100 - 30
    expect(result.grade).toBe("C");
  });

  // ── Confidence multiplier tests ────────────────────────────────────

  it("applies medium confidence multiplier (0.6)", () => {
    // 1 critical at medium confidence: 15 * 0.6 = 9
    const result = computeScore([
      makeFinding("critical", { confidence: "medium" }),
    ]);
    expect(result.score).toBe(91); // 100 - 9
    expect(result.grade).toBe("A");
  });

  it("applies low confidence multiplier (0.3)", () => {
    // 1 critical at low confidence: 15 * 0.3 = 4.5 → rounds to 4.5
    const result = computeScore([
      makeFinding("critical", { confidence: "low" }),
    ]);
    expect(result.score).toBeCloseTo(96, 0); // 100 - 4.5, rounded to 96
  });

  it("defaults to high confidence when not specified", () => {
    // No confidence field → treated as high (1.0)
    const result = computeScore([makeFinding("critical")]);
    expect(result.score).toBe(85); // 100 - 15
  });

  // ── Severity tier cap tests ────────────────────────────────────────

  it("caps critical tier at 100 points", () => {
    // 7 criticals × 15 = 105, tier-capped to 100
    const findings = Array.from({ length: 7 }, (_, i) =>
      makeFinding("critical", { ruleId: `crit-${i}`, confidence: "high" }),
    );
    const result = computeScore(findings);
    expect(result.score).toBe(0); // 100 - 100
  });

  it("caps high tier at 30 points", () => {
    // 10 high × 8 = 80, tier-capped to 30
    const findings = Array.from({ length: 10 }, (_, i) =>
      makeFinding("high", { ruleId: `high-${i}`, confidence: "high" }),
    );
    const result = computeScore(findings);
    expect(result.score).toBe(70); // 100 - 30
  });

  it("caps low tier at 25 points (without fileCount)", () => {
    // 50 low × 1 = 50, tier-capped to 25
    const findings = Array.from({ length: 50 }, (_, i) =>
      makeFinding("low", { ruleId: `low-${i}`, confidence: "high" }),
    );
    const result = computeScore(findings);
    expect(result.score).toBe(75); // 100 - 25
    expect(result.grade).toBe("C");
  });

  it("low-only findings can never produce F grade", () => {
    // Even 500 low findings — tier cap prevents F
    const findings = Array.from({ length: 500 }, (_, i) =>
      makeFinding("low", { ruleId: `low-${i % 50}`, confidence: "high" }),
    );
    const result = computeScore(findings);
    expect(result.score).toBeGreaterThanOrEqual(75); // 100 - 25 = 75
    expect(result.grade).not.toBe("F");
  });

  // ── Density normalization tests ────────────────────────────────────

  it("reduces LOW deductions for low-density repos", () => {
    // 10 low findings across 100 files = density 0.1 = very clean
    const findings = Array.from({ length: 10 }, (_, i) =>
      makeFinding("low", { ruleId: `low-${i}`, confidence: "high" }),
    );
    const withoutFiles = computeScore(findings);
    const withFiles = computeScore(findings, 100);
    // With density normalization, score should be HIGHER than without
    expect(withFiles.score).toBeGreaterThan(withoutFiles.score);
  });

  it("does not reduce CRITICAL/HIGH/MEDIUM deductions by density", () => {
    // 1 critical finding — same score regardless of file count
    const findings = [makeFinding("critical", { ruleId: "crit-1" })];
    const small = computeScore(findings, 10);
    const large = computeScore(findings, 1000);
    expect(small.score).toBe(large.score); // Both 85
    expect(small.score).toBe(85);
  });

  it("density 0.5 with many LOW findings scores well (clean repo)", () => {
    // 50 LOW findings across 100 files = density 0.5
    const findings = Array.from({ length: 50 }, (_, i) =>
      makeFinding("low", { ruleId: `low-${i % 20}`, confidence: "high" }),
    );
    const result = computeScore(findings, 100);
    // density 0.5 → factor = sqrt(0.5/3) ≈ 0.41
    // LOW raw: 50pts but per-rule-capped (20 rules × 2.5 avg = 50, each under 30) → 50, tier-capped to 25
    // 25 × 0.41 = 10.25 → score ≈ 90
    expect(result.score).toBeGreaterThanOrEqual(88);
    expect(result.grade).toBe("A");
  });

  it("density 5.0+ with many LOW findings scores poorly (noisy repo)", () => {
    // 500 LOW findings across 100 files = density 5.0
    const findings = Array.from({ length: 500 }, (_, i) =>
      makeFinding("low", { ruleId: `low-${i % 50}`, confidence: "high" }),
    );
    const result = computeScore(findings, 100);
    // density 5 → factor = min(1, sqrt(5/3)) = 1.0 (full deduction)
    // LOW tier cap 25 × 1.0 = 25 → score 75
    expect(result.score).toBe(75);
    expect(result.grade).toBe("C");
  });

  it("no normalization when fileCount is not provided", () => {
    // Without fileCount, densityFactor defaults to 1.0 (no benefit)
    const findings = Array.from({ length: 30 }, (_, i) =>
      makeFinding("low", { ruleId: `low-${i}`, confidence: "high" }),
    );
    const result = computeScore(findings);
    // 30 low → tier cap 25, no density normalization → score 75
    expect(result.score).toBe(75);
  });

  // ── Breakdown tests ────────────────────────────────────────────────

  it("provides correct breakdown counts", () => {
    const findings = [
      makeFinding("critical", { ruleId: "r1", confidence: "high" }),
      makeFinding("critical", { ruleId: "r2", confidence: "high" }),
      makeFinding("high", { ruleId: "r3", confidence: "high" }),
      makeFinding("medium", { ruleId: "r4", confidence: "high" }),
      makeFinding("medium", { ruleId: "r5", confidence: "high" }),
      makeFinding("medium", { ruleId: "r6", confidence: "high" }),
      makeFinding("low", { ruleId: "r7", confidence: "high" }),
      makeFinding("info", { ruleId: "r8" }),
    ];
    const result = computeScore(findings);
    expect(result.breakdown.critical.count).toBe(2);
    expect(result.breakdown.critical.deducted).toBe(30);
    expect(result.breakdown.high.count).toBe(1);
    expect(result.breakdown.high.deducted).toBe(8);
    expect(result.breakdown.medium.count).toBe(3);
    expect(result.breakdown.medium.deducted).toBe(9);
    expect(result.breakdown.low.count).toBe(1);
    expect(result.breakdown.low.deducted).toBe(1);
    expect(result.breakdown.info.count).toBe(1);
    expect(result.breakdown.info.deducted).toBe(0);
    expect(result.score).toBe(100 - 30 - 8 - 9 - 1);
  });
});
