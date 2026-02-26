"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

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

const EXAMPLES: Record<string, { language: string; code: string }> = {
  "SQL Injection": {
    language: "javascript",
    code: `async function getUser(req, res) {
  const id = req.params.id;
  const query = \`SELECT * FROM users WHERE id = \${id}\`;
  const result = await db.query(query);
  res.json(result);
}`,
  },
  "Hardcoded Secret": {
    language: "javascript",
    code: `const config = {
  apiKey: "sk_live_a1b2c3d4e5f6g7h8i9j0",
  dbPassword: "password123",
  jwtSecret: "my-super-secret-key",
};

export default config;`,
  },
  "XSS & eval()": {
    language: "javascript",
    code: `function renderComment(comment) {
  document.innerHTML = comment.body;
  const data = eval(comment.metadata);
  return data;
}

app.get("/search", (req, res) => {
  res.send("<h1>Results for: " + req.query.q + "</h1>");
});`,
  },
  "Clean Code": {
    language: "typescript",
    code: `import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

export async function getUser(id: string) {
  const user = await db.query(
    "SELECT id, name, email FROM users WHERE id = $1",
    [id]
  );
  return UserSchema.parse(user);
}`,
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-400 text-white",
  medium: "bg-amber-400 text-white",
  low: "bg-blue-400 text-white",
  info: "bg-zinc-400 text-white",
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-400 border-emerald-400",
  B: "text-blue-400 border-blue-400",
  C: "text-amber-400 border-amber-400",
  D: "text-orange-400 border-orange-400",
  F: "text-red-400 border-red-400",
};

export default function PlaygroundPage() {
  const [code, setCode] = useState(EXAMPLES["SQL Injection"].code);
  const [language, setLanguage] = useState("javascript");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleScan() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const data: ScanResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function loadExample(name: string) {
    const ex = EXAMPLES[name];
    if (ex) {
      setCode(ex.code);
      setLanguage(ex.language);
      setResult(null);
      setError("");
    }
  }

  // Build highlighted line set from findings
  const highlightedLines = new Set<number>();
  if (result) {
    for (const f of result.findings) {
      for (let l = f.startLine; l <= f.endLine; l++) {
        highlightedLines.add(l);
      }
    }
  }

  const codeLines = code.split("\n");

  return (
    <div className="flex flex-col min-h-screen bg-[#131313]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#1e1e1e] bg-[#131313]/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Carapace" width={24} height={24} className="rounded" />
            <span className="text-[17px] font-black text-[#e0e0e0] tracking-tight">
              carapace security
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/"
              className="text-[13px] font-medium text-[#444] hover:text-[#e0e0e0] transition-colors"
            >
              Home
            </Link>
            <span className="text-[13px] font-medium text-[#e0e0e0]">
              Playground
            </span>
          </nav>
        </div>
      </header>

      <main className="flex-1 py-8">
        <div className="max-w-6xl mx-auto px-6">
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-black text-[#e0e0e0] tracking-tight">
              Try Carapace
            </h1>
            <p className="text-[#444] mt-2">
              Paste code below and see findings instantly. No install needed.
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="text-[13px] px-3 py-2 border border-[#1e1e1e] rounded bg-[#141414] text-[#e0e0e0] font-medium"
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="java">Java</option>
              <option value="ruby">Ruby</option>
              <option value="php">PHP</option>
              <option value="solidity">Solidity</option>
              <option value="rust">Rust</option>
            </select>

            <select
              onChange={(e) => loadExample(e.target.value)}
              defaultValue=""
              className="text-[13px] px-3 py-2 border border-[#1e1e1e] rounded bg-[#141414] text-[#e0e0e0] font-medium"
            >
              <option value="" disabled>
                Load example...
              </option>
              {Object.keys(EXAMPLES).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <button
              onClick={handleScan}
              disabled={loading || !code.trim()}
              className="ml-auto text-[14px] px-6 py-2 bg-[#e0e0e0] hover:bg-white disabled:bg-[#e0e0e0]/50 text-[#131313] rounded font-bold transition-colors"
            >
              {loading ? "Scanning..." : "Scan"}
            </button>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/40 rounded text-[13px] text-red-400 font-medium">
              {error}
            </div>
          )}

          {/* Score badge */}
          {result && result.grade !== null && (
            <div className="mb-4 flex items-center gap-4">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 ${GRADE_COLORS[result.grade] ?? "text-zinc-400 border-zinc-400"}`}
              >
                <span className="text-2xl font-black">{result.grade}</span>
              </div>
              <div>
                <span className="text-xl font-black text-[#e0e0e0]">
                  {result.score}/100
                </span>
                <p className="text-[13px] text-[#444]">
                  {result.findings.length} finding
                  {result.findings.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}

          {/* Split pane */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Code editor */}
            <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl overflow-hidden">
              <div className="px-4 py-2 border-b border-[#1e1e1e] bg-[#111]">
                <span className="text-[12px] font-bold text-[#444]">
                  Code
                </span>
              </div>
              {result ? (
                /* Read-only highlighted view after scan */
                <div className="p-0 font-mono text-[12px] leading-6 overflow-x-auto max-h-[500px] overflow-y-auto">
                  {codeLines.map((line, i) => {
                    const lineNum = i + 1;
                    const isHighlighted = highlightedLines.has(lineNum);
                    return (
                      <div
                        key={i}
                        className={
                          isHighlighted ? "bg-red-500/10" : "bg-[#141414]"
                        }
                      >
                        <span className="inline-block w-10 text-right mr-3 text-[#555] select-none px-2">
                          {lineNum}
                        </span>
                        <span
                          className={
                            isHighlighted ? "text-red-400" : "text-[#ccc]"
                          }
                        >
                          {line || " "}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Editable textarea */
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  className="w-full min-h-[400px] p-4 font-mono text-[12px] leading-6 text-[#ccc] bg-[#131313] border-[#1e1e1e] resize-none focus:outline-none"
                  placeholder="Paste your code here..."
                />
              )}
            </div>

            {/* Findings */}
            <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl overflow-hidden">
              <div className="px-4 py-2 border-b border-[#1e1e1e] bg-[#111]">
                <span className="text-[12px] font-bold text-[#444]">
                  Findings
                </span>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {!result ? (
                  <div className="p-8 text-center text-[#444] text-[13px]">
                    Click &quot;Scan&quot; to analyze your code
                  </div>
                ) : result.warning ? (
                  <div className="p-8 text-center">
                    <div className="text-2xl mb-2">&#x26A0;&#xFE0F;</div>
                    <p className="text-[#e0e0e0] font-bold text-[14px]">
                      Not recognized as code
                    </p>
                    <p className="text-[#555] text-[13px]">
                      {result.warning}
                    </p>
                  </div>
                ) : result.findings.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="text-2xl mb-2">&#x2705;</div>
                    <p className="text-[#e0e0e0] font-bold text-[14px]">
                      No issues found
                    </p>
                    <p className="text-[#555] text-[13px]">
                      Code looks clean!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#1e1e1e]">
                    {result.findings.map((f, i) => (
                      <div key={i} className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[9px] font-mono font-bold rounded px-1.5 py-0.5 uppercase ${SEVERITY_COLORS[f.severity] ?? "bg-zinc-400 text-white"}`}
                          >
                            {f.severity}
                          </span>
                          <span className="text-[10px] font-mono text-[#555]">
                            {f.ruleId}
                          </span>
                        </div>
                        <p className="text-[13px] font-bold text-[#e0e0e0] mb-1">
                          {f.title.replace("[Pattern] ", "")}
                        </p>
                        <p className="text-[12px] text-[#555] mb-2">
                          {f.description}
                        </p>
                        <div className="text-[11px] text-[#444] font-mono mb-2">
                          Line {f.startLine}
                          {f.endLine !== f.startLine && `\u2013${f.endLine}`}
                        </div>
                        {f.suggestion && (
                          <div className="text-[12px] bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2 text-emerald-400">
                            <span className="font-bold">Fix: </span>
                            {f.suggestion}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CTA */}
          {result && result.findings.length > 0 && (
            <div className="mt-6 text-center">
              <div className="inline-block bg-[#141414] border border-[#1e1e1e] rounded-2xl px-6 py-4">
                <p className="text-[14px] text-[#555] mb-3">
                  Scan your entire codebase in one command
                </p>
                <div className="bg-[#131313] rounded border border-[#1e1e1e] px-4 py-2 mb-3">
                  <code className="text-[13px] text-emerald-400 font-mono">
                    $ npx carapace scan . --full
                  </code>
                </div>
                <Link
                  href="/login"
                  className="text-[14px] px-5 py-2 bg-[#e0e0e0] hover:bg-white text-[#131313] rounded font-bold transition-colors inline-block"
                >
                  Get started free
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
