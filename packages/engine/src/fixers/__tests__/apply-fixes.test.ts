import { describe, it, expect } from "vitest";
import { applyFixes, validateFixedSyntax, type FileFixInput } from "../apply-fixes.js";
import type { Finding } from "../../ai/schemas.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    severity: "critical",
    category: "security",
    title: "Test finding",
    description: "Test description",
    filePath: "src/index.ts",
    startLine: 5,
    endLine: 5,
    codeSnippet: 'const x = "bad";',
    suggestion: 'Use "good" instead',
    fixDiff: "",
    ruleId: "test-rule",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyFixes", () => {
  it("applies a simple unified-diff fix", () => {
    const original = [
      "const a = 1;",
      "const b = 2;",
      'const password = "admin123";',
      "const d = 4;",
      "export { a, b, d };",
    ].join("\n");

    const finding = makeFinding({
      filePath: "src/config.ts",
      startLine: 3,
      fixDiff: [
        "-const password = \"admin123\";",
        "+const password = process.env.DB_PASSWORD ?? \"\";",
      ].join("\n"),
    });

    const fileInputs: FileFixInput[] = [
      { filePath: "src/config.ts", originalContent: original },
    ];

    const result = applyFixes([finding], fileInputs);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].newContent).toContain("process.env.DB_PASSWORD");
    expect(result.files[0].newContent).not.toContain("admin123");
    expect(result.files[0].appliedFindings).toHaveLength(1);
  });

  it("skips medium/low severity findings", () => {
    const finding = makeFinding({
      severity: "medium",
      fixDiff: "-old\n+new",
    });

    const result = applyFixes([finding], [
      { filePath: "src/index.ts", originalContent: "old\n" },
    ]);

    expect(result.files).toHaveLength(0);
  });

  it("skips findings with empty fixDiff", () => {
    const finding = makeFinding({ fixDiff: "" });
    const result = applyFixes([finding], [
      { filePath: "src/index.ts", originalContent: "code\n" },
    ]);
    expect(result.files).toHaveLength(0);
  });

  it("skips files not in fileInputs", () => {
    const finding = makeFinding({
      filePath: "missing.ts",
      fixDiff: "-old\n+new",
    });

    const result = applyFixes([finding], []);
    expect(result.files).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("not available");
  });

  it("applies multiple fixes bottom-to-top in same file", () => {
    const original = [
      "const line1 = 1;",
      "const bad1 = true;",
      "const line3 = 3;",
      "const line4 = 4;",
      "const bad2 = true;",
      "const line6 = 6;",
    ].join("\n");

    const finding1 = makeFinding({
      filePath: "src/app.ts",
      startLine: 2,
      fixDiff: "-const bad1 = true;\n+const good1 = true;",
    });

    const finding2 = makeFinding({
      filePath: "src/app.ts",
      startLine: 5,
      fixDiff: "-const bad2 = true;\n+const good2 = true;",
    });

    const result = applyFixes([finding1, finding2], [
      { filePath: "src/app.ts", originalContent: original },
    ]);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].newContent).toContain("good1");
    expect(result.files[0].newContent).toContain("good2");
    expect(result.files[0].newContent).not.toContain("bad1");
    expect(result.files[0].newContent).not.toContain("bad2");
  });

  it("returns empty result when no findings", () => {
    const result = applyFixes([], []);
    expect(result.files).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it("skips unparseable fixDiff", () => {
    const finding = makeFinding({
      fixDiff: "just some text without diff markers",
    });

    const result = applyFixes([finding], [
      { filePath: "src/index.ts", originalContent: "code\n" },
    ]);

    expect(result.files).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("parse");
  });

  it("skips fix that would break JS/TS syntax", () => {
    const original = [
      "const a = 1;",
      "const b = 2;",
      "export { a, b };",
    ].join("\n");

    // This fix introduces a syntax error (unclosed parenthesis)
    const finding = makeFinding({
      filePath: "src/broken.ts",
      startLine: 2,
      fixDiff: "-const b = 2;\n+const b = func(2;",
    });

    const result = applyFixes([finding], [
      { filePath: "src/broken.ts", originalContent: original },
    ]);

    expect(result.files).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("syntax");
  });

  it("accepts fix that produces valid syntax", () => {
    const original = [
      "const a = 1;",
      'const secret = "hardcoded";',
      "export { a };",
    ].join("\n");

    const finding = makeFinding({
      filePath: "src/valid.ts",
      startLine: 2,
      fixDiff: '-const secret = "hardcoded";\n+const secret = process.env.SECRET ?? "";',
    });

    const result = applyFixes([finding], [
      { filePath: "src/valid.ts", originalContent: original },
    ]);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].newContent).toContain("process.env.SECRET");
  });

  it("skips syntax validation for non-JS/TS files", () => {
    const original = "key: value\nbad_key: bad_value\nother: stuff";

    const finding = makeFinding({
      filePath: "config.yml",
      startLine: 2,
      fixDiff: "-bad_key: bad_value\n+good_key: good_value",
    });

    const result = applyFixes([finding], [
      { filePath: "config.yml", originalContent: original },
    ]);

    // YAML file — syntax validation skipped, fix applied
    expect(result.files).toHaveLength(1);
    expect(result.files[0].newContent).toContain("good_key");
  });
});

// ---------------------------------------------------------------------------
// validateFixedSyntax
// ---------------------------------------------------------------------------

describe("validateFixedSyntax", () => {
  it("returns null for valid TypeScript", () => {
    const code = 'const x = 1;\nconst y = "hello";\nexport { x, y };';
    expect(validateFixedSyntax("src/index.ts", code)).toBeNull();
  });

  it("returns null for valid JSX", () => {
    const code = 'const App = () => <div>Hello</div>;\nexport default App;';
    expect(validateFixedSyntax("src/App.tsx", code)).toBeNull();
  });

  it("returns error message for invalid syntax", () => {
    const code = "const x = func(1;"; // unclosed paren
    const err = validateFixedSyntax("src/broken.ts", code);
    expect(err).not.toBeNull();
    expect(err).toContain("Syntax error");
  });

  it("returns null for non-JS/TS files (no validation)", () => {
    const code = "this is not valid code {{{{";
    expect(validateFixedSyntax("config.yml", code)).toBeNull();
    expect(validateFixedSyntax("README.md", code)).toBeNull();
    expect(validateFixedSyntax("Dockerfile", code)).toBeNull();
  });

  it("handles .mjs and .cjs extensions", () => {
    const valid = "export const x = 1;";
    expect(validateFixedSyntax("lib/utils.mjs", valid)).toBeNull();
    expect(validateFixedSyntax("lib/utils.cjs", valid)).toBeNull();

    const invalid = "export const x = {;";
    expect(validateFixedSyntax("lib/utils.mjs", invalid)).not.toBeNull();
  });
});
