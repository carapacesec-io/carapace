import { resolve, join, dirname, relative, extname } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, cpSync } from "node:fs";
import { createInterface } from "node:readline";
import ts from "typescript";
import {
  discoverFiles,
  _scanFile,
  _ALL_RULES,
  loadConfig,
  filterByConfig,
} from "@carapacesecurity/engine";

export interface CleanOptions {
  path: string;
  dryRun: boolean;
  severity?: string;
  interactive?: boolean;
  undo?: boolean;
}

/* ------------------------------------------------------------------ */
/*  ANSI helpers                                                       */
/* ------------------------------------------------------------------ */

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

function colorDiff(filePath: string, removals: string[], additions: string[]): string {
  const lines: string[] = [];
  lines.push(`${BOLD}${CYAN}--- ${filePath}${RESET}`);
  for (let i = 0; i < Math.max(removals.length, additions.length); i++) {
    if (removals[i] !== undefined) lines.push(`${RED}- ${removals[i]}${RESET}`);
    if (additions[i] !== undefined) lines.push(`${GREEN}+ ${additions[i]}${RESET}`);
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Post-fix syntax validation                                         */
/* ------------------------------------------------------------------ */

const JS_TS_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

/**
 * Check if the fixed content is syntactically valid.
 * Uses TypeScript's parser which handles JS/TS/JSX/TSX.
 * Returns null if valid, or an error message if invalid.
 */
function validateSyntax(filePath: string, content: string): string | null {
  const ext = extname(filePath).toLowerCase();
  if (!JS_TS_EXTS.has(ext)) return null; // only validate JS/TS files

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ext === ".tsx" || ext === ".jsx" ? ts.ScriptKind.TSX : undefined,
  );

  // parseDiagnostics are syntax errors found during parsing
  const errors = sourceFile.parseDiagnostics;
  if (errors && errors.length > 0) {
    const first = errors[0];
    const pos = sourceFile.getLineAndCharacterOfPosition(first.start ?? 0);
    const msg = ts.flattenDiagnosticMessageText(first.messageText, "\n");
    return `Syntax error at line ${pos.line + 1}: ${msg}`;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Backup / undo                                                      */
/* ------------------------------------------------------------------ */

const BACKUP_DIR = ".carapace-backup";

function createBackup(targetPath: string, filePath: string): boolean {
  try {
    const backupRoot = join(targetPath, BACKUP_DIR);
    const relPath = relative(targetPath, filePath);
    const backupPath = join(backupRoot, relPath);

    mkdirSync(dirname(backupPath), { recursive: true });
    cpSync(filePath, backupPath);
    return true;
  } catch {
    return false;
  }
}

function restoreBackup(targetPath: string): boolean {
  const backupRoot = join(targetPath, BACKUP_DIR);
  if (!existsSync(backupRoot)) return false;

  let restoredCount = 0;

  function walkAndRestore(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkAndRestore(fullPath);
      } else {
        const relPath = relative(backupRoot, fullPath);
        const originalPath = join(targetPath, relPath);
        cpSync(fullPath, originalPath);
        restoredCount++;
      }
    }
  }

  walkAndRestore(backupRoot);
  rmSync(backupRoot, { recursive: true, force: true });

  process.stderr.write(`${GREEN}Restored ${restoredCount} file(s) from backup.${RESET}\n`);
  return true;
}

/* ------------------------------------------------------------------ */
/*  Interactive prompt                                                 */
/* ------------------------------------------------------------------ */

async function promptUser(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((res) => {
    rl.question(question, (answer) => {
      rl.close();
      res(answer.trim().toLowerCase());
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Range fix type                                                     */
/* ------------------------------------------------------------------ */

interface RangeFix {
  startLine: number;
  endLine: number;
  original: string[];
  replacement: string;
  ruleId: string;
  title: string;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export async function runClean(options: CleanOptions): Promise<void> {
  const targetPath = resolve(options.path);

  // Handle --undo
  if (options.undo) {
    process.stderr.write(`${BOLD}${CYAN}carapace clean --undo${RESET}\n`);
    const restored = restoreBackup(targetPath);
    if (!restored) {
      process.stderr.write(`${RED}No backup found in ${BACKUP_DIR}/${RESET}\n`);
    }
    return;
  }

  const config = loadConfig(targetPath);

  process.stderr.write(`${BOLD}${CYAN}carapace clean${RESET} ${targetPath}\n`);

  // Discover files (respecting ignore config)
  const files = discoverFiles(targetPath, { maxFiles: 2000, ignore: config?.ignore });
  if (files.length === 0) {
    process.stderr.write("[carapace] No source files found.\n");
    return;
  }

  process.stderr.write(`${DIM}Scanning ${files.length} files...${RESET}\n`);

  let totalFixed = 0;
  let filesFixed = 0;
  let removedCount = 0;
  let replacedCount = 0;
  let skippedCount = 0;
  let acceptAll = false;

  const severityOrder = ["info", "low", "medium", "high", "critical"];
  const severityThreshold = options.severity
    ? severityOrder.indexOf(options.severity)
    : 0;

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file.absolutePath, "utf-8");
    } catch {
      skippedCount++;
      continue;
    }

    // Skip binary files
    if (content.slice(0, 8192).includes("\0")) { skippedCount++; continue; }
    if (content.length > 500_000) { skippedCount++; continue; }

    // Scan with all rules (no line range restriction)
    let findings = _scanFile(file.relativePath, content, _ALL_RULES, undefined);

    // Filter to fixable findings (non-empty fixDiff)
    findings = findings.filter((f) => f.fixDiff !== "");

    // Apply config filters
    if (config) {
      findings = filterByConfig(findings, config);
    }

    // Apply severity filter
    if (severityThreshold > 0) {
      findings = findings.filter(
        (f) => severityOrder.indexOf(f.severity) >= severityThreshold,
      );
    }

    if (findings.length === 0) continue;

    // Build range fixes from all findings
    const lines = content.split("\n");
    const rangeFixes: RangeFix[] = [];
    const claimedLines = new Set<number>();

    for (const finding of findings) {
      const startIdx = finding.startLine - 1;
      const endIdx = finding.endLine - 1;
      if (startIdx < 0 || endIdx >= lines.length) continue;

      // Skip if any line in this range is already claimed
      let overlaps = false;
      for (let l = finding.startLine; l <= finding.endLine; l++) {
        if (claimedLines.has(l)) { overlaps = true; break; }
      }
      if (overlaps) continue;

      for (let l = finding.startLine; l <= finding.endLine; l++) {
        claimedLines.add(l);
      }

      rangeFixes.push({
        startLine: finding.startLine,
        endLine: finding.endLine,
        original: lines.slice(startIdx, endIdx + 1),
        replacement: finding.fixDiff,
        ruleId: finding.ruleId,
        title: finding.title,
      });
    }

    if (rangeFixes.length === 0) continue;

    // Interactive mode: prompt for each fix
    let approvedFixes = rangeFixes;
    if (options.interactive && !acceptAll) {
      approvedFixes = [];
      let quit = false;

      for (const fix of rangeFixes) {
        if (quit) break;

        const isDelete = fix.replacement === "" || fix.replacement === "__DELETE_LINE__";
        const action = isDelete ? "DELETE" : "REPLACE";

        process.stderr.write(`\n${BOLD}${file.relativePath}:${fix.startLine}${RESET} ${DIM}(${fix.ruleId})${RESET}\n`);
        process.stderr.write(`  ${fix.title}\n`);
        for (const origLine of fix.original) {
          process.stderr.write(`  ${RED}- ${origLine.trim()}${RESET}\n`);
        }
        if (!isDelete) {
          const ws = fix.original[0].match(/^(\s*)/)?.[1] ?? "";
          for (const rl of fix.replacement.split("\n")) {
            process.stderr.write(`  ${GREEN}+ ${(ws + rl).trim()}${RESET}\n`);
          }
        }

        const answer = await promptUser(`  ${YELLOW}${action}? [y]es / [n]o / [a]ll / [q]uit: ${RESET}`);

        if (answer === "y" || answer === "yes") {
          approvedFixes.push(fix);
        } else if (answer === "a" || answer === "all") {
          acceptAll = true;
          approvedFixes.push(fix);
          // Add remaining fixes for this file
          const idx = rangeFixes.indexOf(fix);
          approvedFixes.push(...rangeFixes.slice(idx + 1));
          break;
        } else if (answer === "q" || answer === "quit") {
          quit = true;
          break;
        }
        // 'n' or anything else: skip
      }

      if (quit) break;
    }

    if (approvedFixes.length === 0) continue;

    // Sort by startLine descending (bottom-to-top) to preserve line numbers
    approvedFixes.sort((a, b) => b.startLine - a.startLine);

    const removals: string[] = [];
    const additions: string[] = [];
    const modifiedLines = [...lines];

    for (const fix of approvedFixes) {
      const startIdx = fix.startLine - 1;
      const count = fix.endLine - fix.startLine + 1;

      if (fix.replacement === "" || fix.replacement === "__DELETE_LINE__") {
        for (const origLine of fix.original) {
          removals.push(`${DIM}L${fix.startLine}${RESET} ${origLine.trim()} ${DIM}(${fix.ruleId})${RESET}`);
        }
        modifiedLines.splice(startIdx, count);
        removedCount += count;
      } else {
        const leadingWhitespace = fix.original[0].match(/^(\s*)/)?.[1] ?? "";
        const replacementLines = fix.replacement.split("\n").map((rl) => leadingWhitespace + rl);

        for (const origLine of fix.original) {
          removals.push(`${DIM}L${fix.startLine}${RESET} ${origLine.trim()}`);
        }
        for (const newLine of replacementLines) {
          additions.push(`${DIM}L${fix.startLine}${RESET} ${newLine.trim()} ${DIM}(${fix.ruleId})${RESET}`);
        }

        modifiedLines.splice(startIdx, count, ...replacementLines);
        replacedCount++;
      }
    }

    const newContent = modifiedLines.join("\n");

    // Validate syntax before writing (JS/TS only)
    const syntaxError = validateSyntax(file.relativePath, newContent);
    if (syntaxError) {
      process.stderr.write(`${YELLOW}Skipping ${file.relativePath} — fix would break syntax: ${syntaxError}${RESET}\n`);
      skippedCount++;
      continue;
    }

    if (options.dryRun) {
      process.stdout.write(colorDiff(file.relativePath, removals, additions) + "\n\n");
    } else {
      // Create backup before writing — skip file if backup fails
      const backedUp = createBackup(targetPath, file.absolutePath);
      if (!backedUp) {
        process.stderr.write(`${YELLOW}Skipping ${file.relativePath} — backup failed${RESET}\n`);
        skippedCount++;
        continue;
      }
      writeFileSync(file.absolutePath, newContent);
    }

    totalFixed += approvedFixes.length;
    filesFixed++;
  }

  // Summary
  const mode = options.dryRun ? `${DIM}(dry run)${RESET}` : "";
  const skippedMsg = skippedCount > 0 ? `, ${skippedCount} skipped` : "";
  process.stderr.write(
    `\n${BOLD}Cleaned ${filesFixed} file${filesFixed !== 1 ? "s" : ""} — ${totalFixed} fix${totalFixed !== 1 ? "es" : ""} applied${RESET} ${mode}\n` +
    `${DIM}  ${removedCount} removed, ${replacedCount} replaced${skippedMsg}${RESET}\n`,
  );

  if (totalFixed === 0) {
    process.stderr.write(`${GREEN}Nothing to clean — code is already clean.${RESET}\n`);
  } else if (!options.dryRun) {
    process.stderr.write(`${DIM}  Backup saved to ${BACKUP_DIR}/ — run 'carapace clean --undo' to restore${RESET}\n`);
  }
}
