import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, filterByConfig } from "../config.js";

const TEST_DIR = join(tmpdir(), `carapace-config-test-${Date.now()}`);

function setupConfig(content: string): void {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(join(TEST_DIR, ".carapace.yml"), content);
}

describe("loadConfig", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("returns null when no config file exists", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    expect(loadConfig(TEST_DIR)).toBeNull();
  });

  it("parses valid config", () => {
    setupConfig(`
rulesets:
  - general
  - attack
severity_threshold: high
ignore:
  - node_modules
  - dist
disable:
  - cp-qual-todo-fixme
`);

    const config = loadConfig(TEST_DIR);
    expect(config).not.toBeNull();
    expect(config!.rulesets).toEqual(["general", "attack"]);
    expect(config!.severity_threshold).toBe("high");
    expect(config!.ignore).toEqual(["node_modules", "dist"]);
    expect(config!.disable).toEqual(["cp-qual-todo-fixme"]);
  });

  it("returns defaults for empty YAML", () => {
    setupConfig("");

    const config = loadConfig(TEST_DIR);
    expect(config).not.toBeNull();
    expect(config!.rulesets).toEqual(["general", "attack", "quality"]);
    expect(config!.severity_threshold).toBe("info");
  });

  it("warns on typo in ruleset", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setupConfig(`
rulesets:
  - general
  - atack
`);

    const config = loadConfig(TEST_DIR);
    expect(config).not.toBeNull();
    expect(config!.rulesets).toEqual(["general"]);

    const warningCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(warningCalls.some((msg) => msg.includes("atack") && msg.includes("did you mean 'attack'"))).toBe(true);
  });

  it("warns on invalid severity", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setupConfig(`
severity_threshold: hgih
`);

    const config = loadConfig(TEST_DIR);
    expect(config).not.toBeNull();
    expect(config!.severity_threshold).toBe("info"); // Falls back to default

    const warningCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(warningCalls.some((msg) => msg.includes("hgih") && msg.includes("did you mean 'high'"))).toBe(true);
  });

  it("warns on malformed YAML", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setupConfig(`
rulesets: [
  unclosed bracket
`);

    const config = loadConfig(TEST_DIR);
    expect(config).not.toBeNull();
    // Should fall back to defaults
    expect(config!.rulesets).toEqual(["general", "attack", "quality"]);

    const warningCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(warningCalls.some((msg) => msg.includes("could not parse"))).toBe(true);
  });

  it("warns on unknown config keys", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setupConfig(`
rulesets:
  - general
foo: bar
`);

    loadConfig(TEST_DIR);

    const warningCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(warningCalls.some((msg) => msg.includes("unknown config key 'foo'"))).toBe(true);
  });

  it("warns on unknown rule IDs in disable", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setupConfig(`
disable:
  - cp-qual-todo-fixme
  - cp-fake-nonexistent
`);

    const config = loadConfig(TEST_DIR);
    expect(config).not.toBeNull();
    // Valid rules kept, invalid ones filtered
    expect(config!.disable).toEqual(["cp-qual-todo-fixme"]);

    const warningCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(warningCalls.some((msg) => msg.includes("cp-fake-nonexistent"))).toBe(true);
  });

  it("handles all valid rulesets", () => {
    setupConfig(`
rulesets:
  - general
  - attack
  - quality
  - solidity
`);

    const config = loadConfig(TEST_DIR);
    expect(config!.rulesets).toEqual(["general", "attack", "quality", "solidity"]);
  });

  it("handles all valid severities", () => {
    for (const sev of ["critical", "high", "medium", "low", "info"]) {
      if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
      }
      setupConfig(`severity_threshold: ${sev}`);
      const config = loadConfig(TEST_DIR);
      expect(config!.severity_threshold).toBe(sev);
    }
  });
});

describe("filterByConfig", () => {
  it("filters by disabled rules", () => {
    const findings = [
      { ruleId: "cp-qual-todo-fixme", severity: "low" },
      { ruleId: "cp-sec-eval", severity: "high" },
    ];

    const config = {
      rulesets: ["general"],
      severity_threshold: "info",
      ignore: [],
      disable: ["cp-qual-todo-fixme"],
    };

    const filtered = filterByConfig(findings, config);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].ruleId).toBe("cp-sec-eval");
  });

  it("filters by severity threshold", () => {
    const findings = [
      { ruleId: "rule-1", severity: "low" },
      { ruleId: "rule-2", severity: "high" },
      { ruleId: "rule-3", severity: "critical" },
    ];

    const config = {
      rulesets: ["general"],
      severity_threshold: "high",
      ignore: [],
      disable: [],
    };

    const filtered = filterByConfig(findings, config);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((f) => f.severity)).toEqual(["high", "critical"]);
  });

  it("returns all findings when threshold is info", () => {
    const findings = [
      { ruleId: "rule-1", severity: "info" },
      { ruleId: "rule-2", severity: "low" },
      { ruleId: "rule-3", severity: "high" },
    ];

    const config = {
      rulesets: ["general"],
      severity_threshold: "info",
      ignore: [],
      disable: [],
    };

    const filtered = filterByConfig(findings, config);
    expect(filtered).toHaveLength(3);
  });
});
