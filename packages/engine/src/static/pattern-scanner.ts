/**
 * Pattern Scanner — pure TypeScript regex-based vulnerability scanner.
 *
 * No external binary dependencies. Reads source files and matches regex
 * patterns against their content to find security issues, bugs, and
 * code-quality problems.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Severity } from "../ai/schemas.js";
import { scanFileAST } from "./ast-scanner.js";
import type { StaticFinding, ToolRunner, ToolRunnerOptions } from "./types.js";
import { ALL_RULES } from "./pattern-rules.private.js";

/* ------------------------------------------------------------------ */
/*  PatternRule definition                                            */
/* ------------------------------------------------------------------ */

interface PatternRule {
  id: string;
  title: string;
  description: string;
  suggestion: string;
  /** Applied once per line. */
  pattern: RegExp;
  /** Applied against the full file content (use sparingly). */
  multilinePattern?: RegExp;
  severity: Severity;
  category: string;
  confidence: "high" | "medium" | "low";
  /** File extensions this rule applies to. `["*"]` means every file. */
  languages: string[];
  /** Optional template for fixDiff — `$0` is replaced with the matched text. */
  fixTemplate?: string;
  /** Optional function that transforms the matched line into the fixed line. */
  fixFn?: (line: string) => string;
  /** Optional function that transforms a multiline match into the fixed text. Empty string = delete. */
  multilineFixFn?: (matchedText: string) => string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function extOf(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

function isInChangedLines(
  line: number,
  ranges: [number, number][] | undefined,
): boolean {
  if (!ranges) return true; // no range info — include by default
  return ranges.some(([start, end]) => line >= start && line <= end);
}

function rangeOverlaps(
  startLine: number,
  endLine: number,
  ranges: [number, number][] | undefined,
): boolean {
  if (!ranges) return true;
  return ranges.some(
    ([rStart, rEnd]) => startLine <= rEnd && endLine >= rStart,
  );
}

function extractSnippet(
  lines: string[],
  lineIdx: number,
  contextBefore = 1,
  contextAfter = 1,
): string {
  const start = Math.max(0, lineIdx - contextBefore);
  const end = Math.min(lines.length - 1, lineIdx + contextAfter);
  return lines.slice(start, end + 1).join("\n");
}

/* ------------------------------------------------------------------ */
/*  Web/general file extensions                                       */
/* ------------------------------------------------------------------ */

const JS_TS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];
const PY = [".py"];
const GO = [".go"];
const SOL = [".sol"];
const JAVA = [".java"];
const RUBY = [".rb", ".erb"];
const PHP = [".php"];
const ALL = ["*"];

/* ------------------------------------------------------------------ */
/*  False positive filtering helpers                                   */
/* ------------------------------------------------------------------ */

function isTestFile(filePath: string): boolean {
  return /(?:\.test\.|\.spec\.|__tests__\/|\/test\/|\/tests\/|\.stories\.)/.test(filePath);
}

function isDocsFile(filePath: string): boolean {
  return /(?:README|docs\/|examples\/|\.md$|\.mdx$|CHANGELOG|LICENSE)/i.test(filePath);
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:\/\/|#|\/?\*|<!--)/.test(trimmed);
}

function isImportLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:import\s|(?:const|let|var)\s+\w+\s*=\s*require\s*\(|from\s|using\s)/.test(trimmed);
}

interface FPContext {
  filePath: string;
  line: string;
  rule: PatternRule;
}

function isConfigFile(filePath: string): boolean {
  return /\.(?:json|ya?ml|toml)$/i.test(filePath);
}

function isJsxFile(filePath: string): boolean {
  return /\.[jt]sx$/i.test(filePath);
}

function isScriptDir(filePath: string): boolean {
  return /(?:^|\/)(?:scripts|build|tools|infra)\//i.test(filePath);
}

function isFalsePositive(ctx: FPContext): boolean {
  // Skip docs files for most rules
  if (isDocsFile(ctx.filePath)) return true;
  // Skip comment lines (except for TODO/FIXME rule which specifically targets comments)
  if (ctx.rule.id !== "cp-qual-todo-fixme" && isCommentLine(ctx.line)) return true;
  // Skip import lines for URL/IP/secret rules
  if (isImportLine(ctx.line) && /(?:http-no-tls|hardcoded-ip|hardcoded-secret)/.test(ctx.rule.id)) return true;

  // Skip config files for security rules (config files aren't executable)
  if (isConfigFile(ctx.filePath) && ctx.rule.category === "security") return true;

  // Skip lines that look like commented-out code (// const x = ...) for non-comment-specific rules
  const trimmed = ctx.line.trim();
  if (trimmed.startsWith("// ") && /^\/\/\s*(?:const|let|var|function|class|import|export|return|if|for)\b/.test(trimmed)) {
    return true;
  }

  // Skip deep-nesting in JSX/TSX files — JSX is inherently nested
  if (ctx.rule.id === "cp-qual-deep-nesting" && isJsxFile(ctx.filePath)) return true;

  // Skip callback-hell in test files — describe/it/beforeEach blocks are not callback hell
  if (ctx.rule.id === "cp-clean-callback-hell" && isTestFile(ctx.filePath)) return true;

  // Skip command-injection in scripts/build/tools directories — these use exec with hardcoded commands
  if (ctx.rule.id === "cp-sec-command-injection" && isScriptDir(ctx.filePath)) return true;

  // Skip test fixtures / mock data for secret/credential rules
  if (/(?:hardcoded-secret|console-log-sensitive)/.test(ctx.rule.id)) {
    if (/(?:mock|stub|fixture|fake|dummy)/i.test(ctx.line)) return true;
    // Skip lines with redaction markers
    if (/\[REDACTED\]|\*\*\*|mask\(|redact\(/.test(ctx.line)) return true;
    // Skip schema/type/placeholder patterns for hardcoded-secret
    if (ctx.rule.id === "cp-sec-hardcoded-secret") {
      if (/(?:\bschema\b|type\s*:|\bexample\b|placeholder|\bdefault\b)/i.test(ctx.line)) return true;
      if (/process\.env\b/.test(ctx.line)) return true;
    }
  }

  return false;
}

function adjustSeverityForContext(severity: Severity, filePath: string): Severity {
  if (isTestFile(filePath) && severity !== "info") return "info";
  return severity;
}

/* ------------------------------------------------------------------ */
/*  Rule definitions — loaded from private module                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Special cleaning scanners (file-level analysis)                   */
/* ------------------------------------------------------------------ */

function scanFileCleaningChecks(
  relPath: string,
  content: string,
  lines: string[],
  changedRanges: [number, number][] | undefined,
): StaticFinding[] {
  const findings: StaticFinding[] = [];
  const ext = extOf(relPath);

  // Skip non-code, test, and docs files
  const codeExts = [...JS_TS, ...PY, ...GO, ...JAVA, ...RUBY, ...PHP, ...SOL];
  if (!codeExts.includes(ext)) return findings;
  if (isTestFile(relPath) || isDocsFile(relPath)) return findings;

  const fileHasChanges = !changedRanges || changedRanges.length > 0;

  // ---- AST-based checks for JS/TS files ----
  // Replaces regex-based unused import/variable/function, cyclomatic complexity,
  // and function-too-long checks with accurate TypeScript Compiler API analysis.
  if (JS_TS.includes(ext)) {
    findings.push(...scanFileAST(relPath, content, changedRanges));
  }

  // ---- cp-clean-file-too-long (>500 lines) ----
  if (fileHasChanges && lines.length > 500) {
    findings.push({
      tool: "pattern-scanner",
      ruleId: "cp-clean-file-too-long",
      severity: "info",
      category: "code-cleaning",
      title: "[Pattern] File too long",
      description: `This file is ${lines.length} lines. Large files are harder to navigate, test, and review.`,
      filePath: relPath,
      startLine: 1,
      endLine: lines.length,
      codeSnippet: `// ${relPath}: ${lines.length} lines`,
      suggestion: "Split into smaller, focused modules of <300 lines each.",
      fixDiff: "",
      confidence: "high",
    });
  }

  // ---- cp-clean-function-too-long (>50 lines, Java/Go — JS/TS handled by AST) ----
  if ([...JAVA, ...GO].includes(ext)) {
    const fnStartRegex =
      /(?:(?:export\s+)?(?:async\s+)?function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/;
    let braceDepth = 0;
    let fnStartLine = -1;
    let fnName = "";
    let inFn = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!inFn) {
        if (fnStartRegex.test(line)) {
          const nameMatch =
            line.match(/function\s+(\w+)/) || line.match(/(?:const|let|var)\s+(\w+)/);
          fnName = nameMatch ? nameMatch[1] : "anonymous";
          const opens = (line.match(/\{/g) || []).length;
          const closes = (line.match(/\}/g) || []).length;
          if (opens > 0) {
            braceDepth = opens - closes;
            fnStartLine = i;
            inFn = braceDepth > 0;
          }
        }
      } else {
        braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        if (braceDepth <= 0) {
          const fnLength = i - fnStartLine + 1;
          if (fnLength > 50 && rangeOverlaps(fnStartLine + 1, i + 1, changedRanges)) {
            findings.push({
              tool: "pattern-scanner",
              ruleId: "cp-clean-function-too-long",
              severity: "low",
              category: "code-cleaning",
              title: "[Pattern] Function too long",
              description: `Function '${fnName}' is ${fnLength} lines. Long functions are hard to test and maintain.`,
              filePath: relPath,
              startLine: fnStartLine + 1,
              endLine: i + 1,
              codeSnippet: `${lines[fnStartLine]}\n  // ... ${fnLength} lines ...\n${lines[i]}`,
              suggestion: "Extract helper functions to keep each function under 50 lines.",
              fixDiff: "",
              confidence: "medium",
            });
          }
          inFn = false;
          braceDepth = 0;
        }
      }
    }
  }

  // ---- cp-clean-cyclomatic-complexity (>10, Java/Go — JS/TS handled by AST) ----
  if ([...JAVA, ...GO].includes(ext)) {
    const fnStartRegex =
      /(?:(?:export\s+)?(?:async\s+)?function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/;
    let braceDepth = 0;
    let fnStartLine = -1;
    let fnName = "";
    let inFn = false;
    let complexity = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!inFn) {
        if (fnStartRegex.test(line)) {
          const nameMatch =
            line.match(/function\s+(\w+)/) || line.match(/(?:const|let|var)\s+(\w+)/);
          fnName = nameMatch ? nameMatch[1] : "anonymous";
          const opens = (line.match(/\{/g) || []).length;
          const closes = (line.match(/\}/g) || []).length;
          if (opens > 0) {
            braceDepth = opens - closes;
            fnStartLine = i;
            inFn = braceDepth > 0;
            complexity = 1;
          }
        }
      } else {
        complexity += (line.match(/\b(?:if|else\s+if|while|for|case|catch)\b/g) || []).length;
        complexity += (line.match(/&&|\|\||\?\?/g) || []).length;
        const ternary = (line.match(/\?/g) || []).length - (line.match(/\?\./g) || []).length;
        complexity += Math.max(0, ternary);

        braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        if (braceDepth <= 0) {
          if (complexity > 10 && rangeOverlaps(fnStartLine + 1, i + 1, changedRanges)) {
            findings.push({
              tool: "pattern-scanner",
              ruleId: "cp-clean-cyclomatic-complexity",
              severity: "low",
              category: "code-cleaning",
              title: "[Pattern] High cyclomatic complexity",
              description: `Function '${fnName}' has complexity ${complexity} (threshold: 10). Complex functions are hard to test.`,
              filePath: relPath,
              startLine: fnStartLine + 1,
              endLine: i + 1,
              codeSnippet: `${lines[fnStartLine]}\n  // complexity: ${complexity}\n${lines[i]}`,
              suggestion: "Decompose into smaller functions. Extract conditionals into helpers.",
              fixDiff: "",
              confidence: "medium",
            });
          }
          inFn = false;
          braceDepth = 0;
          complexity = 1;
        }
      }
    }
  }

  // ---- cp-clean-duplicate-code (4+ identical non-trivial lines appearing 2+ times) ----
  if (lines.length > 8) {
    const WINDOW = 4;
    const blockMap = new Map<string, number[]>();

    for (let i = 0; i <= lines.length - WINDOW; i++) {
      const block = lines
        .slice(i, i + WINDOW)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("*"))
        .join("\n");

      if (block.length < 40) continue; // skip trivial blocks

      const prev = blockMap.get(block);
      if (!prev) {
        blockMap.set(block, [i + 1]);
      } else if (i + 1 - prev[prev.length - 1] >= WINDOW) {
        prev.push(i + 1);
      }
    }

    const reported = new Set<string>();
    for (const [block, locs] of blockMap) {
      if (locs.length >= 2 && !reported.has(block)) {
        reported.add(block);
        if (rangeOverlaps(locs[0], locs[0] + WINDOW, changedRanges)) {
          findings.push({
            tool: "pattern-scanner",
            ruleId: "cp-clean-duplicate-code",
            severity: "low",
            category: "code-cleaning",
            title: "[Pattern] Duplicate code block",
            description: `This ${WINDOW}-line block appears ${locs.length} times (lines: ${locs.join(", ")}).`,
            filePath: relPath,
            startLine: locs[0],
            endLine: locs[0] + WINDOW - 1,
            codeSnippet: extractSnippet(lines, locs[0] - 1, 0, WINDOW - 1),
            suggestion: "Extract the repeated code into a shared function or variable.",
            fixDiff: "",
            confidence: "low",
          });
        }
      }
    }
  }

  // ---- cp-clean-mixed-quotes (JS/TS — file-level) ----
  if (JS_TS.includes(ext) && fileHasChanges) {
    let singleCount = 0;
    let doubleCount = 0;

    for (const line of lines) {
      if (line.includes("`")) continue;
      singleCount += (line.match(/'[^']*'/g) || []).length;
      doubleCount += (line.match(/"[^"]*"/g) || []).length;
    }

    const total = singleCount + doubleCount;
    if (total >= 10) {
      const minority = Math.min(singleCount, doubleCount);
      if (minority / total > 0.2) {
        findings.push({
          tool: "pattern-scanner",
          ruleId: "cp-clean-mixed-quotes",
          severity: "info",
          category: "code-cleaning",
          title: "[Pattern] Inconsistent quote style",
          description: `File mixes single quotes (${singleCount}) and double quotes (${doubleCount}). Pick one style.`,
          filePath: relPath,
          startLine: 1,
          endLine: 1,
          codeSnippet: `// ${singleCount} single-quoted, ${doubleCount} double-quoted strings`,
          suggestion: `Use ${singleCount > doubleCount ? "single" : "double"} quotes consistently, or configure Prettier.`,
          fixDiff: "",
          confidence: "low",
        });
      }
    }
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/*  Scanner implementation                                            */
/* ------------------------------------------------------------------ */

function ruleAppliesToFile(rule: PatternRule, filePath: string): boolean {
  if (rule.languages.includes("*")) return true;
  const ext = extOf(filePath);
  return rule.languages.includes(ext);
}

/**
 * Scan a single file against all applicable rules.
 *
 * Returns findings filtered to changed line ranges only.
 */
function scanFile(
  relPath: string,
  content: string,
  rules: PatternRule[],
  changedRanges: [number, number][] | undefined,
): StaticFinding[] {
  const findings: StaticFinding[] = [];
  const lines = content.split("\n");

  const applicableRules = rules.filter((r) => ruleAppliesToFile(r, relPath));
  if (applicableRules.length === 0) return findings;

  // ---- Per-line patterns ----
  for (const rule of applicableRules) {
    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1; // 1-based
      const line = lines[i];

      if (!rule.pattern.test(line)) continue;
      // Reset lastIndex for global regexes
      rule.pattern.lastIndex = 0;

      if (!isInChangedLines(lineNumber, changedRanges)) continue;

      // False positive filtering
      if (isFalsePositive({ filePath: relPath, line, rule })) continue;

      const snippet = extractSnippet(lines, i, 1, 1);
      const effectiveSeverity = adjustSeverityForContext(rule.severity, relPath);

      findings.push({
        tool: "pattern-scanner",
        ruleId: rule.id,
        severity: effectiveSeverity,
        category: rule.category,
        title: `[Pattern] ${rule.title}`,
        description: rule.description,
        filePath: relPath,
        startLine: lineNumber,
        endLine: lineNumber,
        codeSnippet: snippet,
        suggestion: rule.suggestion,
        fixDiff: rule.fixFn
          ? rule.fixFn(line.trim())
          : rule.fixTemplate
            ? rule.fixTemplate.replace("$0", line.trim())
            : "",
        confidence: rule.confidence,
      });
    }
  }

  // ---- Multiline patterns ----
  for (const rule of applicableRules) {
    if (!rule.multilinePattern) continue;

    // File-level false positive filtering for multiline rules
    if (rule.id === "cp-clean-callback-hell" && isTestFile(relPath)) continue;
    if (rule.id === "cp-sec-command-injection" && isScriptDir(relPath)) continue;

    // Reset for global regexes
    rule.multilinePattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = rule.multilinePattern.exec(content)) !== null) {
      // Determine the start line of the match
      const textBefore = content.slice(0, match.index);
      const startLine = textBefore.split("\n").length;
      const matchLines = match[0].split("\n").length;
      const endLine = startLine + matchLines - 1;

      if (!rangeOverlaps(startLine, endLine, changedRanges)) continue;

      // Limit snippet length for multiline matches
      const snippetLines = match[0].split("\n");
      const snippet =
        snippetLines.length > 6
          ? [...snippetLines.slice(0, 3), "  ...", ...snippetLines.slice(-2)].join("\n")
          : match[0];

      findings.push({
        tool: "pattern-scanner",
        ruleId: rule.id,
        severity: rule.severity,
        category: rule.category,
        title: `[Pattern] ${rule.title}`,
        description: rule.description,
        filePath: relPath,
        startLine,
        endLine,
        codeSnippet: snippet,
        suggestion: rule.suggestion,
        fixDiff: rule.multilineFixFn
          ? rule.multilineFixFn(match[0])
          : "",
        confidence: rule.confidence,
      });

      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) {
        rule.multilinePattern.lastIndex++;
      }
    }
  }

  // ---- File-level cleaning checks (only when cleaning rules are included) ----
  if (rules.some((r) => r.category === "code-cleaning")) {
    findings.push(...scanFileCleaningChecks(relPath, content, lines, changedRanges));
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/*  Exported ToolRunner                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Test exports                                                       */
/* ------------------------------------------------------------------ */

export type { PatternRule };
export { scanFile as _scanFile, ALL_RULES as _ALL_RULES };
export {
  isTestFile as _isTestFile,
  isDocsFile as _isDocsFile,
  isCommentLine as _isCommentLine,
  isImportLine as _isImportLine,
  isFalsePositive as _isFalsePositive,
  adjustSeverityForContext as _adjustSeverityForContext,
};

/* ------------------------------------------------------------------ */
/*  Exported ToolRunner                                               */
/* ------------------------------------------------------------------ */

export const patternScannerRunner: ToolRunner = {
  name: "pattern-scanner",

  async isAvailable(): Promise<boolean> {
    // Pure TypeScript — always available, no external dependencies.
    return true;
  },

  isRelevant(_changedFiles: string[]): boolean {
    // Patterns cover all common languages — always relevant.
    return true;
  },

  async run(options: ToolRunnerOptions): Promise<StaticFinding[]> {
    const { repoPath, changedFiles, changedLineRanges } = options;

    if (changedFiles.length === 0) return [];

    const allFindings: StaticFinding[] = [];

    // Process files in parallel with a concurrency cap to avoid fd exhaustion.
    const CONCURRENCY = 20;
    const queue = [...changedFiles];

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const relPath = queue.shift();
        if (!relPath) break;

        const absPath = path.resolve(repoPath, relPath);

        let content: string;
        try {
          content = await readFile(absPath, "utf-8");
        } catch {
          // File may have been deleted in the PR — skip silently.
          continue;
        }

        // Skip binary files (heuristic: contains null byte in first 8 KB)
        if (content.slice(0, 8192).includes("\0")) continue;

        // Skip very large files (>500 KB) to avoid perf issues
        if (content.length > 500_000) continue;

        const ranges = changedLineRanges[relPath];
        const findings = scanFile(relPath, content, ALL_RULES, ranges);
        allFindings.push(...findings);
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, changedFiles.length) },
      () => worker(),
    );
    await Promise.all(workers);

    return allFindings;
  },
};
