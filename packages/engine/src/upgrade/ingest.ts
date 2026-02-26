/**
 * Repo ingestion and project understanding.
 *
 * Clones a repo, walks the file tree, detects ecosystem/framework,
 * and builds a structured summary of the project.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat, readFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type {
  Ecosystem,
  Framework,
  ProjectFile,
  ProjectSummary,
} from "./types.js";

const exec = promisify(execFile);

// ── Language detection ──────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript",
  ".sol": "solidity", ".vy": "vyper",
  ".rs": "rust",
  ".py": "python",
  ".go": "go",
  ".java": "java", ".kt": "kotlin",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".c": "c", ".cpp": "cpp", ".h": "c-header",
  ".css": "css", ".scss": "scss", ".less": "less",
  ".html": "html", ".vue": "vue", ".svelte": "svelte",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
  ".md": "markdown", ".mdx": "mdx",
  ".sql": "sql",
  ".sh": "shell", ".bash": "shell",
  ".dockerfile": "docker", ".dockerignore": "docker",
};

// ── Ignore patterns ─────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "target",
  "__pycache__", ".venv", "venv", ".tox", "vendor",
  ".cache", ".turbo", "coverage", ".nyc_output",
  "artifacts", "typechain-types", "cache",
]);

const IGNORE_FILES = new Set([
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  "Cargo.lock", "poetry.lock", "Pipfile.lock",
]);

// ── File walking ────────────────────────────────────────────────────────

async function walkDir(
  dir: string,
  root: string,
  files: ProjectFile[],
  maxFiles: number = 5000,
): Promise<void> {
  if (files.length >= maxFiles) return;

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (files.length >= maxFiles) return;

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      await walkDir(path.join(dir, entry.name), root, files, maxFiles);
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath);
      const ext = path.extname(entry.name).toLowerCase();
      const language = EXT_TO_LANG[ext] ?? "other";

      // Skip binary files and very large files
      const fstat = await stat(fullPath).catch(() => null);
      if (!fstat || fstat.size > 1_000_000) continue; // Skip files > 1MB

      // Count lines for code files
      let lineCount = 0;
      if (language !== "other") {
        try {
          const content = await readFile(fullPath, "utf-8");
          lineCount = content.split("\n").length;
        } catch {
          lineCount = 0;
        }
      }

      files.push({
        path: relPath,
        language,
        sizeBytes: fstat.size,
        lineCount,
      });
    }
  }
}

// ── Ecosystem detection ────────────────────────────────────────────────

function detectEcosystems(
  files: ProjectFile[],
  configFiles: string[],
): Ecosystem[] {
  const ecosystems = new Set<Ecosystem>();

  if (configFiles.some((f) => f === "package.json" || f === "pnpm-workspace.yaml"))
    ecosystems.add("node");
  if (configFiles.some((f) => f === "Cargo.toml"))
    ecosystems.add("rust");
  if (configFiles.some((f) => ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"].includes(f)))
    ecosystems.add("python");
  if (configFiles.some((f) => f === "go.mod"))
    ecosystems.add("go");
  if (files.some((f) => f.language === "solidity"))
    ecosystems.add("solidity");

  if (ecosystems.size === 0) ecosystems.add("unknown");
  return [...ecosystems];
}

function detectFramework(files: ProjectFile[], configFiles: string[]): Framework {
  const fileNames = new Set(files.map((f) => f.path));
  const configSet = new Set(configFiles);

  // Check config files for framework indicators
  if (fileNames.has("next.config.ts") || fileNames.has("next.config.js") || fileNames.has("next.config.mjs"))
    return "nextjs";
  if (fileNames.has("anchor.toml") || configSet.has("Anchor.toml"))
    return "anchor";
  if (fileNames.has("hardhat.config.ts") || fileNames.has("hardhat.config.js"))
    return "hardhat";
  if (fileNames.has("foundry.toml"))
    return "foundry";
  if (fileNames.has("truffle-config.js"))
    return "truffle";
  if (configSet.has("nest-cli.json") || files.some((f) => f.path.includes("@nestjs")))
    return "nestjs";
  if (fileNames.has("manage.py"))
    return "django";
  if (files.some((f) => f.path.includes("flask")))
    return "flask";
  if (files.some((f) => f.path.includes("fastapi")))
    return "fastapi";

  // Check for React (without Next.js)
  if (files.some((f) => f.language === "typescript" || f.language === "javascript")) {
    // Rough check
    if (files.some((f) => f.path.includes("src/App.tsx") || f.path.includes("src/App.jsx")))
      return "react";
  }

  // Express detection via common patterns
  if (files.some((f) => f.path.includes("express") || f.path.includes("app.ts") || f.path.includes("server.ts")))
    return "express";

  return "unknown";
}

function findConfigFiles(files: ProjectFile[]): string[] {
  const configs = [
    "package.json", "tsconfig.json", "pnpm-workspace.yaml",
    "Cargo.toml", "rust-toolchain.toml",
    "pyproject.toml", "requirements.txt", "setup.py", "Pipfile",
    "go.mod", "go.sum",
    "hardhat.config.ts", "hardhat.config.js", "foundry.toml",
    "truffle-config.js", "anchor.toml", "Anchor.toml",
    "next.config.ts", "next.config.js", "next.config.mjs",
    "nest-cli.json", "angular.json", "vue.config.js", "svelte.config.js",
    ".eslintrc.js", ".eslintrc.json", "eslint.config.js",
    ".prettierrc", ".prettierrc.json", "prettier.config.js",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".github/workflows", ".gitlab-ci.yml", "Jenkinsfile",
    "turbo.json", "nx.json", "lerna.json",
  ];

  return files
    .filter((f) => configs.some((c) => f.path === c || f.path.endsWith(`/${c}`)))
    .map((f) => f.path);
}

function findEntryPoints(files: ProjectFile[], framework: Framework): string[] {
  const entries: string[] = [];
  const paths = files.map((f) => f.path);

  // Framework-specific entry points
  switch (framework) {
    case "nextjs":
      entries.push(...paths.filter((p) => p.includes("app/page.") || p.includes("pages/index.")));
      entries.push(...paths.filter((p) => p.includes("app/layout.")));
      break;
    case "express":
    case "fastify":
      entries.push(...paths.filter((p) => /^src\/(index|app|server|main)\.(ts|js)$/.test(p)));
      break;
    case "hardhat":
    case "foundry":
    case "truffle":
      entries.push(...paths.filter((p) => p.includes("contracts/") && p.endsWith(".sol")));
      break;
    case "anchor":
      entries.push(...paths.filter((p) => p.includes("programs/") && p.endsWith("lib.rs")));
      break;
    default:
      entries.push(...paths.filter((p) => /^(src\/)?(index|main|app)\.(ts|js|py|rs|go)$/.test(p)));
  }

  return entries.slice(0, 10);
}

// ── Main ────────────────────────────────────────────────────────────────

/**
 * Clone a repo and build a project summary.
 * Returns the cloned path and project summary.
 */
export async function ingestRepo(
  repoUrl: string,
  branch?: string,
): Promise<{ repoPath: string; summary: ProjectSummary }> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "vex-upgrade-"));

  // Clone
  const cloneArgs = ["clone", "--depth", "50", repoUrl, tmpDir];
  if (branch) {
    cloneArgs.splice(2, 0, "--branch", branch);
  }

  await exec("git", cloneArgs, {
    timeout: 120_000,
    maxBuffer: 200 * 1024 * 1024,
  });

  // Extract repo name
  const repoName = repoUrl
    .replace(/\.git$/, "")
    .split("/")
    .pop() ?? "unknown";

  // Walk file tree
  const files: ProjectFile[] = [];
  await walkDir(tmpDir, tmpDir, files);

  // Analyze
  const configFiles = findConfigFiles(files);
  const ecosystems = detectEcosystems(files, configFiles);
  const framework = detectFramework(files, configFiles);
  const entryPoints = findEntryPoints(files, framework);

  const hasTests = files.some(
    (f) =>
      f.path.includes("test/") ||
      f.path.includes("tests/") ||
      f.path.includes("__tests__/") ||
      f.path.includes(".test.") ||
      f.path.includes(".spec."),
  );

  const hasCI = files.some(
    (f) =>
      f.path.includes(".github/workflows") ||
      f.path.includes(".gitlab-ci") ||
      f.path.includes("Jenkinsfile") ||
      f.path.includes(".circleci"),
  );

  // File count by language
  const filesByLanguage: Record<string, number> = {};
  for (const f of files) {
    filesByLanguage[f.language] = (filesByLanguage[f.language] ?? 0) + 1;
  }

  const totalLines = files.reduce((sum, f) => sum + f.lineCount, 0);

  const summary: ProjectSummary = {
    name: repoName,
    description: "", // Will be filled by AI later
    ecosystem: ecosystems[0],
    framework,
    ecosystems,
    totalFiles: files.length,
    totalLines,
    filesByLanguage,
    entryPoints,
    configFiles,
    hasTests,
    hasCI,
    files,
  };

  return { repoPath: tmpDir, summary };
}

/**
 * Read a file's content from the cloned repo.
 */
export async function readRepoFile(
  repoPath: string,
  filePath: string,
): Promise<string> {
  const fullPath = path.join(repoPath, filePath);
  return readFile(fullPath, "utf-8");
}

/**
 * Read multiple files (up to maxSize total).
 */
export async function readRepoFiles(
  repoPath: string,
  filePaths: string[],
  maxTotalSize: number = 500_000,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let totalSize = 0;

  for (const fp of filePaths) {
    if (totalSize >= maxTotalSize) break;
    try {
      const content = await readRepoFile(repoPath, fp);
      if (totalSize + content.length <= maxTotalSize) {
        result[fp] = content;
        totalSize += content.length;
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return result;
}
