/**
 * Unified diff parser.
 *
 * Parses the standard unified-diff format produced by `git diff` and used in
 * GitHub PR diffs into a structured representation of files, hunks, and
 * individual line changes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChangeType = "add" | "delete" | "context";

export interface DiffChange {
  type: ChangeType;
  content: string;
  lineNumber: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface DiffFile {
  path: string;
  oldPath: string;
  status: FileStatus;
  hunks: DiffHunk[];
}

export interface ParsedDiff {
  files: DiffFile[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIFF_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function detectStatus(
  oldPath: string,
  newPath: string,
  headerLines: string[],
): FileStatus {
  if (headerLines.some((l) => l.startsWith("rename from "))) return "renamed";
  if (headerLines.some((l) => l.startsWith("new file mode"))) return "added";
  if (headerLines.some((l) => l.startsWith("deleted file mode")))
    return "deleted";
  if (oldPath !== newPath) return "renamed";
  return "modified";
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseDiff(raw: string): ParsedDiff {
  const lines = raw.split("\n");
  const files: DiffFile[] = [];

  let i = 0;

  while (i < lines.length) {
    // Find the next diff header
    const headerMatch = DIFF_HEADER.exec(lines[i]);
    if (!headerMatch) {
      i++;
      continue;
    }

    const oldPath = headerMatch[1];
    const newPath = headerMatch[2];
    i++;

    // Collect extended header lines (index, old mode, new mode, etc.)
    const extHeaders: string[] = [];
    while (
      i < lines.length &&
      !lines[i].startsWith("--- ") &&
      !lines[i].startsWith("diff --git ")
    ) {
      extHeaders.push(lines[i]);
      i++;
    }

    const status = detectStatus(oldPath, newPath, extHeaders);
    const hunks: DiffHunk[] = [];

    // Skip --- and +++ lines
    if (i < lines.length && lines[i].startsWith("--- ")) i++;
    if (i < lines.length && lines[i].startsWith("+++ ")) i++;

    // Parse hunks
    while (i < lines.length && !DIFF_HEADER.test(lines[i])) {
      const hunkMatch = HUNK_HEADER.exec(lines[i]);
      if (!hunkMatch) {
        i++;
        continue;
      }

      const oldStart = parseInt(hunkMatch[1], 10);
      const oldLines = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3], 10);
      const newLines = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;
      i++;

      const changes: DiffChange[] = [];
      let currentOldLine = oldStart;
      let currentNewLine = newStart;

      while (i < lines.length) {
        const line = lines[i];

        // Stop at next hunk or file header
        if (HUNK_HEADER.test(line) || DIFF_HEADER.test(line)) break;

        if (line.startsWith("+")) {
          changes.push({
            type: "add",
            content: line.slice(1),
            lineNumber: currentNewLine,
          });
          currentNewLine++;
        } else if (line.startsWith("-")) {
          changes.push({
            type: "delete",
            content: line.slice(1),
            lineNumber: currentOldLine,
          });
          currentOldLine++;
        } else if (line.startsWith(" ")) {
          changes.push({
            type: "context",
            content: line.slice(1),
            lineNumber: currentNewLine,
          });
          currentOldLine++;
          currentNewLine++;
        } else if (line === "\\ No newline at end of file") {
          // Skip "no newline" markers
          i++;
          continue;
        } else {
          // Unknown line (empty line outside hunk, etc.) -- stop hunk
          break;
        }

        i++;
      }

      hunks.push({ oldStart, oldLines, newStart, newLines, changes });
    }

    files.push({
      path: newPath,
      oldPath,
      status,
      hunks,
    });
  }

  return { files };
}
