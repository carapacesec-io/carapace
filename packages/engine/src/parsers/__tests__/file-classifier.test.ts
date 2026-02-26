import { describe, it, expect } from "vitest";
import { classifyFile } from "../file-classifier.js";

describe("classifyFile", () => {
  it("classifies .sol files as solidity smart contracts", () => {
    const result = classifyFile("contracts/Token.sol");
    expect(result.language).toBe("solidity");
    expect(result.chain).toBe("solidity");
    expect(result.isSmartContract).toBe(true);
  });

  it("classifies .ts files as typescript", () => {
    const result = classifyFile("src/index.ts");
    expect(result.language).toBe("typescript");
    expect(result.chain).toBeUndefined();
    expect(result.isSmartContract).toBe(false);
  });

  it("classifies .tsx files as typescript", () => {
    const result = classifyFile("src/App.tsx");
    expect(result.language).toBe("typescript");
  });

  it("classifies .py files as python", () => {
    const result = classifyFile("app/main.py");
    expect(result.language).toBe("python");
    expect(result.chain).toBeUndefined();
  });

  it("classifies .go files as go", () => {
    const result = classifyFile("cmd/server/main.go");
    expect(result.language).toBe("go");
  });

  it("classifies .rs files as rust", () => {
    const result = classifyFile("src/lib.rs");
    expect(result.language).toBe("rust");
    expect(result.isSmartContract).toBe(false);
  });

  it("classifies .java files as java", () => {
    const result = classifyFile("src/main/java/App.java");
    expect(result.language).toBe("java");
  });

  it("classifies .js files as javascript", () => {
    const result = classifyFile("lib/utils.js");
    expect(result.language).toBe("javascript");
  });

  it("classifies .jsx files as javascript", () => {
    const result = classifyFile("components/Button.jsx");
    expect(result.language).toBe("javascript");
  });

  it("returns unknown for unrecognized extensions", () => {
    const result = classifyFile("README.md");
    expect(result.language).toBe("unknown");
    expect(result.chain).toBeUndefined();
    expect(result.isSmartContract).toBe(false);
  });

  it("returns unknown for files with no extension", () => {
    const result = classifyFile("Makefile");
    expect(result.language).toBe("unknown");
  });
});
