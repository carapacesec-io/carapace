import { describe, it, expect } from "vitest";
import { parseDiff } from "../diff-parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiff(body: string): string {
  return body.trimStart();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseDiff", () => {
  it("parses a single-file diff with one hunk", () => {
    const raw = [
      "diff --git a/src/index.ts b/src/index.ts",
      "index 1234567..abcdef0 100644",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1,3 +1,4 @@",
      ' import { foo } from "./foo";',
      '+import { bar } from "./bar";',
      " ",
      " export function main() {",
    ].join("\n");

    const result = parseDiff(raw);
    expect(result.files).toHaveLength(1);

    const file = result.files[0];
    expect(file.path).toBe("src/index.ts");
    expect(file.oldPath).toBe("src/index.ts");
    expect(file.status).toBe("modified");
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0].changes).toHaveLength(4);

    const addChange = file.hunks[0].changes.find((c) => c.type === "add");
    expect(addChange).toBeDefined();
    expect(addChange!.content).toBe('import { bar } from "./bar";');
  });

  it("parses multi-file diffs", () => {
    const raw = makeDiff(`
diff --git a/a.ts b/a.ts
index 1234567..abcdef0 100644
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
 export { x };
diff --git a/b.ts b/b.ts
index 1234567..abcdef0 100644
--- a/b.ts
+++ b/b.ts
@@ -1,2 +1,2 @@
-const old = true;
+const updated = true;
 export {};
`);

    const result = parseDiff(raw);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe("a.ts");
    expect(result.files[1].path).toBe("b.ts");
  });

  it("detects new files", () => {
    const raw = makeDiff(`
diff --git a/newfile.ts b/newfile.ts
new file mode 100644
index 0000000..abcdef0
--- /dev/null
+++ b/newfile.ts
@@ -0,0 +1,3 @@
+export const hello = "world";
+export const foo = "bar";
+export const baz = 42;
`);

    const result = parseDiff(raw);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].status).toBe("added");
    expect(result.files[0].hunks[0].changes).toHaveLength(3);
    expect(result.files[0].hunks[0].changes.every((c) => c.type === "add")).toBe(true);
  });

  it("detects deleted files", () => {
    const raw = makeDiff(`
diff --git a/old.ts b/old.ts
deleted file mode 100644
index abcdef0..0000000
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const gone = true;
-export const removed = true;
`);

    const result = parseDiff(raw);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].status).toBe("deleted");
    expect(result.files[0].hunks[0].changes.every((c) => c.type === "delete")).toBe(true);
  });

  it("detects renamed files", () => {
    const raw = makeDiff(`
diff --git a/old-name.ts b/new-name.ts
similarity index 90%
rename from old-name.ts
rename to new-name.ts
index 1234567..abcdef0 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,2 +1,2 @@
-export const name = "old";
+export const name = "new";
`);

    const result = parseDiff(raw);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].status).toBe("renamed");
    expect(result.files[0].oldPath).toBe("old-name.ts");
    expect(result.files[0].path).toBe("new-name.ts");
  });

  it("returns empty files array for empty input", () => {
    const result = parseDiff("");
    expect(result.files).toHaveLength(0);
  });

  it("returns empty files array for non-diff text", () => {
    const result = parseDiff("just some random text\nwith multiple lines\n");
    expect(result.files).toHaveLength(0);
  });

  it("handles 'No newline at end of file' markers", () => {
    const raw = makeDiff(`
diff --git a/file.ts b/file.ts
index 1234567..abcdef0 100644
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
-const old = 1;
+const updated = 1;
\\ No newline at end of file
`);

    const result = parseDiff(raw);
    expect(result.files).toHaveLength(1);
    // The "No newline" marker should be skipped, not appear as a change
    const changes = result.files[0].hunks[0].changes;
    expect(changes.every((c) => !c.content.includes("No newline"))).toBe(true);
  });

  it("tracks line numbers correctly across multiple hunks", () => {
    const raw = makeDiff(`
diff --git a/file.ts b/file.ts
index 1234567..abcdef0 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line1
+inserted
 line2
 line3
@@ -10,3 +11,4 @@
 line10
+another insert
 line11
 line12
`);

    const result = parseDiff(raw);
    const hunks = result.files[0].hunks;
    expect(hunks).toHaveLength(2);

    // First hunk: insertion at line 2 (new numbering)
    const firstAdd = hunks[0].changes.find((c) => c.type === "add");
    expect(firstAdd!.lineNumber).toBe(2);

    // Second hunk: insertion at line 12 (new numbering)
    const secondAdd = hunks[1].changes.find((c) => c.type === "add");
    expect(secondAdd!.lineNumber).toBe(12);
  });
});
