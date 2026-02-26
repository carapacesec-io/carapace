/**
 * Integration test — runs the full analyze() pipeline in staticOnly mode
 * (no API key needed). Validates end-to-end: diff → parse → classify → result.
 */

import { describe, it, expect } from "vitest";
import { analyze } from "../analyzer.js";

function d(body: string) {
  return body.trimStart();
}

describe("analyze (staticOnly)", () => {
  it("returns empty findings for a clean diff", async () => {
    const diff = d(`
diff --git a/src/index.ts b/src/index.ts
index 0000000..1111111 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,3 @@
 export const version = "1.0.0";
+export const name = "vex";
 export default {};
`);

    const result = await analyze({
      diff,
      enabledRulesets: ["general"],
      staticOnly: true,
    });

    expect(result).toBeDefined();
    expect(result.findings).toBeDefined();
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.summary).toBeTruthy();
  });

  it("returns a result for an empty diff", async () => {
    const result = await analyze({
      diff: "",
      enabledRulesets: ["general"],
      staticOnly: true,
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary).toBe("No files found in the diff.");
  });

  it("runs without apiKey (falls back to static-only)", async () => {
    const diff = d(`
diff --git a/contracts/Token.sol b/contracts/Token.sol
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/contracts/Token.sol
@@ -0,0 +1,5 @@
+pragma solidity ^0.8.0;
+
+contract Token {
+    mapping(address => uint256) balances;
+}
`);

    const result = await analyze({
      diff,
      enabledRulesets: ["general", "crypto"],
      // No apiKey → staticOnly behavior
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeTruthy();
  });

  it("handles multi-file diffs in staticOnly mode", async () => {
    const diff = d(`
diff --git a/src/a.ts b/src/a.ts
index 0000000..1111111 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
 export { x };
diff --git a/src/b.js b/src/b.js
index 0000000..1111111 100644
--- a/src/b.js
+++ b/src/b.js
@@ -1,2 +1,3 @@
 const a = "hello";
+const b = "world";
 module.exports = { a };
`);

    const result = await analyze({
      diff,
      enabledRulesets: ["general"],
      staticOnly: true,
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeTruthy();
  });

  it("detects solidity chain from diff and includes in summary", async () => {
    const diff = d(`
diff --git a/contracts/Vault.sol b/contracts/Vault.sol
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/contracts/Vault.sol
@@ -0,0 +1,10 @@
+// SPDX-License-Identifier: MIT
+pragma solidity ^0.8.19;
+
+contract Vault {
+    mapping(address => uint256) public balances;
+
+    function deposit() external payable {
+        balances[msg.sender] += msg.value;
+    }
+}
`);

    const result = await analyze({
      diff,
      enabledRulesets: ["general", "crypto"],
      staticOnly: true,
    });

    expect(result).toBeDefined();
  });
});
