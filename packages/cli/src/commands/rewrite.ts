import { resolve, extname } from "node:path";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import {
  discoverFiles,
  _scanFile,
  _ALL_RULES,
  rewriteFiles,
  createProvider,
  loadConfig,
  filterByConfig,
} from "@carapace/engine";
import type { CreateProviderOptions } from "@carapace/engine";

export interface RewriteOptions {
  path: string;
  provider: string;
  model?: string;
  apiKey?: string;
  dryRun: boolean;
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

function showDiff(filePath: string, original: string, rewritten: string): void {
  const origLines = original.split("\n");
  const newLines = rewritten.split("\n");

  process.stdout.write(`${BOLD}${CYAN}--- ${filePath}${RESET}\n`);

  // Simple line-by-line diff
  const maxLines = Math.max(origLines.length, newLines.length);
  for (let i = 0; i < maxLines; i++) {
    const o = origLines[i];
    const n = newLines[i];
    if (o === n) continue;
    if (o !== undefined && n !== undefined) {
      process.stdout.write(`${RED}- ${o}${RESET}\n`);
      process.stdout.write(`${GREEN}+ ${n}${RESET}\n`);
    } else if (o !== undefined) {
      process.stdout.write(`${RED}- ${o}${RESET}\n`);
    } else if (n !== undefined) {
      process.stdout.write(`${GREEN}+ ${n}${RESET}\n`);
    }
  }
  process.stdout.write("\n");
}

/* ------------------------------------------------------------------ */
/*  Ollama auto-detection (shared with scan)                           */
/* ------------------------------------------------------------------ */

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

function pickOllamaModel(models: string[]): string | undefined {
  if (models.length === 0) return undefined;
  const llama3 = models.find((m) => m.startsWith("llama3"));
  if (llama3) return llama3;
  const codellama = models.find((m) => m.startsWith("codellama"));
  if (codellama) return codellama;
  return models[0];
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export async function runRewrite(options: RewriteOptions): Promise<void> {
  const targetPath = resolve(options.path);
  const config = loadConfig(targetPath);

  process.stderr.write(`${BOLD}${CYAN}carapace rewrite${RESET} ${targetPath}\n`);

  // Resolve AI provider
  let providerInstance;
  const apiKey = options.apiKey || process.env.CARAPACE_API_KEY;
  const providerName = options.provider as CreateProviderOptions["provider"];

  if (apiKey) {
    try {
      providerInstance = createProvider({
        provider: providerName,
        apiKey,
        model: options.model,
      });
    } catch {
      process.stderr.write(
        `[carapace] Could not create ${providerName} provider.\n`,
      );
    }
  } else {
    // Auto-detect Ollama
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
        process.stderr.write("[carapace] Could not connect to local engine.\n");
      }
    }
  }

  if (!providerInstance) {
    process.stderr.write(
      "[carapace] No AI provider available. Rewrite requires an AI provider.\n" +
      "[carapace] Install Ollama (ollama.com) or set --api-key\n",
    );
    process.exit(1);
  }

  // Determine files to rewrite
  interface FileWithFindings {
    filePath: string;
    absolutePath: string;
    content: string;
    findings: Array<{
      ruleId: string;
      severity: string;
      title: string;
      description: string;
      suggestion: string;
      startLine: number;
      endLine: number;
      codeSnippet: string;
      category: string;
      confidence: string;
    }>;
  }

  const filesToRewrite: FileWithFindings[] = [];

  // Check if path is a single file or directory
  let isFile = false;
  try {
    isFile = statSync(targetPath).isFile();
  } catch {
    // directory or doesn't exist
  }

  if (isFile) {
    const content = readFileSync(targetPath, "utf-8");
    const ext = extname(targetPath);
    const relPath = targetPath.split("/").pop() || targetPath;
    let findings = _scanFile(relPath, content, _ALL_RULES, undefined);
    if (config) findings = filterByConfig(findings, config);
    if (findings.length > 0) {
      filesToRewrite.push({
        filePath: relPath,
        absolutePath: targetPath,
        content,
        findings,
      });
    }
  } else {
    const discovered = discoverFiles(targetPath, { maxFiles: 500, ignore: config?.ignore });
    process.stderr.write(`${DIM}Scanning ${discovered.length} files for findings...${RESET}\n`);

    for (const file of discovered) {
      let content: string;
      try {
        content = readFileSync(file.absolutePath, "utf-8");
      } catch {
        continue;
      }
      if (content.slice(0, 8192).includes("\0")) continue;
      if (content.length > 500_000) continue;

      let findings = _scanFile(file.relativePath, content, _ALL_RULES, undefined);
      if (config) findings = filterByConfig(findings, config);
      if (findings.length > 0) {
        filesToRewrite.push({
          filePath: file.relativePath,
          absolutePath: file.absolutePath,
          content,
          findings,
        });
      }
    }
  }

  if (filesToRewrite.length === 0) {
    process.stderr.write(`${GREEN}No findings to rewrite — code is clean.${RESET}\n`);
    return;
  }

  process.stderr.write(
    `${DIM}Rewriting ${filesToRewrite.length} file(s) with AI...${RESET}\n`,
  );

  // Call rewriteFiles
  const results = await rewriteFiles({
    provider: providerInstance,
    files: filesToRewrite.map((f) => ({
      filePath: f.filePath,
      content: f.content,
      findings: f.findings.map((finding) => ({
        ...finding,
        filePath: f.filePath,
      })),
    })),
  });

  let totalChanges = 0;

  for (const result of results) {
    if (result.originalContent === result.rewrittenContent) continue;

    totalChanges += result.changesSummary.length || 1;

    if (options.dryRun) {
      showDiff(result.filePath, result.originalContent, result.rewrittenContent);
      if (result.changesSummary.length > 0) {
        for (const change of result.changesSummary) {
          process.stdout.write(`  ${DIM}- ${change}${RESET}\n`);
        }
        process.stdout.write("\n");
      }
    } else {
      // Find the original file to get the absolute path
      const original = filesToRewrite.find((f) => f.filePath === result.filePath);
      if (original) {
        writeFileSync(original.absolutePath, result.rewrittenContent);
      }
    }
  }

  const mode = options.dryRun ? `${DIM}(dry run)${RESET}` : "";
  process.stderr.write(
    `\n${BOLD}Rewrote ${results.filter((r) => r.originalContent !== r.rewrittenContent).length} file(s) — AI applied ${totalChanges} improvement(s)${RESET} ${mode}\n`,
  );
}
