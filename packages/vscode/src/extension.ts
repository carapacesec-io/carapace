import * as vscode from "vscode";
import { runScan } from "./scanner";
import { findingsToDiagnostics, clearFixStore, makeFixKey, getFixData } from "./diagnostics";

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
  diagnosticCollection =
    vscode.languages.createDiagnosticCollection("carapace");
  context.subscriptions.push(diagnosticCollection);

  // Command: Scan workspace
  context.subscriptions.push(
    vscode.commands.registerCommand("carapace.scan", () => {
      const wsFolder = vscode.workspace.workspaceFolders?.[0];
      if (!wsFolder) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return;
      }
      doScan(wsFolder.uri.fsPath);
    })
  );

  // Command: Scan current file
  context.subscriptions.push(
    vscode.commands.registerCommand("carapace.scanFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active file.");
        return;
      }
      const wsFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (!wsFolder) {
        vscode.window.showErrorMessage("File is not in a workspace.");
        return;
      }
      doScan(wsFolder.uri.fsPath);
    })
  );

  // Command: Fix all in current file
  context.subscriptions.push(
    vscode.commands.registerCommand("carapace.fixFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active file.");
        return;
      }
      const diags = diagnosticCollection.get(editor.document.uri);
      if (!diags || diags.length === 0) {
        vscode.window.showInformationMessage("No Carapace findings to fix.");
        return;
      }
      await applyAllFixes(editor.document.uri, diags);
    })
  );

  // Scan on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
      const config = vscode.workspace.getConfiguration("carapace");
      if (!config.get<boolean>("scanOnSave", true)) return;

      const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
      if (!wsFolder) return;

      doScan(wsFolder.uri.fsPath);
    })
  );

  // Code action provider for applying fixes
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new CarapaceFixProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );
}

async function doScan(workspacePath: string) {
  const config = vscode.workspace.getConfiguration("carapace");
  const staticOnly = config.get<boolean>("staticOnly", true);
  const minSeverity = config.get<string>("failSeverity", "info");

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Carapace: Scanning...",
      cancellable: false,
    },
    async () => {
      try {
        const result = await runScan(workspacePath, staticOnly);

        diagnosticCollection.clear();
        clearFixStore();

        const diagMap = findingsToDiagnostics(
          result.findings,
          workspacePath,
          minSeverity
        );

        for (const [uri, diags] of diagMap) {
          diagnosticCollection.set(uri, diags);
        }

        const count = result.findings.length;
        const fixable = result.findings.filter(f => f.fixDiff && f.fixDiff !== "").length;
        const fixMsg = fixable > 0 ? ` (${fixable} auto-fixable)` : "";
        vscode.window.showInformationMessage(
          `Carapace: ${count} finding${count !== 1 ? "s" : ""}${fixMsg} (${result.grade} — ${result.score}/100)`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Carapace scan failed: ${msg}`);
      }
    }
  );
}

async function applyAllFixes(uri: vscode.Uri, diags: readonly vscode.Diagnostic[]) {
  const edit = new vscode.WorkspaceEdit();
  let fixCount = 0;

  // Collect all fixes, sort by start line descending to avoid offset issues
  const fixes: Array<{ range: vscode.Range; replacement: string; ruleId: string }> = [];

  for (const diag of diags) {
    if (diag.source !== "carapace") continue;
    const ruleId = typeof diag.code === "string" ? diag.code : "";
    const startLine = diag.range.start.line + 1; // back to 1-based
    const key = makeFixKey(uri, startLine, ruleId);
    const fixData = getFixData(key);
    if (!fixData) continue;

    fixes.push({
      range: diag.range,
      replacement: fixData.fixDiff,
      ruleId,
    });
  }

  // Sort descending by start line (apply bottom-to-top)
  fixes.sort((a, b) => b.range.start.line - a.range.start.line);

  for (const fix of fixes) {
    const fullRange = new vscode.Range(
      fix.range.start.line, 0,
      fix.range.end.line + 1, 0
    );

    if (fix.replacement === "" || fix.replacement === "__DELETE_LINE__") {
      edit.delete(uri, fullRange);
    } else {
      // Get the document to preserve indentation
      const doc = await vscode.workspace.openTextDocument(uri);
      const originalLine = doc.lineAt(fix.range.start.line).text;
      const leadingWs = originalLine.match(/^(\s*)/)?.[1] ?? "";
      const replacementLines = fix.replacement.split("\n").map(l => leadingWs + l);
      edit.replace(uri, fullRange, replacementLines.join("\n") + "\n");
    }
    fixCount++;
  }

  if (fixCount > 0) {
    await vscode.workspace.applyEdit(edit);
    vscode.window.showInformationMessage(`Carapace: Applied ${fixCount} fix${fixCount !== 1 ? "es" : ""}.`);
  }
}

class CarapaceFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    let fixableCount = 0;

    for (const diag of context.diagnostics) {
      if (diag.source !== "carapace") continue;

      const ruleId = typeof diag.code === "string" ? diag.code : "";
      const startLine = diag.range.start.line + 1; // back to 1-based
      const key = makeFixKey(document.uri, startLine, ruleId);
      const fixData = getFixData(key);

      if (!fixData) continue;
      fixableCount++;

      const isDelete = fixData.fixDiff === "" || fixData.fixDiff === "__DELETE_LINE__";
      const actionTitle = isDelete
        ? `Remove: ${fixData.title} (${ruleId})`
        : `Fix: ${fixData.title} (${ruleId})`;

      const action = new vscode.CodeAction(
        actionTitle,
        vscode.CodeActionKind.QuickFix
      );
      action.diagnostics = [diag];
      action.isPreferred = true;

      // Build the workspace edit
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        diag.range.start.line, 0,
        diag.range.end.line + 1, 0
      );

      if (isDelete) {
        edit.delete(document.uri, fullRange);
      } else {
        const originalLine = document.lineAt(diag.range.start.line).text;
        const leadingWs = originalLine.match(/^(\s*)/)?.[1] ?? "";
        const replacementLines = fixData.fixDiff.split("\n").map(l => leadingWs + l);
        edit.replace(document.uri, fullRange, replacementLines.join("\n") + "\n");
      }

      action.edit = edit;
      actions.push(action);
    }

    // Add "Fix All" action if multiple fixes available
    if (fixableCount > 1) {
      const fixAll = new vscode.CodeAction(
        `Fix all Carapace issues (${fixableCount})`,
        vscode.CodeActionKind.QuickFix
      );
      fixAll.command = {
        command: "carapace.fixFile",
        title: "Fix all Carapace issues in file",
      };
      actions.push(fixAll);
    }

    return actions;
  }
}

export function deactivate() {
  diagnosticCollection?.dispose();
}
