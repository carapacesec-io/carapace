import * as cp from "child_process";

export interface ScanFinding {
  severity: string;
  category: string;
  title: string;
  description: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  suggestion: string;
  fixDiff: string;
  ruleId: string;
  confidence: string;
}

export interface ScanResult {
  findings: ScanFinding[];
  score: number;
  grade: string;
}

/**
 * Check if carapace CLI is available.
 */
function checkCarapaceInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = cp.spawn("npx", ["carapace", "version"], {
      shell: true,
      timeout: 10_000,
    });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

/**
 * Run `npx carapace scan` as a child process and parse JSON output.
 */
export function runScan(
  workspacePath: string,
  staticOnly: boolean
): Promise<ScanResult> {
  return new Promise(async (resolve, reject) => {
    const installed = await checkCarapaceInstalled();
    if (!installed) {
      reject(
        new Error(
          "Carapace CLI is not installed. Run `npm install -g @carapacesecurity/cli` or ensure npx can resolve it."
        )
      );
      return;
    }

    const args = [
      "carapace",
      "scan",
      workspacePath,
      "--full",
      "--format",
      "json",
    ];
    if (staticOnly) {
      args.push("--static-only");
    }

    const proc = cp.spawn("npx", args, {
      cwd: workspacePath,
      shell: true,
      timeout: 120_000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout);
        resolve({
          findings: parsed.findings ?? [],
          score: parsed.score ?? 100,
          grade: parsed.grade ?? "A",
        });
      } catch {
        reject(
          new Error(
            `Carapace scan failed (exit ${code}): ${stderr || "Could not parse output"}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start carapace: ${err.message}`));
    });
  });
}
