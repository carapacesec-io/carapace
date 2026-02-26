"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

/* ── Types ─────────────────────────────────────────────── */

interface PlaygroundFinding {
  ruleId: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  suggestion: string;
  fixDiff: string;
  confidence: string;
}

interface ScanResult {
  findings: PlaygroundFinding[];
  score: number | null;
  grade: string | null;
  breakdown: Record<string, { count: number; deducted: number }> | null;
  warning?: string;
}

/* ── Constants ─────────────────────────────────────────── */

const VULNERABLE_CODE = `const API_KEY = "sk_live_a1b2c3d4e5f6g7h8i9j0";

async function getUser(req, res) {
  const id = req.params.id;
  const query = \`SELECT * FROM users WHERE id = \${id}\`;
  const result = await db.query(query);
  console.log("User data:", result);
  const data = eval(req.body.filter);
  res.json(result);
}`;

const FIXED_CODE = `async function getUser(req, res) {
  const id = req.params.id;
  const result = await db.query(
    "SELECT id, name, email FROM users WHERE id = $1",
    [id]
  );
  if (!result) return res.status(404).json({ error: "Not found" });
  res.json(result);
}`;

const FIXED_LINES = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

const CWE_MAP: Record<string, string[]> = {
  "cp-sql-injection": ["CWE-89"],
  "cp-hardcoded-secret": ["CWE-798"],
  "cp-eval-usage": ["CWE-95"],
  "cp-console-log": [],
  "cp-weak-hash": ["CWE-328"],
  "cp-xss-innerhtml": ["CWE-79"],
  "cp-command-injection": ["CWE-78"],
  "cp-open-redirect": ["CWE-601"],
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-400 text-white",
  medium: "bg-amber-400 text-white",
  low: "bg-blue-400 text-white",
  info: "bg-zinc-400 text-white",
};

const GRADE_COLORS: Record<string, { text: string; border: string; bg: string }> = {
  A: { text: "text-emerald-400", border: "border-emerald-400", bg: "bg-emerald-400" },
  B: { text: "text-blue-400", border: "border-blue-400", bg: "bg-blue-400" },
  C: { text: "text-amber-400", border: "border-amber-400", bg: "bg-amber-400" },
  D: { text: "text-orange-400", border: "border-orange-400", bg: "bg-orange-400" },
  F: { text: "text-red-400", border: "border-red-400", bg: "bg-red-400" },
};

/* ── x402 Constants ───────────────────────────────────── */

const X402_DEMO_STEPS = [
  {
    cmd: "$ curl -X POST https://api.carapace.dev/api/v1/review \\",
    cmdLine2: '    -H "Content-Type: application/json" -d \'{"diff": "..."}\'',
    response: JSON.stringify(
      {
        error: "Payment Required",
        x402: {
          version: "1",
          price: "$0.02",
          network: "eip155:8453",
          facilitatorUrl: "https://x402.org/facilitator",
          walletAddress: "0x9A7f...85EF",
        },
      },
      null,
      2,
    ),
    status: "HTTP 402 Payment Required",
    statusColor: "text-red-400",
  },
  {
    cmd: '$ x402 pay --price "$0.02" --network base --to 0x9A7f...85EF',
    cmdLine2: undefined as string | undefined,
    response: "Payment confirmed.\ntx: 0x8f3a...c21d  (Base mainnet)",
    status: "Payment Settled",
    statusColor: "text-emerald-400",
  },
  {
    cmd: "$ curl -X POST https://api.carapace.dev/api/v1/review \\",
    cmdLine2: '    -H "x-payment: <token>" -d \'{"diff": "..."}\'',
    response: JSON.stringify(
      {
        score: 42,
        grade: "F",
        findings: [
          { severity: "critical", title: "SQL Injection", ruleId: "cp-sql-injection" },
          { severity: "critical", title: "Hardcoded Secret", ruleId: "cp-hardcoded-secret" },
        ],
        totalFindings: 4,
      },
      null,
      2,
    ),
    status: "HTTP 200 OK",
    statusColor: "text-emerald-400",
  },
];

const X402_PRICING = [
  { endpoint: "/api/v1/review", price: "$0.02", desc: "Code review & scan" },
  { endpoint: "/api/attack/recon", price: "$0.01", desc: "Reconnaissance scan" },
  { endpoint: "/api/attack/scan", price: "$0.03", desc: "Full attack scan" },
  { endpoint: "/api/upgrade", price: "$0.05", desc: "Repo upgrade" },
];

/* ── Harden Constants ────────────────────────────────── */

const HARDEN_SUGGESTIONS = [
  {
    id: "harden-missing-helmet",
    title: "Express app without helmet() middleware",
    severity: "HIGH",
    severityColor: "text-red-400",
    severityBg: "bg-red-500/15",
    file: "src/app.ts",
    description: "helmet() sets security-related HTTP headers (X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options, etc.).",
    fix: 'import helmet from "helmet";\napp.use(helmet());',
  },
  {
    id: "harden-missing-rate-limit",
    title: "No rate limiting on authentication routes",
    severity: "HIGH",
    severityColor: "text-red-400",
    severityBg: "bg-red-500/15",
    file: "src/routes/auth.ts",
    description: "Authentication endpoints without rate limiting are vulnerable to brute-force and credential-stuffing attacks.",
    fix: 'import rateLimit from "express-rate-limit";\nconst authLimiter = rateLimit({\n  windowMs: 15 * 60 * 1000,\n  max: 10,\n});\napp.use("/auth", authLimiter);',
  },
  {
    id: "harden-missing-csrf",
    title: "Express app without CSRF protection",
    severity: "MEDIUM",
    severityColor: "text-amber-400",
    severityBg: "bg-amber-500/15",
    file: "src/app.ts",
    description: "State-changing endpoints without CSRF protection allow attackers to forge requests on behalf of authenticated users.",
    fix: 'import { doubleCsrf } from "csrf-csrf";\napp.use(doubleCsrfProtection);',
  },
  {
    id: "harden-missing-csp",
    title: "No Content-Security-Policy headers",
    severity: "HIGH",
    severityColor: "text-red-400",
    severityBg: "bg-red-500/15",
    file: "src/app.ts",
    description: "CSP prevents XSS, clickjacking, and code injection attacks by controlling which resources the browser loads.",
    fix: 'res.setHeader(\n  "Content-Security-Policy",\n  "default-src \'self\'; script-src \'self\'"\n);',
  },
  {
    id: "harden-ts-no-strict",
    title: "TypeScript strict mode not enabled",
    severity: "MEDIUM",
    severityColor: "text-amber-400",
    severityBg: "bg-amber-500/15",
    file: "tsconfig.json",
    description: "Strict mode enables strictNullChecks, noImplicitAny, and other checks that catch type-safety bugs before they become runtime vulnerabilities.",
    fix: '"strict": true',
    autoFixable: true,
  },
];

/* ── Card (from landing page) ──────────────────────────── */

const cardStyle = {
  background: "linear-gradient(145deg, #1a1a1e 0%, #222226 50%, #1e1e22 100%)",
  border: "1px solid rgba(200, 200, 204, 0.08)",
  borderRadius: "14px",
  boxShadow:
    "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.15)",
} as const;

const cardOverlay = {
  background:
    "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 60%)",
  borderRadius: "14px",
  position: "absolute" as const,
  inset: 0,
  pointerEvents: "none" as const,
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div style={cardStyle} className={`relative overflow-hidden ${className}`}>
      <div style={cardOverlay} />
      <div className="relative">{children}</div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────── */

function getGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function TerminalDots() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
      <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
      <div className="w-3 h-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */

export default function DemoPage() {
  const [scanning, setScanning] = useState(false);
  const [visibleFindings, setVisibleFindings] = useState<PlaygroundFinding[]>([]);
  const [allFindings, setAllFindings] = useState<PlaygroundFinding[]>([]);
  const [scanComplete, setScanComplete] = useState(false);
  const [beforeScore, setBeforeScore] = useState<number | null>(null);
  const [afterScore, setAfterScore] = useState<number | null>(null);
  const [animatedScore, setAnimatedScore] = useState<number | null>(null);
  const [scorePhase, setScorePhase] = useState<"idle" | "before" | "pause" | "after">("idle");
  const [activeTab, setActiveTab] = useState<"results" | "harden" | "x402" | "onchain">("results");
  const [error, setError] = useState("");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // x402 demo state
  const [x402Step, setX402Step] = useState<"idle" | "step1" | "step2" | "step3" | "done">("idle");
  const [x402Lines, setX402Lines] = useState<{ text: string; type: "cmd" | "response" | "status" }[]>([]);
  const x402TermRef = useRef<HTMLDivElement>(null);

  // harden demo state
  const [hardenStep, setHardenStep] = useState<number>(-1); // -1 = idle, 0-4 = revealing, 5 = done
  const [hardenRunning, setHardenRunning] = useState(false);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
    };
  }, []);

  const animateScore = useCallback(
    (from: number, to: number, duration: number, onDone?: () => void) => {
      const start = performance.now();
      const step = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimatedScore(Math.round(from + (to - from) * eased));
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          onDone?.();
        }
      };
      requestAnimationFrame(step);
    },
    [],
  );

  const runX402Demo = useCallback(() => {
    // Reset
    setX402Step("step1");
    setX402Lines([]);
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    let delay = 0;
    const charDelay = 25;
    const stepPause = 600;

    const addLine = (line: { text: string; type: "cmd" | "response" | "status" }, at: number) => {
      const t = setTimeout(() => {
        setX402Lines((prev) => [...prev, line]);
        // Auto-scroll terminal
        requestAnimationFrame(() => {
          x402TermRef.current?.scrollTo({ top: x402TermRef.current.scrollHeight, behavior: "smooth" });
        });
      }, at);
      timersRef.current.push(t);
    };

    X402_DEMO_STEPS.forEach((step, stepIdx) => {
      const stepKey = `step${stepIdx + 1}` as "step1" | "step2" | "step3";

      // Set step indicator
      const stepTimer = setTimeout(() => setX402Step(stepKey), delay);
      timersRef.current.push(stepTimer);

      // Type command char by char
      const cmdFull = step.cmdLine2 ? `${step.cmd}\n${step.cmdLine2}` : step.cmd;
      for (let i = 0; i <= cmdFull.length; i++) {
        const t = setTimeout(() => {
          setX402Lines((prev) => {
            // Remove previous partial cmd for this step and replace
            const filtered = prev.filter((l) => l.text !== `__typing_${stepIdx}`);
            // Remove the last typing line if present
            const withoutPartial = filtered.filter(
              (_, idx) => !(idx === filtered.length - 1 && filtered[idx]?.text.startsWith(`__typing_${stepIdx}:`)),
            );
            return [
              ...withoutPartial.filter((l) => !l.text.startsWith(`__typing_${stepIdx}:`)),
              { text: `__typing_${stepIdx}:${cmdFull.slice(0, i)}`, type: "cmd" as const },
            ];
          });
        }, delay + i * charDelay);
        timersRef.current.push(t);
      }
      delay += cmdFull.length * charDelay + 200;

      // Replace typing placeholder with final command
      const finalCmdTimer = setTimeout(() => {
        setX402Lines((prev) => [
          ...prev.filter((l) => !l.text.startsWith(`__typing_${stepIdx}:`)),
          { text: cmdFull, type: "cmd" as const },
        ]);
      }, delay);
      timersRef.current.push(finalCmdTimer);
      delay += 100;

      // Show status badge
      addLine({ text: step.status, type: "status" }, delay);
      delay += 200;

      // Show response
      addLine({ text: step.response, type: "response" }, delay);
      delay += stepPause;
    });

    // Mark done
    const doneTimer = setTimeout(() => setX402Step("done"), delay);
    timersRef.current.push(doneTimer);
  }, []);

  const runHardenDemo = useCallback(() => {
    setHardenStep(-1);
    setHardenRunning(true);
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    HARDEN_SUGGESTIONS.forEach((_, i) => {
      const t = setTimeout(() => setHardenStep(i), (i + 1) * 1400);
      timersRef.current.push(t);
    });

    const doneTimer = setTimeout(() => {
      setHardenStep(HARDEN_SUGGESTIONS.length);
      setHardenRunning(false);
    }, (HARDEN_SUGGESTIONS.length + 1) * 1400);
    timersRef.current.push(doneTimer);
  }, []);

  async function handleScan() {
    // Reset state
    setScanning(true);
    setError("");
    setVisibleFindings([]);
    setAllFindings([]);
    setScanComplete(false);
    setBeforeScore(null);
    setAfterScore(null);
    setAnimatedScore(null);
    setScorePhase("idle");
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    try {
      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: VULNERABLE_CODE, language: "javascript" }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const data: ScanResult = await res.json();
      const findings = data.findings;
      setAllFindings(findings);
      setBeforeScore(data.score ?? 0);

      // Stagger findings in with 200ms delay
      findings.forEach((f, i) => {
        const timer = setTimeout(() => {
          setVisibleFindings((prev) => [...prev, f]);
        }, i * 200);
        timersRef.current.push(timer);
      });

      // After all findings shown, reveal fixed code + start score animation
      const revealTimer = setTimeout(
        () => {
          setScanComplete(true);
          setScanning(false);

          // Animate score: 0 → before score
          setScorePhase("before");
          const bScore = data.score ?? 0;
          animateScore(0, bScore, 800, () => {
            // Pause 500ms
            setScorePhase("pause");
            const pauseTimer = setTimeout(() => {
              // Compute "after" score (fixed code = 100)
              const aScore = 94;
              setAfterScore(aScore);
              setScorePhase("after");
              animateScore(bScore, aScore, 2500);
            }, 800);
            timersRef.current.push(pauseTimer);
          });
        },
        findings.length * 200 + 300,
      );
      timersRef.current.push(revealTimer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setScanning(false);
    }
  }

  const vulnerableLines = VULNERABLE_CODE.split("\n");
  const fixedLines = FIXED_CODE.split("\n");

  // Build highlighted line set from findings
  const highlightedLines = new Set<number>();
  for (const f of allFindings) {
    for (let l = f.startLine; l <= f.endLine; l++) {
      highlightedLines.add(l);
    }
  }

  const displayScore = animatedScore ?? 0;
  const displayGrade = getGrade(displayScore);
  const gradeColors = GRADE_COLORS[displayGrade] ?? GRADE_COLORS.F;

  const hasStarted = visibleFindings.length > 0 || scanning;

  return (
    <div className="flex flex-col min-h-screen bg-[#131313]">
      {/* Header */}
      <header className="border-b border-[#1e1e1e]">
        <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Carapace" width={34} height={34} className="rounded" />
            <span className="text-[17px] font-bold text-[#e0e0e0] tracking-tight">
              carapace security
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/"
              className="text-[14px] text-[#666] hover:text-[#e0e0e0] transition-colors"
            >
              Home
            </Link>
            <span className="text-[14px] text-[#e0e0e0] font-medium">Demo</span>
          </nav>
        </div>
      </header>

      <main className="flex-1 py-8">
        <div className="max-w-6xl mx-auto px-6">
          {/* Title + Run Scan */}
          <div className="text-center mb-8">
            <p className="text-[#555] mb-6 max-w-md mx-auto">
              Watch Carapace scan vulnerable code, find issues, and generate fixes in real time.
            </p>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="text-[14px] px-8 py-3 bg-[#4ade80] hover:bg-[#22c55e] disabled:bg-[#4ade80]/50 text-[#131313] rounded-lg font-bold transition-colors inline-flex items-center gap-2"
            >
              {scanning ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Scanning...
                </>
              ) : (
                "Run Scan"
              )}
            </button>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/40 rounded-lg text-[13px] text-red-400 font-medium text-center">
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-6">
            <button
              onClick={() => setActiveTab("results")}
              className={`text-[13px] font-bold px-4 py-2 rounded-lg transition-colors ${
                activeTab === "results"
                  ? "bg-[#1e1e1e] text-[#e0e0e0]"
                  : "text-[#555] hover:text-[#e0e0e0]"
              }`}
            >
              Scan Results
            </button>
            <button
              onClick={() => setActiveTab("harden")}
              className={`text-[13px] font-bold px-4 py-2 rounded-lg transition-colors ${
                activeTab === "harden"
                  ? "bg-[#1e1e1e] text-[#e0e0e0]"
                  : "text-[#555] hover:text-[#e0e0e0]"
              }`}
            >
              Harden
            </button>
            <button
              onClick={() => setActiveTab("x402")}
              className={`text-[13px] font-bold px-4 py-2 rounded-lg transition-colors ${
                activeTab === "x402"
                  ? "bg-[#1e1e1e] text-[#e0e0e0]"
                  : "text-[#555] hover:text-[#e0e0e0]"
              }`}
            >
              x402
            </button>
            <button
              onClick={() => setActiveTab("onchain")}
              className={`text-[13px] font-bold px-4 py-2 rounded-lg transition-colors ${
                activeTab === "onchain"
                  ? "bg-[#1e1e1e] text-[#e0e0e0]"
                  : "text-[#555] hover:text-[#e0e0e0]"
              }`}
            >
              On-Chain
            </button>
          </div>

          {activeTab === "results" ? (
            <>
              {/* Three-panel grid — Scan Results */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Panel 1: Vulnerable Code */}
                <Card>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
                    <div className="flex items-center gap-3">
                      <TerminalDots />
                      <span className="text-[12px] font-bold text-red-400">Vulnerable Code</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#555]">app.js</span>
                  </div>
                  <div className="p-0 font-mono text-[12px] leading-6 overflow-x-auto max-h-[420px] overflow-y-auto">
                    {vulnerableLines.map((line, i) => {
                      const lineNum = i + 1;
                      const isVulnerable = hasStarted && highlightedLines.has(lineNum);
                      return (
                        <div
                          key={i}
                          className={`transition-colors duration-300 ${
                            isVulnerable ? "bg-red-500/10" : ""
                          }`}
                        >
                          <span className="inline-block w-8 text-right mr-3 text-[#333] select-none text-[11px]">
                            {lineNum}
                          </span>
                          <span className={isVulnerable ? "text-red-400/80" : "text-[#777]"}>
                            {line || " "}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Panel 2: Findings */}
                <Card>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
                    <span className="text-[12px] font-bold text-[#e0e0e0]">Findings</span>
                    {visibleFindings.length > 0 && (
                      <span className="text-[10px] font-mono font-bold text-red-400 bg-red-500/15 rounded-full px-2.5 py-0.5">
                        {visibleFindings.length} issue{visibleFindings.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="max-h-[420px] overflow-y-auto">
                    {!hasStarted ? (
                      <div className="p-8 text-center text-[#444] text-[13px]">
                        Click <span className="text-[#4ade80] font-bold">Run Scan</span> to
                        analyze
                      </div>
                    ) : visibleFindings.length === 0 && scanning ? (
                      <div className="p-8 text-center text-[#444] text-[13px]">
                        <svg
                          className="animate-spin h-5 w-5 mx-auto mb-2 text-[#555]"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Analyzing...
                      </div>
                    ) : (
                      <div className="divide-y divide-[#1e1e1e]">
                        {visibleFindings.map((f, i) => {
                          const cwes = CWE_MAP[f.ruleId] ?? [];
                          return (
                            <div
                              key={i}
                              className="p-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
                              style={{ animationDelay: `${i * 50}ms` }}
                            >
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                <span
                                  className={`text-[9px] font-mono font-bold rounded px-1.5 py-0.5 uppercase ${
                                    SEVERITY_COLORS[f.severity] ?? "bg-zinc-400 text-white"
                                  }`}
                                >
                                  {f.severity}
                                </span>
                                {cwes.map((cwe) => (
                                  <span
                                    key={cwe}
                                    className="text-[9px] font-mono font-bold text-[#4ade80] bg-[#4ade80]/10 border border-[#4ade80]/20 rounded px-1.5 py-0.5"
                                  >
                                    {cwe}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[12px] font-bold text-[#e0e0e0] mb-0.5">
                                {f.title.replace("[Pattern] ", "")}
                              </p>
                              <p className="text-[11px] text-[#555] mb-1 leading-relaxed">
                                {f.description}
                              </p>
                              <div className="text-[10px] text-[#444] font-mono">
                                Line {f.startLine}
                                {f.endLine !== f.startLine && `\u2013${f.endLine}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Panel 3: Fixed Code */}
                <Card>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
                    <div className="flex items-center gap-3">
                      <TerminalDots />
                      <span className="text-[12px] font-bold text-emerald-400">Fixed Code</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#555]">app.js</span>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto">
                    {!scanComplete ? (
                      <div className="p-8 text-center text-[#444] text-[13px]">
                        {hasStarted
                          ? "Generating fix..."
                          : "Fixed code will appear after scan"}
                      </div>
                    ) : (
                      <div className="p-0 font-mono text-[12px] leading-6 overflow-x-auto transition-opacity duration-500">
                        {fixedLines.map((line, i) => {
                          const lineNum = i + 1;
                          const isFixed = FIXED_LINES.has(lineNum);
                          return (
                            <div
                              key={i}
                              className={isFixed ? "bg-emerald-500/10" : ""}
                            >
                              <span className="inline-block w-8 text-right mr-3 text-[#333] select-none text-[11px]">
                                {lineNum}
                              </span>
                              <span
                                className={
                                  isFixed ? "text-emerald-400/80" : "text-[#777]"
                                }
                              >
                                {line || " "}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Score Animation Bar */}
              {scorePhase !== "idle" && (
                <Card className="p-5 mb-6">
                  <div className="flex items-center gap-4">
                    {/* Before badge */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                          scorePhase === "before"
                            ? `${gradeColors.border} ${gradeColors.text}`
                            : "border-red-400 text-red-400"
                        }`}
                      >
                        <span className="text-sm font-black">
                          {scorePhase === "before" ? displayGrade : getGrade(beforeScore ?? 0)}
                        </span>
                      </div>
                      <div className="text-[12px]">
                        <div className="font-bold text-red-400">
                          {beforeScore ?? 0}/100
                        </div>
                        <div className="text-[#555]">Before</div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="flex-1 relative h-3 bg-[#1a1a1a] rounded-full overflow-hidden border border-[#2a2a2a]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                        style={{
                          width: `${displayScore}%`,
                          background:
                            displayScore >= 90
                              ? "#4ade80"
                              : displayScore >= 70
                                ? "#fbbf24"
                                : displayScore >= 50
                                  ? "#f97316"
                                  : "#ef4444",
                        }}
                      />
                    </div>

                    {/* After badge */}
                    <div
                      className={`flex items-center gap-2 shrink-0 transition-opacity duration-500 ${
                        scorePhase === "after" ? "opacity-100" : "opacity-30"
                      }`}
                    >
                      <div className="text-[12px] text-right">
                        <div className="font-bold text-emerald-400">
                          {afterScore ?? "—"}/100
                        </div>
                        <div className="text-[#555]">After</div>
                      </div>
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                          scorePhase === "after"
                            ? "border-emerald-400 text-emerald-400"
                            : "border-[#333] text-[#555]"
                        }`}
                      >
                        <span className="text-sm font-black">
                          {scorePhase === "after" ? "A" : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Score counter */}
                  <div className="text-center mt-3">
                    <span className={`text-3xl font-black font-mono ${gradeColors.text}`}>
                      {displayScore}
                    </span>
                    <span className="text-[#555] text-lg font-bold">/100</span>
                    <span
                      className={`ml-2 text-lg font-black ${gradeColors.text}`}
                    >
                      {displayGrade}
                    </span>
                  </div>
                </Card>
              )}
            </>
          ) : activeTab === "harden" ? (
            /* Harden Tab */
            <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4">
              {/* Left: Terminal output */}
              <Card>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
                  <div className="flex items-center gap-3">
                    <TerminalDots />
                    <span className="text-[12px] font-bold text-[#e0e0e0]">carapace harden .</span>
                  </div>
                  <button
                    onClick={runHardenDemo}
                    disabled={hardenRunning}
                    className="text-[11px] px-3 py-1.5 bg-[#4ade80] hover:bg-[#22c55e] disabled:bg-[#4ade80]/50 text-[#131313] rounded-md font-bold transition-colors"
                  >
                    {hardenStep === -1 ? "Run" : hardenStep >= HARDEN_SUGGESTIONS.length ? "Replay" : "Running..."}
                  </button>
                </div>
                <div className="p-4 font-mono text-[12px] leading-6 overflow-y-auto max-h-[540px] min-h-[320px]">
                  {hardenStep === -1 ? (
                    <div className="flex items-center justify-center h-full min-h-[280px] text-[#444] text-[13px]">
                      Click <span className="text-[#4ade80] font-bold mx-1">Run</span> to simulate a hardening check
                    </div>
                  ) : (
                    <div>
                      {/* Header lines */}
                      <div className="text-[#4ade80] mb-1">$ carapace harden .</div>
                      <div className="text-[#666] mb-1">[carapace] Hardening check: /app</div>
                      <div className="text-[#666] mb-3">[carapace] Detected: express, typescript</div>

                      {/* Suggestions revealed one by one */}
                      {HARDEN_SUGGESTIONS.map((s, i) => (
                        hardenStep >= i && (
                          <div
                            key={s.id}
                            className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#e0e0e0] font-bold">{i + 1}.</span>
                              <span className="text-[#e0e0e0] font-bold">{s.title}</span>
                              {s.autoFixable && (
                                <span className="text-[10px] text-[#666]">[auto-fixable]</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mb-1 pl-4">
                              <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${s.severityColor} ${s.severityBg}`}>
                                {s.severity}
                              </span>
                              <span className="text-[10px] text-[#555]">{s.id}</span>
                            </div>
                            <div className="text-[#555] text-[11px] pl-4 mb-1">File: {s.file}</div>
                            <div className="text-[#555] text-[11px] pl-4 mb-1">{s.description}</div>
                            <pre className="text-[#4ade80]/60 text-[11px] pl-4 border-l-2 border-[#2a2a2a] ml-4 mt-1 whitespace-pre-wrap">{s.fix}</pre>
                          </div>
                        )
                      ))}

                      {/* Summary line */}
                      {hardenStep >= HARDEN_SUGGESTIONS.length && (
                        <div className="mt-4 pt-3 border-t border-[#2a2a2a] animate-in fade-in duration-300">
                          <span className="text-[#e0e0e0] font-bold">5 suggestion(s)</span>
                          <span className="text-[#666]">: </span>
                          <span className="text-red-400 font-bold">3 high</span>
                          <span className="text-[#666]">, </span>
                          <span className="text-amber-400 font-bold">2 medium</span>
                          <span className="text-[#666]"> — 1 auto-fixable with --apply</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Right: What it checks + install */}
              <div className="space-y-4">
                <Card className="p-5">
                  <h3 className="text-[12px] font-bold text-[#e0e0e0] mb-4">Security Controls</h3>
                  <div className="space-y-3">
                    {HARDEN_SUGGESTIONS.map((s, i) => {
                      const isRevealed = hardenStep >= i;
                      return (
                        <div key={s.id} className="flex items-start gap-2.5">
                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 mt-0.5 ${
                              isRevealed
                                ? "border-red-400 bg-red-400/20"
                                : "border-[#333]"
                            }`}
                          >
                            {isRevealed ? (
                              <svg className="w-3 h-3 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            ) : (
                              <span className="text-[9px] text-[#444]">{i + 1}</span>
                            )}
                          </div>
                          <div>
                            <p className={`text-[12px] font-bold ${isRevealed ? "text-[#e0e0e0]" : "text-[#555]"}`}>
                              {s.title.length > 35 ? s.title.slice(0, 35) + "..." : s.title}
                            </p>
                            <p className="text-[10px] text-[#444]">{s.file}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card className="p-5">
                  <h3 className="text-[12px] font-bold text-[#e0e0e0] mb-3">Try it</h3>
                  <div className="bg-[#131313] rounded-lg p-3 font-mono text-[11px] text-[#4ade80] mb-3">
                    <div>$ npm i -g @carapacesecurity/cli</div>
                    <div className="mt-1">$ carapace harden .</div>
                  </div>
                  <p className="text-[11px] text-[#555]">
                    Suggestion-only by default. Use <span className="text-[#e0e0e0] font-mono">--apply</span> to auto-fix tsconfig strict mode.
                  </p>
                </Card>
              </div>
            </div>
          ) : activeTab === "x402" ? (
            /* x402 Payments Tab */
            <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
              {/* Left: Terminal simulation */}
              <Card>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
                  <div className="flex items-center gap-3">
                    <TerminalDots />
                    <span className="text-[12px] font-bold text-[#e0e0e0]">x402 Payment Flow</span>
                  </div>
                  <button
                    onClick={runX402Demo}
                    disabled={x402Step !== "idle" && x402Step !== "done"}
                    className="text-[11px] px-3 py-1.5 bg-[#4ade80] hover:bg-[#22c55e] disabled:bg-[#4ade80]/50 text-[#131313] rounded-md font-bold transition-colors"
                  >
                    {x402Step === "idle" ? "Run" : x402Step === "done" ? "Replay" : "Running..."}
                  </button>
                </div>
                <div
                  ref={x402TermRef}
                  className="p-4 font-mono text-[12px] leading-6 overflow-y-auto max-h-[480px] min-h-[320px]"
                >
                  {x402Step === "idle" ? (
                    <div className="flex items-center justify-center h-full min-h-[280px] text-[#444] text-[13px]">
                      Click <span className="text-[#4ade80] font-bold mx-1">Run</span> to simulate the x402 payment flow
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {x402Lines.map((line, i) => {
                        // Handle typing placeholders
                        const isTyping = line.text.startsWith("__typing_");
                        const displayText = isTyping ? line.text.split(":").slice(1).join(":") : line.text;

                        if (line.type === "status") {
                          const step = X402_DEMO_STEPS.find((s) => s.status === line.text);
                          return (
                            <div key={i} className="flex items-center gap-2 my-2">
                              <span
                                className={`text-[10px] font-mono font-bold rounded px-2 py-0.5 ${
                                  step?.statusColor ?? "text-[#555]"
                                } ${
                                  line.text.includes("402")
                                    ? "bg-red-500/15"
                                    : line.text.includes("200")
                                      ? "bg-emerald-500/15"
                                      : "bg-emerald-500/15"
                                }`}
                              >
                                {line.text}
                              </span>
                            </div>
                          );
                        }

                        if (line.type === "response") {
                          return (
                            <pre
                              key={i}
                              className="text-[#666] text-[11px] leading-5 pl-4 border-l-2 border-[#2a2a2a] my-2 whitespace-pre-wrap"
                            >
                              {displayText}
                            </pre>
                          );
                        }

                        // Command line
                        return (
                          <div key={i} className="text-[#4ade80]">
                            {displayText.split("\n").map((part, j) => (
                              <div key={j}>{part}{isTyping && j === displayText.split("\n").length - 1 && <span className="animate-pulse">_</span>}</div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>

              {/* Right: Flow stepper + pricing */}
              <div className="space-y-4">
                {/* Stepper */}
                <Card className="p-5">
                  <h3 className="text-[12px] font-bold text-[#e0e0e0] mb-4">Payment Flow</h3>
                  <div className="space-y-4">
                    {[
                      { label: "Request API", detail: "$0.02 per call", stepKey: "step1" },
                      { label: "Pay via Base", detail: "USDC settlement", stepKey: "step2" },
                      { label: "Get Results", detail: "Authenticated response", stepKey: "step3" },
                    ].map((item, i) => {
                      const stepNum = i + 1;
                      const stepKeys = ["step1", "step2", "step3", "done"];
                      const currentIdx = stepKeys.indexOf(x402Step);
                      const isCompleted = currentIdx > i || x402Step === "done";
                      const isActive = x402Step === item.stepKey;

                      return (
                        <div key={i} className="flex items-start gap-3">
                          {/* Circle indicator */}
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                              isCompleted
                                ? "border-emerald-400 bg-emerald-400/20"
                                : isActive
                                  ? "border-[#4ade80] bg-[#4ade80]/10"
                                  : "border-[#333]"
                            }`}
                          >
                            {isCompleted ? (
                              <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <span className={`text-[11px] font-bold ${isActive ? "text-[#4ade80]" : "text-[#444]"}`}>
                                {stepNum}
                              </span>
                            )}
                          </div>
                          {/* Label */}
                          <div>
                            <p className={`text-[13px] font-bold ${isCompleted || isActive ? "text-[#e0e0e0]" : "text-[#555]"}`}>
                              {item.label}
                            </p>
                            <p className="text-[11px] text-[#444]">{item.detail}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Pricing table */}
                <Card className="p-5">
                  <h3 className="text-[12px] font-bold text-[#e0e0e0] mb-3">Endpoint Pricing</h3>
                  <div className="space-y-2">
                    {X402_PRICING.map((row) => (
                      <div key={row.endpoint} className="flex items-center justify-between py-1.5 border-b border-[#1e1e1e] last:border-0">
                        <div>
                          <p className="text-[12px] font-mono text-[#4ade80]">{row.endpoint}</p>
                          <p className="text-[10px] text-[#444]">{row.desc}</p>
                        </div>
                        <span className="text-[13px] font-bold text-[#e0e0e0] font-mono">{row.price}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            /* On-Chain Tab */
            <div className="max-w-lg mx-auto">
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4ade80]/10">
                    <svg
                      className="w-5 h-5 text-[#4ade80]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M9 12l2 2 4-4" />
                      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-[16px] font-black text-[#e0e0e0]">
                      EAS Attestation on Base
                    </h2>
                    <p className="text-[12px] text-[#555]">
                      Verifiable on-chain security record
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mb-5">
                  {[
                    {
                      label: "Schema UID",
                      value: "0x0f18...ed221",
                      mono: true,
                    },
                    {
                      label: "Attester",
                      value: "0x9A7f...85EF",
                      mono: true,
                    },
                    {
                      label: "Score",
                      value: scanComplete ? `${beforeScore ?? 42} → 94` : "42 → 94",
                      mono: false,
                    },
                    {
                      label: "Grade",
                      value: scanComplete
                        ? `${getGrade(beforeScore ?? 42)} → A`
                        : "F → A",
                      mono: false,
                    },
                    {
                      label: "Findings",
                      value: scanComplete
                        ? `${allFindings.length} detected, all fixed`
                        : "4 detected, all fixed",
                      mono: false,
                    },
                    {
                      label: "Timestamp",
                      value: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
                      mono: true,
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between py-2 border-b border-[#1e1e1e] last:border-0"
                    >
                      <span className="text-[12px] text-[#555] font-medium">
                        {row.label}
                      </span>
                      <span
                        className={`text-[12px] text-[#e0e0e0] ${
                          row.mono ? "font-mono" : "font-bold"
                        }`}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>

                <a
                  href="https://base.easscan.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center text-[14px] px-6 py-3 bg-[#4ade80] hover:bg-[#22c55e] text-[#131313] rounded-lg font-bold transition-colors mb-3"
                >
                  View on EASScan
                </a>
                <p className="text-center text-[11px] text-[#444]">
                  Every scan creates a verifiable on-chain record
                </p>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e1e1e] py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Carapace" width={18} height={18} className="rounded" />
            <span className="text-[14px] font-bold text-[#555]">carapace security</span>
          </div>
          <div className="flex items-center gap-6 text-[13px] text-[#555]">
            <a
              href="https://github.com/carapacesec-io/carapace"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#e0e0e0] transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://x.com/carapacesec_"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#e0e0e0] transition-colors"
            >
              X
            </a>
          </div>
          <p className="text-[12px] text-[#444]">&copy; 2026 Carapace Security</p>
        </div>
      </footer>
    </div>
  );
}
