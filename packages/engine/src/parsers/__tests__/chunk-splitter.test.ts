import { describe, it, expect } from "vitest";
import { splitIntoChunks, type DiffChunk } from "../chunk-splitter.js";
import type { DiffFile } from "../diff-parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a small DiffFile with a given line count of added content. */
function makeFile(path: string, lineCount: number): DiffFile {
  const changes = Array.from({ length: lineCount }, (_, i) => ({
    type: "add" as const,
    content: `line ${i + 1} of ${path} — ${"x".repeat(40)}`,
    lineNumber: i + 1,
  }));

  return {
    path,
    oldPath: path,
    status: "modified" as const,
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: lineCount,
        changes,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("splitIntoChunks", () => {
  it("keeps small files in a single chunk", () => {
    const files = [makeFile("a.ts", 5), makeFile("b.ts", 5)];
    // 100k tokens is plenty for two small files
    const chunks = splitIntoChunks(files, 100_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].files).toHaveLength(2);
  });

  it("splits files across chunks when budget is exceeded", () => {
    const files = [makeFile("a.ts", 50), makeFile("b.ts", 50), makeFile("c.ts", 50)];
    // Use a tight budget so each file gets its own chunk
    // Each file ~50 lines * ~55 chars/line = ~2750 chars / 4 ≈ 688 tokens + header
    const chunks = splitIntoChunks(files, 800);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    // Each chunk should have exactly one file
    for (const chunk of chunks) {
      expect(chunk.files).toHaveLength(1);
    }
  });

  it("splits a single large file by hunks", () => {
    // Create a file with multiple hunks that each just barely fit individually
    const file: DiffFile = {
      path: "big.ts",
      oldPath: "big.ts",
      status: "modified",
      hunks: Array.from({ length: 5 }, (_, hi) => ({
        oldStart: hi * 100 + 1,
        oldLines: 10,
        newStart: hi * 100 + 1,
        newLines: 20,
        changes: Array.from({ length: 20 }, (_, li) => ({
          type: "add" as const,
          content: `hunk ${hi} line ${li} ${"y".repeat(100)}`,
          lineNumber: hi * 100 + li + 1,
        })),
      })),
    };

    // Budget: each hunk is ~20 lines * ~110 chars = ~2200 chars / 4 ≈ 550 tokens
    // Set budget to ~700 so only 1 hunk fits per chunk
    const chunks = splitIntoChunks([file], 700);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    // All chunks should reference the same file path
    for (const chunk of chunks) {
      expect(chunk.files[0].path).toBe("big.ts");
    }
  });

  it("returns empty array for empty input", () => {
    const chunks = splitIntoChunks([], 10_000);
    expect(chunks).toHaveLength(0);
  });

  it("includes estimatedTokens on each chunk", () => {
    const files = [makeFile("a.ts", 10)];
    const chunks = splitIntoChunks(files, 100_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].estimatedTokens).toBeGreaterThan(0);
  });
});
