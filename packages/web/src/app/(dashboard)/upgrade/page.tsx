"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UpgradeResult {
  project: {
    name: string;
    description: string;
    ecosystem: string;
    framework: string;
    totalFiles: number;
    totalLines: number;
    filesByLanguage: Record<string, number>;
    hasTests: boolean;
    hasCI: boolean;
  };
  dependencies: {
    totalDeps: number;
    outdatedCount: number;
    deprecatedCount: number;
    vulnerableCount: number;
    deps: {
      name: string;
      currentVersion: string;
      latestVersion: string;
      isOutdated: boolean;
      isDeprecated: boolean;
      majorsBehind: number;
      vulnerabilities: { id: string; severity: string; title: string }[];
      replacement?: string;
    }[];
  };
  audit: {
    stats: {
      totalIssues: number;
      bySeverity: Record<string, number>;
      byCategory: Record<string, number>;
    };
    toolsRan: string[];
    issues: {
      category: string;
      severity: string;
      title: string;
      description: string;
      filePath: string;
      startLine: number;
    }[];
  };
  plan: {
    summary: string;
    totalItems: number;
    autoFixableCount: number;
    items: {
      id: string;
      type: string;
      priority: number;
      severity: string;
      title: string;
      description: string;
      affectedFiles: string[];
      risk: string;
      effort: string;
      autoFixable: boolean;
    }[];
  };
  transforms: {
    transforms: {
      filePath: string;
      originalContent: string;
      newContent: string;
      diff: string;
      explanation: string;
    }[];
    filesToDelete?: string[];
    newFiles?: { path: string; content: string }[];
    packageChanges?: {
      update: Record<string, string>;
      remove: string[];
      add: Record<string, string>;
    };
  };
  duration: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  info: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  "security-fix": "Security",
  "dependency-update": "Dependency",
  "bug-fix": "Bug Fix",
  "modernization": "Modernize",
  "performance": "Performance",
  "code-quality": "Quality",
  "deprecation-fix": "Deprecation",
};

export default function UpgradePage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<UpgradeResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "deps" | "audit" | "plan" | "transforms">("overview");
  const [applyLoading, setApplyLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  async function handleCreatePR() {
    if (!result || !repoUrl) return;
    setApplyLoading(true);
    setError("");
    setPrUrl(null);
    try {
      const res = await fetch("/api/upgrade/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          transforms: result.transforms.transforms,
          newFiles: result.transforms.newFiles,
          filesToDelete: result.transforms.filesToDelete,
          packageChanges: result.transforms.packageChanges,
          planSummary: result.plan.summary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create PR");
      setPrUrl(data.prUrl);
    } catch (err: any) {
      setError(err.message ?? "Failed to create PR");
    } finally {
      setApplyLoading(false);
    }
  }

  async function handleDownload() {
    if (!result) return;
    setDownloadLoading(true);
    setError("");
    try {
      const res = await fetch("/api/upgrade/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: result.project.name,
          transforms: result.transforms.transforms.map((t) => ({
            filePath: t.filePath,
            newContent: t.newContent,
          })),
          newFiles: result.transforms.newFiles,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.project.name || "upgraded"}-upgraded.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message ?? "Download failed");
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleUpgrade(planOnly: boolean = false) {
    if (!repoUrl.trim()) return;
    setLoading(true);
    setPhase("Cloning repository...");
    setError("");
    setResult(null);
    setPrUrl(null);

    try {
      const res = await fetch("/api/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl.trim(), planOnly }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upgrade failed");
      }

      const data = await res.json();
      setResult(data);
      setActiveTab("overview");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
      setPhase("");
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Code Upgrade</h1>
        <p className="text-zinc-400 mt-1">
          Paste a GitHub repo URL. We&apos;ll analyze your Solidity contracts, dependencies, and security posture — then generate an upgrade plan with fixes.
        </p>
      </div>

      {/* Input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          onKeyDown={(e) => e.key === "Enter" && handleUpgrade(false)}
        />
        <Button
          onClick={() => handleUpgrade(false)}
          disabled={loading || !repoUrl.trim()}
          className="bg-zinc-100 hover:bg-white text-zinc-900 border-0 px-6"
        >
          {loading ? phase || "Analyzing..." : "Upgrade"}
        </Button>
        <Button
          onClick={() => handleUpgrade(true)}
          disabled={loading || !repoUrl.trim()}
          variant="outline"
          className="border-zinc-700 hover:border-zinc-600"
        >
          Plan Only
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-zinc-800 pb-px">
            {(["overview", "deps", "audit", "plan", "transforms"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab
                    ? "text-zinc-100 border-b-2 border-zinc-100 bg-zinc-800/50"
                    : "text-zinc-500 hover:text-zinc-100"
                }`}
              >
                {tab === "deps" ? "Dependencies" : tab === "transforms" ? "Transforms" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === "audit" && ` (${result.audit.stats.totalIssues})`}
                {tab === "plan" && ` (${result.plan.totalItems})`}
                {tab === "transforms" && ` (${result.transforms.transforms.length})`}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400">Project</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">{result.project.name}</div>
                  <div className="text-xs text-zinc-400 mt-1">
                    {result.project.ecosystem} / {result.project.framework}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {result.project.totalFiles} files, {result.project.totalLines.toLocaleString()} lines
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400">Dependencies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">{result.dependencies.totalDeps}</div>
                  <div className="flex gap-3 mt-1 text-xs">
                    {result.dependencies.vulnerableCount > 0 && (
                      <span className="text-red-400">{result.dependencies.vulnerableCount} vulnerable</span>
                    )}
                    {result.dependencies.deprecatedCount > 0 && (
                      <span className="text-yellow-400">{result.dependencies.deprecatedCount} deprecated</span>
                    )}
                    {result.dependencies.outdatedCount > 0 && (
                      <span className="text-blue-400">{result.dependencies.outdatedCount} outdated</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400">Issues Found</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">{result.audit.stats.totalIssues}</div>
                  <div className="flex gap-3 mt-1 text-xs">
                    {Object.entries(result.audit.stats.bySeverity).map(([sev, count]) => (
                      <span key={sev} className={sev === "critical" ? "text-red-400" : sev === "high" ? "text-orange-400" : "text-zinc-400"}>
                        {count} {sev}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400">Upgrade Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">{result.plan.totalItems} items</div>
                  <div className="text-xs text-zinc-300 mt-1">
                    {result.plan.autoFixableCount} auto-fixable
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {(result.duration / 1000).toFixed(1)}s total
                  </div>
                </CardContent>
              </Card>

              {/* Plan Summary */}
              <div className="md:col-span-2 lg:col-span-4">
                <Card className="bg-zinc-950 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-base">Upgrade Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-400 leading-relaxed">{result.plan.summary}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Dependencies Tab */}
          {activeTab === "deps" && (
            <div className="space-y-3">
              {result.dependencies.deps
                .filter((d) => d.isOutdated || d.isDeprecated || d.vulnerabilities.length > 0)
                .map((dep) => (
                  <div
                    key={dep.name}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{dep.name}</span>
                        {dep.isDeprecated && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            DEPRECATED
                          </span>
                        )}
                        {dep.vulnerabilities.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                            {dep.vulnerabilities.length} CVE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {dep.currentVersion} → {dep.latestVersion}
                        {dep.replacement && <span className="text-yellow-400 ml-2">Replace with: {dep.replacement}</span>}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {dep.majorsBehind > 0 && `${dep.majorsBehind} major${dep.majorsBehind > 1 ? "s" : ""} behind`}
                    </div>
                  </div>
                ))}
              {result.dependencies.deps.filter((d) => d.isOutdated || d.isDeprecated || d.vulnerabilities.length > 0).length === 0 && (
                <div className="text-center py-12 text-zinc-500">All dependencies are up to date.</div>
              )}
            </div>
          )}

          {/* Audit Tab */}
          {activeTab === "audit" && (
            <div className="space-y-3">
              {result.audit.issues.map((issue, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${SEVERITY_COLORS[issue.severity] ?? ""}`}>
                        {issue.severity.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium">{issue.title}</span>
                    </div>
                    {issue.filePath && (
                      <span className="text-xs text-zinc-500 font-mono">
                        {issue.filePath}:{issue.startLine}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{issue.description}</p>
                </div>
              ))}
              {result.audit.issues.length === 0 && (
                <div className="text-center py-12 text-zinc-500">No issues found.</div>
              )}
            </div>
          )}

          {/* Plan Tab */}
          {activeTab === "plan" && (
            <div className="space-y-3">
              {result.plan.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 font-mono w-6">#{item.priority}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${SEVERITY_COLORS[item.severity] ?? ""}`}>
                        {item.severity.toUpperCase()}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {TYPE_LABELS[item.type] ?? item.type}
                      </span>
                      <span className="text-sm font-medium">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.autoFixable && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                          AUTO-FIX
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-500">
                        Risk: {item.risk} / Effort: {item.effort}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{item.description}</p>
                  {item.affectedFiles.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {item.affectedFiles.map((f) => (
                        <span key={f} className="text-[10px] px-2 py-0.5 rounded bg-white/[0.03] text-zinc-500 font-mono">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Transforms Tab */}
          {activeTab === "transforms" && (
            <div className="space-y-4">
              {/* Action Buttons */}
              {result.transforms.transforms.length > 0 && (
                <Card className="bg-zinc-950 border-zinc-800">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <h3 className="text-sm font-semibold">Apply Changes</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Create a PR with all upgrades or download the improved files
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={handleDownload}
                        disabled={downloadLoading}
                        variant="outline"
                        className="border-zinc-700 hover:border-zinc-600"
                      >
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        {downloadLoading ? "Generating..." : "Download Zip"}
                      </Button>
                      <Button
                        onClick={handleCreatePR}
                        disabled={applyLoading}
                        className="bg-zinc-100 hover:bg-white text-zinc-900 border-0"
                      >
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 01.75.75v6.5a.75.75 0 01-1.5 0v-6.5a.75.75 0 01.75-.75zm-2.25 9a.75.75 0 01.75-.75h5a.75.75 0 010 1.5h-5a.75.75 0 01-.75-.75z" />
                          <path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354z" />
                        </svg>
                        {applyLoading ? "Creating PR..." : "Create Pull Request"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* PR Success Message */}
              {prUrl && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Pull Request Created</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Your upgraded code is ready for review</p>
                  </div>
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-zinc-300 hover:text-zinc-100 underline"
                  >
                    View PR on GitHub
                  </a>
                </div>
              )}

              {result.transforms.packageChanges && Object.keys(result.transforms.packageChanges.update).length > 0 && (
                <Card className="bg-zinc-950 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-base">Package Updates</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="font-mono text-xs space-y-1">
                      {Object.entries(result.transforms.packageChanges.update).map(([pkg, ver]) => (
                        <div key={pkg} className="text-green-400">+ &quot;{pkg}&quot;: &quot;{ver}&quot;</div>
                      ))}
                      {result.transforms.packageChanges.remove.map((pkg) => (
                        <div key={pkg} className="text-red-400">- &quot;{pkg}&quot;</div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {result.transforms.transforms.map((t, i) => (
                <Card key={i} className="bg-zinc-950 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-sm font-mono">{t.filePath}</CardTitle>
                    <p className="text-xs text-zinc-400">{t.explanation}</p>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs font-mono overflow-x-auto p-4 rounded-lg bg-zinc-950 border border-zinc-800 max-h-96 overflow-y-auto">
                      {t.diff.split("\n").map((line, j) => (
                        <div
                          key={j}
                          className={
                            line.startsWith("+") && !line.startsWith("+++")
                              ? "text-green-400 bg-green-500/[0.05]"
                              : line.startsWith("-") && !line.startsWith("---")
                              ? "text-red-400 bg-red-500/[0.05]"
                              : line.startsWith("@@")
                              ? "text-blue-400"
                              : "text-zinc-500"
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </pre>
                  </CardContent>
                </Card>
              ))}
              {result.transforms.transforms.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  No code transforms generated. Use &quot;Upgrade&quot; (not &quot;Plan Only&quot;) to generate code changes.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="text-center py-20">
          <div className="text-4xl mb-4 opacity-20">{"</>"}</div>
          <h3 className="text-lg font-medium mb-2">Paste a GitHub repo URL</h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            We&apos;ll clone it, analyze dependencies, run security audits,
            and generate a prioritized upgrade plan with code fixes.
          </p>
        </div>
      )}
    </div>
  );
}
