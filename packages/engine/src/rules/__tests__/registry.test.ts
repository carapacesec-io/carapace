import { describe, it, expect } from "vitest";
import { getAllRules, getRulesForChains } from "../registry.js";

describe("getAllRules", () => {
  it("returns a non-empty array of rules", () => {
    const rules = getAllRules();
    expect(rules.length).toBeGreaterThan(0);
  });

  it("every rule has required fields", () => {
    const rules = getAllRules();
    for (const rule of rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(rule.category).toBeTruthy();
      expect(typeof rule.enabled).toBe("boolean");
      expect(["critical", "high", "medium", "low", "info"]).toContain(rule.severity);
    }
  });

  it("has no duplicate rule IDs", () => {
    const rules = getAllRules();
    const ids = rules.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("getRulesForChains", () => {
  it("includes general rules when filtering by chain", () => {
    const rules = getRulesForChains(["solidity"]);
    const generalRules = rules.filter((r) => !r.chain);
    expect(generalRules.length).toBeGreaterThan(0);
  });

  it("includes solidity rules when solidity chain is specified", () => {
    const rules = getRulesForChains(["solidity"]);
    const solidityRules = rules.filter((r) => r.chain === "solidity");
    expect(solidityRules.length).toBeGreaterThan(0);
  });

  it("excludes chain-specific rules when no matching chain", () => {
    const rules = getRulesForChains([]);
    const chainRules = rules.filter((r) => r.chain);
    expect(chainRules).toHaveLength(0);
  });
});
