import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { analyze, analyzeFullScan, createProvider, computeScore, loadConfig, filterByConfig } from "@carapace/engine";
import type { CreateProviderOptions } from "@carapace/engine";
import { formatResult, type FormatOptions } from "../formatter.js";
import { runClean } from "./clean.js";

export interface ScanOptions {
  path: string;
  provider: string;
  model?: string;
  apiKey?: string;
  rulesets: string;
  format: "table" | "json" | "markdown";
  output?: string;
  staticOnly: boolean;
  full: boolean;
  failOn?: string;
  fix: boolean;
}

function getDiff(cwd: string): string {
  // Try unstaged changes first
  try {
    const unstaged = execSync("git diff HEAD", {
      cwd,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (unstaged) return unstaged;
  } catch {
    // not a git repo or no HEAD
  }

  // Try staged changes
  try {
    const staged = execSync("git diff --cached", {
      cwd,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (staged) return staged;
  } catch {
    // ignore
  }

  // Fall back to last commit
  try {
    return execSync("git diff HEAD~1", {
      cwd,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Auto-detect a running Ollama instance and available models.
 */
async function detectOllama(): Promise<{ available: boolean; models: string[] }> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
    });
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return {
      available: true,
      models: data.models?.map((m) => m.name) ?? [],
    };
  } catch {
    return { available: false, models: [] };
  }
}

/**
 * Pick the best Ollama model from available models.
 * Prefers llama3 variants, then any available model.
 */
function pickOllamaModel(models: string[]): string | undefined {
  if (models.length === 0) return undefined;

  // Prefer llama3 variants
  const llama3 = models.find((m) => m.startsWith("llama3"));
  if (llama3) return llama3;

  // Then any codellama
  const codellama = models.find((m) => m.startsWith("codellama"));
  if (codellama) return codellama;

  // Fall back to first model
  return models[0];
}

const VALID_FORMATS = ["table", "json", "markdown"] as const;

export async function runScan(options: ScanOptions): Promise<void> {
  // Validate --format
  if (!VALID_FORMATS.includes(options.format as typeof VALID_FORMATS[number])) {
    process.stderr.write(
      `[carapace] Error: invalid format '${options.format}'. Must be one of: ${VALID_FORMATS.join(", ")}\n`,
    );
    process.exit(1);
  }

  const targetPath = resolve(options.path);
  const config = loadConfig(targetPath);
  const enabledRulesets = config?.rulesets.length
    ? config.rulesets
    : options.rulesets.split(",").map((s) => s.trim());

  // ─── FULL SCAN MODE ──────────────────────────────────────────────
  if (options.full) {
    // Resolve AI provider for full scan
    let providerInstance;
    if (!options.staticOnly) {
      const apiKey = options.apiKey || process.env.CARAPACE_API_KEY;
      const providerName = options.provider as CreateProviderOptions["provider"];

      if (apiKey) {
        // Explicit API key — use the specified provider
        try {
          providerInstance = createProvider({
            provider: providerName,
            apiKey,
            model: options.model,
          });
        } catch {
          process.stderr.write(
            `[carapace] Could not create ${providerName} provider. Running static-only.\n`,
          );
        }
      } else {
        // No API key — try Ollama auto-detection
        const ollama = await detectOllama();
        if (ollama.available && ollama.models.length > 0) {
          const model = options.model || pickOllamaModel(ollama.models);
          process.stderr.write(
            `[carapace] Local engine detected. Using model: ${model}\n`,
          );
          try {
            providerInstance = createProvider({
              provider: "ollama",
              model,
            });
          } catch {
            process.stderr.write("[carapace] Could not connect to local engine. Running static-only.\n");
          }
        } else {
          process.stderr.write(
            "[carapace] No API key configured. Running static-only.\n" +
            "[carapace] For deep analysis, set --api-key or CARAPACE_API_KEY\n",
          );
        }
      }
    }

    const result = await analyzeFullScan({
      targetPath,
      enabledRulesets,
      provider: providerInstance,
      staticOnly: options.staticOnly || !providerInstance,
    });

    const findings = config ? filterByConfig(result.findings, config) : result.findings;
    const score = result.score ?? computeScore(findings);
    const formatOpts: FormatOptions = { format: options.format };
    const output = formatResult(findings, score, formatOpts);

    if (options.output) {
      try {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(resolve(options.output), output);
        process.stderr.write(`[carapace] Report written to ${options.output}\n`);
      } catch (err) {
        process.stderr.write(`[carapace] Error: could not write to ${options.output} — ${(err as Error).message}\n`);
        process.exit(1);
      }
    } else {
      process.stdout.write(output);
      if (options.format === "table") process.stdout.write("\n");
    }

    // Auto-fix if --fix flag is set
    if (options.fix) {
      const fixableCount = findings.filter((f) => f.fixDiff !== "").length;
      if (fixableCount > 0) {
        process.stderr.write(`\n[carapace] --fix: applying ${fixableCount} auto-fixable finding(s)...\n`);
        await runClean({ path: options.path, dryRun: false });
      } else {
        process.stderr.write("\n[carapace] --fix: no auto-fixable findings.\n");
      }
    }

    if (options.failOn) {
      const severityOrder = ["info", "low", "medium", "high", "critical"];
      const thresholdIdx = severityOrder.indexOf(options.failOn);
      if (thresholdIdx >= 0) {
        const hasViolation = findings.some(
          (f) => severityOrder.indexOf(f.severity) >= thresholdIdx,
        );
        if (hasViolation) process.exit(1);
      }
    }

    return;
  }

  // ─── DIFF SCAN MODE (default) ────────────────────────────────────

  // Get diff
  const diff = getDiff(targetPath);
  if (!diff) {
    process.stderr.write("[carapace] No git diff found. Nothing to scan.\n");
    process.exit(0);
  }

  // Create AI provider (unless static-only)
  let providerInstance;
  if (!options.staticOnly) {
    const apiKey = options.apiKey || process.env.CARAPACE_API_KEY;
    const providerName = options.provider as CreateProviderOptions["provider"];

    if (providerName === "ollama" || apiKey) {
      try {
        providerInstance = createProvider({
          provider: providerName,
          apiKey: apiKey,
          model: options.model,
        });
      } catch {
        process.stderr.write(
          `[carapace] Could not create ${providerName} provider. Running static-only.\n`,
        );
      }
    }
  }

  // Run analysis
  const result = await analyze({
    diff,
    enabledRulesets,
    provider: providerInstance,
    repoPath: targetPath,
    staticOnly: options.staticOnly || !providerInstance,
  });

  const diffFindings = config ? filterByConfig(result.findings, config) : result.findings;
  const score = result.score ?? computeScore(diffFindings);

  // Format output
  const formatOpts: FormatOptions = { format: options.format };
  const output = formatResult(diffFindings, score, formatOpts);

  // Write to file or stdout
  if (options.output) {
    try {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(resolve(options.output), output);
      process.stderr.write(`[carapace] Report written to ${options.output}\n`);
    } catch (err) {
      process.stderr.write(`[carapace] Error: could not write to ${options.output} — ${(err as Error).message}\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write(output);
    if (options.format === "table") process.stdout.write("\n");
  }

  // Auto-fix if --fix flag is set
  if (options.fix) {
    const fixableCount = diffFindings.filter((f) => f.fixDiff !== "").length;
    if (fixableCount > 0) {
      process.stderr.write(`\n[carapace] --fix: applying ${fixableCount} auto-fixable finding(s)...\n`);
      await runClean({ path: options.path, dryRun: false });
    } else {
      process.stderr.write("\n[carapace] --fix: no auto-fixable findings.\n");
    }
  }

  // Exit code based on --fail-on
  if (options.failOn) {
    const threshold = options.failOn;
    const severityOrder = ["info", "low", "medium", "high", "critical"];
    const thresholdIdx = severityOrder.indexOf(threshold);

    if (thresholdIdx >= 0) {
      const hasViolation = diffFindings.some(
        (f) => severityOrder.indexOf(f.severity) >= thresholdIdx,
      );
      if (hasViolation) process.exit(1);
    }
  }
}
