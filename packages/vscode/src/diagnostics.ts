import * as vscode from "vscode";
import type { ScanFinding } from "./scanner";

const SEVERITY_MAP: Record<string, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error,
  high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning,
  low: vscode.DiagnosticSeverity.Information,
  info: vscode.DiagnosticSeverity.Hint,
};

const SEVERITY_THRESHOLD_ORDER = ["info", "low", "medium", "high", "critical"];

export interface FixData {
  fixDiff: string;
  startLine: number;
  endLine: number;
  ruleId: string;
  title: string;
}

/** Module-level store: diagnostic key → fix data */
const fixStore = new Map<string, FixData>();

export function makeFixKey(uri: vscode.Uri, startLine: number, ruleId: string): string {
  return `${uri.toString()}:${startLine}:${ruleId}`;
}

export function getFixData(key: string): FixData | undefined {
  return fixStore.get(key);
}

export function clearFixStore(): void {
  fixStore.clear();
}

/**
 * Convert scan findings to VS Code diagnostics, grouped by file URI.
 * Also populates the fix store for findings with non-empty fixDiff.
 */
export function findingsToDiagnostics(
  findings: ScanFinding[],
  workspacePath: string,
  minSeverity: string
): Map<vscode.Uri, vscode.Diagnostic[]> {
  const map = new Map<vscode.Uri, vscode.Diagnostic[]>();
  const minIdx = SEVERITY_THRESHOLD_ORDER.indexOf(minSeverity);

  for (const f of findings) {
    const sevIdx = SEVERITY_THRESHOLD_ORDER.indexOf(f.severity);
    if (sevIdx < minIdx) continue;

    const uri = vscode.Uri.file(
      workspacePath + "/" + f.filePath
    );

    const start = Math.max(0, (f.startLine ?? 1) - 1);
    const end = Math.max(start, (f.endLine ?? f.startLine ?? 1) - 1);
    const range = new vscode.Range(start, 0, end, Number.MAX_SAFE_INTEGER);

    const severity = SEVERITY_MAP[f.severity] ?? vscode.DiagnosticSeverity.Information;

    const diag = new vscode.Diagnostic(
      range,
      `${f.title}\n${f.description}`,
      severity
    );
    diag.source = "carapace";
    diag.code = f.ruleId;

    const arr = map.get(uri) ?? [];
    arr.push(diag);
    map.set(uri, arr);

    // Store fix data for fixable findings
    if (f.fixDiff && f.fixDiff !== "") {
      const key = makeFixKey(uri, f.startLine, f.ruleId);
      fixStore.set(key, {
        fixDiff: f.fixDiff,
        startLine: f.startLine,
        endLine: f.endLine,
        ruleId: f.ruleId,
        title: f.title,
      });
    }
  }

  return map;
}
