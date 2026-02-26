import { existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

export interface InitOptions {
  path: string;
  skipHook: boolean;
}

const WORKFLOW_TEMPLATE = `name: Carapace Security Scan

on:
  pull_request:
    branches: [main, master]

permissions:
  contents: read
  pull-requests: write

jobs:
  carapace:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: carapacesec/carapace-action@v1
        with:
          fail-on: high
`;

function detectLanguage(dir: string): string[] {
  const rulesets: string[] = ["general", "quality"];

  if (existsSync(join(dir, "package.json"))) rulesets.push("attack");
  if (existsSync(join(dir, "pom.xml"))) rulesets.push("attack");
  if (existsSync(join(dir, "Cargo.toml"))) rulesets.push("attack");
  if (existsSync(join(dir, "go.mod"))) rulesets.push("attack");
  if (existsSync(join(dir, "requirements.txt")) || existsSync(join(dir, "pyproject.toml")))
    rulesets.push("attack");

  // Solidity detection
  if (
    existsSync(join(dir, "hardhat.config.ts")) ||
    existsSync(join(dir, "hardhat.config.js")) ||
    existsSync(join(dir, "foundry.toml")) ||
    existsSync(join(dir, "truffle-config.js"))
  ) {
    rulesets.push("solidity");
  }

  // Deduplicate
  return [...new Set(rulesets)];
}

function generateConfig(rulesets: string[]): string {
  return `# Carapace configuration
# Docs: https://carapace.dev/docs/config

rulesets:
${rulesets.map((r) => `  - ${r}`).join("\n")}

severity_threshold: medium

ignore:
  - node_modules
  - dist
  - build
  - .next
  - vendor
  - __pycache__
  - "*.min.js"
  - "*.bundle.js"

# Disable specific rules (uncomment as needed):
# disable:
#   - cp-qual-todo-fixme
#   - cp-qual-magic-number
`;
}

const HOOK_SCRIPT = `#!/bin/sh
# Carapace pre-commit hook — clean + scan gate
npx carapace clean . 2>/dev/null
npx carapace scan . --static-only --fail-on high
`;

export function runInit(options: InitOptions): void {
  const dir = resolve(options.path);

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    process.stderr.write(`\x1b[31mError:\x1b[0m ${dir} is not a directory\n`);
    process.exit(1);
  }

  const created: string[] = [];
  const skipped: string[] = [];

  // 1. GitHub Actions workflow
  const workflowDir = join(dir, ".github", "workflows");
  const workflowFile = join(workflowDir, "carapace.yml");

  if (existsSync(workflowFile)) {
    skipped.push(".github/workflows/carapace.yml");
  } else {
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(workflowFile, WORKFLOW_TEMPLATE);
    created.push(".github/workflows/carapace.yml");
  }

  // 2. Project config
  const configFile = join(dir, ".carapace.yml");

  if (existsSync(configFile)) {
    skipped.push(".carapace.yml");
  } else {
    const rulesets = detectLanguage(dir);
    writeFileSync(configFile, generateConfig(rulesets));
    created.push(".carapace.yml");
  }

  // 3. Pre-commit hook (optional)
  if (!options.skipHook) {
    // Prefer Husky if .husky dir exists
    const huskyDir = join(dir, ".husky");
    const gitHooksDir = join(dir, ".git", "hooks");
    let hookPath: string;
    let hookLabel: string;

    if (existsSync(huskyDir)) {
      hookPath = join(huskyDir, "pre-commit");
      hookLabel = ".husky/pre-commit";
    } else if (existsSync(join(dir, ".git"))) {
      hookPath = join(gitHooksDir, "pre-commit");
      hookLabel = ".git/hooks/pre-commit";
    } else {
      hookPath = "";
      hookLabel = "";
    }

    if (hookPath) {
      if (existsSync(hookPath)) {
        skipped.push(hookLabel);
      } else {
        mkdirSync(join(hookPath, ".."), { recursive: true });
        writeFileSync(hookPath, HOOK_SCRIPT, { mode: 0o755 });
        created.push(hookLabel);
      }
    }
  }

  // Summary
  process.stdout.write("\n\x1b[36mcarapace init\x1b[0m\n\n");

  if (created.length > 0) {
    process.stdout.write("\x1b[32mCreated:\x1b[0m\n");
    for (const f of created) {
      process.stdout.write(`  + ${f}\n`);
    }
  }

  if (skipped.length > 0) {
    process.stdout.write("\x1b[33mSkipped (already exists):\x1b[0m\n");
    for (const f of skipped) {
      process.stdout.write(`  ~ ${f}\n`);
    }
  }

  if (created.length === 0 && skipped.length === 0) {
    process.stdout.write("  Nothing to do.\n");
  }

  process.stdout.write("\n");
}
