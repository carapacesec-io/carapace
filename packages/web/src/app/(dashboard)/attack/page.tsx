"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ScanType = "RECON" | "AUTH_AUDIT" | "API_SCAN" | "FULL_PENTEST";

interface Finding {
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence: string;
  remediation: string;
}

interface ScanResult {
  scanId: string;
  target: string;
  findings: Finding[];
  summary: string;
}

const scanTypes: { value: ScanType; label: string; description: string }[] = [
  { value: "RECON", label: "Recon", description: "Passive reconnaissance — headers, CORS, TLS, tech fingerprinting" },
  { value: "AUTH_AUDIT", label: "Auth Audit", description: "Authentication and session management analysis" },
  { value: "API_SCAN", label: "API Scan", description: "IDOR, mass assignment, broken auth, data exposure" },
  { value: "FULL_PENTEST", label: "Full Pentest", description: "Comprehensive scan — recon + auth + API + injection testing" },
];

const severityColors: Record<string, string> = {
  CRITICAL: "text-red-400 bg-red-500/10 border-red-500/20",
  HIGH: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  MEDIUM: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  LOW: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  INFO: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
};

export default function AttackPage() {
  const [target, setTarget] = useState("");
  const [scanType, setScanType] = useState<ScanType>("RECON");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    if (!target) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const endpoint = scanType === "RECON" ? "/api/attack/recon" : "/api/attack/scan";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, scanType }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Scan failed (${response.status})`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Attack Scanner</h1>
        <p className="text-muted-foreground mt-1">
          Run offensive security scans against your targets
        </p>
      </div>

      {/* Target input */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle>Target</CardTitle>
          <CardDescription>
            Enter a URL to scan. Only public targets are allowed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <input
              type="url"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
            <Button
              onClick={runScan}
              disabled={loading || !target}
              className="bg-zinc-100 hover:bg-white text-zinc-900 border-0"
            >
              {loading ? "Scanning..." : "Run scan"}
            </Button>
          </div>

          {/* Scan type selector */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {scanTypes.map((st) => (
              <button
                key={st.value}
                onClick={() => setScanType(st.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  scanType === st.value
                    ? "border-zinc-500 bg-zinc-800"
                    : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <p className="text-sm font-medium text-zinc-100">{st.label}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{st.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="bg-red-950/30 border-red-900">
          <CardContent className="pt-6">
            <p className="text-sm text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Findings ({result.findings.length})
            </h2>
            <Link href={`/attack/${result.scanId}`}>
              <Button variant="outline" size="sm" className="border-zinc-800 text-zinc-300">
                View full report
              </Button>
            </Link>
          </div>

          {result.findings.length === 0 ? (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardContent className="pt-6">
                <p className="text-sm text-zinc-400">No findings. Target appears to have good security posture.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {result.findings.map((finding, i) => (
                <Card key={i} className="bg-zinc-950 border-zinc-800">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider mt-0.5 ${severityColors[finding.severity] ?? severityColors.INFO}`}>
                        {finding.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-100">{finding.title}</p>
                        <p className="text-xs text-zinc-400 mt-1">{finding.description}</p>
                        {finding.evidence && (
                          <pre className="mt-2 rounded bg-zinc-900 border border-zinc-800 p-2 text-[11px] font-mono text-zinc-400 overflow-x-auto">
                            {finding.evidence}
                          </pre>
                        )}
                        {finding.remediation && (
                          <p className="mt-2 text-xs text-zinc-400">{finding.remediation}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
