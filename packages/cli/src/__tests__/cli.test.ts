import { describe, it, expect } from "vitest";
import { parseArgs } from "../cli.js";

describe("parseArgs", () => {
  it("parses command as first positional", () => {
    const result = parseArgs(["scan", "."]);
    expect(result.command).toBe("scan");
    expect(result.positional).toEqual(["."]);
  });

  it("parses boolean flags", () => {
    const result = parseArgs(["scan", "--dry-run", "--static-only", "--full"]);
    expect(result.args["dry-run"]).toBe("true");
    expect(result.args["static-only"]).toBe("true");
    expect(result.args["full"]).toBe("true");
  });

  it("parses key-value flags", () => {
    const result = parseArgs(["scan", "--format", "json", "--fail-on", "high"]);
    expect(result.args["format"]).toBe("json");
    expect(result.args["fail-on"]).toBe("high");
  });

  it("parses --api-key with value", () => {
    const result = parseArgs(["scan", "--api-key", "sk-test123"]);
    expect(result.args["api-key"]).toBe("sk-test123");
  });

  it("parses --rulesets with value", () => {
    const result = parseArgs(["scan", "--rulesets", "general,attack,quality"]);
    expect(result.args["rulesets"]).toBe("general,attack,quality");
  });

  it("parses --interactive as boolean", () => {
    const result = parseArgs(["clean", "--interactive"]);
    expect(result.args["interactive"]).toBe("true");
  });

  it("parses --undo as boolean", () => {
    const result = parseArgs(["clean", "--undo"]);
    expect(result.args["undo"]).toBe("true");
  });

  it("parses --fix as boolean", () => {
    const result = parseArgs(["scan", "--fix"]);
    expect(result.args["fix"]).toBe("true");
  });

  it("parses --verbose as boolean", () => {
    const result = parseArgs(["scan", "--verbose"]);
    expect(result.args["verbose"]).toBe("true");
  });

  it("parses --quiet as boolean", () => {
    const result = parseArgs(["scan", "--quiet"]);
    expect(result.args["quiet"]).toBe("true");
  });

  it("parses short flags -h and -v", () => {
    const resultH = parseArgs(["scan", "-h"]);
    expect(resultH.args["help"]).toBe("true");

    const resultV = parseArgs(["scan", "-v"]);
    expect(resultV.args["version"]).toBe("true");
  });

  it("captures multiple positional args", () => {
    const result = parseArgs(["scan", "src", "lib"]);
    expect(result.command).toBe("scan");
    expect(result.positional).toEqual(["src", "lib"]);
  });

  it("handles mixed flags and positionals", () => {
    const result = parseArgs(["scan", ".", "--format", "json", "--static-only"]);
    expect(result.command).toBe("scan");
    expect(result.positional).toEqual(["."]);
    expect(result.args["format"]).toBe("json");
    expect(result.args["static-only"]).toBe("true");
  });

  it("returns empty command when no args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("");
    expect(result.positional).toEqual([]);
  });

  it("parses --output with value", () => {
    const result = parseArgs(["scan", "--output", "report.json"]);
    expect(result.args["output"]).toBe("report.json");
  });

  it("parses --severity with value", () => {
    const result = parseArgs(["clean", "--severity", "high"]);
    expect(result.args["severity"]).toBe("high");
  });

  it("parses --provider with value", () => {
    const result = parseArgs(["rewrite", "--provider", "anthropic"]);
    expect(result.args["provider"]).toBe("anthropic");
  });

  it("parses --model with value", () => {
    const result = parseArgs(["rewrite", "--model", "claude-3-opus"]);
    expect(result.args["model"]).toBe("claude-3-opus");
  });

  it("parses --skip-hook as boolean", () => {
    const result = parseArgs(["init", "--skip-hook"]);
    expect(result.args["skip-hook"]).toBe("true");
  });

  it("parses --version as boolean", () => {
    const result = parseArgs(["scan", "--version"]);
    expect(result.args["version"]).toBe("true");
  });

  it("parses --help as boolean", () => {
    const result = parseArgs(["scan", "--help"]);
    expect(result.args["help"]).toBe("true");
  });

  it("parses clean command with all options", () => {
    const result = parseArgs(["clean", ".", "--dry-run", "--severity", "medium", "--interactive"]);
    expect(result.command).toBe("clean");
    expect(result.positional).toEqual(["."]);
    expect(result.args["dry-run"]).toBe("true");
    expect(result.args["severity"]).toBe("medium");
    expect(result.args["interactive"]).toBe("true");
  });

  it("parses scan command with all options", () => {
    const result = parseArgs([
      "scan", ".", "--full", "--format", "markdown",
      "--fail-on", "medium", "--static-only", "--fix",
    ]);
    expect(result.command).toBe("scan");
    expect(result.args["full"]).toBe("true");
    expect(result.args["format"]).toBe("markdown");
    expect(result.args["fail-on"]).toBe("medium");
    expect(result.args["static-only"]).toBe("true");
    expect(result.args["fix"]).toBe("true");
  });
});
