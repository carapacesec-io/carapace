/**
 * File discovery for full-codebase scanning.
 *
 * Two strategies:
 *   1. Git repo: use `git ls-files` (fast, respects .gitignore)
 *   2. Non-git: walk directories, skip common non-source dirs
 */

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveredFile {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  language: string;
}

export interface DiscoverOptions {
  maxFiles?: number;
  maxFileSizeKB?: number;
  /** Glob patterns to ignore (from .carapace.yml) */
  ignore?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".sol",
  ".java", ".rb", ".php",
  ".c", ".cpp", ".h", ".hpp",
  ".sh", ".bash",
  ".yaml", ".yml", ".json", ".toml", ".tf",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage",
  "__pycache__", "vendor", ".next", "target",
  ".cache", ".turbo", ".output", "out",
  ".venv", "venv", "env",
]);

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".sol": "solidity",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
  ".sh": "shell", ".bash": "shell",
  ".yaml": "yaml", ".yml": "yaml",
  ".json": "json",
  ".toml": "toml",
  ".tf": "terraform",
};

// Priority directories — files here come first when capping at maxFiles
const PRIORITY_DIRS = ["src", "lib", "app", "packages", "contracts"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * Simple glob matcher for ignore patterns.
 * Supports: *, **, directory names, and file globs like "*.min.js"
 */
function matchesIgnore(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Exact directory name match (e.g., "node_modules", "dist")
    const segments = relPath.split("/");
    if (segments.some((s) => s === pattern)) return true;

    // Glob with * (e.g., "*.min.js", "*.bundle.js")
    if (pattern.startsWith("*")) {
      const suffix = pattern.slice(1); // e.g., ".min.js"
      if (relPath.endsWith(suffix)) return true;
    }

    // Path prefix match (e.g., "tests/", "vendor/")
    const cleanPattern = pattern.replace(/\/$/, "");
    if (relPath.startsWith(cleanPattern + "/") || relPath === cleanPattern) return true;

    // ** glob (e.g., "**/*.test.ts")
    if (pattern.includes("**")) {
      const regStr = pattern
        .replace(/\*\*/g, ".*")
        .replace(/(?<!\.)(\*)/g, "[^/]*")
        .replace(/\./g, "\\.");
      if (new RegExp(`^${regStr}$`).test(relPath)) return true;
    }
  }
  return false;
}

function isBinary(absolutePath: string): boolean {
  try {
    const buf = Buffer.alloc(512);
    const fd = require("node:fs").openSync(absolutePath, "r");
    const bytesRead = require("node:fs").readSync(fd, buf, 0, 512, 0);
    require("node:fs").closeSync(fd);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getLang(filePath: string): string {
  return EXT_TO_LANG[extname(filePath).toLowerCase()] ?? "unknown";
}

// ---------------------------------------------------------------------------
// Git-based discovery
// ---------------------------------------------------------------------------

function discoverViaGit(
  targetPath: string,
  maxFileSizeKB: number,
): DiscoveredFile[] {
  const raw = execSync("git ls-files --cached --others --exclude-standard", {
    cwd: targetPath,
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  if (!raw) return [];

  const files: DiscoveredFile[] = [];

  for (const line of raw.split("\n")) {
    const rel = line.trim();
    if (!rel || !isSourceFile(rel)) continue;

    const abs = join(targetPath, rel);

    try {
      const stat = statSync(abs);
      if (!stat.isFile()) continue;
      if (stat.size > maxFileSizeKB * 1024) continue;
      if (stat.size === 0) continue;
      if (isBinary(abs)) continue;

      files.push({
        relativePath: rel,
        absolutePath: abs,
        sizeBytes: stat.size,
        language: getLang(rel),
      });
    } catch {
      // File disappeared or unreadable — skip
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Walk-based discovery (non-git repos)
// ---------------------------------------------------------------------------

function discoverViaWalk(
  targetPath: string,
  maxFileSizeKB: number,
): DiscoveredFile[] {
  const files: DiscoveredFile[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        const abs = join(dir, entry.name);
        const rel = relative(targetPath, abs);

        if (!isSourceFile(rel)) continue;

        try {
          const stat = statSync(abs);
          if (stat.size > maxFileSizeKB * 1024) continue;
          if (stat.size === 0) continue;
          if (isBinary(abs)) continue;

          files.push({
            relativePath: rel,
            absolutePath: abs,
            sizeBytes: stat.size,
            language: getLang(rel),
          });
        } catch {
          // skip
        }
      }
    }
  }

  walk(targetPath);
  return files;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover all source files in a project.
 *
 * Uses `git ls-files` if available (fast, respects .gitignore), otherwise
 * walks the directory tree skipping common non-source directories.
 */
export function discoverFiles(
  targetPath: string,
  opts?: DiscoverOptions,
): DiscoveredFile[] {
  const maxFiles = opts?.maxFiles ?? 500;
  const maxFileSizeKB = opts?.maxFileSizeKB ?? 100;
  const ignorePatterns = opts?.ignore ?? [];

  let files: DiscoveredFile[];

  // Try git first
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: targetPath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    files = discoverViaGit(targetPath, maxFileSizeKB);
  } catch {
    files = discoverViaWalk(targetPath, maxFileSizeKB);
  }

  // Apply ignore patterns from config
  if (ignorePatterns.length > 0) {
    files = files.filter((f) => !matchesIgnore(f.relativePath, ignorePatterns));
  }

  // If over limit, prioritize src/lib/app dirs
  if (files.length > maxFiles) {
    const priority: DiscoveredFile[] = [];
    const rest: DiscoveredFile[] = [];

    for (const f of files) {
      const topDir = f.relativePath.split("/")[0];
      if (PRIORITY_DIRS.includes(topDir)) {
        priority.push(f);
      } else {
        rest.push(f);
      }
    }

    files = [...priority, ...rest].slice(0, maxFiles);
  }

  return files;
}
