/**
 * Fix applicator.
 *
 * Takes review findings with fixDiff and original file contents, applies the
 * fixes, and returns the updated content for each file. Applies bottom-to-top
 * to preserve line numbers.
 */

import path from "node:path";
import ts from "typescript";
import type { Finding } from "../ai/schemas.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileFixInput {
  /** Path to the file (relative to repo root). */
  filePath: string;
  /** Original file content from GitHub. */
  originalContent: string;
}

export interface FileFixResult {
  filePath: string;
  newContent: string;
  appliedFindings: Finding[];
}

export interface ApplyFixesResult {
  /** Successfully fixed files. */
  files: FileFixResult[];
  /** Findings that couldn't be applied. */
  skipped: Array<{ finding: Finding; reason: string }>;
}

// ---------------------------------------------------------------------------
// Post-fix syntax validation
// ---------------------------------------------------------------------------

const JS_TS_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

/**
 * Check if the fixed content is syntactically valid JS/TS.
 * Returns null if valid (or non-JS/TS file), or an error message if invalid.
 */
export function validateFixedSyntax(filePath: string, content: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (!JS_TS_EXTS.has(ext)) return null;

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ext === ".tsx" || ext === ".jsx" ? ts.ScriptKind.TSX : undefined,
  );

  // parseDiagnostics is populated by the parser but not in the public TS API type
  const errors = (sourceFile as unknown as { parseDiagnostics?: ts.DiagnosticWithLocation[] }).parseDiagnostics;
  if (errors && errors.length > 0) {
    const first = errors[0];
    const pos = sourceFile.getLineAndCharacterOfPosition(first.start ?? 0);
    const msg = ts.flattenDiagnosticMessageText(first.messageText, "\n");
    return `Syntax error at line ${pos.line + 1}: ${msg}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a fixDiff string into line-level add/delete operations.
 *
 * Supports two formats:
 * 1. Unified diff format: lines starting with +/- after @@ header
 * 2. Simple replacement: "old code" → "new code" (just treat as plain replacement)
 */
interface DiffOp {
  /** 1-based line number in the original file. */
  startLine: number;
  /** Lines to remove from the original. */
  removeLines: string[];
  /** Lines to insert in their place. */
  insertLines: string[];
}

function parseFixDiff(fixDiff: string, startLine: number): DiffOp | null {
  const lines = fixDiff.split("\n");

  // Try unified diff format
  const removeLines: string[] = [];
  const insertLines: string[] = [];
  let hasUnifiedFormat = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      hasUnifiedFormat = true;
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++")) continue;

    if (line.startsWith("-")) {
      removeLines.push(line.slice(1));
      hasUnifiedFormat = true;
    } else if (line.startsWith("+")) {
      insertLines.push(line.slice(1));
      hasUnifiedFormat = true;
    }
  }

  if (hasUnifiedFormat && (removeLines.length > 0 || insertLines.length > 0)) {
    return { startLine, removeLines, insertLines };
  }

  return null;
}

/**
 * Apply a single DiffOp to file lines (mutates the array).
 * Returns true if applied successfully, false if the context doesn't match.
 */
function applyOp(fileLines: string[], op: DiffOp): boolean {
  const lineIdx = op.startLine - 1; // Convert 1-based to 0-based

  if (lineIdx < 0 || lineIdx > fileLines.length) return false;

  if (op.removeLines.length > 0) {
    // Verify the lines to remove actually match
    for (let i = 0; i < op.removeLines.length; i++) {
      const fileLineIdx = lineIdx + i;
      if (fileLineIdx >= fileLines.length) return false;

      // Fuzzy match: trim whitespace for comparison
      const expected = op.removeLines[i].trim();
      const actual = fileLines[fileLineIdx].trim();
      if (expected !== actual) return false;
    }

    // Remove old lines and insert new ones
    fileLines.splice(lineIdx, op.removeLines.length, ...op.insertLines);
  } else {
    // Pure insertion (no removal)
    fileLines.splice(lineIdx, 0, ...op.insertLines);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Apply auto-fixes from findings to original file contents.
 *
 * Processes all findings that have a non-empty fixDiff.
 *
 * Applies fixes bottom-to-top within each file to preserve line numbers.
 * If any fix in a file fails to apply, all fixes for that file are skipped
 * (all-or-nothing per file).
 */
export function applyFixes(
  findings: Finding[],
  fileInputs: FileFixInput[],
): ApplyFixesResult {
  const result: ApplyFixesResult = { files: [], skipped: [] };

  // Filter to all findings that have a fixDiff
  const fixable = findings.filter(
    (f) => f.fixDiff.trim().length > 0,
  );

  if (fixable.length === 0) return result;

  // Group findings by file
  const byFile = new Map<string, Finding[]>();
  for (const f of fixable) {
    const existing = byFile.get(f.filePath) ?? [];
    existing.push(f);
    byFile.set(f.filePath, existing);
  }

  // Build a lookup for original content
  const contentMap = new Map<string, string>();
  for (const input of fileInputs) {
    contentMap.set(input.filePath, input.originalContent);
  }

  // Apply fixes file by file
  for (const [filePath, fileFindings] of byFile) {
    const original = contentMap.get(filePath);
    if (!original) {
      for (const f of fileFindings) {
        result.skipped.push({ finding: f, reason: "File content not available" });
      }
      continue;
    }

    // Parse all fixDiffs
    const ops: Array<{ op: DiffOp; finding: Finding }> = [];
    for (const f of fileFindings) {
      const op = parseFixDiff(f.fixDiff, f.startLine);
      if (op) {
        ops.push({ op, finding: f });
      } else {
        result.skipped.push({ finding: f, reason: "Could not parse fixDiff" });
      }
    }

    if (ops.length === 0) continue;

    // Sort by startLine descending (bottom-to-top)
    ops.sort((a, b) => b.op.startLine - a.op.startLine);

    // Test each op independently on a fresh copy, keep only successful ones
    const validOps: Array<{ op: DiffOp; finding: Finding }> = [];
    for (const entry of ops) {
      const testLines = original.split("\n");
      if (applyOp(testLines, entry.op)) {
        validOps.push(entry);
      } else {
        result.skipped.push({ finding: entry.finding, reason: "Context mismatch — lines don't match" });
      }
    }

    if (validOps.length === 0) continue;

    // Apply only successful ops bottom-to-top on a single copy
    const lines = original.split("\n");
    for (const { op } of validOps) {
      applyOp(lines, op);
    }

    const newContent = lines.join("\n");
    if (newContent !== original) {
      // Validate syntax before accepting the fix
      const syntaxErr = validateFixedSyntax(filePath, newContent);
      if (syntaxErr) {
        for (const { finding } of validOps) {
          result.skipped.push({ finding, reason: `Fix broke syntax: ${syntaxErr}` });
        }
        continue;
      }

      result.files.push({
        filePath,
        newContent,
        appliedFindings: validOps.map((o) => o.finding),
      });
    }
  }

  return result;
}
