/**
 * Types for the Upgrade pipeline.
 *
 * The upgrade pipeline takes an entire repo, understands it, audits it,
 * and produces a prioritized plan of improvements with code transforms.
 */

import type { Severity } from "../ai/schemas.js";

// ── Project Understanding ──────────────────────────────────────────────

export type Ecosystem = "node" | "rust" | "python" | "solidity" | "go" | "unknown";
export type Framework =
  | "nextjs" | "react" | "express" | "nestjs" | "fastify"
  | "hardhat" | "foundry" | "anchor" | "truffle"
  | "django" | "flask" | "fastapi"
  | "actix" | "rocket"
  | "unknown";

export interface ProjectFile {
  path: string;
  language: string;
  sizeBytes: number;
  lineCount: number;
}

export interface ProjectSummary {
  /** Repo name. */
  name: string;
  /** Short AI-generated description of what the project does. */
  description: string;
  /** Detected primary ecosystem. */
  ecosystem: Ecosystem;
  /** Detected framework. */
  framework: Framework;
  /** All detected ecosystems in the repo. */
  ecosystems: Ecosystem[];
  /** Total files. */
  totalFiles: number;
  /** Total lines of code. */
  totalLines: number;
  /** Files broken down by language. */
  filesByLanguage: Record<string, number>;
  /** Key entry points / main files. */
  entryPoints: string[];
  /** Config files found. */
  configFiles: string[];
  /** Has test directory/files. */
  hasTests: boolean;
  /** Has CI/CD config. */
  hasCI: boolean;
  /** All project files (for reference). */
  files: ProjectFile[];
}

// ── Dependency Analysis ────────────────────────────────────────────────

export interface DepVulnerability {
  id: string;
  severity: Severity;
  title: string;
  url: string;
  fixAvailable: boolean;
  fixVersion?: string;
}

export interface DepInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  isDeprecated: boolean;
  /** Major version behind. */
  majorsBehind: number;
  vulnerabilities: DepVulnerability[];
  /** Suggested replacement (e.g., moment → dayjs). */
  replacement?: string;
}

export interface DependencyReport {
  ecosystem: Ecosystem;
  totalDeps: number;
  outdatedCount: number;
  deprecatedCount: number;
  vulnerableCount: number;
  deps: DepInfo[];
}

// ── Codebase Audit ─────────────────────────────────────────────────────

export type IssueCategory =
  | "security"
  | "deprecated-pattern"
  | "dead-code"
  | "anti-pattern"
  | "performance"
  | "type-safety"
  | "error-handling"
  | "modernization";

export interface AuditIssue {
  category: IssueCategory;
  severity: Severity;
  title: string;
  description: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  /** Source: "static" (tool) or "ai" (LLM). */
  source: "static" | "ai";
  tool?: string;
}

export interface AuditReport {
  issues: AuditIssue[];
  /** Which static tools ran. */
  toolsRan: string[];
  /** Summary stats. */
  stats: {
    totalIssues: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

// ── Upgrade Plan ───────────────────────────────────────────────────────

export type UpgradeType =
  | "dependency-update"
  | "security-fix"
  | "bug-fix"
  | "modernization"
  | "performance"
  | "code-quality"
  | "deprecation-fix";

export interface UpgradeItem {
  id: string;
  type: UpgradeType;
  priority: number; // 1 = highest
  severity: Severity;
  title: string;
  description: string;
  /** Files that need to change. */
  affectedFiles: string[];
  /** Risk level of this change. */
  risk: "low" | "medium" | "high";
  /** Estimated effort. */
  effort: "trivial" | "small" | "medium" | "large";
  /** Whether this can be auto-fixed. */
  autoFixable: boolean;
}

export interface UpgradePlan {
  /** AI-generated summary of the overall upgrade strategy. */
  summary: string;
  /** Total items in the plan. */
  totalItems: number;
  /** Items grouped and prioritized. */
  items: UpgradeItem[];
  /** Items that can be auto-fixed. */
  autoFixableCount: number;
}

// ── Code Transform ─────────────────────────────────────────────────────

export interface FileTransform {
  /** Path to the file. */
  filePath: string;
  /** Original content. */
  originalContent: string;
  /** New content after transform. */
  newContent: string;
  /** Unified diff. */
  diff: string;
  /** Which upgrade items this addresses. */
  upgradeItemIds: string[];
  /** Explanation of changes. */
  explanation: string;
}

export interface TransformResult {
  transforms: FileTransform[];
  /** Files to delete. */
  filesToDelete: string[];
  /** New files to create. */
  newFiles: { path: string; content: string }[];
  /** Package.json changes (deps to update/remove/add). */
  packageChanges?: {
    update: Record<string, string>;
    remove: string[];
    add: Record<string, string>;
  };
}

// ── Full Pipeline Result ───────────────────────────────────────────────

export interface UpgradeResult {
  project: ProjectSummary;
  dependencies: DependencyReport;
  audit: AuditReport;
  plan: UpgradePlan;
  transforms: TransformResult;
  /** Total time in ms. */
  duration: number;
}

// ── Pipeline Options ───────────────────────────────────────────────────

export interface UpgradeOptions {
  /** GitHub repo URL or local path. */
  repoUrl: string;
  /** Branch to analyze (default: main/master). */
  branch?: string;
  /** Pluggable AI provider. Takes precedence over apiKey. */
  provider?: import("../ai/provider.js").AIProvider;
  /** AI API key for intelligent analysis. Optional — static-only without it. */
  apiKey?: string;
  /** AI model to use. */
  model?: string;
  /** Skip AI analysis entirely (static tools only). */
  staticOnly?: boolean;
  /** Skip code transforms (analysis + plan only). */
  planOnly?: boolean;
  /** Max files to transform (to control cost). */
  maxTransformFiles?: number;
}
