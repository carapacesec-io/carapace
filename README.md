# Carapace

Automated security scanner and code reviewer. Catches vulnerabilities, code smells, and security misconfigurations across 120+ detection rules spanning JavaScript/TypeScript, Solidity, Java, Ruby, and PHP.

**Live at [carapacesec.io](https://carapacesec.io)**

## How it works

```
Code change → Static pattern scan (120+ rules) → AI deep analysis → Findings + auto-fix diffs
```

Four-phase engine:
1. **Parse** -- diff parsing, file classification, chunk splitting
2. **Static scan** -- 120+ regex + AST rules with CWE/OWASP mapping
3. **AI analysis** -- LLM-powered deep review (Anthropic, OpenAI, or Ollama)
4. **Score & report** -- severity scoring, deduplication, markdown/JSON output

## Quick start

### CLI (fastest)

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

### GitHub Action

```yaml
# .github/workflows/carapace.yml
name: Carapace
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: carapacesec-io/carapace@main
        with:
          mode: local
          fail-on: high
          rulesets: general,attack,quality
```

With cloud mode (uses the Carapace API):

```yaml
      - uses: carapacesec-io/carapace@main
        with:
          mode: cloud
          api-key: ${{ secrets.CARAPACE_API_KEY }}
```

### GitHub App

Install the [Carapace GitHub App](https://carapacesec.io) on your repos. Automatic PR reviews on every push -- no config needed.

### Self-hosted

```bash
cp .env.example .env
# Fill in DATABASE_URL, NEXTAUTH_SECRET, GITHUB_CLIENT_ID/SECRET, etc.

docker compose up -d
```

This starts Postgres, Redis, the web dashboard, and the background worker.

## Packages

| Package | Description |
|---------|-------------|
| `packages/engine` | Core analysis engine -- rules, parsers, AI integration, scoring |
| `packages/web` | Next.js dashboard + API routes + attack surface scanner |
| `packages/cli` | CLI tool (`@carapacesecurity/cli`) |
| `packages/carapace-bin` | Thin wrapper for `npx carapace` |
| `packages/vscode` | VS Code extension with inline diagnostics + auto-fix |
| `packages/action` | GitHub Action |
| `packages/worker` | BullMQ worker for async PR reviews |

## Detection rules

120+ rules across 9 categories:

| Category | Examples | Count |
|----------|----------|-------|
| Security | SQL injection, XSS, SSRF, prototype pollution, timing attacks, CORS | 31 |
| Solidity | Reentrancy, flash loan, oracle manipulation, storage collision | 15 |
| Java | Deserialization, XPath injection, Spring CSRF, log injection | 5 |
| Ruby | SQL injection, ERB injection, mass assignment | 3 |
| PHP | SQL injection, eval, file inclusion | 3 |
| Quality | return-await, throw-literal, redundant-boolean, prefer-const, empty-catch | 25 |
| Performance | N+1 queries, sync FS, await in loop, structuredClone, DOM in loop | 11 |
| Code Cleaning | Unused imports/vars/functions, dead code, cyclomatic complexity, duplicate code | 21 |
| React | Index as key, direct state mutation, missing key prop | 3 |

Every rule maps to CWE IDs and OWASP categories. 50+ rules include auto-fix templates.

## Attack surface scanner

The web dashboard includes an external attack surface scanner with four scan types:

- **RECON** -- security headers, CORS, HSTS, cookies, TLS, tech fingerprinting
- **AUTH_AUDIT** -- login forms, session entropy, MFA detection, rate limiting
- **API_SCAN** -- CORS misconfiguration, method enumeration, error disclosure, endpoint discovery
- **FULL_PENTEST** -- all of the above + XSS probes, open redirect, SQL injection indicators

## API

### Code review

```bash
curl -X POST https://carapacesec.io/api/v1/review \
  -H "Authorization: Bearer $CARAPACE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"diff": "...", "rulesets": ["general", "attack"]}'
```

Also supports [x402](https://x402.org) payments as an alternative to API keys.

### Attack scan

```bash
curl -X POST https://carapacesec.io/api/attack/scan \
  -H "Content-Type: application/json" \
  -d '{"target": "https://example.com", "scanType": "AUTH_AUDIT"}'
```

Requires session auth or x402 payment.

## Development

```bash
git clone https://github.com/carapacesec-io/carapace.git
cd carapace
pnpm install
cp .env.example .env

# Start everything
pnpm dev

# Run tests (527+ passing)
pnpm test

# Build all packages
pnpm build
```

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+ (or use `docker compose up postgres redis`)
- Redis 7+

## Environment variables

See [`.env.example`](.env.example) for the full list. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `NEXTAUTH_SECRET` | Yes | Random secret for session encryption |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth app client secret |
| `ANTHROPIC_API_KEY` | No | For AI-powered deep analysis |
| `CARAPACE_API_KEY` | No | API key for `/api/v1/review` |

## License

[MIT](LICENSE)
