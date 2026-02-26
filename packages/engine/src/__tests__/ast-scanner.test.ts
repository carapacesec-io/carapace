/**
 * AST Scanner Tests — validates TypeScript Compiler API-based code quality checks.
 */

import { describe, it, expect } from "vitest";
import { scanFileAST } from "../static/ast-scanner.js";

function findingIds(code: string, file = "test.ts") {
  return scanFileAST(file, code, undefined).map((f) => f.ruleId);
}

function findingsFor(code: string, ruleId: string, file = "test.ts") {
  return scanFileAST(file, code, undefined).filter((f) => f.ruleId === ruleId);
}

// ---------------------------------------------------------------------------
// Unused Imports
// ---------------------------------------------------------------------------

describe("cp-clean-unused-import (AST)", () => {
  it("flags a named import that is never used", () => {
    const code = `import { useState } from "react";\nconsole.log("hello");`;
    const hits = findingsFor(code, "cp-clean-unused-import");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("useState");
  });

  it("flags a default import that is never used", () => {
    const code = `import React from "react";\nconsole.log("hello");`;
    const hits = findingsFor(code, "cp-clean-unused-import");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("React");
  });

  it("flags a namespace import that is never used", () => {
    const code = `import * as path from "path";\nconsole.log("hello");`;
    const hits = findingsFor(code, "cp-clean-unused-import");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("path");
  });

  it("does NOT flag a named import that is used", () => {
    const code = `import { useState } from "react";\nconst [x, setX] = useState(0);`;
    const hits = findingsFor(code, "cp-clean-unused-import");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag a re-exported import", () => {
    const code = `import { Foo } from "./foo";\nexport { Foo };`;
    const hits = findingsFor(code, "cp-clean-unused-import");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag a type-only import (import type)", () => {
    const code = `import type { SomeType } from "./types";\nconst x = 1;`;
    const hits = findingsFor(code, "cp-clean-unused-import");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag a side-effect import", () => {
    const code = `import "./styles.css";\nconst x = 1;`;
    const hits = findingsFor(code, "cp-clean-unused-import");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag an import used in JSX", () => {
    const code = `import Button from "./Button";\nconst App = () => <Button />;`;
    const hits = findingsFor(code, "cp-clean-unused-import", "test.tsx");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag _ prefixed imports", () => {
    const code = `import { _internal } from "./utils";\nconst x = 1;`;
    const hits = findingsFor(code, "cp-clean-unused-import");
    expect(hits.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unused Variables
// ---------------------------------------------------------------------------

describe("cp-clean-unused-variable (AST)", () => {
  it("flags a simple unused variable", () => {
    const code = `const unused = 42;\nconsole.log("hello");`;
    const hits = findingsFor(code, "cp-clean-unused-variable");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("unused");
  });

  it("does NOT flag a variable used later", () => {
    const code = `const count = 42;\nconsole.log(count);`;
    const hits = findingsFor(code, "cp-clean-unused-variable");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag _ prefixed variables", () => {
    const code = `const _unused = 42;\nconsole.log("hello");`;
    const hits = findingsFor(code, "cp-clean-unused-variable");
    expect(hits.length).toBe(0);
  });

  it("flags unused destructured variables", () => {
    const code = `function test(obj: any) {\n  const { aa, bb } = obj;\n  console.log(aa);\n}`;
    const hits = findingsFor(code, "cp-clean-unused-variable");
    // bb is unused
    expect(hits.some((h) => h.description.includes("bb"))).toBe(true);
  });

  it("does NOT flag exported variables", () => {
    const code = `export const API_URL = "https://example.com";`;
    const hits = findingsFor(code, "cp-clean-unused-variable");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag variables used in callbacks", () => {
    const code = `const handler = () => {};\nsetTimeout(handler, 100);`;
    const hits = findingsFor(code, "cp-clean-unused-variable");
    expect(hits.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unused Functions
// ---------------------------------------------------------------------------

describe("cp-clean-unused-function (AST)", () => {
  it("flags a function that is never called", () => {
    const code = `function unused() { return 1; }\nconsole.log("hello");`;
    const hits = findingsFor(code, "cp-clean-unused-function");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("unused");
  });

  it("does NOT flag a function that is called", () => {
    const code = `function greet() { return "hi"; }\nconsole.log(greet());`;
    const hits = findingsFor(code, "cp-clean-unused-function");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag an exported function", () => {
    const code = `export function helper() { return 1; }`;
    const hits = findingsFor(code, "cp-clean-unused-function");
    expect(hits.length).toBe(0);
  });

  it("flags unused arrow function assigned to variable", () => {
    const code = `const unused = () => { return 1; };\nconsole.log("hello");`;
    const hits = findingsFor(code, "cp-clean-unused-function");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("unused");
  });

  it("does NOT flag arrow function used as callback", () => {
    const code = `const handler = () => { return 1; };\nsetTimeout(handler, 100);`;
    const hits = findingsFor(code, "cp-clean-unused-function");
    expect(hits.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cyclomatic Complexity
// ---------------------------------------------------------------------------

describe("cp-clean-cyclomatic-complexity (AST)", () => {
  it("does NOT flag a simple function (complexity 1)", () => {
    const code = `function simple() { return 1; }`;
    const hits = findingsFor(code, "cp-clean-cyclomatic-complexity");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag a function with complexity < 10", () => {
    const code = `function moderate(x: number) {
  if (x > 0) return 1;
  if (x < 0) return -1;
  if (x === 0) return 0;
  return x;
}`;
    const hits = findingsFor(code, "cp-clean-cyclomatic-complexity");
    expect(hits.length).toBe(0);
  });

  it("flags a function with complexity > 10", () => {
    // Each if adds 1, each && adds 1, base = 1
    // 8 ifs + 3 && = 12 total
    const code = `function complex(a: number, b: number, c: boolean) {
  if (a > 0) { console.log(1); }
  if (a < 0) { console.log(2); }
  if (b > 0) { console.log(3); }
  if (b < 0) { console.log(4); }
  if (c) { console.log(5); }
  if (a > 0 && b > 0) { console.log(6); }
  if (a > 0 && b > 0 && c) { console.log(7); }
  if (a === b) { console.log(8); }
  return a + b;
}`;
    const hits = findingsFor(code, "cp-clean-cyclomatic-complexity");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("complex");
  });

  it("counts ternaries and logical operators correctly", () => {
    const code = `function tricky(x: number, y: number) {
  const a = x > 0 ? 1 : 0;
  const b = y > 0 ? 1 : 0;
  if (x > 0) {}
  if (y > 0) {}
  if (x > 0 && y > 0) {}
  if (x > 0 || y > 0) {}
  if (x > 0 ?? y > 0) {}
  if (x === y) {}
  if (x !== y) {}
  if (x >= y) {}
  return a + b;
}`;
    const hits = findingsFor(code, "cp-clean-cyclomatic-complexity");
    expect(hits.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Function Length
// ---------------------------------------------------------------------------

describe("cp-clean-function-too-long (AST)", () => {
  it("does NOT flag a short function", () => {
    const code = `function short() {\n  return 1;\n}`;
    const hits = findingsFor(code, "cp-clean-function-too-long");
    expect(hits.length).toBe(0);
  });

  it("flags a function longer than 50 lines", () => {
    const bodyLines = Array.from({ length: 55 }, (_, i) => `  const x${i} = ${i};`).join("\n");
    const code = `function longFn() {\n${bodyLines}\n}`;
    const hits = findingsFor(code, "cp-clean-function-too-long");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("longFn");
  });

  it("flags arrow functions that are too long", () => {
    const bodyLines = Array.from({ length: 55 }, (_, i) => `  const x${i} = ${i};`).join("\n");
    const code = `const longArrow = () => {\n${bodyLines}\n};`;
    const hits = findingsFor(code, "cp-clean-function-too-long");
    expect(hits.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Changed ranges filtering
// ---------------------------------------------------------------------------

describe("changed ranges filtering", () => {
  it("only reports findings within changed ranges", () => {
    const code = `import { unused } from "react";\nconsole.log("hello");`;
    // Import is on line 1, but changed range is only line 2
    const hits = scanFileAST("test.ts", code, [[2, 2]]);
    expect(hits.filter((f) => f.ruleId === "cp-clean-unused-import").length).toBe(0);
  });

  it("reports findings when line is in changed range", () => {
    const code = `import { unused } from "react";\nconsole.log("hello");`;
    // Import is on line 1, changed range includes line 1
    const hits = scanFileAST("test.ts", code, [[1, 2]]);
    expect(hits.filter((f) => f.ruleId === "cp-clean-unused-import").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Prefer Const (cp-qual-prefer-const)
// ---------------------------------------------------------------------------

describe("cp-qual-prefer-const (AST)", () => {
  it("flags let that is never reassigned", () => {
    const code = `let count = 42;\nconsole.log(count);`;
    const hits = findingsFor(code, "cp-qual-prefer-const");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("count");
  });

  it("does NOT flag let that is reassigned", () => {
    const code = `let count = 0;\ncount = 10;\nconsole.log(count);`;
    const hits = findingsFor(code, "cp-qual-prefer-const");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag let with += reassignment", () => {
    const code = `let sum = 0;\nsum += 5;\nconsole.log(sum);`;
    const hits = findingsFor(code, "cp-qual-prefer-const");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag let with ++ reassignment", () => {
    const code = `let count = 0;\ncount++;\nconsole.log(count);`;
    const hits = findingsFor(code, "cp-qual-prefer-const");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag const declarations", () => {
    const code = `const x = 42;\nconsole.log(x);`;
    const hits = findingsFor(code, "cp-qual-prefer-const");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag _ prefixed let declarations", () => {
    const code = `let _unused = 42;\nconsole.log("hello");`;
    const hits = findingsFor(code, "cp-qual-prefer-const");
    expect(hits.length).toBe(0);
  });

  it("produces correct fixDiff (let -> const)", () => {
    const code = `let count = 42;\nconsole.log(count);`;
    const hits = findingsFor(code, "cp-qual-prefer-const");
    expect(hits.length).toBe(1);
    expect(hits[0].fixDiff).toContain("const");
    expect(hits[0].fixDiff).not.toMatch(/\blet\b/);
  });
});

// ---------------------------------------------------------------------------
// Unsafe Type Assertion (cp-qual-unsafe-type-assertion)
// ---------------------------------------------------------------------------

describe("cp-qual-unsafe-type-assertion (AST)", () => {
  it("flags 'as any' assertion", () => {
    const code = `const val = input as any;`;
    const hits = findingsFor(code, "cp-qual-unsafe-type-assertion");
    expect(hits.length).toBe(1);
    expect(hits[0].description).toContain("any");
  });

  it("flags '<any>' assertion in .ts files", () => {
    const code = `const val = <any>input;`;
    const hits = findingsFor(code, "cp-qual-unsafe-type-assertion");
    expect(hits.length).toBe(1);
  });

  it("does NOT flag 'as unknown'", () => {
    const code = `const val = input as unknown;`;
    const hits = findingsFor(code, "cp-qual-unsafe-type-assertion");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag 'as string'", () => {
    const code = `const val = input as string;`;
    const hits = findingsFor(code, "cp-qual-unsafe-type-assertion");
    expect(hits.length).toBe(0);
  });

  it("does NOT flag in .js files", () => {
    const code = `const val = input;`;
    const hits = findingsFor(code, "cp-qual-unsafe-type-assertion", "test.js");
    expect(hits.length).toBe(0);
  });

  it("produces correct fixDiff (as any -> as unknown)", () => {
    const code = `const val = input as any;`;
    const hits = findingsFor(code, "cp-qual-unsafe-type-assertion");
    expect(hits.length).toBe(1);
    expect(hits[0].fixDiff).toContain("as unknown");
    expect(hits[0].fixDiff).not.toContain("as any");
  });

  it("produces correct fixDiff (<any> -> <unknown>)", () => {
    const code = `const val = <any>input;`;
    const hits = findingsFor(code, "cp-qual-unsafe-type-assertion");
    expect(hits.length).toBe(1);
    expect(hits[0].fixDiff).toContain("<unknown>");
    expect(hits[0].fixDiff).not.toContain("<any>");
  });
});

// ---------------------------------------------------------------------------
// Confidence levels
// ---------------------------------------------------------------------------

describe("AST confidence levels", () => {
  it("AST findings have 'high' confidence", () => {
    const code = `import { unused } from "react";\nconsole.log("hello");`;
    const hits = scanFileAST("test.ts", code, undefined);
    for (const h of hits) {
      expect(h.confidence).toBe("high");
    }
  });
});
