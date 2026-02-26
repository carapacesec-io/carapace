import { describe, it, expect } from "vitest";
import { _scanFile, _ALL_RULES } from "../pattern-scanner.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findRule(id: string) {
  const rule = _ALL_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  return rule;
}

/**
 * Scan a single line of code against a specific rule and return findings.
 * Uses "app.ts" / "app.js" / "app.sol" etc. to avoid test-file severity
 * downgrade and docs-file false-positive filtering.
 */
function scanFor(ruleId: string, filePath: string, code: string) {
  const rule = findRule(ruleId);
  return _scanFile(filePath, code, [rule], undefined).filter(
    (f) => f.ruleId === ruleId,
  );
}

/** Shorthand: scan a .ts file */
function scanTS(ruleId: string, code: string) {
  return scanFor(ruleId, "app.ts", code);
}

/** Shorthand: scan a .js file */
function scanJS(ruleId: string, code: string) {
  return scanFor(ruleId, "app.js", code);
}

/** Shorthand: scan a .sol file */
function scanSOL(ruleId: string, code: string) {
  return scanFor(ruleId, "app.sol", code);
}

/* ================================================================== */
/*  1. cp-qual-console-log  —  fixTemplate: "" (delete line)          */
/* ================================================================== */

describe("cp-qual-console-log — fixDiff", () => {
  it("should produce empty fixDiff (delete line)", () => {
    const findings = scanTS("cp-qual-console-log", 'console.log("hello");\n');
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for indented console.log", () => {
    const findings = scanTS(
      "cp-qual-console-log",
      '  console.log("debug value:", x);\n',
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for console.log with template literal", () => {
    const findings = scanTS(
      "cp-qual-console-log",
      "console.log(`user: ${name}`);\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });
});

/* ================================================================== */
/*  2. cp-qual-debugger  —  fixTemplate: "" (delete)                  */
/* ================================================================== */

describe("cp-qual-debugger — fixDiff", () => {
  it("should produce empty fixDiff (delete line)", () => {
    const findings = scanTS("cp-qual-debugger", "debugger;\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for indented debugger", () => {
    const findings = scanTS("cp-qual-debugger", "    debugger;\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for debugger without semicolon", () => {
    const findings = scanTS("cp-qual-debugger", "  debugger\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });
});

/* ================================================================== */
/*  3. cp-qual-alert  —  fixTemplate: "" (delete)                     */
/* ================================================================== */

describe("cp-qual-alert — fixDiff", () => {
  it("should produce empty fixDiff (delete line)", () => {
    const findings = scanTS("cp-qual-alert", 'alert("Warning!");\n');
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should detect alert with template literal", () => {
    const findings = scanTS("cp-qual-alert", "alert(`Hello ${name}`);\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should detect alert with single quotes", () => {
    const findings = scanTS("cp-qual-alert", "alert('Error occurred');\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });
});

/* ================================================================== */
/*  4. cp-qual-var-usage  —  var -> let                               */
/* ================================================================== */

describe("cp-qual-var-usage — fixDiff", () => {
  it("should replace var with let", () => {
    const findings = scanTS("cp-qual-var-usage", "var count = 0;\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("let count = 0;");
  });

  it("should replace var with let when indented", () => {
    const findings = scanTS("cp-qual-var-usage", "  var name = 'test';\n");
    expect(findings.length).toBe(1);
    // fixFn receives line.trim()
    expect(findings[0].fixDiff).toBe("let name = 'test';");
  });

  it("should handle var with complex assignment", () => {
    const findings = scanTS(
      "cp-qual-var-usage",
      "var items = getItems().filter(Boolean);\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("let items = getItems().filter(Boolean);");
  });

  it("should handle var declaration without initializer", () => {
    const findings = scanTS("cp-qual-var-usage", "var result;\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("let result;");
  });
});

/* ================================================================== */
/*  5. cp-qual-equality-coercion  —  == -> ===, != -> !==             */
/* ================================================================== */

describe("cp-qual-equality-coercion — fixDiff", () => {
  it("should replace == with ===", () => {
    const findings = scanJS("cp-qual-equality-coercion", "if (x == 1) {\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("===");
    expect(findings[0].fixDiff).not.toMatch(/[^=]==[^=]/);
  });

  it("should also fix != -> !== when both == and != are on the same line", () => {
    // The pattern only triggers on ==, but the fixFn replaces both == and !=
    const findings = scanJS(
      "cp-qual-equality-coercion",
      "if (x == 1 && y != 2) {\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("===");
    expect(findings[0].fixDiff).toContain("!==");
  });

  it("should handle multiple == on one line", () => {
    const findings = scanJS(
      "cp-qual-equality-coercion",
      "if (a == 1 && b == 2) {\n",
    );
    expect(findings.length).toBe(1);
    // Both == should be replaced
    const fix = findings[0].fixDiff;
    expect(fix).toContain("a === 1");
    expect(fix).toContain("b === 2");
  });

  it("should not double-convert already-strict equality", () => {
    // The regex should not match === so fixFn should leave it alone
    const findings = scanJS(
      "cp-qual-equality-coercion",
      "if (a == 1 && b === 2) {\n",
    );
    expect(findings.length).toBe(1);
    const fix = findings[0].fixDiff;
    expect(fix).toContain("a === 1");
    // The existing === should remain as ===
    expect(fix).toContain("b === 2");
  });
});

/* ================================================================== */
/*  6. cp-qual-non-null-assertion  —  !. -> ?.                        */
/* ================================================================== */

describe("cp-qual-non-null-assertion — fixDiff", () => {
  it("should replace !. with ?.", () => {
    const findings = scanTS(
      "cp-qual-non-null-assertion",
      "const name = user!.name;\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("const name = user?.name;");
  });

  it("should replace multiple non-null assertions on one line", () => {
    const findings = scanTS(
      "cp-qual-non-null-assertion",
      "const val = obj!.nested!.value;\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("const val = obj?.nested?.value;");
  });

  it("should handle chained property access", () => {
    const findings = scanTS(
      "cp-qual-non-null-assertion",
      "return ctx!.session;\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("return ctx?.session;");
  });
});

/* ================================================================== */
/*  7. cp-qual-any-type  —  any -> unknown                            */
/* ================================================================== */

describe("cp-qual-any-type — fixDiff", () => {
  it("should replace : any with : unknown", () => {
    const findings = scanTS("cp-qual-any-type", "function parse(data: any) {\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain(": unknown");
    expect(findings[0].fixDiff).not.toContain(": any");
  });

  it("should replace 'as any' with 'as unknown'", () => {
    const findings = scanTS(
      "cp-qual-any-type",
      "const val = input as any;\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("as unknown");
    expect(findings[0].fixDiff).not.toContain("as any");
  });

  it("should replace <any> with <unknown>", () => {
    const findings = scanTS(
      "cp-qual-any-type",
      "const arr: Array<any> = [];\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("<unknown>");
    expect(findings[0].fixDiff).not.toContain("<any>");
  });

  it("should handle multiple any occurrences on one line", () => {
    const findings = scanTS(
      "cp-qual-any-type",
      "function transform(input: any): any {\n",
    );
    expect(findings.length).toBe(1);
    const fix = findings[0].fixDiff;
    // Both 'any' should become 'unknown'
    expect(fix).not.toMatch(/:\s*any\b/);
    expect((fix.match(/unknown/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

/* ================================================================== */
/*  8. cp-qual-empty-catch  —  add console.error                      */
/* ================================================================== */

describe("cp-qual-empty-catch — fixDiff", () => {
  it("should add console.error with named variable", () => {
    const findings = scanTS("cp-qual-empty-catch", "catch (err) {}\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe(
      "catch (err) { console.error(err); }",
    );
  });

  it("should add console.error with 'e' when variable is 'e'", () => {
    const findings = scanTS("cp-qual-empty-catch", "catch (e) {}\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("catch (e) { console.error(e); }");
  });

  it("should add console.error with default 'e' when no catch variable", () => {
    const findings = scanTS("cp-qual-empty-catch", "catch {}\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("catch (e) { console.error(e); }");
  });

  it("should preserve the original variable name (error)", () => {
    const findings = scanTS("cp-qual-empty-catch", "catch (error) {}\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe(
      "catch (error) { console.error(error); }",
    );
  });
});

/* ================================================================== */
/*  9. cp-sec-eval  —  detection only (fixFn removed — dangerous)      */
/* ================================================================== */

describe("cp-sec-eval — fixDiff", () => {
  it("should detect eval usage but NOT auto-fix (fixFn removed)", () => {
    const findings = scanTS("cp-sec-eval", 'eval("some code");\n');
    expect(findings.length).toBe(1);
    // fixFn was removed because replacing eval() with JSON.parse() is dangerous
    // for non-JSON eval calls
    expect(findings[0].fixDiff).toBe("");
  });

  it("should detect eval with variable argument but NOT auto-fix", () => {
    const findings = scanTS("cp-sec-eval", "const result = eval(data);\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should detect eval with leading whitespace but NOT auto-fix", () => {
    const findings = scanTS("cp-sec-eval", "    eval(input);\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });
});

/* ================================================================== */
/*  10. cp-sec-md5-sha1  —  md5/sha1 -> sha256                       */
/* ================================================================== */

describe("cp-sec-md5-sha1 — fixDiff", () => {
  it("should replace createHash('md5') with createHash('sha256')", () => {
    const findings = scanTS(
      "cp-sec-md5-sha1",
      "const hash = createHash('md5');\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain('"sha256"');
    expect(findings[0].fixDiff).not.toMatch(/['"]md5['"]/i);
  });

  it("should replace createHash('sha1') with createHash('sha256')", () => {
    const findings = scanTS(
      "cp-sec-md5-sha1",
      "const hash = createHash('sha1');\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain('"sha256"');
    expect(findings[0].fixDiff).not.toMatch(/['"]sha1['"]/i);
  });

  it("should handle createHash with double-quoted 'md5'", () => {
    const findings = scanTS(
      "cp-sec-md5-sha1",
      'const hash = createHash("md5");\n',
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain('"sha256"');
    expect(findings[0].fixDiff).not.toMatch(/["']md5["']/i);
  });

  it("should handle createHash with SHA1 argument", () => {
    const findings = scanTS(
      "cp-sec-md5-sha1",
      'const hash = createHash("SHA1");\n',
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain('"sha256"');
  });

  it("should handle createHash without quotes around algorithm name", () => {
    // The regex allows optional quotes: ["']?
    const findings = scanTS(
      "cp-sec-md5-sha1",
      "const hash = createHash(md5);\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBeDefined();
  });
});

/* ================================================================== */
/*  11. cp-sec-http-no-tls  —  http:// -> https://                    */
/* ================================================================== */

describe("cp-sec-http-no-tls — fixDiff", () => {
  it("should replace http:// with https://", () => {
    const findings = scanTS(
      "cp-sec-http-no-tls",
      'const url = "http://api.example.com";\n',
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("https://api.example.com");
    expect(findings[0].fixDiff).not.toContain("http://");
  });

  it("should handle multiple http:// on one line", () => {
    const findings = scanTS(
      "cp-sec-http-no-tls",
      'fetch("http://a.com").then(() => fetch("http://b.com"));\n',
    );
    expect(findings.length).toBe(1);
    const fix = findings[0].fixDiff;
    expect(fix).toContain("https://a.com");
    expect(fix).toContain("https://b.com");
    expect(fix).not.toContain("http://");
  });

  it("should NOT flag localhost URLs (not detected as finding)", () => {
    const findings = scanTS(
      "cp-sec-http-no-tls",
      'const url = "http://localhost:3000";\n',
    );
    expect(findings.length).toBe(0);
  });

  it("should NOT flag 127.0.0.1 URLs", () => {
    const findings = scanTS(
      "cp-sec-http-no-tls",
      'const url = "http://127.0.0.1:8080";\n',
    );
    expect(findings.length).toBe(0);
  });
});

/* ================================================================== */
/*  12. cp-sec-insecure-random  —  Math.random -> crypto.randomUUID   */
/* ================================================================== */

describe("cp-sec-insecure-random — fixDiff", () => {
  it("should replace Math.random() with crypto.randomUUID()", () => {
    const findings = scanTS(
      "cp-sec-insecure-random",
      "const token = Math.random().toString(36);\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("crypto.randomUUID()");
    expect(findings[0].fixDiff).not.toContain("Math.random");
  });

  it("should handle Math.random() in string concatenation", () => {
    const findings = scanTS(
      "cp-sec-insecure-random",
      'const id = "id-" + Math.random();\n',
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("crypto.randomUUID()");
  });

  it("should handle Math.random() with spaces in parens", () => {
    const findings = scanTS(
      "cp-sec-insecure-random",
      "const val = Math.random(  );\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("crypto.randomUUID()");
  });
});

/* ================================================================== */
/*  13. cp-sec-jwt-none  —  "none" -> "HS256"                         */
/* ================================================================== */

describe("cp-sec-jwt-none — fixDiff", () => {
  it('should replace "none" with "HS256"', () => {
    const findings = scanTS(
      "cp-sec-jwt-none",
      "const options = { algorithm: \"none\" };\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain('"HS256"');
    expect(findings[0].fixDiff).not.toMatch(/["']none["']/i);
  });

  it("should replace 'none' (single quotes) with \"HS256\"", () => {
    const findings = scanTS(
      "cp-sec-jwt-none",
      "jwt.sign(payload, key, { algorithm: 'none' });\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain('"HS256"');
  });

  it("should handle algorithms array", () => {
    const findings = scanTS(
      "cp-sec-jwt-none",
      "const opts = { algorithms: [\"none\"] };\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain('"HS256"');
  });
});

/* ================================================================== */
/*  14. cp-sec-cors-wildcard  —  "*" -> env var                       */
/* ================================================================== */

describe("cp-sec-cors-wildcard — fixDiff", () => {
  it('should replace "*" with process.env reference', () => {
    const findings = scanTS(
      "cp-sec-cors-wildcard",
      'origin: "*",\n',
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("process.env.ALLOWED_ORIGIN");
    expect(findings[0].fixDiff).not.toMatch(/["']\*["']/);
  });

  it("should handle allowedOrigin assignment", () => {
    const findings = scanTS(
      "cp-sec-cors-wildcard",
      "const allowedOrigin = '*';\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("process.env.ALLOWED_ORIGIN");
  });

  it("should include fallback domain in the fix", () => {
    const findings = scanTS(
      "cp-sec-cors-wildcard",
      'allowedOrigins: "*"\n',
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("yourdomain.com");
  });
});

/* ================================================================== */
/*  15. cp-sec-hardcoded-ip  —  detection only (fixFn removed)         */
/* ================================================================== */

describe("cp-sec-hardcoded-ip — fixDiff", () => {
  it("should detect hardcoded IP but NOT auto-fix (fixFn removed)", () => {
    const findings = scanTS(
      "cp-sec-hardcoded-ip",
      'const server = "192.168.1.100";\n',
    );
    expect(findings.length).toBe(1);
    // fixFn was removed — blindly replacing IPs with process.env.HOST is dangerous
    expect(findings[0].fixDiff).toBe("");
  });

  it("should detect IP in single quotes but NOT auto-fix", () => {
    const findings = scanTS(
      "cp-sec-hardcoded-ip",
      "const db = '10.0.0.5';\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should detect IP inside a connection string but NOT auto-fix", () => {
    const findings = scanTS(
      "cp-sec-hardcoded-ip",
      'const host = connect("172.16.0.1");\n',
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });
});

/* ================================================================== */
/*  16. cp-sec-insecure-cookie  —  add security flags                 */
/* ================================================================== */

describe("cp-sec-insecure-cookie — fixDiff", () => {
  it("should add security flags to res.cookie()", () => {
    const findings = scanTS(
      "cp-sec-insecure-cookie",
      "res.cookie('session', token);\n",
    );
    expect(findings.length).toBe(1);
    const fix = findings[0].fixDiff;
    expect(fix).toContain("secure: true");
    expect(fix).toContain("httpOnly: true");
    expect(fix).toContain('sameSite: "strict"');
  });

  it("should handle document.cookie assignment", () => {
    const findings = scanTS(
      "cp-sec-insecure-cookie",
      'document.cookie = "session=" + token;\n',
    );
    expect(findings.length).toBe(1);
    const fix = findings[0].fixDiff;
    expect(fix).toContain("Secure");
    expect(fix).toContain("HttpOnly");
    expect(fix).toContain("SameSite=Strict");
  });

  it("should handle setCookie call", () => {
    const findings = scanTS(
      "cp-sec-insecure-cookie",
      "setCookie('auth', value);\n",
    );
    expect(findings.length).toBe(1);
    const fix = findings[0].fixDiff;
    expect(fix).toContain("secure: true");
    expect(fix).toContain("httpOnly: true");
  });
});

/* ================================================================== */
/*  17. cp-sol-floating-pragma  —  ^ -> =                             */
/* ================================================================== */

describe("cp-sol-floating-pragma — fixDiff", () => {
  it("should replace ^ with = in pragma", () => {
    const findings = scanSOL(
      "cp-sol-floating-pragma",
      "pragma solidity ^0.8.24;\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("pragma solidity =0.8.24;");
  });

  it("should handle different version numbers", () => {
    const findings = scanSOL(
      "cp-sol-floating-pragma",
      "pragma solidity ^0.8.0;\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("pragma solidity =0.8.0;");
  });

  it("should preserve rest of the line", () => {
    const findings = scanSOL(
      "cp-sol-floating-pragma",
      "pragma solidity ^0.8.20; // version\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("pragma solidity =0.8.20;");
  });
});

/* ================================================================== */
/*  18. cp-perf-sync-fs  —  readFileSync -> await readFile, etc.      */
/* ================================================================== */

describe("cp-perf-sync-fs — fixDiff", () => {
  it("should replace readFileSync with await readFile", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "const data = readFileSync('config.json', 'utf-8');\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await readFile(");
    expect(findings[0].fixDiff).not.toContain("readFileSync");
  });

  it("should replace writeFileSync with await writeFile", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "writeFileSync('out.txt', content);\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await writeFile(");
    expect(findings[0].fixDiff).not.toContain("writeFileSync");
  });

  it("should replace appendFileSync with await appendFile", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "appendFileSync('log.txt', line);\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await appendFile(");
  });

  it("should replace mkdirSync with await mkdir", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "mkdirSync('output', { recursive: true });\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await mkdir(");
  });

  it("should replace readdirSync with await readdir", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "const files = readdirSync('src');\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await readdir(");
  });

  it("should replace statSync with await stat", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "const info = statSync('file.txt');\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await stat(");
  });

  it("should replace existsSync with await access", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "if (existsSync('config.json')) {\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await access(");
  });

  it("should replace unlinkSync with await unlink", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "unlinkSync('temp.txt');\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await unlink(");
  });

  it("should replace renameSync with await rename", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "renameSync('old.txt', 'new.txt');\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await rename(");
  });

  it("should replace copyFileSync with await copyFile", () => {
    const findings = scanTS(
      "cp-perf-sync-fs",
      "copyFileSync('src.txt', 'dst.txt');\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("await copyFile(");
  });
});

/* ================================================================== */
/*  19. cp-clean-dead-branch  —  fixTemplate: "" (delete)             */
/* ================================================================== */

describe("cp-clean-dead-branch — fixDiff", () => {
  it("should produce empty fixDiff for if(false)", () => {
    const findings = scanTS(
      "cp-clean-dead-branch",
      "if (false) { doStuff(); }\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for if(0)", () => {
    const findings = scanTS(
      "cp-clean-dead-branch",
      "if (0) { neverRuns(); }\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for while(false)", () => {
    const findings = scanTS(
      "cp-clean-dead-branch",
      "while (false) { loop(); }\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for if(null)", () => {
    const findings = scanTS(
      "cp-clean-dead-branch",
      "if (null) { nope(); }\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for if(undefined)", () => {
    const findings = scanTS(
      "cp-clean-dead-branch",
      "if (undefined) { nope(); }\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it('should produce empty fixDiff for if("")', () => {
    const findings = scanTS(
      "cp-clean-dead-branch",
      'if ("") { nope(); }\n',
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });
});

/* ================================================================== */
/*  20. cp-clean-inconsistent-naming  —  snake_case -> camelCase      */
/* ================================================================== */

describe("cp-clean-inconsistent-naming — fixDiff", () => {
  it("should convert single snake_case to camelCase", () => {
    const findings = scanTS(
      "cp-clean-inconsistent-naming",
      "const user_name = getName();\nconsole.log(user_name);\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("userName");
    expect(findings[0].fixDiff).not.toContain("user_name");
  });

  it("should convert multi-segment snake_case to camelCase", () => {
    const findings = scanTS(
      "cp-clean-inconsistent-naming",
      "let first_last_name = 'John Doe';\nconsole.log(first_last_name);\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("firstLastName");
  });

  it("should work with var keyword", () => {
    // Note: this will also trigger cp-qual-var-usage, but we filter by ruleId
    const findings = scanTS(
      "cp-clean-inconsistent-naming",
      "var item_count = 0;\nconsole.log(item_count);\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("itemCount");
  });

  it("should work with function keyword", () => {
    const findings = scanTS(
      "cp-clean-inconsistent-naming",
      "function get_data() { return 1; }\nget_data();\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("getData");
    expect(findings[0].fixDiff).not.toContain("get_data");
  });
});

/* ================================================================== */
/*  21. cp-clean-empty-block  —  fixTemplate: "" (delete)             */
/* ================================================================== */

describe("cp-clean-empty-block — fixDiff", () => {
  it("should produce empty fixDiff for empty if block", () => {
    const findings = scanTS(
      "cp-clean-empty-block",
      "if (condition) {}\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for empty else block", () => {
    const findings = scanTS("cp-clean-empty-block", "else {}\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for empty for block", () => {
    const findings = scanTS(
      "cp-clean-empty-block",
      "for (let i = 0; i < 10; i++) {}\n",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should produce empty fixDiff for empty while block", () => {
    const findings = scanTS("cp-clean-empty-block", "while (true) {}\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("");
  });

  it("should NOT flag blocks with content", () => {
    const findings = scanTS(
      "cp-clean-empty-block",
      "if (x) { doStuff(); }\n",
    );
    expect(findings.length).toBe(0);
  });
});

/* ================================================================== */
/*  22. cp-clean-double-semicolon  —  ;; -> ;                         */
/* ================================================================== */

describe("cp-clean-double-semicolon — fixDiff", () => {
  it("should replace ;; with ;", () => {
    const findings = scanTS("cp-clean-double-semicolon", "const x = 1;;\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("const x = 1;");
  });

  it("should handle trailing whitespace after ;;", () => {
    const findings = scanTS("cp-clean-double-semicolon", "const x = 1;;  \n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("const x = 1;");
    expect(findings[0].fixDiff).not.toContain(";;");
  });
});

/* ================================================================== */
/*  23. cp-clean-yoda-condition  —  flip operands                      */
/* ================================================================== */

describe("cp-clean-yoda-condition — fixDiff", () => {
  it("should flip null === x to x === null", () => {
    const findings = scanTS("cp-clean-yoda-condition", "if (null === value) {\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("value === null");
  });

  it("should flip 42 === x to x === 42", () => {
    const findings = scanTS("cp-clean-yoda-condition", "if (42 === count) {\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("count === 42");
  });
});

/* ================================================================== */
/*  24. cp-qual-return-await  —  return await -> return                */
/* ================================================================== */

describe("cp-qual-return-await — fixDiff", () => {
  it("should remove await from return", () => {
    const findings = scanTS("cp-qual-return-await", "return await fetchData();\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toBe("return fetchData();");
    expect(findings[0].fixDiff).not.toContain("await");
  });
});

/* ================================================================== */
/*  25. cp-qual-no-optional-chain  —  x && x.y -> x?.y                */
/* ================================================================== */

describe("cp-qual-no-optional-chain — fixDiff", () => {
  it("should replace x && x.prop with x?.prop", () => {
    const findings = scanTS("cp-qual-no-optional-chain", "const name = user && user.name;\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("user?.name");
    expect(findings[0].fixDiff).not.toContain("&&");
  });
});

/* ================================================================== */
/*  26. cp-qual-redundant-boolean  —  === true -> direct               */
/* ================================================================== */

describe("cp-qual-redundant-boolean — fixDiff", () => {
  it("should simplify x === true to x", () => {
    const findings = scanTS("cp-qual-redundant-boolean", "if (isReady === true) {\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("isReady");
    expect(findings[0].fixDiff).not.toContain("=== true");
  });

  it("should simplify x ? true : false to !!x", () => {
    const findings = scanTS("cp-qual-redundant-boolean", "const val = isActive ? true : false;\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("!!isActive");
  });

  it("should simplify x ? false : true to !x", () => {
    const findings = scanTS("cp-qual-redundant-boolean", "const val = isActive ? false : true;\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("!isActive");
  });
});

/* ================================================================== */
/*  27. cp-qual-no-throw-literal  —  throw "x" -> throw new Error("x") */
/* ================================================================== */

describe("cp-qual-no-throw-literal — fixDiff", () => {
  it("should wrap string throw in new Error()", () => {
    const findings = scanTS("cp-qual-no-throw-literal", 'throw "something went wrong";\n');
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("new Error(");
    expect(findings[0].fixDiff).toContain("something went wrong");
  });
});

/* ================================================================== */
/*  28. cp-qual-unhandled-promise  —  .then(x) -> .then(x).catch()     */
/* ================================================================== */

describe("cp-qual-unhandled-promise — fixDiff", () => {
  it("should append .catch(console.error)", () => {
    const findings = scanTS("cp-qual-unhandled-promise", "fetchData().then(handle);\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain(".catch(console.error)");
  });
});

/* ================================================================== */
/*  29. cp-perf-unnecessary-clone  —  JSON round-trip -> structuredClone */
/* ================================================================== */

describe("cp-perf-unnecessary-clone — fixDiff", () => {
  it("should replace JSON.parse(JSON.stringify(x)) with structuredClone(x)", () => {
    const findings = scanTS("cp-perf-unnecessary-clone", "const copy = JSON.parse(JSON.stringify(obj));\n");
    expect(findings.length).toBe(1);
    expect(findings[0].fixDiff).toContain("structuredClone(obj)");
    expect(findings[0].fixDiff).not.toContain("JSON.parse");
  });
});

/* ================================================================== */
/*  Cross-cutting edge cases                                           */
/* ================================================================== */

describe("Cross-cutting: fixDiff behavior", () => {
  it("fixDiff is always a string (never undefined)", () => {
    // Rules without fixFn or fixTemplate should still produce fixDiff: ""
    const findings = scanTS(
      "cp-sec-sql-injection",
      "db.query(`SELECT * FROM users WHERE id = ${id}`);\n",
    );
    expect(findings.length).toBe(1);
    expect(typeof findings[0].fixDiff).toBe("string");
  });

  it("fixFn receives trimmed line (no leading/trailing whitespace)", () => {
    const findings = scanTS(
      "cp-qual-var-usage",
      "    var x = 1;\n",
    );
    expect(findings.length).toBe(1);
    // fixFn gets "var x = 1;" (trimmed), so result should not have leading spaces
    expect(findings[0].fixDiff).toBe("let x = 1;");
    expect(findings[0].fixDiff).not.toMatch(/^\s/);
  });

  it("comment lines are filtered out (no findings for commented code)", () => {
    const findings = scanTS(
      "cp-sec-eval",
      "// eval(malicious);\n",
    );
    expect(findings.length).toBe(0);
  });

  it("rules with fixTemplate='' produce empty string for any input", () => {
    // Verify with multiple delete-type rules
    const consoleFindings = scanTS(
      "cp-qual-console-log",
      'console.log("test");\n',
    );
    const debuggerFindings = scanTS("cp-qual-debugger", "debugger;\n");
    const alertFindings = scanTS("cp-qual-alert", 'alert("hi");\n');
    const deadBranchFindings = scanTS(
      "cp-clean-dead-branch",
      "if (false) {}\n",
    );
    const emptyBlockFindings = scanTS(
      "cp-clean-empty-block",
      "if (x) {}\n",
    );

    expect(consoleFindings[0].fixDiff).toBe("");
    expect(debuggerFindings[0].fixDiff).toBe("");
    expect(alertFindings[0].fixDiff).toBe("");
    expect(deadBranchFindings[0].fixDiff).toBe("");
    expect(emptyBlockFindings[0].fixDiff).toBe("");
  });

  it("all fixable rules have the expected fixDiff type for their mechanism", () => {
    // Verify that every rule with fixFn or fixTemplate is represented in ALL_RULES
    const fixableRules = _ALL_RULES.filter(
      (r) => r.fixFn !== undefined || r.fixTemplate !== undefined || r.multilineFixFn !== undefined,
    );
    // Should have at least 29 fixable pattern rules based on the specification
    expect(fixableRules.length).toBeGreaterThanOrEqual(29);
  });
});

/* ================================================================== */
/*  Verify all fixable rules are exported and accessible               */
/* ================================================================== */

describe("All fixable rules exist in _ALL_RULES", () => {
  const expectedFixableRuleIds = [
    "cp-qual-console-log",
    "cp-qual-debugger",
    "cp-qual-alert",
    "cp-qual-var-usage",
    "cp-qual-equality-coercion",
    "cp-qual-non-null-assertion",
    "cp-qual-any-type",
    "cp-qual-empty-catch",
    // cp-sec-eval — fixFn removed (dangerous: eval→JSON.parse is wrong for non-JSON)
    // cp-sec-hardcoded-ip — fixFn removed (dangerous: blind IP→process.env.HOST)
    "cp-sec-md5-sha1",
    "cp-sec-http-no-tls",
    "cp-sec-insecure-random",
    "cp-sec-jwt-none",
    "cp-sec-cors-wildcard",
    "cp-sec-insecure-cookie",
    "cp-sol-floating-pragma",
    "cp-perf-sync-fs",
    "cp-clean-dead-branch",
    "cp-clean-inconsistent-naming",
    "cp-clean-empty-block",
    // New fixable rules
    "cp-clean-double-semicolon",
    "cp-clean-unnecessary-else-if",
    "cp-clean-yoda-condition",
    "cp-qual-return-await",
    "cp-qual-no-optional-chain",
    "cp-qual-redundant-boolean",
    "cp-qual-no-throw-literal",
    "cp-qual-no-await",
    "cp-qual-unhandled-promise",
    "cp-perf-unnecessary-clone",
  ];

  for (const ruleId of expectedFixableRuleIds) {
    it(`${ruleId} exists and has fixFn or fixTemplate`, () => {
      const rule = _ALL_RULES.find((r) => r.id === ruleId);
      expect(rule).toBeDefined();
      const hasFixMechanism =
        rule!.fixFn !== undefined || rule!.fixTemplate !== undefined || rule!.multilineFixFn !== undefined;
      expect(hasFixMechanism).toBe(true);
    });
  }
});
