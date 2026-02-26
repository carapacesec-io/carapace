#!/usr/bin/env node

import { runScan, type ScanOptions } from "./commands/scan.js";
import { runRules } from "./commands/rules.js";
import { runInit, type InitOptions } from "./commands/init.js";
import { runClean, type CleanOptions } from "./commands/clean.js";
import { runRewrite, type RewriteOptions } from "./commands/rewrite.js";
import { runBulk, type BulkOptions } from "./commands/bulk.js";
import { runHardenCommand, type HardenOptions } from "./commands/harden.js";

const VERSION = "0.3.0";

function printHelp(): void {
  process.stdout.write(`
\x1b[36mcarapace\x1b[0m — security scanner & code cleaner
\x1b[2mv${VERSION}\x1b[0m

\x1b[1mUSAGE\x1b[0m
  carapace scan [path]              Scan a directory (default: .)
  carapace scan [path] --full       Scan entire codebase (not just git changes)
  carapace clean [path]             Auto-fix code issues (default: .)
  carapace rewrite [path]           AI-powered code rewrite
  carapace init [path]              Set up Carapace in a project
  carapace harden [path]             Check for missing security controls
  carapace bulk                      Bulk scan repos from various sources
  carapace rules                    List all rules with CWE/OWASP tags
  carapace version                  Print version

\x1b[1mSCAN OPTIONS\x1b[0m
  --full                       Scan entire codebase (not just git changes)
  --fix                        Auto-fix all fixable findings after scan
  --api-key <key>              Carapace API key (or set CARAPACE_API_KEY env var)
  --rulesets <list>            Comma-separated: general,attack,quality,solidity (default: general,attack,quality)
  --format <fmt>               Output: table, json, markdown (default: table)
  --output <file>              Write report to file
  --static-only                Static analysis only, skip deep scan
  --fail-on <severity>         Exit 1 if findings >= severity (critical, high, medium, low)

\x1b[1mCLEAN OPTIONS\x1b[0m
  --dry-run                    Show what would change without modifying files
  --severity <level>           Only fix findings >= severity (default: all)
  --interactive                Approve each fix individually (y/n/a/q)
  --undo                       Restore files from last clean backup

\x1b[1mHARDEN OPTIONS\x1b[0m
  --apply                        Auto-fix applicable suggestions (tsconfig strict)
  --format <fmt>                 Output: table, json (default: table)

\x1b[1mBULK OPTIONS\x1b[0m
  --source <type>                Source: github-trending, github-search, github-stars, manual-list
  --name <name>                  Job name (required)
  --language <lang>              Filter by language
  --count <n>                    Number of repos (default: 50)
  --query <q>                    Search query (for github-search source)
  --repos <list>                 Comma-separated repos (for manual-list source)
  --no-poll                      Don't poll for results, exit after starting
  --api-url <url>                API base URL (default: https://carapacesec.io)
  --format <fmt>                 Output: table, json, csv (default: table)
  --output <file>                Write results to file

\x1b[1mREWRITE OPTIONS\x1b[0m
  --provider <name>            AI provider: ollama, anthropic, openai (default: ollama)
  --model <name>               Model name
  --api-key <key>              API key for the AI provider
  --dry-run                    Show diff without writing files

\x1b[1mRULES OPTIONS\x1b[0m
  --ruleset <name>             Filter by category

\x1b[1mEXAMPLES\x1b[0m
  carapace scan .                                     Scan current directory (git diff)
  carapace scan . --full                              Scan entire codebase
  carapace clean .                                    Fix all auto-fixable issues
  carapace clean . --dry-run                          Preview fixes without writing
  carapace rewrite src/app.ts --dry-run               AI-rewrite a file
  carapace scan . --format json --output report.json  JSON report to file
  carapace scan . --fail-on high                      CI gate on high+ findings
  carapace harden .                                   Check for missing security controls
  carapace harden . --apply                           Auto-fix applicable suggestions
  carapace rules --ruleset solidity                   List Solidity rules
  carapace bulk --source github-trending --count 50   Bulk scan trending repos
  carapace bulk --source manual-list --repos "a/b,c/d" Scan specific repos

\x1b[1mGLOBAL OPTIONS\x1b[0m
  --verbose                    Set log level to debug
  --quiet                      Suppress info/warn output

\x1b[1mENVIRONMENT\x1b[0m
  CARAPACE_API_KEY                  Carapace API key
  CARAPACE_LOG_LEVEL                Log level: debug, info, warn, error, silent

`);
}

const BOOLEAN_FLAGS = new Set([
  "static-only", "full", "help", "version", "skip-hook",
  "dry-run", "fix", "interactive", "undo", "verbose", "quiet",
  "no-poll", "apply",
]);

const KNOWN_FLAGS = new Set([
  ...BOOLEAN_FLAGS,
  "api-key", "rulesets", "format", "output", "fail-on",
  "provider", "model", "severity", "ruleset",
  "source", "language", "count", "query", "repos", "api-url", "name",
]);

export function parseArgs(argv: string[]): { command: string; args: Record<string, string>; positional: string[] } {
  const command = argv[0] || "";
  const args: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      if (!KNOWN_FLAGS.has(key)) {
        process.stderr.write(`[carapace] Warning: unknown flag --${key}\n`);
      }

      if (BOOLEAN_FLAGS.has(key)) {
        args[key] = "true";
      } else {
        if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
          process.stderr.write(`[carapace] Error: --${key} requires a value\n`);
          process.exit(1);
        }
        args[key] = argv[++i] || "";
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      if (key === "h") args["help"] = "true";
      else if (key === "v") args["version"] = "true";
      else args[key] = argv[++i] || "";
    } else {
      positional.push(arg);
    }
  }

  // Handle --verbose / --quiet
  if (args["verbose"] === "true") {
    process.env.CARAPACE_LOG_LEVEL = "debug";
  } else if (args["quiet"] === "true") {
    process.env.CARAPACE_LOG_LEVEL = "error";
  }

  return { command, args, positional };
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs.includes("--help") || rawArgs.includes("-h")) {
    printHelp();
    return;
  }

  if (rawArgs.includes("--version") || rawArgs.includes("-v")) {
    process.stdout.write(`carapace v${VERSION}\n`);
    return;
  }

  const { command, args, positional } = parseArgs(rawArgs);

  switch (command) {
    case "version":
      process.stdout.write(`carapace v${VERSION}\n`);
      break;

    case "rules": {
      runRules(args["ruleset"]);
      break;
    }

    case "init": {
      const initOpts: InitOptions = {
        path: positional[0] || ".",
        skipHook: args["skip-hook"] === "true",
      };
      runInit(initOpts);
      break;
    }

    case "scan": {
      const scanOpts: ScanOptions = {
        path: positional[0] || ".",
        provider: args["provider"] || "ollama",
        model: args["model"],
        apiKey: args["api-key"],
        rulesets: args["rulesets"] || "general,attack,quality",
        format: (args["format"] as ScanOptions["format"]) || "table",
        output: args["output"],
        staticOnly: args["static-only"] === "true",
        full: args["full"] === "true",
        failOn: args["fail-on"],
        fix: args["fix"] === "true",
      };

      await runScan(scanOpts);
      break;
    }

    case "clean": {
      const cleanOpts: CleanOptions = {
        path: positional[0] || ".",
        dryRun: args["dry-run"] === "true",
        severity: args["severity"],
        interactive: args["interactive"] === "true",
        undo: args["undo"] === "true",
      };
      await runClean(cleanOpts);
      break;
    }

    case "rewrite": {
      const rewriteOpts: RewriteOptions = {
        path: positional[0] || ".",
        provider: args["provider"] || "ollama",
        model: args["model"],
        apiKey: args["api-key"],
        dryRun: args["dry-run"] === "true",
      };
      await runRewrite(rewriteOpts);
      break;
    }

    case "harden": {
      const hardenOpts: HardenOptions = {
        path: positional[0] || ".",
        apply: args["apply"] === "true",
        format: (args["format"] as "table" | "json") || "table",
      };
      await runHardenCommand(hardenOpts);
      break;
    }

    case "bulk": {
      const bulkOpts: BulkOptions = {
        source: args["source"] || "",
        apiUrl: args["api-url"] || "https://carapacesec.io",
        apiKey: args["api-key"] || process.env.CARAPACE_API_KEY || "",
        name: args["name"] || "",
        language: args["language"],
        count: args["count"] ? parseInt(args["count"], 10) : 50,
        query: args["query"],
        repos: args["repos"],
        poll: args["no-poll"] !== "true",
        output: args["output"],
        format: args["format"] || "table",
      };
      await runBulk(bulkOpts);
      break;
    }

    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`[carapace] Fatal: ${err}\n`);
  process.exit(1);
});
