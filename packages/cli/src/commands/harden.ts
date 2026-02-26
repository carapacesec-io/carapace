import { resolve } from "node:path";
import { runHarden, applyHardenFix, type HardenSuggestion } from "@carapacesecurity/engine";

export interface HardenOptions {
  path: string;
  apply: boolean;
  format: "table" | "json";
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "\x1b[31m",    // red
  medium: "\x1b[33m",  // yellow
  low: "\x1b[36m",     // cyan
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function formatSuggestion(s: HardenSuggestion, index: number): string {
  const color = SEVERITY_COLORS[s.severity] ?? "";
  const fixTag = s.autoFixable ? ` ${DIM}[auto-fixable]${RESET}` : "";
  const lines: string[] = [
    `${BOLD}${index + 1}. ${s.title}${RESET}${fixTag}`,
    `   ${color}${s.severity.toUpperCase()}${RESET}  ${DIM}${s.id}${RESET}`,
    `   ${DIM}File:${RESET} ${s.filePath}`,
    `   ${s.description}`,
    "",
    `   ${DIM}Suggested fix:${RESET}`,
    ...s.suggestedCode.split("\n").map((line) => `   ${DIM}${line}${RESET}`),
    "",
  ];
  return lines.join("\n");
}

export async function runHardenCommand(options: HardenOptions): Promise<void> {
  const projectPath = resolve(options.path);

  process.stderr.write(`[carapace] Hardening check: ${projectPath}\n`);

  const result = runHarden(projectPath);

  if (result.frameworksDetected.length > 0) {
    process.stderr.write(
      `[carapace] Detected: ${result.frameworksDetected.join(", ")}\n`,
    );
  }

  if (result.suggestions.length === 0) {
    process.stderr.write("[carapace] No hardening suggestions — looking good!\n");
    return;
  }

  // JSON output
  if (options.format === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (options.apply) {
      applyFixable(projectPath, result.suggestions);
    }
    return;
  }

  // Table output
  process.stdout.write("\n");
  process.stdout.write(`${BOLD}Hardening Report${RESET}\n`);
  process.stdout.write(`${DIM}${"─".repeat(60)}${RESET}\n\n`);

  for (let i = 0; i < result.suggestions.length; i++) {
    process.stdout.write(formatSuggestion(result.suggestions[i], i));
    process.stdout.write("\n");
  }

  const highCount = result.suggestions.filter((s) => s.severity === "high").length;
  const medCount = result.suggestions.filter((s) => s.severity === "medium").length;
  const fixableCount = result.suggestions.filter((s) => s.autoFixable).length;

  process.stdout.write(`${DIM}${"─".repeat(60)}${RESET}\n`);
  process.stdout.write(
    `${BOLD}${result.suggestions.length} suggestion(s)${RESET}: ` +
    `${SEVERITY_COLORS.high}${highCount} high${RESET}, ` +
    `${SEVERITY_COLORS.medium}${medCount} medium${RESET}` +
    (fixableCount > 0 ? ` — ${fixableCount} auto-fixable with --apply` : "") +
    "\n\n",
  );

  // Apply if --apply
  if (options.apply) {
    applyFixable(projectPath, result.suggestions);
  }
}

function applyFixable(projectPath: string, suggestions: HardenSuggestion[]): void {
  const fixable = suggestions.filter((s) => s.autoFixable);
  if (fixable.length === 0) {
    process.stderr.write("[carapace] No auto-fixable suggestions.\n");
    return;
  }

  for (const s of fixable) {
    const applied = applyHardenFix(projectPath, s);
    if (applied) {
      process.stderr.write(`[carapace] Applied: ${s.title}\n`);
    } else {
      process.stderr.write(`[carapace] Failed to apply: ${s.title}\n`);
    }
  }
}
