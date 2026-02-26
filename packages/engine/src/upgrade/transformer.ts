/**
 * AI-powered code transformer.
 *
 * Takes the upgrade plan and original file contents,
 * and generates improved versions of each file.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  UpgradePlan,
  UpgradeItem,
  FileTransform,
  TransformResult,
  ProjectSummary,
  DependencyReport,
} from "./types.js";
import type { AIProvider } from "../ai/provider.js";
import { logger } from "../logger.js";

/**
 * Create a unified diff between two strings.
 */
function createDiff(filePath: string, original: string, updated: string): string {
  const origLines = original.split("\n");
  const newLines = updated.split("\n");

  const diff: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  // Simple line-by-line diff (not optimal but functional)
  let i = 0;
  let j = 0;

  while (i < origLines.length || j < newLines.length) {
    // Find next difference
    const contextStart = i;
    while (i < origLines.length && j < newLines.length && origLines[i] === newLines[j]) {
      i++;
      j++;
    }

    if (i >= origLines.length && j >= newLines.length) break;

    // Found a difference — find extent
    const diffStartOrig = i;
    const diffStartNew = j;

    // Look ahead to find where they sync again
    let syncFound = false;
    for (let lookI = i; lookI < Math.min(origLines.length, i + 50); lookI++) {
      for (let lookJ = j; lookJ < Math.min(newLines.length, j + 50); lookJ++) {
        if (origLines[lookI] === newLines[lookJ]) {
          // Found sync point
          const contextLines = Math.min(3, contextStart);
          const hunkStartOrig = Math.max(0, diffStartOrig - contextLines);
          const hunkStartNew = Math.max(0, diffStartNew - contextLines);

          diff.push(`@@ -${hunkStartOrig + 1},${lookI - hunkStartOrig + 3} +${hunkStartNew + 1},${lookJ - hunkStartNew + 3} @@`);

          // Context before
          for (let c = hunkStartOrig; c < diffStartOrig; c++) {
            diff.push(` ${origLines[c]}`);
          }
          // Removed lines
          for (let c = diffStartOrig; c < lookI; c++) {
            diff.push(`-${origLines[c]}`);
          }
          // Added lines
          for (let c = diffStartNew; c < lookJ; c++) {
            diff.push(`+${newLines[c]}`);
          }
          // Context after
          for (let c = lookI; c < Math.min(origLines.length, lookI + 3); c++) {
            diff.push(` ${origLines[c]}`);
          }

          i = lookI;
          j = lookJ;
          syncFound = true;
          break;
        }
      }
      if (syncFound) break;
    }

    if (!syncFound) {
      // Rest of file changed
      diff.push(`@@ -${diffStartOrig + 1},${origLines.length - diffStartOrig} +${diffStartNew + 1},${newLines.length - diffStartNew} @@`);
      for (let c = diffStartOrig; c < origLines.length; c++) {
        diff.push(`-${origLines[c]}`);
      }
      for (let c = diffStartNew; c < newLines.length; c++) {
        diff.push(`+${newLines[c]}`);
      }
      break;
    }
  }

  return diff.join("\n");
}

/**
 * Transform files according to the upgrade plan.
 *
 * Accepts either an AIProvider or a legacy apiKey string.
 */
export async function transformFiles(
  repoPath: string,
  plan: UpgradePlan,
  summary: ProjectSummary,
  deps: DependencyReport,
  apiKeyOrProvider: string | AIProvider,
  model?: string,
  maxFiles: number = 20,
): Promise<TransformResult> {
  let provider: AIProvider;
  if (typeof apiKeyOrProvider === "string") {
    const { AnthropicProvider } = await import("../ai/providers/anthropic.js");
    provider = new AnthropicProvider(apiKeyOrProvider, model);
  } else {
    provider = apiKeyOrProvider;
  }
  const transforms: FileTransform[] = [];
  const packageChanges: TransformResult["packageChanges"] = {
    update: {},
    remove: [],
    add: {},
  };

  // Group upgrade items by file
  const fileToItems = new Map<string, UpgradeItem[]>();
  for (const item of plan.items) {
    for (const file of item.affectedFiles) {
      const existing = fileToItems.get(file) ?? [];
      existing.push(item);
      fileToItems.set(file, existing);
    }
  }

  // Process package.json dep changes separately
  const depUpdates = plan.items.filter(
    (i) => i.type === "dependency-update" || i.type === "security-fix" || i.type === "deprecation-fix",
  );
  for (const item of depUpdates) {
    const dep = deps.deps.find((d) => item.title.includes(d.name));
    if (dep) {
      if (dep.isDeprecated && dep.replacement) {
        packageChanges!.remove.push(dep.name);
      } else if (dep.latestVersion !== dep.currentVersion) {
        packageChanges!.update[dep.name] = dep.latestVersion;
      }
    }
  }

  // Transform code files (not package.json)
  const codeFiles = [...fileToItems.entries()]
    .filter(([f]) => f !== "package.json")
    .slice(0, maxFiles);

  // Process files with concurrency limit
  const CONCURRENCY = 3;
  for (let i = 0; i < codeFiles.length; i += CONCURRENCY) {
    const batch = codeFiles.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async ([filePath, items]) => {
        try {
          const fullPath = path.join(repoPath, filePath);
          const originalContent = await readFile(fullPath, "utf-8");

          const itemDescriptions = items
            .map((item) => `- [${item.type}] ${item.title}: ${item.description}`)
            .join("\n");

          const response = await provider.complete({
            messages: [
              {
                role: "system",
                content: `You are CodeCleaner Code Transformer. Your job is to improve code files based on an upgrade plan.

RULES:
1. Apply ONLY the changes described in the upgrade items below
2. Preserve all existing functionality — do NOT break things
3. Keep the same code style and conventions
4. If you're unsure about a change, skip it — safety first
5. Return ONLY the complete updated file content, nothing else
6. Do NOT add markdown fences or explanations — just the raw file content`,
              },
              {
                role: "user",
                content: `File: ${filePath}

Upgrade items to apply:
${itemDescriptions}

Original file content:
\`\`\`
${originalContent}
\`\`\`

Return the complete updated file content with the upgrade items applied:`,
              },
            ],
            maxTokens: 8192,
            model,
          });

          const newContent = response.text
            .replace(/^```\w*\s*\n?/m, "")
            .replace(/\n?```\s*$/m, "");

          // Only include if content actually changed
          if (newContent.trim() === originalContent.trim()) return null;

          const diff = createDiff(filePath, originalContent, newContent);

          return {
            filePath,
            originalContent,
            newContent,
            diff,
            upgradeItemIds: items.map((i) => i.id),
            explanation: items.map((i) => i.title).join("; "),
          } as FileTransform;
        } catch (err) {
          logger.error(`[transformer] Failed to transform ${filePath}: ${err}`);
          return null;
        }
      }),
    );

    for (const result of batchResults) {
      if (result) transforms.push(result);
    }
  }

  return {
    transforms,
    filesToDelete: [],
    newFiles: [],
    packageChanges: packageChanges!,
  };
}
