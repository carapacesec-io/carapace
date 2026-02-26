/**
 * 20 real bug-pattern diffs.
 *
 * Each test validates that the diff parses correctly, the language is
 * classified, and the right rules are selected. AI-level detection is
 * covered separately (integration tests with MockProvider).
 */

import { describe, it, expect } from "vitest";
import { parseDiff } from "../parsers/diff-parser.js";
import { classifyFile } from "../parsers/file-classifier.js";
import { getRulesForChains, getAllRules } from "../rules/registry.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function d(body: string) {
  return body.trimStart();
}

/** Quick sanity: parse, classify first file, check expected language. */
function assertParsesAs(raw: string, expectedLang: string, expectedFileCount = 1) {
  const parsed = parseDiff(raw);
  expect(parsed.files.length).toBe(expectedFileCount);
  const cls = classifyFile(parsed.files[0].path);
  expect(cls.language).toBe(expectedLang);
  return { parsed, cls };
}

// ---------------------------------------------------------------------------
// Bug pattern diffs
// ---------------------------------------------------------------------------

const BUG_DIFFS = {
  // 1. SQL Injection
  sqlInjection: [
    "diff --git a/src/users.ts b/src/users.ts",
    "index 0000000..1111111 100644",
    "--- a/src/users.ts",
    "+++ b/src/users.ts",
    "@@ -10,3 +10,5 @@",
    ' import { db } from "./db";',
    " ",
    "+export async function getUser(id: string) {",
    "+  return db.query(`SELECT * FROM users WHERE id = ${id}`);",
    "+}",
  ].join("\n"),

  // 2. XSS (reflected)
  xss: d(`
diff --git a/src/handler.js b/src/handler.js
index 0000000..1111111 100644
--- a/src/handler.js
+++ b/src/handler.js
@@ -5,2 +5,4 @@
 app.get("/greet", (req, res) => {
+  const name = req.query.name;
+  res.send("<div>Hello " + name + "</div>");
 });
`),

  // 3. Command Injection
  commandInjection: d(`
diff --git a/src/deploy.ts b/src/deploy.ts
index 0000000..1111111 100644
--- a/src/deploy.ts
+++ b/src/deploy.ts
@@ -1,3 +1,5 @@
 import { exec } from "child_process";

+export function cleanDir(userInput: string) {
+  exec("rm -rf " + userInput);
+}
`),

  // 4. SSRF
  ssrf: d(`
diff --git a/src/proxy.ts b/src/proxy.ts
index 0000000..1111111 100644
--- a/src/proxy.ts
+++ b/src/proxy.ts
@@ -3,2 +3,5 @@
 app.post("/fetch", async (req, res) => {
+  const url = req.body.url;
+  const response = await fetch(url);
+  res.json(await response.json());
 });
`),

  // 5. Path Traversal
  pathTraversal: d(`
diff --git a/src/files.js b/src/files.js
index 0000000..1111111 100644
--- a/src/files.js
+++ b/src/files.js
@@ -3,2 +3,5 @@
 app.get("/download", (req, res) => {
+  const base = "/var/uploads";
+  const filePath = base + "/" + req.params.file;
+  res.sendFile(filePath);
 });
`),

  // 6. Hardcoded API Key
  hardcodedApiKey: d(`
diff --git a/src/config.ts b/src/config.ts
index 0000000..1111111 100644
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,2 +1,4 @@
 export const config = {
+  stripeKey: "sk_live_abc123def456ghi789jkl012mno345",
+  apiEndpoint: "https://api.example.com",
 };
`),

  // 7. Hardcoded Password
  hardcodedPassword: d(`
diff --git a/config/settings.py b/config/settings.py
index 0000000..1111111 100644
--- a/config/settings.py
+++ b/config/settings.py
@@ -5,2 +5,4 @@
 DATABASE = {
+    "host": "db.prod.internal",
+    "password": "admin123",
 }
`),

  // 8. Missing Null Check
  missingNullCheck: d(`
diff --git a/src/profile.ts b/src/profile.ts
index 0000000..1111111 100644
--- a/src/profile.ts
+++ b/src/profile.ts
@@ -5,2 +5,4 @@
 export function displayName(user: User | null) {
+  const name = user.name.toLowerCase();
+  return name.trim();
 }
`),

  // 9. Off-by-one
  offByOne: d(`
diff --git a/src/utils.js b/src/utils.js
index 0000000..1111111 100644
--- a/src/utils.js
+++ b/src/utils.js
@@ -1,2 +1,5 @@
 function processItems(arr) {
+  for (let i = 0; i <= arr.length; i++) {
+    console.log(arr[i]);
+  }
 }
`),

  // 10. Race Condition
  raceCondition: d(`
diff --git a/src/counter.ts b/src/counter.ts
index 0000000..1111111 100644
--- a/src/counter.ts
+++ b/src/counter.ts
@@ -3,3 +3,7 @@
 let balance = 0;

+export async function withdraw(amount: number) {
+  const current = await getBalance();
+  if (current >= amount) {
+    await setBalance(current - amount);
+  }
 }
`),

  // 11. Empty Catch Block
  emptyCatch: d(`
diff --git a/src/loader.ts b/src/loader.ts
index 0000000..1111111 100644
--- a/src/loader.ts
+++ b/src/loader.ts
@@ -1,2 +1,7 @@
 export async function loadConfig() {
+  try {
+    const data = await readFile("config.json", "utf-8");
+    return JSON.parse(data);
+  } catch (e) {
+  }
 }
`),

  // 12. Unused Import
  unusedImport: d(`
diff --git a/src/app.ts b/src/app.ts
index 0000000..1111111 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import { useState, useEffect } from "react";
+import { foo } from "./utils";

 export function App() {
`),

  // 13. N+1 Query
  nPlusOne: d(`
diff --git a/src/api/posts.ts b/src/api/posts.ts
index 0000000..1111111 100644
--- a/src/api/posts.ts
+++ b/src/api/posts.ts
@@ -3,2 +3,7 @@
 export async function getPostsWithAuthors(db: DB) {
+  const posts = await db.post.findMany();
+  for (const post of posts) {
+    const author = await db.user.findUnique({ where: { id: post.authorId } });
+    post.author = author;
+  }
+  return posts;
 }
`),

  // 14. Missing Validation
  missingValidation: d(`
diff --git a/src/routes/register.ts b/src/routes/register.ts
index 0000000..1111111 100644
--- a/src/routes/register.ts
+++ b/src/routes/register.ts
@@ -3,2 +3,5 @@
 app.post("/register", async (req, res) => {
+  const { email, password, role } = req.body;
+  await db.user.create({ data: { email, password, role } });
+  res.json({ ok: true });
 });
`),

  // 15. Prototype Pollution
  prototypePollution: d(`
diff --git a/src/merge.js b/src/merge.js
index 0000000..1111111 100644
--- a/src/merge.js
+++ b/src/merge.js
@@ -1,2 +1,4 @@
 function mergeConfig(target, input) {
+  const parsed = JSON.parse(input);
+  Object.assign(target, parsed);
 }
`),

  // 16. Insecure Deserialization
  insecureDeserialization: d(`
diff --git a/src/execute.js b/src/execute.js
index 0000000..1111111 100644
--- a/src/execute.js
+++ b/src/execute.js
@@ -1,2 +1,4 @@
 function runPlugin(data) {
+  const plugin = JSON.parse(data);
+  eval(plugin.code);
 }
`),

  // 17. Open Redirect
  openRedirect: d(`
diff --git a/src/auth.ts b/src/auth.ts
index 0000000..1111111 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -5,2 +5,4 @@
 app.get("/login/callback", (req, res) => {
+  const next = req.query.next as string;
+  res.redirect(next);
 });
`),

  // 18. Missing Rate Limit
  missingRateLimit: d(`
diff --git a/src/auth.ts b/src/auth.ts
index 0000000..1111111 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -5,2 +5,6 @@
 app.post("/login", async (req, res) => {
+  const { email, password } = req.body;
+  const user = await db.user.findUnique({ where: { email } });
+  const valid = await bcrypt.compare(password, user.passwordHash);
+  res.json({ token: valid ? createToken(user) : null });
 });
`),

  // 19. Broken Access Control
  brokenAccessControl: d(`
diff --git a/src/admin.ts b/src/admin.ts
index 0000000..1111111 100644
--- a/src/admin.ts
+++ b/src/admin.ts
@@ -3,2 +3,5 @@
 app.delete("/admin/users/:id", async (req, res) => {
+  const userId = req.params.id;
+  await db.user.delete({ where: { id: userId } });
+  res.json({ deleted: true });
 });
`),

  // 20. Reentrancy
  reentrancy: [
    "diff --git a/contracts/Vault.sol b/contracts/Vault.sol",
    "index 0000000..1111111 100644",
    "--- a/contracts/Vault.sol",
    "+++ b/contracts/Vault.sol",
    "@@ -10,3 +10,7 @@",
    "     mapping(address => uint256) public balances;",
    " ",
    "+    function withdraw(uint256 amount) external {",
    "+        require(balances[msg.sender] >= amount, \"Insufficient\");",
    "+        (bool ok, ) = msg.sender.call{value: amount}(\"\");",
    "+        require(ok, \"Transfer failed\");",
    "+        balances[msg.sender] -= amount;",
    "     }",
  ].join("\n"),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bug-patterns", () => {
  // ---- Injection / OWASP ----

  it("#1 SQL Injection — parses as TypeScript, selects security rules", () => {
    const { parsed, cls } = assertParsesAs(BUG_DIFFS.sqlInjection, "typescript");
    const addedLines = parsed.files[0].hunks[0].changes.filter((c) => c.type === "add");
    expect(addedLines.some((c) => c.content.includes("SELECT"))).toBe(true);
    const rules = getAllRules().filter((r) => !r.chain);
    const secRule = rules.find((r) => r.id === "gen-security");
    expect(secRule).toBeDefined();
  });

  it("#2 XSS — parses as JavaScript", () => {
    const { parsed } = assertParsesAs(BUG_DIFFS.xss, "javascript");
    expect(parsed.files[0].hunks[0].changes.some((c) => c.content.includes("res.send"))).toBe(true);
  });

  it("#3 Command Injection — parses as TypeScript", () => {
    const { parsed } = assertParsesAs(BUG_DIFFS.commandInjection, "typescript");
    expect(parsed.files[0].hunks[0].changes.some((c) => c.content.includes("exec"))).toBe(true);
  });

  it("#4 SSRF — parses as TypeScript", () => {
    assertParsesAs(BUG_DIFFS.ssrf, "typescript");
  });

  it("#5 Path Traversal — parses as JavaScript", () => {
    assertParsesAs(BUG_DIFFS.pathTraversal, "javascript");
  });

  // ---- Secrets ----

  it("#6 Hardcoded API Key — parses as TypeScript", () => {
    const { parsed } = assertParsesAs(BUG_DIFFS.hardcodedApiKey, "typescript");
    expect(parsed.files[0].hunks[0].changes.some((c) => c.content.includes("sk_live_"))).toBe(true);
  });

  it("#7 Hardcoded Password — parses as Python", () => {
    const { parsed } = assertParsesAs(BUG_DIFFS.hardcodedPassword, "python");
    expect(parsed.files[0].hunks[0].changes.some((c) => c.content.includes("admin123"))).toBe(true);
  });

  // ---- Logic Bugs ----

  it("#8 Missing Null Check — parses as TypeScript", () => {
    assertParsesAs(BUG_DIFFS.missingNullCheck, "typescript");
  });

  it("#9 Off-by-one — parses as JavaScript", () => {
    const { parsed } = assertParsesAs(BUG_DIFFS.offByOne, "javascript");
    expect(parsed.files[0].hunks[0].changes.some((c) => c.content.includes("<="))).toBe(true);
  });

  it("#10 Race Condition — parses as TypeScript", () => {
    assertParsesAs(BUG_DIFFS.raceCondition, "typescript");
  });

  // ---- Code Quality ----

  it("#11 Empty Catch Block — parses as TypeScript", () => {
    const { parsed } = assertParsesAs(BUG_DIFFS.emptyCatch, "typescript");
    // Verify the catch block is truly empty (just "catch (e) {" and "}")
    const changes = parsed.files[0].hunks[0].changes.filter((c) => c.type === "add");
    const catchLine = changes.find((c) => c.content.includes("catch"));
    expect(catchLine).toBeDefined();
  });

  it("#12 Unused Import — parses as TypeScript", () => {
    const { parsed } = assertParsesAs(BUG_DIFFS.unusedImport, "typescript");
    expect(parsed.files[0].hunks[0].changes.some((c) => c.content.includes('import { foo }'))).toBe(true);
  });

  // ---- Performance ----

  it("#13 N+1 Query — parses as TypeScript", () => {
    assertParsesAs(BUG_DIFFS.nPlusOne, "typescript");
  });

  // ---- Validation ----

  it("#14 Missing Validation — parses as TypeScript", () => {
    assertParsesAs(BUG_DIFFS.missingValidation, "typescript");
  });

  // ---- Advanced Security ----

  it("#15 Prototype Pollution — parses as JavaScript", () => {
    assertParsesAs(BUG_DIFFS.prototypePollution, "javascript");
  });

  it("#16 Insecure Deserialization — parses as JavaScript", () => {
    const { parsed } = assertParsesAs(BUG_DIFFS.insecureDeserialization, "javascript");
    expect(parsed.files[0].hunks[0].changes.some((c) => c.content.includes("eval"))).toBe(true);
  });

  it("#17 Open Redirect — parses as TypeScript", () => {
    assertParsesAs(BUG_DIFFS.openRedirect, "typescript");
  });

  it("#18 Missing Rate Limit — parses as TypeScript", () => {
    assertParsesAs(BUG_DIFFS.missingRateLimit, "typescript");
  });

  it("#19 Broken Access Control — parses as TypeScript", () => {
    assertParsesAs(BUG_DIFFS.brokenAccessControl, "typescript");
  });

  // ---- Smart Contract ----

  it("#20 Reentrancy — parses as Solidity, selects chain rules", () => {
    const { parsed, cls } = assertParsesAs(BUG_DIFFS.reentrancy, "solidity");
    expect(cls.isSmartContract).toBe(true);
    expect(cls.chain).toBe("solidity");

    // Solidity-specific rules should be included
    const rules = getRulesForChains(["solidity"]);
    const solidityRules = rules.filter((r) => r.chain === "solidity");
    expect(solidityRules.length).toBeGreaterThan(0);

    // Verify the pattern: external call before state update
    const changes = parsed.files[0].hunks[0].changes.filter((c) => c.type === "add");
    const callIdx = changes.findIndex((c) => c.content.includes("msg.sender.call{"));
    const stateUpdateIdx = changes.findIndex((c) => c.content.includes("balances[msg.sender] -="));
    expect(callIdx).toBeGreaterThanOrEqual(0);
    expect(stateUpdateIdx).toBeGreaterThanOrEqual(0);
    expect(callIdx).toBeLessThan(stateUpdateIdx);
  });
});
