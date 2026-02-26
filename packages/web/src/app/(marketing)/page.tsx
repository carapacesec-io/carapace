import Link from "next/link";
import Image from "next/image";

const cardStyle = {
  background: "linear-gradient(145deg, #1a1a1e 0%, #222226 50%, #1e1e22 100%)",
  border: "1px solid rgba(200, 200, 204, 0.08)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.15)",
} as const;

const cardOverlay = {
  background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 60%)",
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

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#131313]">
      {/* Header */}
      <header className="border-b border-[#1e1e1e]">
        <div className="max-w-5xl mx-auto flex h-14 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Carapace" width={34} height={34} className="rounded" />
            <span className="text-[17px] font-bold text-[#e0e0e0] tracking-tight">carapace security</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/playground" className="text-[14px] text-[#666] hover:text-[#e0e0e0] transition-colors">Playground</Link>
            <Link href="/stats" className="text-[14px] text-[#666] hover:text-[#e0e0e0] transition-colors">Stats</Link>
            <a href="https://github.com/carapacesec" target="_blank" rel="noopener noreferrer" className="text-[14px] text-[#666] hover:text-[#e0e0e0] transition-colors">GitHub</a>
            <a href="https://x.com/carapacesec_" target="_blank" rel="noopener noreferrer" className="text-[#666] hover:text-[#e0e0e0] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="pt-24 pb-16">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-[13px] font-mono text-[#4ade80] mb-6 tracking-wider uppercase">Code security &amp; cleaning engine</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-[#f0f0f0] tracking-tight leading-[1.08] mb-5">
              Bad code in,<br />good code out.
            </h1>
            <p className="text-[16px] text-[#777] leading-relaxed max-w-lg mx-auto mb-10">
              120+ detection rules. Auto-fix. AI-powered rewrites.
              Scans your code, finds issues, fixes them. Nothing leaves your machine.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/playground" className="text-[14px] px-7 py-3 bg-[#e0e0e0] hover:bg-white text-[#131313] rounded-lg font-bold transition-colors">
                Try the playground
              </Link>
              <a href="https://github.com/carapacesec" target="_blank" rel="noopener noreferrer" className="text-[14px] px-7 py-3 text-[#888] hover:text-[#e0e0e0] border border-[#2a2a2a] hover:border-[#444] rounded-lg font-bold transition-colors">
                View source
              </a>
            </div>
          </div>
        </section>

        {/* Get Started */}
        <section className="pb-16">
          <div className="max-w-lg mx-auto px-6">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-[#f0f0f0] mb-3">Get Started</h2>
              <div className="bg-[#131313] rounded-lg border border-[#2a2a2a] px-4 py-3 mb-3 space-y-1.5">
                <div><code className="text-[13px] text-emerald-400 font-mono">$ npx carapace clean .</code></div>
                <div><code className="text-[13px] text-emerald-500/70 font-mono">$ npx carapace scan . --full</code></div>
              </div>
              <p className="text-[13px] text-[#777]">
                Or{" "}
                <Link href="/playground" className="text-[#e0e0e0] font-semibold underline decoration-[#444] hover:decoration-[#e0e0e0]">
                  try the playground
                </Link>
                {" "}&mdash; no signup required.
              </p>
            </Card>
          </div>
        </section>

        {/* Stats — 4-col grid */}
        <section className="pb-16">
          <div className="max-w-3xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { value: "120+", label: "Detection rules" },
                { value: "5K+", label: "Repos scanned" },
                { value: "8+", label: "Languages" },
                { value: "A\u2013F", label: "Security grades" },
              ].map((stat) => (
                <Card key={stat.label} className="p-5 text-center">
                  <div className="text-2xl md:text-3xl font-black text-[#f0f0f0] font-mono">{stat.value}</div>
                  <div className="text-[11px] text-[#666] font-medium mt-1 uppercase tracking-wider">{stat.label}</div>
                </Card>
              ))}
            </div>
            <p className="text-center text-[11px] font-mono text-[#444] mt-4">CA: 0x25F17ba23aD7910CAe34fCa536891b584916dBA3</p>
          </div>
        </section>

        {/* How the Engine Works — 2x2 grid */}
        <section id="engine" className="pb-20">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl md:text-4xl font-black text-[#f0f0f0] text-center mb-3 tracking-tight">
              How the engine works
            </h2>
            <p className="text-center text-[#666] mb-10 max-w-md mx-auto">
              Four phases run on every commit. Pure static analysis &mdash; your code never leaves your machine.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  step: "1", title: "Classify & Parse",
                  desc: "Every changed file is classified by language and framework. The diff is parsed into hunks with exact line ranges.",
                  detail: "TypeScript, JavaScript, Python, Go, Solidity, Rust, Java, React",
                },
                {
                  step: "2", title: "Pattern Engine",
                  desc: "120+ built-in detection rules with auto-fix support. Per-line, multi-line, and AST matching with confidence scoring.",
                  detail: "31 security, 15 solidity, 25 quality, 11 performance, 16 cleaning, 3 react",
                },
                {
                  step: "3", title: "Static Analysis",
                  desc: "Specialized analyzers run in parallel. Findings are deduplicated and merged into a single report.",
                  detail: "Pattern Scanner, Slither, Semgrep, Gitleaks",
                },
                {
                  step: "4", title: "Score, Fix & Ship",
                  desc: "Severity-weighted scoring (A\u2013F, 0\u2013100). Fix patches applied bottom-to-top. One-click commit to your branch.",
                  detail: "CRIT: -15 pts, HIGH: -8, MED: -3, LOW: -1",
                  highlight: true,
                },
              ].map((item) => (
                <Card key={item.step} className="p-6">
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                      item.highlight ? "bg-[#4ade80] text-[#131313]" : "bg-[#2a2a2a] text-[#f0f0f0]"
                    }`}>
                      {item.step}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-bold text-[#f0f0f0] mb-1">{item.title}</h3>
                      <p className="text-[13px] text-[#777] leading-relaxed mb-2">{item.desc}</p>
                      <div className="text-[11px] font-mono text-[#555] bg-[#131313] rounded px-2.5 py-1.5 border border-[#2a2a2a]">
                        {item.detail}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Terminal Demo */}
        <section className="pb-20">
          <div className="max-w-2xl mx-auto px-6">
            <Card>
              <div className="flex items-center gap-2 px-5 py-3 border-b border-[#2a2a2a]">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                <span className="ml-2 text-[11px] text-[#555] font-mono">terminal</span>
              </div>
              <div className="p-6 font-mono text-[13px] leading-7 overflow-x-auto">
                <div className="text-[#555]">$ <span className="text-[#e0e0e0]">npx carapace scan . --full</span></div>
                <div className="text-[#333] mt-3">scanning 1,247 files...</div>
                <div className="text-[#333]">running 4 analysis phases...</div>
                <div className="mt-3">
                  <span className="text-red-400/80">&#10007; 12 critical</span>
                  <span className="text-[#2a2a2a] mx-2">&middot;</span>
                  <span className="text-orange-400/80">&#10007; 34 high</span>
                  <span className="text-[#2a2a2a] mx-2">&middot;</span>
                  <span className="text-yellow-500/80">&#9651; 89 medium</span>
                  <span className="text-[#2a2a2a] mx-2">&middot;</span>
                  <span className="text-[#555]">&#9675; 30 low</span>
                </div>
                <div className="text-[#555] mt-1">score: <span className="text-red-400/80">38/100</span> <span className="text-[#333]">(F)</span></div>

                <div className="mt-6 text-[#555]">$ <span className="text-[#e0e0e0]">npx carapace clean .</span></div>
                <div className="text-[#333] mt-3">applying fixes...</div>
                <div className="mt-1 text-[#4ade80]/80">&#10003; fixed 127 of 165 issues</div>
                <div className="text-[#555] mt-1">score: <span className="text-[#4ade80]/80">94/100</span> <span className="text-[#333]">(A)</span></div>
              </div>
            </Card>
          </div>
        </section>

        {/* Before / After */}
        <section id="demo" className="pb-20">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl md:text-4xl font-black text-[#f0f0f0] text-center mb-3 tracking-tight">
              See the transformation
            </h2>
            <p className="text-center text-[#666] mb-10 max-w-md mx-auto">
              Push vulnerable code. Get clean code back. Automatically.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Before */}
              <Card>
                <div className="px-5 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
                  <span className="text-[12px] font-bold text-red-400">Before &mdash; Score: 42/100</span>
                  <span className="text-[10px] font-mono font-bold text-red-400 bg-red-500/15 rounded-full px-2.5 py-0.5">4 findings</span>
                </div>
                <div className="p-5 font-mono text-[12px] leading-6 text-[#777] overflow-x-auto">
                  <div><span className="text-[#333] select-none mr-3"> 1</span><span className="text-purple-400/70">async function</span> getUser(id) {"{"}</div>
                  <div><span className="text-[#333] select-none mr-3"> 2</span>  <span className="text-red-400/60">const q = `SELECT * FROM users</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 3</span>  <span className="text-red-400/60">  WHERE id = ${"{"}id{"}"}`</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 4</span>  const user = await db.query(q)</div>
                  <div><span className="text-[#333] select-none mr-3"> 5</span>  <span className="text-red-400/60">const token = &quot;sk_live_a1b2&quot;</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 6</span>  <span className="text-red-400/60">if (user) res.json(user)</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 7</span>{"}"}</div>
                </div>
              </Card>
              {/* After */}
              <Card>
                <div className="px-5 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
                  <span className="text-[12px] font-bold text-emerald-400">After &mdash; Score: 100/100</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/15 rounded-full px-2.5 py-0.5">0 issues</span>
                </div>
                <div className="p-5 font-mono text-[12px] leading-6 text-[#777] overflow-x-auto">
                  <div><span className="text-[#333] select-none mr-3"> 1</span><span className="text-purple-400/70">async function</span> getUser(id: string) {"{"}</div>
                  <div><span className="text-[#333] select-none mr-3"> 2</span>  <span className="text-emerald-400/50">const user = await db.query(</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 3</span>  <span className="text-emerald-400/50">  `SELECT id, name, email FROM</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 4</span>  <span className="text-emerald-400/50">  users WHERE id = $1`, [id]</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 5</span>  <span className="text-emerald-400/50">)</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 6</span>  <span className="text-emerald-400/50">if (!user) return res.status(404)</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 7</span>  <span className="text-emerald-400/50">  .json({"{"} error: &quot;Not found&quot; {"}"})</span></div>
                  <div><span className="text-[#333] select-none mr-3"> 8</span>  return res.json(user)</div>
                  <div><span className="text-[#333] select-none mr-3"> 9</span>{"}"}</div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Three Ways to Run — grid */}
        <section className="pb-20">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl md:text-4xl font-black text-[#f0f0f0] text-center mb-3 tracking-tight">
              Three ways to run it
            </h2>
            <p className="text-center text-[#666] mb-10 max-w-md mx-auto">
              GitHub App, CLI, or GitHub Action. Your workflow.
            </p>
            <div className="space-y-4">
              {/* GitHub App */}
              <Card className="p-6">
                <div className="flex items-start gap-4">
                  <svg className="w-6 h-6 text-[#f0f0f0] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <div>
                    <h3 className="text-[15px] font-bold text-[#f0f0f0] mb-1">GitHub App &mdash; automatic PR reviews</h3>
                    <p className="text-[13px] text-[#777] leading-relaxed">
                      Install the Carapace GitHub App. Every PR gets scanned &mdash; inline comments, severity badges, one-click &quot;Apply All Fixes&quot; that commits directly to your branch.
                    </p>
                  </div>
                </div>
              </Card>
              {/* CLI */}
              <Card className="p-6">
                <div className="flex items-start gap-4">
                  <svg className="w-6 h-6 text-[#f0f0f0] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-[15px] font-bold text-[#f0f0f0] mb-1">CLI &mdash; scan, clean &amp; rewrite from terminal</h3>
                    <div className="bg-[#131313] rounded-lg border border-[#2a2a2a] px-4 py-2.5 my-2 space-y-1">
                      <div><code className="text-[12px] font-mono"><span className="text-[#4ade80]">$</span><span className="text-[#f0f0f0] ml-2">npx carapace clean .</span></code></div>
                      <div><code className="text-[12px] font-mono"><span className="text-[#4ade80]">$</span><span className="text-[#f0f0f0] ml-2">npx carapace rewrite src/</span></code></div>
                      <div><code className="text-[12px] font-mono"><span className="text-[#4ade80]">$</span><span className="text-[#f0f0f0] ml-2">npx carapace scan . --full</span></code></div>
                    </div>
                    <p className="text-[13px] text-[#777] leading-relaxed">
                      <code className="font-mono text-[#f0f0f0] bg-[#2a2a2a] px-1 rounded">clean</code> auto-fixes 50+ rule types. <code className="font-mono text-[#f0f0f0] bg-[#2a2a2a] px-1 rounded">rewrite</code> uses AI for complex fixes.
                    </p>
                  </div>
                </div>
              </Card>
              {/* GitHub Action */}
              <Card className="p-6">
                <div className="flex items-start gap-4">
                  <svg className="w-6 h-6 text-[#4ade80] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-[15px] font-bold text-[#f0f0f0] mb-1">GitHub Action &mdash; drop into any workflow</h3>
                    <div className="bg-[#131313] rounded-lg border border-[#2a2a2a] px-4 py-2.5 my-2 font-mono text-[12px] text-[#777]">
                      <div><span className="text-[#555]">-</span> <span className="text-[#4ade80]">uses</span>: carapacesec/carapace-action@v1</div>
                      <div><span className="text-[#555]">&nbsp;&nbsp;</span><span className="text-[#4ade80]">with</span>:</div>
                      <div><span className="text-[#555]">&nbsp;&nbsp;&nbsp;&nbsp;</span><span className="text-[#4ade80]">fail-on</span>: high</div>
                    </div>
                    <p className="text-[13px] text-[#777] leading-relaxed">
                      Posts findings as PR checks. Fails the build on critical or high severity issues.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Big Stats */}
        <section className="pb-20">
          <div className="max-w-3xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { value: "5,029", label: "Repos scanned" },
                { value: "6.6M", label: "Issues found" },
                { value: "1.8M", label: "Auto-fixed" },
              ].map((stat) => (
                <Card key={stat.label} className="p-7 text-center">
                  <div className="text-3xl font-black text-[#f0f0f0] font-mono">{stat.value}</div>
                  <div className="text-[11px] text-[#555] font-medium mt-2 uppercase tracking-wider">{stat.label}</div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-24">
          <div className="max-w-lg mx-auto px-6">
            <Card className="p-8 text-center">
              <Image src="/logo.png" alt="Carapace" width={46} height={46} className="rounded mx-auto mb-3" />
              <h2 className="text-xl md:text-2xl font-black text-[#f0f0f0] mb-2">
                Stop shipping vulnerabilities
              </h2>
              <p className="text-[14px] text-[#777] mb-5">
                120+ rules. Auto-fixes. AI rewrites. Every PR.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link href="/playground" className="text-[14px] px-7 py-3 bg-[#e0e0e0] hover:bg-white text-[#131313] rounded-lg font-bold transition-colors">
                  Try the playground
                </Link>
                <Link href="/login" className="text-[14px] px-7 py-3 text-[#888] hover:text-[#e0e0e0] border border-[#2a2a2a] hover:border-[#444] rounded-lg font-bold transition-colors">
                  Sign in with GitHub
                </Link>
              </div>
            </Card>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[#1e1e1e] py-8">
          <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="Carapace" width={18} height={18} className="rounded" />
              <span className="text-[14px] font-bold text-[#555]">carapace security</span>
            </div>
            <div className="flex items-center gap-6 text-[13px] text-[#555]">
              <a href="https://github.com/carapacesec" target="_blank" rel="noopener noreferrer" className="hover:text-[#e0e0e0] transition-colors">GitHub</a>
              <a href="https://x.com/carapacesec_" target="_blank" rel="noopener noreferrer" className="hover:text-[#e0e0e0] transition-colors">X</a>
              <a href="mailto:hello@carapace.io" className="hover:text-[#e0e0e0] transition-colors">Contact</a>
            </div>
            <p className="text-[12px] text-[#444]">
              &copy; 2026 Carapace Security
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
