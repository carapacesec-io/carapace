import { NextRequest, NextResponse } from "next/server";
import { _scanFile, _ALL_RULES, computeScore } from "@carapacesecurity/engine";
import type { Finding } from "@carapacesecurity/engine";

/* Simple in-memory rate limiter: 5 scans per minute per IP */
const rateMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 5;
}

/** Does the input look like actual structured source code?
 *  Requires at least 2 distinct code signals to avoid false positives
 *  on random text that happens to contain a stray bracket or semicolon. */
function looksLikeCode(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 10) return false;

  let signals = 0;

  // Paired brackets/parens (opening AND closing)
  if (/[{([]/.test(trimmed) && /[})\]]/.test(trimmed)) signals++;

  // Assignment or comparison operators
  if (/[^=!<>]=[^=]/.test(trimmed) || /===?|!==?/.test(trimmed)) signals++;

  // Language keywords
  if (/\b(?:function|class|import|export|const|let|var|def|return|if|for|while|struct|fn|pub|async|pragma|require|module|package|from|new|try|catch|switch|case)\b/.test(trimmed)) signals++;

  // Function calls (identifier followed by parens)
  if (/\w+\s*\([^)]*\)/.test(trimmed)) signals++;

  // Comments
  if (/\/\/|\/\*|#\s/.test(trimmed)) signals++;

  // String literals
  if (/["'`][^"'`]+["'`]/.test(trimmed)) signals++;

  // Indented block structure (2+ indented lines)
  const indentedLines = trimmed.split("\n").filter((l) => /^\s{2,}\S/.test(l));
  if (indentedLines.length >= 2) signals++;

  // Need at least 2 different signals — a stray semicolon alone isn't code
  return signals >= 2;
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: ".js",
  typescript: ".ts",
  python: ".py",
  go: ".go",
  java: ".java",
  ruby: ".rb",
  php: ".php",
  solidity: ".sol",
  rust: ".rs",
};

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limited — try again in a minute" },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { code, language } = body as { code?: string; language?: string };

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid `code` field" },
        { status: 400 }
      );
    }

    if (code.length > 50_000) {
      return NextResponse.json(
        { error: "Code too large (max 50 KB)" },
        { status: 400 }
      );
    }

    if (!looksLikeCode(code)) {
      return NextResponse.json({
        findings: [],
        score: null,
        grade: null,
        breakdown: null,
        warning: "This doesn't look like source code. Paste a code snippet to scan.",
      });
    }

    const ext = LANGUAGE_EXTENSIONS[language ?? "javascript"] ?? ".js";
    const fakePath = `playground${ext}`;

    // Run pattern scanner directly on the code string — no disk I/O
    const staticFindings = _scanFile(fakePath, code, _ALL_RULES, undefined);

    // Convert to engine Finding format for scoring
    const engineFindings: Finding[] = staticFindings.map((f) => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      filePath: f.filePath,
      startLine: f.startLine,
      endLine: f.endLine,
      codeSnippet: f.codeSnippet,
      suggestion: f.suggestion,
      fixDiff: f.fixDiff,
      ruleId: f.ruleId,
    }));

    const scoreResult = computeScore(engineFindings);

    return NextResponse.json({
      findings: staticFindings.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        category: f.category,
        title: f.title,
        description: f.description,
        startLine: f.startLine,
        endLine: f.endLine,
        codeSnippet: f.codeSnippet,
        suggestion: f.suggestion,
        fixDiff: f.fixDiff,
        confidence: f.confidence,
      })),
      score: scoreResult.score,
      grade: scoreResult.grade,
      breakdown: scoreResult.breakdown,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to analyze code" },
      { status: 500 }
    );
  }
}
