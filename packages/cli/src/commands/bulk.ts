import { writeFileSync } from "node:fs";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

export interface BulkOptions {
  source: string;
  apiUrl: string;
  apiKey: string;
  name: string;
  language?: string;
  count?: number;
  query?: string;
  repos?: string;
  poll: boolean;
  output?: string;
  format: string;
}

interface BulkScanResponse {
  jobId: string;
  totalRepos: number;
  repos: string[];
}

interface ScanResult {
  id: string;
  repo: string;
  language: string | null;
  status: string;
  score: number | null;
  grade: string | null;
  findings: number;
  duration: number | null;
}

interface JobStatus {
  id: string;
  name: string;
  status: string;
  source: string;
  totalRepos: number;
  completedRepos: number;
  failedRepos: number;
  progress: number;
  createdAt: string;
  completedAt: string | null;
  scans: ScanResult[];
}

function gradeLabel(grade: string | null): string {
  if (!grade) return `${DIM}—${RESET}`;
  if (grade === "A" || grade === "B") return `${GREEN}${grade}${RESET}`;
  if (grade === "C" || grade === "D") return `${YELLOW}${grade}${RESET}`;
  return `${RED}${grade}${RESET}`;
}

function progressBar(completed: number, total: number, width = 30): string {
  const pct = total > 0 ? completed / total : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return `[${GREEN}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET}]`;
}

export async function runBulk(opts: BulkOptions): Promise<void> {
  // Validate
  if (!opts.apiKey) {
    process.stderr.write(`${RED}Error: API key required. Set CARAPACE_API_KEY or use --api-key${RESET}\n`);
    process.exit(1);
  }

  if (!opts.source) {
    process.stderr.write(`${RED}Error: --source is required (github-trending | github-search | github-stars | manual-list)${RESET}\n`);
    process.exit(1);
  }

  if (!opts.name) {
    process.stderr.write(`${RED}Error: --name is required${RESET}\n`);
    process.exit(1);
  }

  const validSources = ["github-trending", "github-search", "github-stars", "manual-list"];
  if (!validSources.includes(opts.source)) {
    process.stderr.write(`${RED}Error: --source must be one of: ${validSources.join(", ")}${RESET}\n`);
    process.exit(1);
  }

  if (opts.source === "github-search" && !opts.query) {
    process.stderr.write(`${RED}Error: --query is required when source is github-search${RESET}\n`);
    process.exit(1);
  }

  if (opts.source === "manual-list" && !opts.repos) {
    process.stderr.write(`${RED}Error: --repos is required when source is manual-list${RESET}\n`);
    process.exit(1);
  }

  // Build request body
  const body: Record<string, unknown> = {
    source: opts.source,
    name: opts.name,
  };
  if (opts.language) body.language = opts.language;
  if (opts.count) body.count = opts.count;
  if (opts.query) body.query = opts.query;
  if (opts.repos) body.repos = opts.repos.split(",").map((r) => r.trim());

  // POST to start bulk scan
  process.stdout.write(`\n${CYAN}${BOLD}carapace bulk scan${RESET}\n`);
  process.stdout.write(`${DIM}Source: ${opts.source} | Name: ${opts.name}${RESET}\n\n`);

  let startResponse: BulkScanResponse;
  try {
    const res = await fetch(`${opts.apiUrl}/api/bulk-scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      process.stderr.write(`${RED}Error: API returned ${res.status}: ${errBody}${RESET}\n`);
      process.exit(1);
    }

    startResponse = (await res.json()) as BulkScanResponse;
  } catch (err) {
    process.stderr.write(`${RED}Error: Failed to connect to ${opts.apiUrl}: ${err}${RESET}\n`);
    process.exit(1);
  }

  process.stdout.write(`${GREEN}Bulk scan started: ${startResponse.totalRepos} repos (job ${startResponse.jobId})${RESET}\n\n`);

  if (!opts.poll) {
    process.stdout.write(`${DIM}Polling disabled. Check status manually:${RESET}\n`);
    process.stdout.write(`  curl -H "Authorization: Bearer $CARAPACE_API_KEY" ${opts.apiUrl}/api/bulk-scan/${startResponse.jobId}\n\n`);
    return;
  }

  // Poll for progress
  let lastStatus: JobStatus | null = null;
  const POLL_INTERVAL = 5000;

  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    try {
      const res = await fetch(`${opts.apiUrl}/api/bulk-scan/${startResponse.jobId}`, {
        headers: { Authorization: `Bearer ${opts.apiKey}` },
      });

      if (!res.ok) {
        process.stderr.write(`${YELLOW}Warning: Poll returned ${res.status}, retrying...${RESET}\n`);
        continue;
      }

      lastStatus = (await res.json()) as JobStatus;
    } catch {
      process.stderr.write(`${YELLOW}Warning: Poll failed, retrying...${RESET}\n`);
      continue;
    }

    const done = lastStatus.completedRepos + lastStatus.failedRepos;
    const currentRepo = lastStatus.scans.find((s) => s.status === "RUNNING")?.repo ?? "";

    // Clear line and print progress
    process.stdout.write(`\r${progressBar(done, lastStatus.totalRepos)} ${done}/${lastStatus.totalRepos}`);
    if (currentRepo) {
      process.stdout.write(` ${DIM}— scanning ${currentRepo}...${RESET}`);
    }
    // Clear rest of line
    process.stdout.write("\x1b[K");

    if (lastStatus.status === "COMPLETED" || lastStatus.status === "FAILED" || done >= lastStatus.totalRepos) {
      process.stdout.write("\n\n");
      break;
    }
  }

  if (!lastStatus) {
    process.stderr.write(`${RED}Error: No status received${RESET}\n`);
    process.exit(1);
  }

  // Print summary
  printSummary(lastStatus, opts);
}

function printSummary(job: JobStatus, opts: BulkOptions): void {
  const completedScans = job.scans.filter((s) => s.status === "COMPLETED");

  if (opts.format === "json") {
    const jsonOutput = JSON.stringify(job, null, 2);
    if (opts.output) {
      writeFileSync(opts.output, jsonOutput, "utf-8");
      process.stdout.write(`${GREEN}Results written to ${opts.output}${RESET}\n`);
    } else {
      process.stdout.write(jsonOutput + "\n");
    }
    return;
  }

  if (opts.format === "csv") {
    const header = "repo,score,grade,findings,status";
    const rows = job.scans.map(
      (s) => `${s.repo},${s.score ?? ""},${s.grade ?? ""},${s.findings},${s.status}`,
    );
    const csvOutput = [header, ...rows].join("\n");
    if (opts.output) {
      writeFileSync(opts.output, csvOutput, "utf-8");
      process.stdout.write(`${GREEN}Results written to ${opts.output}${RESET}\n`);
    } else {
      process.stdout.write(csvOutput + "\n");
    }
    return;
  }

  // Table format (default)
  process.stdout.write(`${BOLD}${CYAN}Bulk Scan Results: ${job.name}${RESET}\n`);
  process.stdout.write(`${DIM}${"─".repeat(70)}${RESET}\n`);

  // Header
  const repoCol = "Repository".padEnd(35);
  const scoreCol = "Score".padStart(6);
  const gradeCol = "Grade".padStart(6);
  const findCol = "Findings".padStart(9);
  const fixCol = "Status".padStart(10);
  process.stdout.write(`${DIM}${repoCol}${scoreCol}${gradeCol}${findCol}${fixCol}${RESET}\n`);
  process.stdout.write(`${DIM}${"─".repeat(70)}${RESET}\n`);

  for (const s of job.scans) {
    const repo = s.repo.length > 33 ? s.repo.slice(0, 30) + "..." : s.repo;
    const score = s.score !== null ? String(s.score).padStart(6) : `${DIM}   —${RESET}  `;
    const grade = gradeLabel(s.grade).padStart(6 + (s.grade ? gradeLabel(s.grade).length - 1 : 3));
    const findings = String(s.findings).padStart(9);
    const status =
      s.status === "COMPLETED"
        ? `${GREEN}${"done".padStart(10)}${RESET}`
        : s.status === "FAILED"
        ? `${RED}${"failed".padStart(10)}${RESET}`
        : `${DIM}${s.status.toLowerCase().padStart(10)}${RESET}`;

    process.stdout.write(`${repo.padEnd(35)}${score}${grade}${findings}${status}\n`);
  }

  process.stdout.write(`${DIM}${"─".repeat(70)}${RESET}\n`);

  // Totals
  const passed = completedScans.filter((s) => s.grade === "A" || s.grade === "B").length;
  const warning = completedScans.filter((s) => s.grade === "C" || s.grade === "D").length;
  const failed = completedScans.filter((s) => s.grade === "F").length;

  process.stdout.write(`\n${BOLD}Summary${RESET}\n`);
  process.stdout.write(`  ${job.totalRepos} scanned, `);
  process.stdout.write(`${GREEN}${passed} passed (A/B)${RESET}, `);
  process.stdout.write(`${YELLOW}${warning} warning (C/D)${RESET}, `);
  process.stdout.write(`${RED}${failed} failed (F)${RESET}\n`);

  if (job.failedRepos > 0) {
    process.stdout.write(`  ${RED}${job.failedRepos} repos failed to scan${RESET}\n`);
  }

  process.stdout.write("\n");

  if (opts.output) {
    // Write table output to file (stripped of ANSI)
    const lines = job.scans.map(
      (s) =>
        `${s.repo.padEnd(35)}${String(s.score ?? "—").padStart(6)}${(s.grade ?? "—").padStart(6)}${String(s.findings).padStart(9)}${s.status.padStart(10)}`,
    );
    const header = `${"Repository".padEnd(35)}${"Score".padStart(6)}${"Grade".padStart(6)}${"Findings".padStart(9)}${"Status".padStart(10)}`;
    const output = [header, "─".repeat(70), ...lines].join("\n");
    writeFileSync(opts.output, output, "utf-8");
    process.stdout.write(`${GREEN}Results written to ${opts.output}${RESET}\n`);
  }
}
