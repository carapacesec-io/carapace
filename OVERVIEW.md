# Carapace — Technical Overview

## What is Carapace?

Carapace is an automated security scanner and code reviewer. It catches vulnerabilities, code smells, and code quality issues across 120+ detection rules. It runs on every PR automatically, scores your code, and provides auto-fix suggestions.

**Live at [carapacesec.io](https://carapacesec.io)**

---

## Architecture

```
Monorepo (pnpm workspaces)
├── packages/engine     — Core analysis engine (rules, parsers, AI integration, scoring)
├── packages/web        — Next.js 16 dashboard + API routes + attack surface scanner
├── packages/worker     — BullMQ background worker (PR reviews, full scans, bulk scans)
├── packages/cli        — CLI tool (@carapacesecurity/cli)
├── packages/carapace-bin — npx carapace wrapper
├── packages/vscode     — VS Code extension with inline diagnostics + quick-fix
└── packages/action     — GitHub Action
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS, shadcn/ui |
| Backend | Next.js API routes, BullMQ workers |
| Database | PostgreSQL (Prisma 7 ORM) |
| Queue | Redis + BullMQ |
| Auth | NextAuth v5 + GitHub OAuth |
| AI | Anthropic Claude / OpenAI / Ollama (configurable) |
| Blockchain | ERC-8004 (Base mainnet), EAS attestations, x402 payments |
| Hosting | EC2 (Ubuntu), Nginx + Let's Encrypt, PM2 |

---

## How the Engine Works

```
Code change → Static pattern scan (120+ rules) → AI deep analysis → Findings + auto-fix diffs
```

**Four-phase pipeline:**

1. **Parse** — Diff parsing, file classification, chunk splitting
2. **Static scan** — 120+ detection rules with CWE/OWASP mapping (regex + AST-like analysis)
3. **AI analysis** — LLM-powered deep review for context-aware vulnerabilities
4. **Score & report** — Severity scoring (0-100), grade (A-F), deduplication, markdown/JSON output

### Detection Rules (120+ total)

| Category | Count | Examples |
|----------|-------|---------|
| Security | 31 | SQL injection, XSS, SSRF, prototype pollution, timing attacks, CORS, CSRF |
| Solidity | 15 | Reentrancy, flash loan, oracle manipulation, storage collision |
| Java | 5 | Deserialization, XPath injection, Spring CSRF, log injection |
| Ruby | 3 | SQL injection, ERB injection, mass assignment |
| PHP | 3 | SQL injection, eval, file inclusion |
| Quality | 25 | return-await, throw-literal, redundant-boolean, prefer-const, empty-catch |
| Performance | 11 | N+1 queries, sync FS, await in loop, structuredClone, DOM in loop |
| Code Cleaning | 21 | Unused imports/vars/functions, dead code, cyclomatic complexity, duplicate code |
| React | 3 | Index as key, direct state mutation, missing key prop |

All rules have confidence scoring (LOW/MEDIUM/HIGH) and map to CWE IDs + OWASP categories. 50+ rules include auto-fix templates.

---

## Product Features

### 1. GitHub App (Automatic PR Reviews)
Install the Carapace GitHub App on any repo. Every PR triggers an automatic security review with inline comments and fix suggestions.

### 2. Full Codebase Scans
Scan an entire repository (not just the diff). Produces a security score, grade, and full finding report.

### 3. Attack Surface Scanner
External security scanning (no code access needed):
- **RECON** — Security headers, CORS, HSTS, cookies, TLS, tech fingerprinting
- **AUTH_AUDIT** — Login forms, session entropy, MFA detection, rate limiting
- **API_SCAN** — CORS misconfig, method enumeration, error disclosure, endpoint discovery
- **FULL_PENTEST** — All above + XSS probes, open redirect, SQL injection indicators

### 4. EAS Attestations
On-chain attestation of scan results on Base via Ethereum Attestation Service. Cryptographic proof that a scan happened and what the results were.

### 5. Bulk Scanner
Scan multiple repos at once. Configurable concurrency, progress tracking, integrated with the dashboard.

### 6. CLI Tool
```bash
npx carapace scan .                    # scan git diff
npx carapace scan . --full             # scan entire codebase
npx carapace scan . --static-only      # no AI, just pattern matching
npx carapace scan . --fail-on high     # exit 1 on high+ findings
npx carapace scan . --format json      # JSON output
npx carapace clean .                   # auto-fix all fixable issues
npx carapace clean . --dry-run         # preview fixes without writing
npx carapace clean . --interactive     # approve each fix individually
npx carapace clean . --undo            # restore from last backup
npx carapace rewrite src/app.ts        # AI-powered code rewrite
npx carapace init .                    # set up config, workflow, hook
npx carapace rules                     # list all rules
```

### 7. VS Code Extension
Inline security and code quality diagnostics with auto-fix quick actions. Scans on save, supports all 120+ detection rules.

### 8. API
REST API with API key auth or x402 payment:
```bash
# Code review
POST /api/v1/review  (Authorization: Bearer $KEY)

# Attack scan
POST /api/attack/scan
```

### 9. x402 Payments
Pay-per-scan via the x402 HTTP payment protocol. No API key needed — just attach a payment to the request.

### 10. ERC-8004 Agent Identity
On-chain agent registration on Base mainnet. Carapace is registered as a Trustless Agent with:
- NFT-based identity in the Identity Registry
- On-chain reputation via the Reputation Registry
- Agent card at `/.well-known/agent-card.json`

---

## Infrastructure

### Production (EC2)

```
Client → Nginx (SSL/Let's Encrypt) → PM2
                                      ├── carapace-web (Next.js on port 3000)
                                      └── carapace-worker (BullMQ processor)
                                           ├── PostgreSQL (localhost:5432)
                                           └── Redis (localhost:6379)
```

- **IP:** EC2 instance on AWS
- **Domain:** carapacesec.io (Cloudflare DNS → Nginx)
- **Deploy:** `./deploy.sh` (git push → pull on EC2 → build → restart PM2)

### Database Schema (key models)

| Model | Purpose |
|-------|---------|
| User | GitHub OAuth users |
| Account | NextAuth linked accounts |
| Repo | GitHub repositories |
| Scan | Scan jobs (PR review, full scan, bulk scan) |
| Finding | Individual vulnerability/issue findings |
| BulkScanJob | Batch scan orchestration |
| Feedback | User ratings (synced to ERC-8004 on-chain) |

---

## Test Coverage

- **364+ tests** across the engine package
- Pattern scanner tests for all 120+ rules
- Config validation tests with Zod
- Integration tests for the full pipeline
- CLI tests for argument parsing, clean, and init commands
- All tests pass: `pnpm test`

---

## Key Files

| File | What it does |
|------|-------------|
| `packages/engine/src/static/pattern-scanner.ts` | All 120+ detection rules + special scanners |
| `packages/engine/src/config.ts` | Zod-validated config loading with typo detection |
| `packages/engine/src/analyzer.ts` | Main analysis pipeline orchestrator |
| `packages/cli/src/commands/clean.ts` | Auto-fix pipeline with backup/undo/interactive mode |
| `packages/cli/src/commands/init.ts` | Project initialization (config, workflow, hook) |
| `packages/web/src/lib/erc8004.ts` | ERC-8004 contract interactions (Identity + Reputation) |
| `packages/web/src/lib/eas.ts` | EAS attestation creation |
| `packages/web/src/lib/x402-middleware.ts` | x402 payment verification middleware |
| `packages/web/src/lib/queue.ts` | BullMQ queue setup |
| `packages/worker/src/processors/` | Background job processors (PR review, full scan, bulk scan) |
| `packages/web/src/app/(marketing)/page.tsx` | Landing page |
| `packages/web/src/app/(public)/stats/page.tsx` | Public stats page |
| `deploy.sh` | One-command deployment script |

---

## Getting Started (Development)

```bash
git clone git@github.com:carapacesec-io/carapace.git
cd carapace
pnpm install
cp .env.example .env
# Fill in DATABASE_URL, NEXTAUTH_SECRET, GITHUB_CLIENT_ID/SECRET

pnpm dev          # Start everything
pnpm test         # Run tests (364+ passing)
pnpm build        # Build all packages
```

### Prerequisites
- Node.js 20+
- pnpm 9+
- PostgreSQL 16+
- Redis 7+
