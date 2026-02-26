import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInit } from "../commands/init.js";

const TEST_DIR = join(tmpdir(), `carapace-init-test-${Date.now()}`);

function setupTestDir(files?: Record<string, string>): void {
  mkdirSync(TEST_DIR, { recursive: true });
  if (files) {
    for (const [name, content] of Object.entries(files)) {
      const filePath = join(TEST_DIR, name);
      mkdirSync(join(filePath, ".."), { recursive: true });
      const { writeFileSync } = require("node:fs");
      writeFileSync(filePath, content);
    }
  }
}

describe("init command", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("creates .carapace.yml", () => {
    setupTestDir();

    runInit({ path: TEST_DIR, skipHook: true });

    const configPath = join(TEST_DIR, ".carapace.yml");
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("rulesets:");
    expect(content).toContain("general");
    expect(content).toContain("quality");
    expect(content).toContain("severity_threshold:");
    expect(content).toContain("ignore:");
  });

  it("creates .github/workflows/carapace.yml", () => {
    setupTestDir();

    runInit({ path: TEST_DIR, skipHook: true });

    const workflowPath = join(TEST_DIR, ".github", "workflows", "carapace.yml");
    expect(existsSync(workflowPath)).toBe(true);

    const content = readFileSync(workflowPath, "utf-8");
    expect(content).toContain("carapace-action@v1");
    expect(content).toContain("pull_request");
    expect(content).toContain("fail-on: high");
  });

  it("creates pre-commit hook when .git exists", () => {
    setupTestDir();
    mkdirSync(join(TEST_DIR, ".git"), { recursive: true });

    runInit({ path: TEST_DIR, skipHook: false });

    const hookPath = join(TEST_DIR, ".git", "hooks", "pre-commit");
    expect(existsSync(hookPath)).toBe(true);

    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("npx carapace clean");
    expect(content).toContain("npx carapace scan");
  });

  it("--skip-hook omits pre-commit hook", () => {
    setupTestDir();
    mkdirSync(join(TEST_DIR, ".git"), { recursive: true });

    runInit({ path: TEST_DIR, skipHook: true });

    const hookPath = join(TEST_DIR, ".git", "hooks", "pre-commit");
    expect(existsSync(hookPath)).toBe(false);
  });

  it("skips existing files", () => {
    setupTestDir();
    const configPath = join(TEST_DIR, ".carapace.yml");
    const { writeFileSync } = require("node:fs");
    writeFileSync(configPath, "existing: content\n");

    runInit({ path: TEST_DIR, skipHook: true });

    // Should not overwrite
    const content = readFileSync(configPath, "utf-8");
    expect(content).toBe("existing: content\n");
  });

  it("detects Node.js project and adds attack ruleset", () => {
    setupTestDir();
    const { writeFileSync } = require("node:fs");
    writeFileSync(join(TEST_DIR, "package.json"), "{}");

    runInit({ path: TEST_DIR, skipHook: true });

    const content = readFileSync(join(TEST_DIR, ".carapace.yml"), "utf-8");
    expect(content).toContain("attack");
  });

  it("detects Solidity project and adds solidity ruleset", () => {
    setupTestDir();
    const { writeFileSync } = require("node:fs");
    writeFileSync(join(TEST_DIR, "hardhat.config.ts"), "");

    runInit({ path: TEST_DIR, skipHook: true });

    const content = readFileSync(join(TEST_DIR, ".carapace.yml"), "utf-8");
    expect(content).toContain("solidity");
  });

  it("prefers Husky directory for hooks", () => {
    setupTestDir();
    mkdirSync(join(TEST_DIR, ".git"), { recursive: true });
    mkdirSync(join(TEST_DIR, ".husky"), { recursive: true });

    runInit({ path: TEST_DIR, skipHook: false });

    const huskyHook = join(TEST_DIR, ".husky", "pre-commit");
    const gitHook = join(TEST_DIR, ".git", "hooks", "pre-commit");
    expect(existsSync(huskyHook)).toBe(true);
    expect(existsSync(gitHook)).toBe(false);
  });
});
