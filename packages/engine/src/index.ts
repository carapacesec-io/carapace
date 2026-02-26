// ---------------------------------------------------------------------------
// @carapace/engine
//
// AI-powered code review engine. Shared by the web worker and GitHub Action.
// ---------------------------------------------------------------------------

// Parsers
export {
  parseDiff,
  type ParsedDiff,
  type DiffFile,
  type DiffHunk,
  type DiffChange,
  type ChangeType,
  type FileStatus,
} from "./parsers/diff-parser.js";

export {
  classifyFile,
  type FileClassification,
  type Language,
  type Chain,
} from "./parsers/file-classifier.js";

export {
  splitIntoChunks,
  type DiffChunk,
} from "./parsers/chunk-splitter.js";

// AI
export { AIClient, type AnalyzeCodeParams, type AnalyzeFileParams } from "./ai/client.js";
export { getSystemPrompt } from "./ai/prompts.js";
export {
  FindingSchema,
  ReviewResultSchema,
  SecurityScoreSchema,
  SeveritySchema,
  type Finding,
  type ReviewResult,
  type SecurityScoreOutput,
  type Severity,
} from "./ai/schemas.js";

// AI Providers
export type { AIProvider, AIMessage, AICompleteParams, AICompleteResult } from "./ai/provider.js";
export {
  createProvider,
  type CreateProviderOptions,
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
  MockProvider,
} from "./ai/providers/index.js";

// Rules
export {
  getAllRules,
  getRulesForChains,
  type Rule,
} from "./rules/registry.js";

export {
  CWE_OWASP_MAP,
  getCweOwasp,
  type CweOwaspEntry,
} from "./rules/cwe-mapping.js";

export {
  computeScore,
  type SecurityScore,
} from "./scoring.js";

export { solidityRules } from "./rules/crypto/solidity.js";
export { generalRules } from "./rules/general/index.js";
export { reconRules, authRules, injectionRules, apiRules } from "./rules/attack/index.js";
export { complexityRules, namingRules, deadCodeRules, gasRules, bestPracticeRules } from "./rules/quality/index.js";

// Formatters
export {
  formatAsReviewComments,
  type GitHubReviewComment,
} from "./formatters/github.js";

export {
  generateMarkdownReport,
  type ReportOptions,
} from "./formatters/markdown-report.js";

// Static analysis
export {
  runStaticAnalysis,
  formatStaticFindingsForAI,
  type StaticAnalysisOptions,
  type StaticAnalysisResult,
} from "./static/runner.js";

export type {
  StaticFinding,
  ToolRunner,
  ToolRunnerOptions,
} from "./static/types.js";

export { slitherRunner } from "./static/slither.js";
export { semgrepRunner } from "./static/semgrep.js";
export { gitleaksRunner } from "./static/gitleaks.js";
export { patternScannerRunner, _scanFile, _ALL_RULES, type PatternRule } from "./static/pattern-scanner.js";

// Upgrade pipeline
export { runUpgrade } from "./upgrade/pipeline.js";
export { ingestRepo, readRepoFile, readRepoFiles } from "./upgrade/ingest.js";
export { analyzeDependencies } from "./upgrade/deps.js";
export { auditCodebase } from "./upgrade/audit.js";
export { generateUpgradePlan, generateFallbackPlan } from "./upgrade/planner.js";
export { transformFiles } from "./upgrade/transformer.js";

export type {
  Ecosystem,
  Framework,
  ProjectFile,
  ProjectSummary,
  DepInfo,
  DepVulnerability,
  DependencyReport,
  IssueCategory,
  AuditIssue,
  AuditReport,
  UpgradeType,
  UpgradeItem,
  UpgradePlan,
  FileTransform,
  TransformResult,
  UpgradeResult,
  UpgradeOptions,
} from "./upgrade/types.js";

// Fixers
export {
  applyFixes,
  validateFixedSyntax,
  type FileFixInput,
  type FileFixResult,
  type ApplyFixesResult,
} from "./fixers/apply-fixes.js";

// Rewriter
export {
  rewriteFile,
  rewriteFiles,
  type RewriteResult,
} from "./ai/rewriter.js";

// Config
export { loadConfig, filterByConfig, type CarapaceConfig } from "./config.js";

// Logger
export { logger } from "./logger.js";

// Main orchestrator
export { analyze, dedupeFindings, type AnalyzeParams } from "./analyzer.js";

// Full-codebase scan
export { analyzeFullScan, type FullScanParams } from "./full-scan.js";
export { discoverFiles, type DiscoveredFile, type DiscoverOptions } from "./full-scan-discovery.js";
