/**
 * Dependency analyzer.
 *
 * Checks for outdated, deprecated, and vulnerable dependencies
 * across Node.js, Rust, and Python ecosystems.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import type { Ecosystem, DepInfo, DepVulnerability, DependencyReport } from "./types.js";
import type { Severity } from "../ai/schemas.js";

const exec = promisify(execFile);

// ── Well-known deprecated packages with replacements ────────────────────

const DEPRECATED_REPLACEMENTS: Record<string, string> = {
  "moment": "dayjs or date-fns",
  "request": "node-fetch or axios or undici",
  "node-uuid": "uuid",
  "node-sass": "sass (dart-sass)",
  "tslint": "eslint with @typescript-eslint",
  "istanbul": "nyc or c8",
  "nomnom": "commander or yargs",
  "colors": "chalk or picocolors",
  "querystring": "URLSearchParams (built-in)",
  "mkdirp": "fs.mkdir with recursive:true (built-in)",
  "rimraf": "fs.rm with recursive:true (built-in)",
  "left-pad": "(built-in String.padStart)",
  "underscore": "lodash-es or native Array methods",
  "bower": "(deprecated, use npm/pnpm)",
  "grunt": "esbuild or tsup or vite",
  "gulp": "esbuild or tsup or vite",
  "browserify": "esbuild or vite or webpack 5",
  "webpack": "esbuild, vite, or rspack (if webpack 4)",
  "create-react-app": "vite or Next.js",
  "@openzeppelin/contracts": "@openzeppelin/contracts (check version for latest)",
  "web3": "viem or ethers v6",
  "ethers": "ethers v6 or viem (if ethers v5)",
  "truffle": "hardhat or foundry",
};

// ── Severity mapping ────────────────────────────────────────────────────

const NPM_SEVERITY_MAP: Record<string, Severity> = {
  critical: "critical",
  high: "high",
  moderate: "medium",
  low: "low",
  info: "info",
};

// ── Node.js dependency analysis ─────────────────────────────────────────

async function analyzeNodeDeps(repoPath: string): Promise<DependencyReport> {
  const pkgPath = path.join(repoPath, "package.json");
  let pkgJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  try {
    const content = await readFile(pkgPath, "utf-8");
    pkgJson = JSON.parse(content);
  } catch {
    return emptyReport("node");
  }

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };

  const depNames = Object.keys(allDeps);
  if (depNames.length === 0) return emptyReport("node");

  const deps: DepInfo[] = [];
  let outdatedCount = 0;
  let deprecatedCount = 0;
  let vulnerableCount = 0;

  // Run npm audit
  let auditResults: Record<string, DepVulnerability[]> = {};
  try {
    const { stdout } = await exec("npm", ["audit", "--json"], {
      cwd: repoPath,
      timeout: 60_000,
      maxBuffer: 20 * 1024 * 1024,
    }).catch((err: any) => ({ stdout: err.stdout ?? "{}", stderr: "" }));

    const auditData = JSON.parse(stdout);
    if (auditData.vulnerabilities) {
      for (const [name, info] of Object.entries(auditData.vulnerabilities) as any) {
        const vulns: DepVulnerability[] = (info.via ?? [])
          .filter((v: any) => typeof v === "object")
          .map((v: any) => ({
            id: v.source?.toString() ?? "unknown",
            severity: NPM_SEVERITY_MAP[v.severity] ?? "medium",
            title: v.title ?? v.name ?? "Unknown vulnerability",
            url: v.url ?? "",
            fixAvailable: !!info.fixAvailable,
            fixVersion: typeof info.fixAvailable === "object" ? info.fixAvailable.version : undefined,
          }));
        if (vulns.length > 0) {
          auditResults[name] = vulns;
        }
      }
    }
  } catch {
    // audit may fail, that's ok
  }

  // Run npm outdated
  let outdatedResults: Record<string, { current: string; latest: string }> = {};
  try {
    const { stdout } = await exec("npm", ["outdated", "--json"], {
      cwd: repoPath,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    }).catch((err: any) => ({ stdout: err.stdout ?? "{}", stderr: "" }));

    outdatedResults = JSON.parse(stdout);
  } catch {
    // outdated may fail
  }

  // Build dep info
  for (const name of depNames) {
    const version = allDeps[name].replace(/^[\^~>=<]/, "");
    const outdated = outdatedResults[name];
    const vulns = auditResults[name] ?? [];

    // Check version distance
    let majorsBehind = 0;
    if (outdated?.latest) {
      const currentMajor = parseInt(version.split(".")[0]) || 0;
      const latestMajor = parseInt(outdated.latest.split(".")[0]) || 0;
      majorsBehind = Math.max(0, latestMajor - currentMajor);
    }

    const isDeprecated = name in DEPRECATED_REPLACEMENTS;
    const isOutdated = !!outdated || majorsBehind > 0;

    if (isOutdated) outdatedCount++;
    if (isDeprecated) deprecatedCount++;
    if (vulns.length > 0) vulnerableCount++;

    deps.push({
      name,
      currentVersion: version,
      latestVersion: outdated?.latest ?? version,
      isOutdated,
      isDeprecated,
      majorsBehind,
      vulnerabilities: vulns,
      replacement: DEPRECATED_REPLACEMENTS[name],
    });
  }

  // Sort: vulnerable first, then deprecated, then outdated, then by name
  deps.sort((a, b) => {
    if (a.vulnerabilities.length !== b.vulnerabilities.length)
      return b.vulnerabilities.length - a.vulnerabilities.length;
    if (a.isDeprecated !== b.isDeprecated) return a.isDeprecated ? -1 : 1;
    if (a.majorsBehind !== b.majorsBehind) return b.majorsBehind - a.majorsBehind;
    return a.name.localeCompare(b.name);
  });

  return {
    ecosystem: "node",
    totalDeps: depNames.length,
    outdatedCount,
    deprecatedCount,
    vulnerableCount,
    deps,
  };
}

// ── Rust dependency analysis ────────────────────────────────────────────

async function analyzeRustDeps(repoPath: string): Promise<DependencyReport> {
  const cargoPath = path.join(repoPath, "Cargo.toml");
  try {
    await access(cargoPath);
  } catch {
    return emptyReport("rust");
  }

  const deps: DepInfo[] = [];
  let vulnerableCount = 0;

  // Run cargo audit if available
  try {
    const { stdout } = await exec("cargo", ["audit", "--json"], {
      cwd: repoPath,
      timeout: 60_000,
      maxBuffer: 20 * 1024 * 1024,
    }).catch((err: any) => ({ stdout: err.stdout ?? '{"vulnerabilities":{"list":[]}}', stderr: "" }));

    const auditData = JSON.parse(stdout);
    const vulnList = auditData?.vulnerabilities?.list ?? [];

    for (const vuln of vulnList) {
      const name = vuln.advisory?.package ?? "unknown";
      const existing = deps.find((d) => d.name === name);

      const vulnInfo: DepVulnerability = {
        id: vuln.advisory?.id ?? "unknown",
        severity: (vuln.advisory?.cvss?.severity?.toLowerCase() ?? "medium") as Severity,
        title: vuln.advisory?.title ?? "Unknown vulnerability",
        url: vuln.advisory?.url ?? "",
        fixAvailable: !!vuln.versions?.patched?.length,
        fixVersion: vuln.versions?.patched?.[0],
      };

      if (existing) {
        existing.vulnerabilities.push(vulnInfo);
      } else {
        vulnerableCount++;
        deps.push({
          name,
          currentVersion: vuln.package?.version ?? "unknown",
          latestVersion: vuln.versions?.patched?.[0] ?? "unknown",
          isOutdated: true,
          isDeprecated: false,
          majorsBehind: 0,
          vulnerabilities: [vulnInfo],
        });
      }
    }
  } catch {
    // cargo audit may not be installed
  }

  return {
    ecosystem: "rust",
    totalDeps: deps.length,
    outdatedCount: 0,
    deprecatedCount: 0,
    vulnerableCount,
    deps,
  };
}

// ── Python dependency analysis ──────────────────────────────────────────

async function analyzePythonDeps(repoPath: string): Promise<DependencyReport> {
  // Check for requirements.txt or pyproject.toml
  let hasPython = false;
  for (const f of ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"]) {
    try {
      await access(path.join(repoPath, f));
      hasPython = true;
      break;
    } catch { /* continue */ }
  }
  if (!hasPython) return emptyReport("python");

  const deps: DepInfo[] = [];
  let vulnerableCount = 0;

  // Run pip-audit if available
  try {
    const { stdout } = await exec(
      "pip-audit",
      ["-r", path.join(repoPath, "requirements.txt"), "--format", "json"],
      { cwd: repoPath, timeout: 60_000, maxBuffer: 20 * 1024 * 1024 },
    ).catch((err: any) => ({ stdout: err.stdout ?? "[]", stderr: "" }));

    const results = JSON.parse(stdout);
    for (const item of results) {
      if (item.vulns && item.vulns.length > 0) {
        vulnerableCount++;
        deps.push({
          name: item.name,
          currentVersion: item.version ?? "unknown",
          latestVersion: item.fix_versions?.[0] ?? "unknown",
          isOutdated: true,
          isDeprecated: false,
          majorsBehind: 0,
          vulnerabilities: item.vulns.map((v: any) => ({
            id: v.id ?? "unknown",
            severity: "high" as Severity,
            title: v.description ?? "Unknown vulnerability",
            url: v.fix_versions?.[0] ? "" : "",
            fixAvailable: !!v.fix_versions?.length,
            fixVersion: v.fix_versions?.[0],
          })),
        });
      }
    }
  } catch {
    // pip-audit may not be installed
  }

  return {
    ecosystem: "python",
    totalDeps: deps.length,
    outdatedCount: 0,
    deprecatedCount: 0,
    vulnerableCount,
    deps,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function emptyReport(ecosystem: Ecosystem): DependencyReport {
  return {
    ecosystem,
    totalDeps: 0,
    outdatedCount: 0,
    deprecatedCount: 0,
    vulnerableCount: 0,
    deps: [],
  };
}

// ── Main ────────────────────────────────────────────────────────────────

/**
 * Analyze all dependencies in a repo across detected ecosystems.
 */
export async function analyzeDependencies(
  repoPath: string,
  ecosystems: Ecosystem[],
): Promise<DependencyReport> {
  // Run analyzers for all detected ecosystems in parallel
  const reports = await Promise.all(
    ecosystems.map(async (eco) => {
      switch (eco) {
        case "node": return analyzeNodeDeps(repoPath);
        case "rust": return analyzeRustDeps(repoPath);
        case "python": return analyzePythonDeps(repoPath);
        default: return emptyReport(eco);
      }
    }),
  );

  // Merge into single report (primary ecosystem first)
  const merged: DependencyReport = {
    ecosystem: ecosystems[0],
    totalDeps: 0,
    outdatedCount: 0,
    deprecatedCount: 0,
    vulnerableCount: 0,
    deps: [],
  };

  for (const report of reports) {
    merged.totalDeps += report.totalDeps;
    merged.outdatedCount += report.outdatedCount;
    merged.deprecatedCount += report.deprecatedCount;
    merged.vulnerableCount += report.vulnerableCount;
    merged.deps.push(...report.deps);
  }

  return merged;
}
