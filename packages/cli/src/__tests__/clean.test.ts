import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runClean } from "../commands/clean.js";

const TEST_DIR = join(tmpdir(), `carapace-clean-test-${Date.now()}`);
const BACKUP_DIR = ".carapace-backup";

function setupTestDir(files: Record<string, string>): void {
  mkdirSync(TEST_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(TEST_DIR, name);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content);
  }
}

function readTestFile(name: string): string {
  return readFileSync(join(TEST_DIR, name), "utf-8");
}

describe("clean command", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("--dry-run does not modify files", async () => {
    const original = 'console.log("hello");\nconst x = 1;\n';
    setupTestDir({ "test.js": original });

    await runClean({ path: TEST_DIR, dryRun: true });

    expect(readTestFile("test.js")).toBe(original);
  });

  it("--dry-run does not create backup", async () => {
    setupTestDir({ "test.js": 'console.log("hello");\n' });

    await runClean({ path: TEST_DIR, dryRun: true });

    expect(existsSync(join(TEST_DIR, BACKUP_DIR))).toBe(false);
  });

  it("cleans files and creates backup", async () => {
    // var usage is fixable (cp-qual-var-usage: var → let)
    const original = 'var x = 1;\nvar y = 2;\n';
    setupTestDir({ "app.js": original });

    await runClean({ path: TEST_DIR, dryRun: false });

    // Backup should exist
    expect(existsSync(join(TEST_DIR, BACKUP_DIR))).toBe(true);

    // File should be modified
    const cleaned = readTestFile("app.js");
    expect(cleaned).toContain("let ");
    expect(cleaned).not.toContain("var ");
  });

  it("--severity high filters out low-severity findings", async () => {
    // console.log is typically a "low" or "info" severity finding
    const original = 'console.log("test");\nconst x = 1;\n';
    setupTestDir({ "test.js": original });

    await runClean({ path: TEST_DIR, dryRun: false, severity: "critical" });

    // File should be unchanged since console.log is not critical severity
    expect(readTestFile("test.js")).toBe(original);
  });

  it("--undo restores from backup", async () => {
    const original = 'var x = 1;\nvar y = 2;\n';
    setupTestDir({ "app.js": original });

    // Clean first
    await runClean({ path: TEST_DIR, dryRun: false });

    // Verify it was cleaned
    expect(readTestFile("app.js")).toContain("let ");

    // Undo
    await runClean({ path: TEST_DIR, dryRun: false, undo: true });

    // Should be back to original
    expect(readTestFile("app.js")).toBe(original);
  });

  it("--undo reports no backup when none exists", async () => {
    setupTestDir({ "test.js": "const x = 1;\n" });

    // Should not throw
    await runClean({ path: TEST_DIR, dryRun: false, undo: true });
  });

  it("skips binary files", async () => {
    const binaryContent = "ELF\x00\x01\x02binary content\x00here";
    setupTestDir({ "test.bin": binaryContent });

    await runClean({ path: TEST_DIR, dryRun: false });

    expect(readTestFile("test.bin")).toBe(binaryContent);
  });

  it("skips oversized files", async () => {
    const largeContent = "x".repeat(600_000);
    setupTestDir({ "large.js": largeContent });

    await runClean({ path: TEST_DIR, dryRun: false });

    expect(readTestFile("large.js")).toBe(largeContent);
  });

  it("handles empty directory gracefully", async () => {
    mkdirSync(TEST_DIR, { recursive: true });

    // Should not throw
    await runClean({ path: TEST_DIR, dryRun: false });
  });

  it("handles already-clean code gracefully", async () => {
    setupTestDir({ "clean.ts": "const x: number = 1;\nexport default x;\n" });

    await runClean({ path: TEST_DIR, dryRun: false });

    // No backup since nothing was changed
    expect(existsSync(join(TEST_DIR, BACKUP_DIR))).toBe(false);
  });
});
