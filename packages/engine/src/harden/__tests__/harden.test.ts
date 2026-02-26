import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHarden, applyHardenFix } from "../harden.js";

function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "harden-test-"));
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(dir, path);
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    mkdirSync(parentDir, { recursive: true });
    writeFileSync(fullPath, content);
  }
  return dir;
}

describe("Harden engine", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch {}
    }
    dirs.length = 0;
  });

  // ── Helmet ──────────────────────────────────────────────────────────

  describe("helmet check", () => {
    it("flags Express app without helmet", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.listen(3000);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-helmet");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("does not flag when helmet is used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", helmet: "^7.0.0" } }),
        "src/app.ts": `import express from "express";\nimport helmet from "helmet";\nconst app = express();\napp.use(helmet());\napp.listen(3000);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-helmet");
      expect(suggestion).toBeUndefined();
    });

    it("skips check for non-Express projects", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { next: "^15.0.0" } }),
        "src/page.tsx": `export default function Home() { return <div>Hello</div>; }`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-helmet");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── Rate limiting ───────────────────────────────────────────────────

  describe("rate limit check", () => {
    it("flags Express app without rate limiting", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/routes/auth.ts": `router.post("/login", (req, res) => { res.send("ok"); });`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-rate-limit");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("does not flag when express-rate-limit is used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", "express-rate-limit": "^7.0.0" } }),
        "src/routes/auth.ts": `import rateLimit from "express-rate-limit";\nconst limiter = rateLimit({ windowMs: 900000, max: 10 });\nrouter.use(limiter);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-rate-limit");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── CSRF ────────────────────────────────────────────────────────────

  describe("CSRF check", () => {
    it("flags Express app with POST routes but no CSRF", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.post("/submit", (req, res) => {});`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csrf");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("medium");
    });

    it("does not flag when csrf-csrf is used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", "csrf-csrf": "^3.0.0" } }),
        "src/app.ts": `import { doubleCsrf } from "csrf-csrf";\nconst { doubleCsrfProtection } = doubleCsrf({});\napp.use(doubleCsrfProtection);\napp.post("/submit", handler);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csrf");
      expect(suggestion).toBeUndefined();
    });

    it("skips CSRF check when no POST/PUT routes exist", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.get("/", (req, res) => {});`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csrf");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── CSP ─────────────────────────────────────────────────────────────

  describe("CSP check", () => {
    it("flags Express app without CSP headers", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.listen(3000);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csp");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("flags Next.js app without CSP headers", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { next: "^15.0.0" } }),
        "next.config.ts": `export default { reactStrictMode: true };`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csp");
      expect(suggestion).toBeDefined();
    });

    it("does not flag when CSP is set via helmet", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", helmet: "^7.0.0" } }),
        "src/app.ts": `import helmet from "helmet";\napp.use(helmet());`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csp");
      expect(suggestion).toBeUndefined();
    });

    it("does not flag when CSP is set manually", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `app.use((req, res, next) => { res.setHeader("Content-Security-Policy", "default-src 'self'"); next(); });`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csp");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── TypeScript strict ───────────────────────────────────────────────

  describe("TypeScript strict check", () => {
    it("flags tsconfig without strict mode", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
        "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022" } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-ts-no-strict");
      expect(suggestion).toBeDefined();
      expect(suggestion!.autoFixable).toBe(true);
      expect(suggestion!.severity).toBe("medium");
    });

    it("does not flag when strict is true", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-ts-no-strict");
      expect(suggestion).toBeUndefined();
    });

    it("skips when no tsconfig.json exists", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-ts-no-strict");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── --apply ─────────────────────────────────────────────────────────

  describe("applyHardenFix", () => {
    it("applies tsconfig strict mode fix", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
        "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022" } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-ts-no-strict")!;

      const applied = applyHardenFix(dir, suggestion);
      expect(applied).toBe(true);

      // Verify the fix was applied
      const afterResult = runHarden(dir);
      const afterSuggestion = afterResult.suggestions.find((s) => s.id === "harden-ts-no-strict");
      expect(afterSuggestion).toBeUndefined();
    });

    it("returns false for non-auto-fixable suggestions", () => {
      const suggestion: import("../harden.js").HardenSuggestion = {
        id: "harden-missing-helmet",
        title: "test",
        description: "test",
        filePath: "test",
        suggestedCode: "test",
        autoFixable: false,
        severity: "high",
      };

      const applied = applyHardenFix("/tmp", suggestion);
      expect(applied).toBe(false);
    });
  });

  // ── Framework detection ─────────────────────────────────────────────

  describe("framework detection", () => {
    it("detects Express + TypeScript", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({
          dependencies: { express: "^4.0.0" },
          devDependencies: { typescript: "^5.0.0" },
        }),
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      expect(result.frameworksDetected).toContain("express");
      expect(result.frameworksDetected).toContain("typescript");
    });

    it("returns empty for project without package.json", () => {
      const dir = makeProject({
        "src/app.ts": `console.log("no package.json");`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      expect(result.suggestions).toHaveLength(0);
      expect(result.frameworksDetected).toHaveLength(0);
    });
  });
});
