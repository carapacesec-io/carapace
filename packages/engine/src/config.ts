/**
 * Config loader — reads and validates `.carapace.yml` configuration files.
 * Uses Zod for schema validation with helpful error messages.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { _ALL_RULES } from "./static/pattern-scanner.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CarapaceConfig {
  /** Which rulesets to enable: "general", "quality", "attack", "solidity" */
  rulesets: string[];
  /** Minimum severity to report: "critical", "high", "medium", "low", "info" */
  severity_threshold: string;
  /** Glob patterns of files/dirs to ignore */
  ignore: string[];
  /** Rule IDs to disable: ["cp-qual-todo-fixme", "cp-sec-eval"] */
  disable: string[];
}

const DEFAULT_CONFIG: CarapaceConfig = {
  rulesets: ["general", "attack", "quality"],
  severity_threshold: "info",
  ignore: [],
  disable: [],
};

export const VALID_SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export const VALID_RULESETS = ["general", "attack", "quality", "solidity"] as const;

/* ------------------------------------------------------------------ */
/*  Zod schema                                                         */
/* ------------------------------------------------------------------ */

const carapaceConfigSchema = z.object({
  rulesets: z.array(z.string()).optional(),
  severity_threshold: z.string().optional(),
  ignore: z.array(z.string()).optional(),
  disable: z.array(z.string()).optional(),
}).passthrough();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function didYouMean(input: string, valid: readonly string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of valid) {
    const dist = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/* ------------------------------------------------------------------ */
/*  Loader                                                             */
/* ------------------------------------------------------------------ */

/**
 * Load `.carapace.yml` from the given directory.
 * Returns the parsed config merged with defaults, or null if no config file exists.
 */
export function loadConfig(dir: string): CarapaceConfig | null {
  const configPath = resolve(join(dir, ".carapace.yml"));

  if (!existsSync(configPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    process.stderr.write(
      `[carapace] Warning: could not parse .carapace.yml — ${(err as Error).message}. Using defaults.\n`,
    );
    return { ...DEFAULT_CONFIG };
  }

  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONFIG };

  // Validate shape with Zod
  const result = carapaceConfigSchema.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      process.stderr.write(
        `[carapace] Warning: config validation error — ${issue.path.join(".")}: ${issue.message}\n`,
      );
    }
    return { ...DEFAULT_CONFIG };
  }

  const data = result.data;

  // Warn about unknown top-level keys
  const knownKeys = new Set(["rulesets", "severity_threshold", "ignore", "disable"]);
  for (const key of Object.keys(data)) {
    if (!knownKeys.has(key)) {
      process.stderr.write(`[carapace] Warning: unknown config key '${key}'\n`);
    }
  }

  const config: CarapaceConfig = { ...DEFAULT_CONFIG };

  // rulesets
  if (Array.isArray(data.rulesets)) {
    const valid: string[] = [];
    for (const r of data.rulesets) {
      if (VALID_RULESETS.includes(r as typeof VALID_RULESETS[number])) {
        valid.push(r);
      } else {
        const suggestion = didYouMean(r, VALID_RULESETS);
        const hint = suggestion ? ` — did you mean '${suggestion}'?` : "";
        process.stderr.write(`[carapace] Warning: unknown ruleset '${r}'${hint}\n`);
      }
    }
    if (valid.length > 0) config.rulesets = valid;
  }

  // severity_threshold
  if (data.severity_threshold !== undefined) {
    if (VALID_SEVERITIES.includes(data.severity_threshold as typeof VALID_SEVERITIES[number])) {
      config.severity_threshold = data.severity_threshold;
    } else {
      const suggestion = didYouMean(data.severity_threshold, VALID_SEVERITIES);
      const hint = suggestion ? ` — did you mean '${suggestion}'?` : "";
      process.stderr.write(
        `[carapace] Warning: invalid severity_threshold '${data.severity_threshold}'${hint}. Using default '${DEFAULT_CONFIG.severity_threshold}'.\n`,
      );
    }
  }

  // ignore
  if (Array.isArray(data.ignore)) {
    config.ignore = data.ignore.filter((g): g is string => typeof g === "string");
  }

  // disable — validate rule IDs
  if (Array.isArray(data.disable)) {
    const allRuleIds = new Set(_ALL_RULES.map((r) => r.id));
    const valid: string[] = [];
    for (const d of data.disable) {
      if (typeof d !== "string") continue;
      if (allRuleIds.has(d)) {
        valid.push(d);
      } else {
        process.stderr.write(`[carapace] Warning: unknown rule ID '${d}' in disable list\n`);
      }
    }
    config.disable = valid;
  }

  return config;
}

/**
 * Filter findings by config — removes disabled rules and below-threshold severities.
 */
export function filterByConfig<T extends { ruleId: string; severity: string }>(
  findings: T[],
  config: CarapaceConfig,
): T[] {
  const severityOrder = ["info", "low", "medium", "high", "critical"];
  const thresholdIdx = severityOrder.indexOf(config.severity_threshold);

  return findings.filter((f) => {
    if (config.disable.includes(f.ruleId)) return false;
    if (thresholdIdx > 0 && severityOrder.indexOf(f.severity) < thresholdIdx) return false;
    return true;
  });
}
