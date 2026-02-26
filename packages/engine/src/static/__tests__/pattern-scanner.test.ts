import { describe, it, expect } from "vitest";
import {
  _scanFile as scanFile,
  _ALL_RULES as ALL_RULES,
  _isTestFile as isTestFile,
  _isDocsFile as isDocsFile,
  _isCommentLine as isCommentLine,
  _isImportLine as isImportLine,
  _isFalsePositive as isFalsePositive,
  _adjustSeverityForContext as adjustSeverityForContext,
} from "../pattern-scanner.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findRule(id: string) {
  const rule = ALL_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  return rule;
}

function scan(ruleId: string, filePath: string, code: string) {
  const rule = findRule(ruleId);
  return scanFile(filePath, code, [rule], undefined);
}

/* ------------------------------------------------------------------ */
/*  False-positive filtering helpers                                   */
/* ------------------------------------------------------------------ */

describe("False positive helpers", () => {
  it("isTestFile detects test files", () => {
    expect(isTestFile("src/utils.test.ts")).toBe(true);
    expect(isTestFile("src/utils.spec.ts")).toBe(true);
    expect(isTestFile("__tests__/utils.ts")).toBe(true);
    expect(isTestFile("src/utils.ts")).toBe(false);
  });

  it("isDocsFile detects documentation files", () => {
    expect(isDocsFile("README.md")).toBe(true);
    expect(isDocsFile("docs/guide.md")).toBe(true);
    expect(isDocsFile("examples/demo.js")).toBe(true);
    expect(isDocsFile("src/index.ts")).toBe(false);
  });

  it("isCommentLine detects comment lines", () => {
    expect(isCommentLine("  // this is a comment")).toBe(true);
    expect(isCommentLine("  # comment")).toBe(true);
    expect(isCommentLine("  * comment")).toBe(true);
    expect(isCommentLine("  /* comment */")).toBe(true);
    expect(isCommentLine("  const x = 1")).toBe(false);
  });

  it("isImportLine detects import statements", () => {
    expect(isImportLine("import foo from 'bar'")).toBe(true);
    expect(isImportLine("const x = require('y')")).toBe(true);
    expect(isImportLine("from os import path")).toBe(true);
    expect(isImportLine("const x = 1")).toBe(false);
  });

  it("adjustSeverityForContext downgrades in test files", () => {
    expect(adjustSeverityForContext("critical", "src/utils.test.ts")).toBe("info");
    expect(adjustSeverityForContext("high", "src/utils.test.ts")).toBe("info");
    expect(adjustSeverityForContext("critical", "src/utils.ts")).toBe("critical");
    expect(adjustSeverityForContext("info", "src/utils.test.ts")).toBe("info");
  });

  it("isFalsePositive skips docs files", () => {
    const rule = findRule("cp-sec-eval");
    expect(isFalsePositive({ filePath: "docs/guide.md", line: "eval(code)", rule })).toBe(true);
  });

  it("isFalsePositive skips comment lines", () => {
    const rule = findRule("cp-sec-eval");
    expect(isFalsePositive({ filePath: "src/index.ts", line: "  // eval(code)", rule })).toBe(true);
    expect(isFalsePositive({ filePath: "src/index.ts", line: "  eval(code)", rule })).toBe(false);
  });

  it("isFalsePositive skips imports for URL rules", () => {
    const rule = findRule("cp-sec-http-no-tls");
    expect(isFalsePositive({ filePath: "src/index.ts", line: "import x from 'http://example.com'", rule })).toBe(true);
  });

  it("scanFile downgrades severity in test files", () => {
    const findings = scan("cp-sec-eval", "src/__tests__/utils.test.ts", 'eval("test")');
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("info");
  });

  it("scanFile skips docs files entirely", () => {
    const findings = scan("cp-sec-eval", "docs/example.md", 'eval("code")');
    expect(findings.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  JS/TS Security Rules                                               */
/* ------------------------------------------------------------------ */

describe("JS/TS Security Rules", () => {
  it("cp-sec-sql-injection — detects template literal SQL", () => {
    const findings = scan("cp-sec-sql-injection", "api.ts", "db.query(`SELECT * FROM users WHERE id = ${userId}`)");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-prototype-pollution — detects Object.assign with req.body", () => {
    const findings = scan("cp-sec-prototype-pollution", "api.ts", "Object.assign({}, req.body)");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-prototype-pollution — detects __proto__", () => {
    const findings = scan("cp-sec-prototype-pollution", "api.ts", 'obj.__proto__ = malicious');
    expect(findings.length).toBe(1);
  });

  it("cp-sec-insecure-random — detects Math.random()", () => {
    const findings = scan("cp-sec-insecure-random", "token.ts", "const token = Math.random().toString(36)");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-xxe — detects XML parsing", () => {
    const findings = scan("cp-sec-xxe", "xml.ts", "const doc = parseXml(input)");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-ldap-injection — detects LDAP filter concat", () => {
    const findings = scan("cp-sec-ldap-injection", "auth.ts", 'ldap.search(`(uid=${username})`)');
    expect(findings.length).toBe(1);
  });

  it("cp-sec-timing-attack — detects secret comparison with ==", () => {
    const findings = scan("cp-sec-timing-attack", "auth.ts", 'if (token === expectedToken) {');
    expect(findings.length).toBe(1);
  });

  it("cp-sec-mass-assignment — detects spread of req.body in create", () => {
    const findings = scan("cp-sec-mass-assignment", "user.ts", "prisma.user.create({ ...req.body })");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-header-injection — detects user input in headers", () => {
    const findings = scan("cp-sec-header-injection", "api.ts", "res.setHeader('X-Custom', req.query.value)");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-log-injection — detects user input in logs", () => {
    const findings = scan("cp-sec-log-injection", "api.ts", "logger.info('Login: ' + req.body.username)");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-unsafe-regex-constructor — detects RegExp from user input", () => {
    const findings = scan("cp-sec-unsafe-regex-constructor", "search.ts", "new RegExp(req.query.pattern)");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-unvalidated-url — detects URL from user input", () => {
    const findings = scan("cp-sec-unvalidated-url", "api.ts", "new URL(req.query.redirect)");
    expect(findings.length).toBe(1);
  });

  // cp-sec-missing-auth-check removed — 85% false positive rate

  it("cp-sec-insecure-cookie — detects cookie without security flags", () => {
    const findings = scan("cp-sec-insecure-cookie", "auth.ts", "res.cookie('session', token)");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-open-cors-credentials — detects credentials with wildcard", () => {
    const code = `cors({ credentials: true, origin: '*' })`;
    const findings = scan("cp-sec-open-cors-credentials", "server.ts", code);
    expect(findings.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Java Rules                                                         */
/* ------------------------------------------------------------------ */

describe("Java Rules", () => {
  it("cp-sec-java-sqli — detects JDBC string concat", () => {
    const findings = scan("cp-sec-java-sqli", "UserDao.java", 'stmt.executeQuery("SELECT * FROM users WHERE id=" + userId)');
    expect(findings.length).toBe(1);
  });

  it("cp-sec-java-deserialization — detects readObject", () => {
    const findings = scan("cp-sec-java-deserialization", "Data.java", "ObjectInputStream ois = new ObjectInputStream(in); Object obj = ois.readObject()");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-java-xpath — detects XPath concat", () => {
    const findings = scan("cp-sec-java-xpath", "Xml.java", 'xpath.evaluate("//user[@id=\'" + userId + "\']")');
    expect(findings.length).toBe(1);
  });

  it("cp-sec-java-log-injection — detects user input in logger", () => {
    const findings = scan("cp-sec-java-log-injection", "Auth.java", 'logger.info("Login attempt: " + request.getParameter("user"))');
    expect(findings.length).toBe(1);
  });

  it("cp-sec-java-spring-csrf — detects CSRF disabled", () => {
    const findings = scan("cp-sec-java-spring-csrf", "SecurityConfig.java", "http.csrf().disable()");
    expect(findings.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Ruby Rules                                                         */
/* ------------------------------------------------------------------ */

describe("Ruby Rules", () => {
  it("cp-sec-ruby-sqli — detects interpolated SQL", () => {
    const findings = scan("cp-sec-ruby-sqli", "user.rb", `User.where("name = '#{params[:name]}'")`);
    expect(findings.length).toBe(1);
  });

  it("cp-sec-ruby-erb-injection — detects html_safe", () => {
    const findings = scan("cp-sec-ruby-erb-injection", "view.erb", "<%= user_input.html_safe %>");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-ruby-mass-assign — detects permit!", () => {
    const findings = scan("cp-sec-ruby-mass-assign", "controller.rb", "params.permit!");
    expect(findings.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  PHP Rules                                                          */
/* ------------------------------------------------------------------ */

describe("PHP Rules", () => {
  it("cp-sec-php-sqli — detects mysql_query with variable", () => {
    const findings = scan("cp-sec-php-sqli", "db.php", 'mysql_query("SELECT * FROM users WHERE id=" . $id)');
    expect(findings.length).toBe(1);
  });

  it("cp-sec-php-eval — detects eval with variable", () => {
    const findings = scan("cp-sec-php-eval", "exec.php", "eval($code)");
    expect(findings.length).toBe(1);
  });

  it("cp-sec-php-file-include — detects include with variable", () => {
    const findings = scan("cp-sec-php-file-include", "loader.php", "include($page)");
    expect(findings.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Solidity Rules (new ones)                                          */
/* ------------------------------------------------------------------ */

describe("Solidity Rules (new)", () => {
  it("cp-sol-oracle-stale — detects latestRoundData without staleness", () => {
    const findings = scan("cp-sol-oracle-stale", "Oracle.sol", "priceFeed.latestRoundData()");
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("cp-sol-flash-loan — detects balanceOf used for pricing", () => {
    const findings = scan("cp-sol-flash-loan", "Pool.sol", "uint256 price = token.balanceOf(address(this)) * rate");
    expect(findings.length).toBe(1);
  });

  it("cp-sol-storage-collision — detects delegatecall", () => {
    const findings = scan("cp-sol-storage-collision", "Proxy.sol", "impl.delegatecall(data)");
    expect(findings.length).toBe(1);
  });

  it("cp-sol-missing-event — detects state change without emit", () => {
    const code = "function setOwner(address _owner) external {\n    owner = _owner;\n}";
    const findings = scan("cp-sol-missing-event", "Contract.sol", code);
    expect(findings.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Bug fix 5: equality coercion false positive reduction              */
/* ------------------------------------------------------------------ */

describe("Bug fix: equality coercion", () => {
  it("detects loose equality with identifiers", () => {
    const findings = scan("cp-qual-equality-coercion", "app.js", "if (x == 1) {");
    expect(findings.length).toBe(1);
  });

  it("does NOT flag == inside string literals", () => {
    const findings = scan("cp-qual-equality-coercion", "app.js", "const msg = 'a == b'");
    expect(findings.length).toBe(0);
  });

  it("does NOT flag == inside comments", () => {
    // Comment lines are filtered by the FP helper
    const findings = scan("cp-qual-equality-coercion", "app.js", "// check if a == b");
    expect(findings.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Bug fix 6: multi-line SQL injection detection                      */
/* ------------------------------------------------------------------ */

describe("Bug fix: multi-line SQL injection", () => {
  it("detects multi-line concatenated SQL query", () => {
    const code = `const sql = "SELECT * FROM users " +\n"WHERE id = " + req.params.id;`;
    const findings = scan("cp-sec-sql-injection", "api.ts", code);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Code Cleaning Rules — Regex-based                                  */
/* ------------------------------------------------------------------ */

/** Scan helper that filters by ruleId (avoids extra findings from special scanners). */
function scanClean(ruleId: string, filePath: string, code: string) {
  const rule = findRule(ruleId);
  return scanFile(filePath, code, [rule], undefined).filter((f) => f.ruleId === ruleId);
}

describe("Code Cleaning — regex rules", () => {
  // cp-clean-dead-branch
  it("cp-clean-dead-branch — detects if(false)", () => {
    const findings = scanClean("cp-clean-dead-branch", "app.ts", "if (false) { doStuff(); }");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-dead-branch — detects while(0)", () => {
    const findings = scanClean("cp-clean-dead-branch", "app.ts", "while (0) { loop(); }");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-dead-branch — does NOT flag normal conditions", () => {
    const findings = scanClean("cp-clean-dead-branch", "app.ts", "if (isReady) { doStuff(); }");
    expect(findings.length).toBe(0);
  });

  // cp-clean-commented-out-code
  it("cp-clean-commented-out-code — detects 3+ lines of commented code", () => {
    const code = [
      "// const x = 1;",
      "// const y = getData();",
      "// return x + y;",
      "", // trailing newline so multiline regex matches
    ].join("\n");
    const findings = scanClean("cp-clean-commented-out-code", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-clean-commented-out-code — ignores normal comments", () => {
    const code = [
      "// This module handles user auth",
      "// It supports OAuth and JWT",
      "// See docs for more info",
      "",
    ].join("\n");
    const findings = scanClean("cp-clean-commented-out-code", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-inconsistent-naming
  it("cp-clean-inconsistent-naming — detects snake_case in JS/TS", () => {
    const findings = scanClean("cp-clean-inconsistent-naming", "app.ts", "const user_name = getName();\nconsole.log(user_name);");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-inconsistent-naming — allows camelCase", () => {
    const findings = scanClean("cp-clean-inconsistent-naming", "app.ts", "const userName = getName();\nconsole.log(userName);");
    expect(findings.length).toBe(0);
  });

  it("cp-clean-inconsistent-naming — does NOT fire on Python", () => {
    const findings = scanClean("cp-clean-inconsistent-naming", "app.py", "const user_name = 'bob'");
    expect(findings.length).toBe(0);
  });

  // cp-clean-nested-ternary
  it("cp-clean-nested-ternary — detects ternary inside ternary", () => {
    const findings = scanClean("cp-clean-nested-ternary", "app.ts", "const x = a ? b ? 1 : 2 : 3");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-nested-ternary — allows single ternary", () => {
    const findings = scanClean("cp-clean-nested-ternary", "app.ts", "const x = a ? 1 : 2");
    expect(findings.length).toBe(0);
  });

  // cp-clean-too-many-params
  it("cp-clean-too-many-params — detects 5+ parameters", () => {
    const findings = scanClean("cp-clean-too-many-params", "app.ts", "function create(a, b, c, d, e) {\n  return [a, b, c, d, e];\n}");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-too-many-params — allows 4 parameters", () => {
    const findings = scanClean("cp-clean-too-many-params", "app.ts", "function create(a, b, c, d) {\n  return [a, b, c, d];\n}");
    expect(findings.length).toBe(0);
  });

  // cp-clean-complex-conditional
  it("cp-clean-complex-conditional — detects 4+ logical operators", () => {
    const findings = scanClean("cp-clean-complex-conditional", "app.ts", "if (a && b || c && d) {");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-complex-conditional — allows simple conditions", () => {
    const findings = scanClean("cp-clean-complex-conditional", "app.ts", "if (a && b) {");
    expect(findings.length).toBe(0);
  });

  // cp-clean-deprecated-api
  it("cp-clean-deprecated-api — detects __defineGetter__", () => {
    const findings = scanClean("cp-clean-deprecated-api", "app.js", "obj.__defineGetter__('x', fn)");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-deprecated-api — detects arguments.callee", () => {
    const findings = scanClean("cp-clean-deprecated-api", "app.js", "return arguments.callee(n - 1)");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-deprecated-api — detects document.write", () => {
    const findings = scanClean("cp-clean-deprecated-api", "app.js", "document.write('<h1>Hi</h1>')");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-deprecated-api — does NOT flag on non-JS", () => {
    const findings = scanClean("cp-clean-deprecated-api", "app.py", "obj.__defineGetter__('x', fn)");
    expect(findings.length).toBe(0);
  });

  // cp-clean-callback-hell
  it("cp-clean-callback-hell — detects 4 levels of nested callbacks", () => {
    const code = `
fs.readFile('a', (err, data) => {
  fs.readFile('b', (err2, data2) => {
    fetch(url, (err3, res) => {
      parse(res, (err4, result) => {
        console.log(result);
      });
    });
  });
});`;
    const findings = scanClean("cp-clean-callback-hell", "app.ts", code);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("cp-clean-callback-hell — allows flat async/await", () => {
    const findings = scanClean("cp-clean-callback-hell", "app.ts", "const data = await readFile('a');\nconst data2 = await readFile('b');");
    expect(findings.length).toBe(0);
  });

  // cp-clean-implicit-any-return
  it("cp-clean-implicit-any-return — detects exported fn without return type in TS", () => {
    const findings = scanClean("cp-clean-implicit-any-return", "api.ts", "export function getUser(id: string) {");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-implicit-any-return — allows fn with return type", () => {
    const findings = scanClean("cp-clean-implicit-any-return", "api.ts", "export function getUser(id: string): User {");
    expect(findings.length).toBe(0);
  });

  it("cp-clean-implicit-any-return — does NOT fire on .js files", () => {
    const findings = scanClean("cp-clean-implicit-any-return", "api.js", "export function getUser(id) {");
    expect(findings.length).toBe(0);
  });

  // cp-clean-empty-block
  it("cp-clean-empty-block — detects empty if block", () => {
    const findings = scanClean("cp-clean-empty-block", "app.ts", "if (condition) {}");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-empty-block — detects empty else block", () => {
    const findings = scanClean("cp-clean-empty-block", "app.ts", "else {}");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-empty-block — allows filled blocks", () => {
    const findings = scanClean("cp-clean-empty-block", "app.ts", "if (x) { doStuff(); }");
    expect(findings.length).toBe(0);
  });

  it("cp-clean-empty-block — does NOT flag empty catch (handled by cp-qual-empty-catch)", () => {
    const findings = scanClean("cp-clean-empty-block", "app.ts", "catch (e) {}");
    expect(findings.length).toBe(0);
  });

  // cp-clean-no-early-return
  it("cp-clean-no-early-return — detects nested if/else chains", () => {
    const code = `if (a) {
  doA();
} else {
  if (b) {
    doB();
  } else {
    doC();
  }
}`;
    const findings = scanClean("cp-clean-no-early-return", "app.ts", code);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  // cp-clean-redundant-else
  it("cp-clean-redundant-else — detects else after return", () => {
    const code = `if (x) {
    return true;
  } else {
    doOther();
  }`;
    const findings = scanClean("cp-clean-redundant-else", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-clean-redundant-else — detects else after throw", () => {
    const code = `if (!user) {
    throw new Error("not found");
  } else {
    process(user);
  }`;
    const findings = scanClean("cp-clean-redundant-else", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  // cp-clean-double-semicolon
  it("cp-clean-double-semicolon — detects double semicolon", () => {
    const findings = scanClean("cp-clean-double-semicolon", "app.ts", "const x = 1;;");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-double-semicolon — allows single semicolon", () => {
    const findings = scanClean("cp-clean-double-semicolon", "app.ts", "const x = 1;");
    expect(findings.length).toBe(0);
  });

  // cp-clean-unnecessary-else-if
  it("cp-clean-unnecessary-else-if — detects else { if pattern", () => {
    const code = `} else {\n  if (x) {`;
    const findings = scanClean("cp-clean-unnecessary-else-if", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-clean-unnecessary-else-if — allows else if", () => {
    const code = `} else if (x) {`;
    const findings = scanClean("cp-clean-unnecessary-else-if", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-yoda-condition
  it("cp-clean-yoda-condition — detects null === x", () => {
    const findings = scanClean("cp-clean-yoda-condition", "app.ts", "if (null === value) {");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-yoda-condition — detects literal == variable", () => {
    const findings = scanClean("cp-clean-yoda-condition", "app.ts", 'if ("active" === status) {');
    expect(findings.length).toBe(1);
  });

  it("cp-clean-yoda-condition — allows normal order", () => {
    const findings = scanClean("cp-clean-yoda-condition", "app.ts", "if (value === null) {");
    expect(findings.length).toBe(0);
  });

  // cp-clean-negative-condition
  it("cp-clean-negative-condition — detects if (!x) { ... } else {", () => {
    const code = `if (!isReady) {\n  wait();\n} else {\n  go();\n}`;
    const findings = scanClean("cp-clean-negative-condition", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-clean-negative-condition — allows positive conditions", () => {
    const code = `if (isReady) {\n  go();\n} else {\n  wait();\n}`;
    const findings = scanClean("cp-clean-negative-condition", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-empty-string-check
  it("cp-clean-empty-string-check — detects .length === 0", () => {
    const findings = scanClean("cp-clean-empty-string-check", "app.ts", "if (str.length === 0) {");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-empty-string-check — detects === ''", () => {
    const findings = scanClean("cp-clean-empty-string-check", "app.ts", "if (str === '') {");
    expect(findings.length).toBe(1);
  });

  it("cp-clean-empty-string-check — allows .length > 0", () => {
    const findings = scanClean("cp-clean-empty-string-check", "app.ts", "if (str.length > 0) {");
    expect(findings.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Code Cleaning Rules — Special scanners                             */
/* ------------------------------------------------------------------ */

/** Full-scan helper: passes ALL_RULES so cleaning checks activate. */
function fullScan(filePath: string, code: string) {
  return scanFile(filePath, code, ALL_RULES, undefined);
}

function fullScanByRule(ruleId: string, filePath: string, code: string) {
  return fullScan(filePath, code).filter((f) => f.ruleId === ruleId);
}

describe("Code Cleaning — special scanners", () => {
  // cp-clean-unused-import
  it("cp-clean-unused-import — detects unused named import", () => {
    const code = `import { useState, useEffect } from 'react';\nconst [x, setX] = useState(0);`;
    const findings = fullScanByRule("cp-clean-unused-import", "app.tsx", code);
    expect(findings.some((f) => f.description.includes("useEffect"))).toBe(true);
  });

  it("cp-clean-unused-import — does NOT flag used imports", () => {
    const code = `import { useState } from 'react';\nconst [x, setX] = useState(0);`;
    const findings = fullScanByRule("cp-clean-unused-import", "app.tsx", code);
    expect(findings.length).toBe(0);
  });

  it("cp-clean-unused-import — detects unused default import", () => {
    const code = `import React from 'react';\nconsole.log('no react used');`;
    const findings = fullScanByRule("cp-clean-unused-import", "app.tsx", code);
    expect(findings.some((f) => f.description.includes("React"))).toBe(true);
  });

  it("cp-clean-unused-import — detects unused namespace import", () => {
    const code = `import * as helpers from './lib';\nconsole.log('nothing');`;
    const findings = fullScanByRule("cp-clean-unused-import", "app.ts", code);
    expect(findings.some((f) => f.description.includes("helpers"))).toBe(true);
  });

  it("cp-clean-unused-import — handles 'as' renames", () => {
    const code = `import { foo as bar } from './lib';\nconsole.log(bar);`;
    const findings = fullScanByRule("cp-clean-unused-import", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  it("cp-clean-unused-import — skips test files", () => {
    const code = `import { unused } from './lib';\nconsole.log('test');`;
    const findings = fullScanByRule("cp-clean-unused-import", "src/__tests__/app.test.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-unused-variable
  it("cp-clean-unused-variable — detects declared but unused const", () => {
    const code = `const unusedVar = computeSomething();\nconsole.log('hello');`;
    const findings = fullScanByRule("cp-clean-unused-variable", "app.ts", code);
    expect(findings.some((f) => f.description.includes("unusedVar"))).toBe(true);
  });

  it("cp-clean-unused-variable — does NOT flag used variables", () => {
    const code = `const name = getName();\nconsole.log(name);`;
    const findings = fullScanByRule("cp-clean-unused-variable", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  it("cp-clean-unused-variable — skips _prefixed variables", () => {
    const code = `const _unused = 1;\nconsole.log('ok');`;
    const findings = fullScanByRule("cp-clean-unused-variable", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-unused-function
  it("cp-clean-unused-function — detects uncalled non-exported function", () => {
    const code = `function helperNeverCalled() {\n  return 1;\n}\nexport function main() { return 2; }`;
    const findings = fullScanByRule("cp-clean-unused-function", "app.ts", code);
    expect(findings.some((f) => f.description.includes("helperNeverCalled"))).toBe(true);
  });

  it("cp-clean-unused-function — does NOT flag called functions", () => {
    const code = `function helper() { return 1; }\nconst x = helper();`;
    const findings = fullScanByRule("cp-clean-unused-function", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  it("cp-clean-unused-function — does NOT flag exported functions", () => {
    const code = `export function unusedExport() { return 1; }`;
    const findings = fullScanByRule("cp-clean-unused-function", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-file-too-long
  it("cp-clean-file-too-long — detects files over 500 lines", () => {
    const code = Array.from({ length: 501 }, (_, i) => `const line${i} = ${i};`).join("\n");
    const findings = fullScanByRule("cp-clean-file-too-long", "big.ts", code);
    expect(findings.length).toBe(1);
    expect(findings[0].description).toContain("501");
  });

  it("cp-clean-file-too-long — allows files under 500 lines", () => {
    const code = Array.from({ length: 100 }, (_, i) => `const line${i} = ${i};`).join("\n");
    const findings = fullScanByRule("cp-clean-file-too-long", "small.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-function-too-long
  it("cp-clean-function-too-long — detects functions over 50 lines", () => {
    const body = Array.from({ length: 55 }, (_, i) => `  const x${i} = ${i};`).join("\n");
    const code = `function bigFn() {\n${body}\n}`;
    const findings = fullScanByRule("cp-clean-function-too-long", "app.ts", code);
    expect(findings.length).toBe(1);
    expect(findings[0].description).toContain("bigFn");
  });

  it("cp-clean-function-too-long — allows short functions", () => {
    const code = `function smallFn() {\n  return 1;\n}`;
    const findings = fullScanByRule("cp-clean-function-too-long", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-cyclomatic-complexity
  it("cp-clean-cyclomatic-complexity — detects complexity >10", () => {
    const branches = Array.from({ length: 12 }, (_, i) => `  if (x${i}) { do${i}(); }`).join("\n");
    const code = `function complexFn() {\n${branches}\n}`;
    const findings = fullScanByRule("cp-clean-cyclomatic-complexity", "app.ts", code);
    expect(findings.length).toBe(1);
    expect(findings[0].description).toContain("complexFn");
  });

  it("cp-clean-cyclomatic-complexity — allows simple functions", () => {
    const code = `function simpleFn() {\n  if (a) { return 1; }\n  return 2;\n}`;
    const findings = fullScanByRule("cp-clean-cyclomatic-complexity", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-duplicate-code
  it("cp-clean-duplicate-code — detects repeated 4-line blocks", () => {
    const block = `  const a = getA();\n  const b = getB();\n  process(a, b);\n  save(a, b);`;
    const code = `function fn1() {\n${block}\n}\nfunction fn2() {\n${block}\n}`;
    const findings = fullScanByRule("cp-clean-duplicate-code", "app.ts", code);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].description).toContain("2 times");
  });

  it("cp-clean-duplicate-code — does NOT flag unique code", () => {
    const code = `function fn1() {\n  const a = 1;\n  const b = 2;\n  return a + b;\n}\nfunction fn2() {\n  const x = 10;\n  const y = 20;\n  return x * y;\n}`;
    const findings = fullScanByRule("cp-clean-duplicate-code", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-clean-mixed-quotes
  it("cp-clean-mixed-quotes — detects mixed quote styles", () => {
    const lines = [
      ...Array.from({ length: 8 }, () => `const a = "double";`),
      ...Array.from({ length: 8 }, () => `const b = 'single';`),
    ];
    const code = lines.join("\n");
    const findings = fullScanByRule("cp-clean-mixed-quotes", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-clean-mixed-quotes — allows consistent quotes", () => {
    const code = Array.from({ length: 12 }, () => `const a = "double";`).join("\n");
    const findings = fullScanByRule("cp-clean-mixed-quotes", "app.ts", code);
    expect(findings.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  JS/TS Quality Rules — New                                          */
/* ------------------------------------------------------------------ */

describe("JS/TS Quality Rules (new)", () => {
  // cp-qual-return-await
  it("cp-qual-return-await — detects return await", () => {
    const findings = scan("cp-qual-return-await", "api.ts", "return await fetchData();");
    expect(findings.length).toBe(1);
  });

  it("cp-qual-return-await — allows plain return", () => {
    const findings = scan("cp-qual-return-await", "api.ts", "return fetchData();");
    expect(findings.length).toBe(0);
  });

  // cp-qual-no-optional-chain
  it("cp-qual-no-optional-chain — detects x && x.prop pattern", () => {
    const findings = scan("cp-qual-no-optional-chain", "app.ts", "const name = user && user.name;");
    expect(findings.length).toBe(1);
  });

  it("cp-qual-no-optional-chain — allows optional chaining", () => {
    const findings = scan("cp-qual-no-optional-chain", "app.ts", "const name = user?.name;");
    expect(findings.length).toBe(0);
  });

  // cp-qual-redundant-boolean
  it("cp-qual-redundant-boolean — detects === true", () => {
    const findings = scan("cp-qual-redundant-boolean", "app.ts", "if (isReady === true) {");
    expect(findings.length).toBe(1);
  });

  it("cp-qual-redundant-boolean — detects x ? true : false", () => {
    const findings = scan("cp-qual-redundant-boolean", "app.ts", "const val = isActive ? true : false;");
    expect(findings.length).toBe(1);
  });

  it("cp-qual-redundant-boolean — allows direct boolean usage", () => {
    const findings = scan("cp-qual-redundant-boolean", "app.ts", "if (isReady) {");
    expect(findings.length).toBe(0);
  });

  // cp-qual-no-throw-literal
  it("cp-qual-no-throw-literal — detects throw string", () => {
    const findings = scan("cp-qual-no-throw-literal", "app.ts", 'throw "something went wrong";');
    expect(findings.length).toBe(1);
  });

  it("cp-qual-no-throw-literal — detects throw number", () => {
    const findings = scan("cp-qual-no-throw-literal", "app.ts", "throw 404;");
    expect(findings.length).toBe(1);
  });

  it("cp-qual-no-throw-literal — allows throw new Error", () => {
    const findings = scan("cp-qual-no-throw-literal", "app.ts", 'throw new Error("something");');
    expect(findings.length).toBe(0);
  });

  // cp-qual-string-concat
  it("cp-qual-string-concat — detects string + variable", () => {
    const findings = scan("cp-qual-string-concat", "app.ts", "const msg = 'Hello ' + name;");
    expect(findings.length).toBe(1);
  });

  it("cp-qual-string-concat — allows template literals", () => {
    const findings = scan("cp-qual-string-concat", "app.ts", "const msg = `Hello ${name}`;");
    expect(findings.length).toBe(0);
  });

  // cp-qual-no-await
  it("cp-qual-no-await — detects async function without await", () => {
    const code = "async function getData() {\n  return fetch('/api');\n}";
    const findings = scanClean("cp-qual-no-await", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-qual-no-await — allows async function with await", () => {
    const code = "async function getData() {\n  return await fetch('/api');\n}";
    const findings = scanClean("cp-qual-no-await", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-qual-error-string-only
  it("cp-qual-error-string-only — detects new Error()", () => {
    const findings = scan("cp-qual-error-string-only", "app.ts", "throw new Error();");
    expect(findings.length).toBe(1);
  });

  it("cp-qual-error-string-only — detects reject with string", () => {
    const findings = scan("cp-qual-error-string-only", "app.ts", 'reject("something failed");');
    expect(findings.length).toBe(1);
  });

  it("cp-qual-error-string-only — allows Error with message", () => {
    const findings = scan("cp-qual-error-string-only", "app.ts", 'throw new Error("descriptive message");');
    expect(findings.length).toBe(0);
  });

  // cp-qual-unhandled-promise
  it("cp-qual-unhandled-promise — detects .then() without .catch()", () => {
    const findings = scan("cp-qual-unhandled-promise", "app.ts", "fetchData().then(handle);");
    expect(findings.length).toBe(1);
  });

  it("cp-qual-unhandled-promise — allows .then().catch()", () => {
    const findings = scan("cp-qual-unhandled-promise", "app.ts", "fetchData().then(handle).catch(console.error);");
    expect(findings.length).toBe(0);
  });

  // cp-qual-swallowed-error
  it("cp-qual-swallowed-error — detects catch block with only comments", () => {
    const code = "catch (err) {\n  // TODO handle\n}";
    const findings = scanClean("cp-qual-swallowed-error", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-qual-swallowed-error — allows catch block with code", () => {
    const code = "catch (err) {\n  console.error(err);\n}";
    const findings = scanClean("cp-qual-swallowed-error", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-qual-floating-promise
  it("cp-qual-floating-promise — detects floating fetch()", () => {
    const findings = scan("cp-qual-floating-promise", "app.ts", "  fetch('/api/data');");
    expect(findings.length).toBe(1);
  });

  it("cp-qual-floating-promise — allows awaited fetch()", () => {
    const findings = scan("cp-qual-floating-promise", "app.ts", "  await fetch('/api/data');");
    expect(findings.length).toBe(0);
  });

  // cp-qual-no-return-in-finally
  it("cp-qual-no-return-in-finally — detects return in finally", () => {
    const code = "finally {\n  return cleanup;\n}";
    const findings = scanClean("cp-qual-no-return-in-finally", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-qual-no-return-in-finally — allows finally without return", () => {
    const code = "finally {\n  cleanup();\n}";
    const findings = scanClean("cp-qual-no-return-in-finally", "app.ts", code);
    expect(findings.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Performance Rules — New                                            */
/* ------------------------------------------------------------------ */

describe("Performance Rules (new)", () => {
  // cp-perf-unnecessary-clone
  it("cp-perf-unnecessary-clone — detects JSON.parse(JSON.stringify())", () => {
    const findings = scan("cp-perf-unnecessary-clone", "app.ts", "const copy = JSON.parse(JSON.stringify(obj));");
    expect(findings.length).toBe(1);
  });

  it("cp-perf-unnecessary-clone — allows structuredClone", () => {
    const findings = scan("cp-perf-unnecessary-clone", "app.ts", "const copy = structuredClone(obj);");
    expect(findings.length).toBe(0);
  });

  // cp-perf-spread-in-loop
  it("cp-perf-spread-in-loop — detects spread in for loop", () => {
    const code = "for (const item of items) {\n  arr = [...arr, item];\n}";
    const findings = scanClean("cp-perf-spread-in-loop", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-perf-spread-in-loop — allows push in loop", () => {
    const code = "for (const item of items) {\n  arr.push(item);\n}";
    const findings = scanClean("cp-perf-spread-in-loop", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-perf-string-concat-loop
  it("cp-perf-string-concat-loop — detects += string in loop", () => {
    const code = 'for (let i = 0; i < n; i++) {\n  result += "line";\n}';
    const findings = scanClean("cp-perf-string-concat-loop", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-perf-string-concat-loop — allows array join", () => {
    const code = "for (let i = 0; i < n; i++) {\n  parts.push(line);\n}\nconst result = parts.join('');";
    const findings = scanClean("cp-perf-string-concat-loop", "app.ts", code);
    expect(findings.length).toBe(0);
  });

  // cp-perf-dom-in-loop
  it("cp-perf-dom-in-loop — detects querySelector in loop", () => {
    const code = "for (let i = 0; i < n; i++) {\n  document.querySelector('.item');\n}";
    const findings = scanClean("cp-perf-dom-in-loop", "app.ts", code);
    expect(findings.length).toBe(1);
  });

  it("cp-perf-dom-in-loop — allows cached DOM query", () => {
    const code = "const el = document.querySelector('.item');\nfor (let i = 0; i < n; i++) {\n  el.click();\n}";
    const findings = scanClean("cp-perf-dom-in-loop", "app.ts", code);
    expect(findings.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  React Rules                                                        */
/* ------------------------------------------------------------------ */

describe("React Rules", () => {
  // cp-react-index-as-key
  it("cp-react-index-as-key — detects key={index}", () => {
    const findings = scan("cp-react-index-as-key", "app.tsx", "<Item key={index} />");
    expect(findings.length).toBe(1);
  });

  it("cp-react-index-as-key — detects key={i}", () => {
    const findings = scan("cp-react-index-as-key", "app.tsx", "<Item key={i} />");
    expect(findings.length).toBe(1);
  });

  it("cp-react-index-as-key — allows key={item.id}", () => {
    const findings = scan("cp-react-index-as-key", "app.tsx", "<Item key={item.id} />");
    expect(findings.length).toBe(0);
  });

  it("cp-react-index-as-key — does NOT fire on .ts files", () => {
    const findings = scan("cp-react-index-as-key", "app.ts", "<Item key={index} />");
    expect(findings.length).toBe(0);
  });

  // cp-react-direct-state-mutation
  it("cp-react-direct-state-mutation — detects this.state.x = value", () => {
    const findings = scan("cp-react-direct-state-mutation", "app.tsx", "this.state.count = 5;");
    expect(findings.length).toBe(1);
  });

  it("cp-react-direct-state-mutation — allows this.setState()", () => {
    const findings = scan("cp-react-direct-state-mutation", "app.tsx", "this.setState({ count: 5 });");
    expect(findings.length).toBe(0);
  });

  // cp-react-missing-key
  it("cp-react-missing-key — detects .map() returning JSX without key", () => {
    const code = "items.map((item) => <div>{item.name}</div>)";
    const findings = scanClean("cp-react-missing-key", "app.tsx", code);
    expect(findings.length).toBe(1);
  });

  it("cp-react-missing-key — allows .map() with key", () => {
    const code = "items.map((item) => <div key={item.id}>{item.name}</div>)";
    const findings = scanClean("cp-react-missing-key", "app.tsx", code);
    expect(findings.length).toBe(0);
  });
});
